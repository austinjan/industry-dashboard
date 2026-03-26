# SP4: Worker Config Builder — Design Spec

**Goal:** Add a config builder UI to the dashboard that lets users configure worker settings (which machines to read, Modbus registers), store config in DB, and generate/download YAML config files.

**Architecture:** DB is the source of truth for config editing. YAML is an export format for worker deployment. Single-direction flow: `DB → YAML → Worker`. Worker does not write config back to DB.

**Tech Stack:** Go (chi, pgx), React 18 + TypeScript, shadcn/ui, TanStack Query, react-i18next

---

## 1. Core Concepts

### Data Flow

```
Dashboard (config builder UI)
  → DB (worker_configs + worker_config_machines + machines.modbus_config)
  → YAML export (GET /api/worker-configs/:id/yaml)
  → Worker reads YAML at startup
```

### Constraints

- **One worker = one site.** A worker config is bound to a single site but can read machines across multiple lines within that site.
- **DB is editing source of truth.** Register settings and connection info are stored in DB.
- **YAML is runtime format.** Workers read YAML files. If a user manually edits the YAML, DB does not know — that's their choice.
- **No config write-back.** Worker does not overwrite DB config settings at startup.

---

## 2. Database Schema

### `worker_configs` table (new)

```sql
CREATE TABLE worker_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    poll_interval VARCHAR(20) NOT NULL DEFAULT '5s',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, site_id)
);
```

### `worker_config_machines` table (new)

```sql
CREATE TABLE worker_config_machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES worker_configs(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 502,
    slave_id INTEGER NOT NULL DEFAULT 1,
    UNIQUE(config_id, machine_id)
);
```

### Register storage

Registers are stored in `machines.modbus_config` JSONB under a `registers` key:

```json
{
  "registers": [
    { "name": "temperature", "address": 40001, "type": "holding", "data_type": "float32", "unit": "°C", "scale": 1.0, "offset": 0, "byte_order": "big" }
  ]
}
```

Registers belong to the machine, not the worker config. Multiple worker configs can reference the same machine and share its registers.

**Important: JSONB merge update.** The `modbus_config` column may contain other keys (e.g., `host`, `port`, `unit_id` from SP3). `SetMachineRegisters` must use a JSONB merge, not a full column replace:

```sql
UPDATE machines
SET modbus_config = COALESCE(modbus_config, '{}'::jsonb) || jsonb_build_object('registers', $1::jsonb),
    updated_at = NOW()
WHERE id = $2
```

---

## 3. API Endpoints

All endpoints use `workers:manage` permission with global scope.

### Worker Configs CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/worker-configs` | List all configs (with site name, machine count, linked worker status) |
| POST | `/api/worker-configs` | Create config (name, site_id, poll_interval) |
| GET | `/api/worker-configs/:id` | Get config detail (includes machines array with connection info + register count per machine) |
| PUT | `/api/worker-configs/:id` | Update config (name, site_id, poll_interval) |
| DELETE | `/api/worker-configs/:id` | Delete config |

### Machine Assignment + Connection

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/api/worker-configs/:id/machines` | Set machines + connections for a config |

Request body:
```json
{
  "machines": [
    { "machine_id": "uuid", "host": "192.168.1.101", "port": 502, "slave_id": 1 },
    { "machine_id": "uuid", "host": "192.168.1.102", "port": 502, "slave_id": 1 }
  ]
}
```

This replaces all machine assignments for the config (delete + insert).

### Register Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/machines/:id/registers` | Get registers for a machine |
| PUT | `/api/machines/:id/registers` | Set registers (replaces all) |
| POST | `/api/machines/:id/registers/import` | Import registers from CSV |

PUT `/api/machines/:id/registers` body:
```json
{
  "registers": [
    { "name": "temperature", "address": 40001, "type": "holding", "data_type": "float32", "unit": "°C", "scale": 1.0, "offset": 0, "byte_order": "big" }
  ]
}
```

POST `/api/machines/:id/registers/import` accepts `Content-Type: text/csv`:
```csv
name,address,type,data_type,unit,scale,offset,byte_order
temperature,40001,holding,float32,°C,1.0,0,big
speed,40003,holding,uint16,rpm,1.0,0,big
```

Returns the parsed registers as JSON (same format as PUT). Only `name` and `address` are required; others default to: type=holding, data_type=float32, scale=1.0, offset=0, byte_order=big.

**Backend validation enums:**
- `type`: holding, input, coil, discrete
- `data_type`: uint16, int16, uint32, int32, float32, float64, bool, string, timestamp_unix
- `byte_order`: big, little, mid-big, mid-little

Return 400 with a clear error message if any value is not in the accepted set. `name` and `address` are required — return 400 if missing.

### YAML Export

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/worker-configs/:id/yaml` | Generate and download YAML |

Returns `Content-Type: application/x-yaml` with `Content-Disposition: attachment; filename="<worker-name>.yaml"`.

YAML generation logic:
1. Load `worker_configs` row (name, poll_interval)
2. Load site (code, name, timezone)
3. Load `worker_config_machines` with machine + line info
4. Load registers from each machine's `modbus_config.registers`
5. Group machines by production line
6. Assemble YAML structure

---

## 4. Frontend: Config Builder UI

### New Route

`/admin/worker-configs` — list page
`/admin/worker-configs/new` — create
`/admin/worker-configs/:id` — edit

### List Page (`WorkerConfigsPage.tsx`)

Table columns: Name, Site, Machines, Poll Interval, Worker Status, Actions

- **Worker Status**: matched by name — if a worker with the same `name` exists in `workers` table and is online → green "Online" badge. Offline → gray. No worker → "Not deployed". **Known limitation:** this is a string equality check with no FK. If the YAML is hand-edited to change the worker name, the dashboard will not recognize it. Acceptable for MVP.
- **Actions**: Edit, Download YAML, Delete

### Edit Page (`WorkerConfigEditPage.tsx`)

Step-based form (tabs or accordion, not a wizard — user can jump between steps):

**Step 1: Basic Settings**
- Worker name (Input, required, unique)
- Site (Select dropdown, required — changing site clears machine selection)
- Poll interval (Input, default "5s")

**Step 2: Select Machines**
- Shows machines from the selected site, grouped by production line
- Checkbox to select/deselect each machine
- For each selected machine: connection fields (host, port, slave_id) shown inline

**Step 3: Configure Registers**
- For each selected machine, a collapsible section with:
  - Register table (editable, sortable)
  - Columns: name, address, type (dropdown), data_type (dropdown), unit, scale, offset, byte_order (dropdown)
  - Add row button
  - Delete row button (per row)
  - CSV Import button → opens CsvImportDialog

**Preview & Download**
- "Preview YAML" button → opens YamlPreviewDialog showing the generated YAML with syntax highlighting
- "Download YAML" button → triggers file download

### Components

| File | Description |
|------|-------------|
| `frontend/src/pages/admin/WorkerConfigsPage.tsx` | List page |
| `frontend/src/pages/admin/WorkerConfigEditPage.tsx` | Create/Edit page with tabs |
| `frontend/src/components/admin/RegisterTable.tsx` | Editable register table |
| `frontend/src/components/admin/CsvImportDialog.tsx` | CSV file upload + preview |
| `frontend/src/components/admin/YamlPreviewDialog.tsx` | YAML preview + download |

---

## 5. Register Table Details

### Editable Table

Each row is a register with these fields:

| Field | Input Type | Required | Default |
|-------|-----------|----------|---------|
| name | Text input | Yes | — |
| address | Number input | Yes | — (supports PLC notation: 40001) |
| type | Select: holding, input, coil, discrete | Yes | holding |
| data_type | Select: uint16, int16, uint32, int32, float32, float64, bool, string | Yes | float32 |
| unit | Text input | No | — |
| scale | Number input | No | 1.0 |
| offset | Number input | No | 0 |
| byte_order | Select: big, little, mid-big, mid-little | No | big |

### CSV Import

Upload a CSV file → parse → show preview table → confirm → replaces or appends to existing registers.

CSV format:
```csv
name,address,type,data_type,unit,scale,offset,byte_order
temperature,40001,holding,float32,°C,1.0,0,big
```

Import dialog shows:
- Parsed rows count
- Preview table of first 10 rows
- Option: "Replace all" or "Append to existing"
- Validation errors (missing name/address) highlighted in red

Also supports JSON array import (auto-detected from file extension or content).

---

## 6. Sidebar Navigation

Add under Admin section:

```
Admin
  User Management      /admin/users
  RBAC Settings         /admin/roles
  Audit Log             /admin/audit
  Sites & Machines      /admin/sites
  Workers               /admin/workers
  Worker Configs        /admin/worker-configs   ← NEW
```

Icon: `FileCode` from lucide-react.

---

## 7. i18n

New keys under `admin` section for all 4 locales:

```
workerConfigs, addWorkerConfig, editWorkerConfig, deleteWorkerConfig,
configName, pollInterval, selectSite, selectMachines, configureRegisters,
previewYaml, downloadYaml, noWorkerConfigs,
registerName, registerAddress, registerType, registerDataType,
registerUnit, registerScale, registerOffset, registerByteOrder,
addRegister, deleteRegister, importCsv, importJson,
replaceAll, appendExisting, importPreview, parsedRows,
validationError, nameRequired, addressRequired,
notDeployed, deployed, connectionSettings,
step1BasicSettings, step2SelectMachines, step3ConfigureRegisters
```

---

## 8. File Structure

### New Backend Files

| File | Description |
|------|-------------|
| `migrations/018_create_worker_configs.up.sql` | worker_configs + worker_config_machines tables |
| `migrations/018_create_worker_configs.down.sql` | Drop tables |
| `internal/worker_config/store.go` | DB queries |
| `internal/worker_config/handler.go` | REST handlers |
| `internal/worker_config/yaml_gen.go` | YAML generation |

### Modified Backend Files

| File | Changes |
|------|---------|
| `internal/site/store.go` | Add GetMachineRegisters, SetMachineRegisters |
| `internal/site/handler.go` | Add register GET/PUT/import handlers |
| `cmd/server/main.go` | Register new routes + add PATCH to CORS AllowedMethods |

### New Frontend Files

| File | Description |
|------|-------------|
| `frontend/src/pages/admin/WorkerConfigsPage.tsx` | List page |
| `frontend/src/pages/admin/WorkerConfigEditPage.tsx` | Create/Edit with tabs |
| `frontend/src/components/admin/RegisterTable.tsx` | Editable register table |
| `frontend/src/components/admin/CsvImportDialog.tsx` | CSV import dialog |
| `frontend/src/components/admin/YamlPreviewDialog.tsx` | YAML preview + download |

### Modified Frontend Files

| File | Changes |
|------|---------|
| `frontend/src/App.tsx` | Add routes |
| `frontend/src/components/layout/Sidebar.tsx` | Add nav item |
| `frontend/src/lib/hooks.ts` | Add worker config hooks |
| `frontend/src/locales/*.json` | Add i18n keys |

---

## 9. Testing

### Backend
- YAML generation: verify output matches expected structure for a config with multiple lines/machines
- CSV parsing: valid CSV, missing columns, malformed data
- Register validation: required fields, valid data types

### Frontend
- Create config → select machines → add registers → preview YAML → download
- CSV import → verify parsed correctly → append/replace
- Edit existing config → verify pre-populated
- Delete config → verify removed

### Integration
- Create config in UI → download YAML → start worker with YAML → verify worker appears in Workers page as online
