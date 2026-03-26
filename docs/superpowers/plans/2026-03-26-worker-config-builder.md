# SP4: Worker Config Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a config builder UI that lets users configure worker settings (machines, Modbus registers), store in DB, and generate/download YAML config files.

**Architecture:** DB is source of truth for editing. YAML is an export format. Flow: `DB → YAML → Worker`. Backend adds `worker_config` package + register endpoints. Frontend adds config list page, step-based edit page, register table editor, CSV import, and YAML preview.

**Tech Stack:** Go (chi, pgx, gopkg.in/yaml.v3), React 18 + TypeScript, shadcn/ui, TanStack Query, react-i18next

---

## File Structure

### New Backend Files

| File | Responsibility |
|------|---------------|
| `migrations/018_create_worker_configs.up.sql` | worker_configs + worker_config_machines tables |
| `migrations/018_create_worker_configs.down.sql` | Drop tables |
| `internal/worker_config/store.go` | CRUD queries for configs, machine assignments |
| `internal/worker_config/handler.go` | REST handlers for config CRUD, machine assignment |
| `internal/worker_config/yaml_gen.go` | YAML generation from DB data |
| `internal/worker_config/yaml_gen_test.go` | YAML generation tests |

### Modified Backend Files

| File | Changes |
|------|---------|
| `internal/site/store.go` | Add GetMachineRegisters, SetMachineRegisters |
| `internal/site/handler.go` | Add GetRegisters, SetRegisters, ImportRegistersCSV handlers |
| `cmd/server/main.go` | Register routes + fix CORS PATCH |

### New Frontend Files

| File | Responsibility |
|------|---------------|
| `frontend/src/pages/admin/WorkerConfigsPage.tsx` | List page with status badges |
| `frontend/src/pages/admin/WorkerConfigEditPage.tsx` | Create/Edit with tab steps |
| `frontend/src/components/admin/RegisterTable.tsx` | Editable register table |
| `frontend/src/components/admin/CsvImportDialog.tsx` | CSV upload + preview |
| `frontend/src/components/admin/YamlPreviewDialog.tsx` | YAML preview + download |

### Modified Frontend Files

| File | Changes |
|------|---------|
| `frontend/src/App.tsx` | Add 3 routes |
| `frontend/src/components/layout/Sidebar.tsx` | Add nav item |
| `frontend/src/lib/hooks.ts` | Add config + register hooks |
| `frontend/src/locales/*.json` | Add ~30 i18n keys |

---

### Task 1: Database Migration

**Files:**
- Create: `migrations/018_create_worker_configs.up.sql`
- Create: `migrations/018_create_worker_configs.down.sql`

- [ ] **Step 1: Create migration 018 up**

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

- [ ] **Step 2: Create migration 018 down**

```sql
DROP TABLE IF EXISTS worker_config_machines;
DROP TABLE IF EXISTS worker_configs;
```

- [ ] **Step 3: Verify: `make migrate`**
- [ ] **Step 4: Commit**

```bash
git add migrations/018_*
git commit -m "feat(sp4): add worker_configs and worker_config_machines tables"
```

---

### Task 2: Backend — Worker Config Store + Handlers

**Files:**
- Create: `internal/worker_config/store.go`
- Create: `internal/worker_config/handler.go`

**Store methods:**

- `ListConfigs(ctx)` — SELECT worker_configs with site name, machine count (from worker_config_machines), and worker status (LEFT JOIN workers on name match). Returns `[]ConfigSummary`.
- `CreateConfig(ctx, name, siteID, pollInterval)` — INSERT, RETURNING all fields.
- `GetConfig(ctx, id)` — SELECT config + site info + machines array (JOIN worker_config_machines → machines → production_lines). Each machine includes host, port, slave_id, machine name, model, line_name, register_count (from modbus_config->'registers' jsonb_array_length).
- `UpdateConfig(ctx, id, name, siteID, pollInterval)` — UPDATE.
- `DeleteConfig(ctx, id)` — DELETE (CASCADE handles machine assignments).
- `SetConfigMachines(ctx, configID, machines []ConfigMachine)` — DELETE all existing + INSERT new. Each ConfigMachine has machine_id, host, port, slave_id.

**Handler methods:**

- `ListConfigs` — GET /api/worker-configs
- `CreateConfig` — POST /api/worker-configs, decode `{name, site_id, poll_interval}`, validate name required
- `GetConfig` — GET /api/worker-configs/:id, validate UUID
- `UpdateConfig` — PUT /api/worker-configs/:id
- `DeleteConfig` — DELETE /api/worker-configs/:id, return 204
- `SetConfigMachines` — PUT /api/worker-configs/:id/machines, decode `{machines: [{machine_id, host, port, slave_id}]}`

All handlers use `workers:manage` global permission. Handle duplicate key errors (config name per site) with 409 Conflict.

- [ ] **Step 1: Create store.go with all types and methods**
- [ ] **Step 2: Create handler.go with all REST handlers**
- [ ] **Step 3: Verify: `go build ./...`**
- [ ] **Step 4: Commit**

```bash
git add internal/worker_config/
git commit -m "feat(sp4): add worker config store and handlers"
```

---

### Task 3: Backend — Register Endpoints + CSV Import

**Files:**
- Modify: `internal/site/store.go`
- Modify: `internal/site/handler.go`

**Store methods to add:**

- `GetMachineRegisters(ctx, machineID)` — Extract `registers` from `modbus_config` JSONB. Returns `[]Register` struct.
- `SetMachineRegisters(ctx, machineID, registers []Register)` — JSONB merge update:
  ```sql
  UPDATE machines
  SET modbus_config = COALESCE(modbus_config, '{}'::jsonb) || jsonb_build_object('registers', $1::jsonb),
      updated_at = NOW()
  WHERE id = $2
  ```

**Register struct:**
```go
type Register struct {
    Name      string  `json:"name"`
    Address   int     `json:"address"`
    Type      string  `json:"type"`
    DataType  string  `json:"data_type"`
    Unit      string  `json:"unit"`
    Scale     float64 `json:"scale"`
    Offset    float64 `json:"offset"`
    ByteOrder string  `json:"byte_order"`
}
```

**Handler methods to add:**

- `GetRegisters` — GET /api/machines/:machineID/registers
- `SetRegisters` — PUT /api/machines/:machineID/registers, decode `{registers: [...]}`, validate each register:
  - `name` required, `address` required
  - `type` must be: holding, input, coil, discrete
  - `data_type` must be: uint16, int16, uint32, int32, float32, float64, bool, string, timestamp_unix
  - `byte_order` must be: big, little, mid-big, mid-little
  - Apply defaults for missing optional fields
- `ImportRegistersCSV` — POST /api/machines/:machineID/registers/import
  - Read request body as CSV text
  - Parse CSV (header row + data rows)
  - Apply defaults for missing columns
  - Validate each row
  - Return parsed registers as JSON (don't save — client decides to PUT after preview)

**Validation helper:**
```go
var validRegTypes = map[string]bool{"holding": true, "input": true, "coil": true, "discrete": true}
var validDataTypes = map[string]bool{"uint16": true, "int16": true, "uint32": true, "int32": true, "float32": true, "float64": true, "bool": true, "string": true, "timestamp_unix": true}
var validByteOrders = map[string]bool{"big": true, "little": true, "mid-big": true, "mid-little": true}
```

- [ ] **Step 1: Add Register type and store methods to site/store.go**
- [ ] **Step 2: Add handler methods to site/handler.go**
- [ ] **Step 3: Verify: `go build ./...`**
- [ ] **Step 4: Commit**

```bash
git add internal/site/store.go internal/site/handler.go
git commit -m "feat(sp4): add register CRUD and CSV import endpoints"
```

---

### Task 4: Backend — YAML Generation

**Files:**
- Create: `internal/worker_config/yaml_gen.go`
- Create: `internal/worker_config/yaml_gen_test.go`
- Modify: `internal/worker_config/handler.go` (add ExportYAML handler)

**YAML generation logic:**

```go
func (s *Store) GenerateYAML(ctx context.Context, configID string) ([]byte, string, error)
// Returns: (yamlBytes, workerName, error)
```

1. Load config (name, poll_interval)
2. Load site (code, name, timezone)
3. Load config machines with line info (JOIN worker_config_machines → machines → production_lines)
4. Load registers for each machine from `modbus_config->'registers'`
5. Group machines by production_line
6. Build YAML struct and marshal with `gopkg.in/yaml.v3`

**YAML struct:**
```go
type YAMLConfig struct {
    SiteCode     string        `yaml:"site_code"`
    SiteName     string        `yaml:"site_name"`
    Timezone     string        `yaml:"timezone"`
    PollInterval string        `yaml:"poll_interval"`
    WorkerName   string        `yaml:"worker_name"`
    Lines        []YAMLLine    `yaml:"lines"`
}
type YAMLLine struct {
    Name         string         `yaml:"name"`
    DisplayOrder int            `yaml:"display_order"`
    Machines     []YAMLMachine  `yaml:"machines"`
}
type YAMLMachine struct {
    Name       string          `yaml:"name"`
    Model      string          `yaml:"model,omitempty"`
    Connection YAMLConnection  `yaml:"connection"`
    Registers  []YAMLRegister  `yaml:"registers"`
}
type YAMLConnection struct {
    Host    string `yaml:"host"`
    Port    int    `yaml:"port"`
    SlaveID int    `yaml:"slave_id"`
}
type YAMLRegister struct {
    Name      string  `yaml:"name"`
    Address   int     `yaml:"address"`
    Type      string  `yaml:"type"`
    DataType  string  `yaml:"data_type"`
    Unit      string  `yaml:"unit,omitempty"`
    Scale     float64 `yaml:"scale,omitempty"`
    Offset    float64 `yaml:"offset,omitempty"`
    ByteOrder string  `yaml:"byte_order,omitempty"`
}
```

**Handler:**
- `ExportYAML` — GET /api/worker-configs/:id/yaml
  - Call GenerateYAML
  - Set `Content-Type: application/x-yaml`
  - Set `Content-Disposition: attachment; filename="<sanitized-worker-name>.yaml"`
  - Sanitize filename: replace non-alphanumeric (except dash/underscore) with underscore

**Unit test:**
- Build a YAMLConfig struct manually, marshal, verify output matches expected YAML format
- Test with multiple lines, multiple machines per line

- [ ] **Step 1: Create yaml_gen.go with GenerateYAML**
- [ ] **Step 2: Create yaml_gen_test.go with test cases**
- [ ] **Step 3: Add ExportYAML handler**
- [ ] **Step 4: Run tests: `make test-one TEST=TestGenerateYAML PKG=internal/worker_config`**
- [ ] **Step 5: Commit**

```bash
git add internal/worker_config/
git commit -m "feat(sp4): add YAML generation with tests"
```

---

### Task 5: Backend — Route Registration + CORS Fix

**Files:**
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Fix CORS — add PATCH to AllowedMethods**

Change line 96:
```go
AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
```

- [ ] **Step 2: Add worker config routes**

Read existing main.go. Add inside the protected `/api` route group (using existing `globalScope`):

```go
// Worker Configs
workerConfigStore := worker_config.NewStore(pool)
workerConfigHandler := worker_config.NewHandler(workerConfigStore)

r.Route("/worker-configs", func(r chi.Router) {
    r.With(rbacMW.Require("workers:manage", globalScope)).Get("/", workerConfigHandler.ListConfigs)
    r.With(rbacMW.Require("workers:manage", globalScope), auditMW.Log("worker_config", "create")).Post("/", workerConfigHandler.CreateConfig)
    r.Route("/{configID}", func(r chi.Router) {
        r.With(rbacMW.Require("workers:manage", globalScope)).Get("/", workerConfigHandler.GetConfig)
        r.With(rbacMW.Require("workers:manage", globalScope), auditMW.Log("worker_config", "update")).Put("/", workerConfigHandler.UpdateConfig)
        r.With(rbacMW.Require("workers:manage", globalScope), auditMW.Log("worker_config", "delete")).Delete("/", workerConfigHandler.DeleteConfig)
        r.With(rbacMW.Require("workers:manage", globalScope), auditMW.Log("worker_config", "set_machines")).Put("/machines", workerConfigHandler.SetConfigMachines)
        r.With(rbacMW.Require("workers:manage", globalScope)).Get("/yaml", workerConfigHandler.ExportYAML)
    })
})
```

- [ ] **Step 3: Add register routes to existing machines block**

Extend `/machines/{machineID}`:
```go
r.With(rbacMW.Require("machine:edit", rbac.SiteFromQuery)).Get("/registers", siteHandler.GetRegisters)
r.With(rbacMW.Require("machine:edit", rbac.SiteFromQuery), auditMW.Log("machine", "set_registers")).Put("/registers", siteHandler.SetRegisters)
r.With(rbacMW.Require("machine:edit", rbac.SiteFromQuery)).Post("/registers/import", siteHandler.ImportRegistersCSV)
```

- [ ] **Step 4: Add import for `worker_config` package**
- [ ] **Step 5: Verify: `go build ./... && make test`**
- [ ] **Step 6: Commit**

```bash
git add cmd/server/main.go
git commit -m "feat(sp4): register worker config routes and fix CORS PATCH"
```

---

### Task 6: Frontend — i18n + Sidebar + Routes + Hooks

**Files:**
- Modify: `frontend/src/locales/en.json` (+ zh-TW, th, vi)
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/hooks.ts`

- [ ] **Step 1: Add i18n keys**

Add to `admin` section in all 4 locales:
```json
"workerConfigs": "Worker Configs",
"addWorkerConfig": "Add Config",
"editWorkerConfig": "Edit Config",
"deleteWorkerConfig": "Delete Config",
"configName": "Config name",
"pollInterval": "Poll interval",
"selectMachines": "Select Machines",
"configureRegisters": "Configure Registers",
"previewYaml": "Preview YAML",
"downloadYaml": "Download YAML",
"noWorkerConfigs": "No worker configs.",
"registerName": "Name",
"registerAddress": "Address",
"registerType": "Type",
"registerDataType": "Data Type",
"registerUnit": "Unit",
"registerScale": "Scale",
"registerOffset": "Offset",
"registerByteOrder": "Byte Order",
"addRegister": "Add Register",
"deleteRegister": "Delete",
"importCsv": "Import CSV",
"replaceAll": "Replace all",
"appendExisting": "Append",
"importPreview": "Import Preview",
"parsedRows": "{{count}} rows parsed",
"notDeployed": "Not deployed",
"connectionSettings": "Connection",
"basicSettings": "Basic Settings",
"yamlPreview": "YAML Preview"
```

Add to `nav`: `"workerConfigs": "Worker Configs"`

Chinese (zh-TW) translations for key terms:
- workerConfigs: "採集器配置"
- addWorkerConfig: "新增配置"
- registerName: "名稱"
- registerAddress: "位址"
- importCsv: "匯入 CSV"
- previewYaml: "預覽 YAML"
- downloadYaml: "下載 YAML"

- [ ] **Step 2: Add sidebar item**

Add to `adminNav` in Sidebar.tsx:
```tsx
{ to: '/admin/worker-configs', label: t('nav.workerConfigs'), icon: FileCode },
```
Import `FileCode` from lucide-react.

- [ ] **Step 3: Add routes in App.tsx**

```tsx
import { WorkerConfigsPage } from '@/pages/admin/WorkerConfigsPage';
import { WorkerConfigEditPage } from '@/pages/admin/WorkerConfigEditPage';

// Inside AppShell routes:
<Route path="/admin/worker-configs" element={<WorkerConfigsPage />} />
<Route path="/admin/worker-configs/new" element={<WorkerConfigEditPage />} />
<Route path="/admin/worker-configs/:id" element={<WorkerConfigEditPage />} />
```

- [ ] **Step 4: Add hooks to hooks.ts**

```tsx
// Worker Configs
export function useWorkerConfigs() {
  return useQuery({
    queryKey: ['worker-configs'],
    queryFn: () => fetchJSON<any[]>('/worker-configs'),
  });
}

export function useWorkerConfig(id: string | undefined) {
  return useQuery({
    queryKey: ['worker-config', id],
    queryFn: () => fetchJSON<any>(`/worker-configs/${id}`),
    enabled: !!id,
  });
}

export function useCreateWorkerConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; site_id: string; poll_interval: string }) =>
      mutateJSON('/worker-configs', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-configs'] }),
  });
}

export function useUpdateWorkerConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; site_id: string; poll_interval: string }) =>
      mutateJSON(`/worker-configs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-configs'] });
      qc.invalidateQueries({ queryKey: ['worker-config'] });
    },
  });
}

export function useDeleteWorkerConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateJSON(`/worker-configs/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-configs'] }),
  });
}

export function useSetConfigMachines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ configId, machines }: { configId: string; machines: any[] }) =>
      mutateJSON(`/worker-configs/${configId}/machines`, { method: 'PUT', body: JSON.stringify({ machines }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-config'] }),
  });
}

export function useMachineRegisters(machineId: string | undefined) {
  return useQuery({
    queryKey: ['machine-registers', machineId],
    queryFn: () => fetchJSON<any>(`/machines/${machineId}/registers`),
    enabled: !!machineId,
  });
}

export function useSetMachineRegisters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ machineId, registers }: { machineId: string; registers: any[] }) =>
      mutateJSON(`/machines/${machineId}/registers`, { method: 'PUT', body: JSON.stringify({ registers }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['machine-registers'] }),
  });
}

export function useImportRegistersCSV() {
  return useMutation({
    mutationFn: ({ machineId, csv }: { machineId: string; csv: string }) =>
      apiFetch(`/machines/${machineId}/registers/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      }).then(async r => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      }),
  });
}

export function useDownloadWorkerConfigYAML() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/worker-configs/${id}/yaml`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'config.yaml';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}
```

- [ ] **Step 5: Create placeholder pages**

`WorkerConfigsPage.tsx`:
```tsx
import { useTranslation } from 'react-i18next';
export function WorkerConfigsPage() {
  const { t } = useTranslation();
  return <div className="p-4"><h2 className="text-xl font-bold">{t('admin.workerConfigs')}</h2></div>;
}
```

`WorkerConfigEditPage.tsx`:
```tsx
import { useTranslation } from 'react-i18next';
export function WorkerConfigEditPage() {
  const { t } = useTranslation();
  return <div className="p-4"><h2 className="text-xl font-bold">{t('admin.editWorkerConfig')}</h2></div>;
}
```

- [ ] **Step 6: Verify: `cd frontend && npm run build`**
- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat(sp4): add i18n, sidebar, routes, hooks, and placeholder pages for worker configs"
```

---

### Task 7: Frontend — Worker Configs List Page

**Files:**
- Modify: `frontend/src/pages/admin/WorkerConfigsPage.tsx`

Replace placeholder with full implementation:

- Table with columns: Name, Site, Machines, Poll Interval, Worker Status, Actions
- Worker Status: green "Online" badge, gray "Offline", or "Not deployed" (from API response)
- Actions: Edit (link to /admin/worker-configs/:id), Download YAML, Delete
- Delete uses existing DeleteDialog
- Download calls `useDownloadWorkerConfigYAML`
- "+ Add Config" button links to /admin/worker-configs/new
- All strings via `t()`

- [ ] **Step 1: Implement full WorkerConfigsPage**
- [ ] **Step 2: Verify: `cd frontend && npm run build`**
- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/WorkerConfigsPage.tsx
git commit -m "feat(sp4): implement worker configs list page"
```

---

### Task 8: Frontend — Register Table + CSV Import

**Files:**
- Create: `frontend/src/components/admin/RegisterTable.tsx`
- Create: `frontend/src/components/admin/CsvImportDialog.tsx`

**RegisterTable:**
- Props: `machineId: string`, `machineName: string`
- Fetches registers with `useMachineRegisters(machineId)`
- Editable table rows with inputs/selects for each field
- Add row button (appends empty row with defaults)
- Delete row button per row
- "Import CSV" button opens CsvImportDialog
- "Save" button calls `useSetMachineRegisters`
- Local state manages edited rows; save persists to DB

**CsvImportDialog:**
- Props: `open`, `onClose`, `onImport: (registers: Register[], mode: 'replace' | 'append') => void`
- File upload input (accepts .csv, .json)
- Parses CSV client-side (split by newlines, split by commas, map to register objects)
- Shows preview table (first 10 rows)
- Shows parsed row count
- Radio: "Replace all" / "Append to existing"
- Validation: highlights rows missing name or address in red
- "Import" button calls onImport with parsed data

- [ ] **Step 1: Create RegisterTable**
- [ ] **Step 2: Create CsvImportDialog**
- [ ] **Step 3: Verify: `cd frontend && npm run build`**
- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/RegisterTable.tsx frontend/src/components/admin/CsvImportDialog.tsx
git commit -m "feat(sp4): add register table editor and CSV import dialog"
```

---

### Task 9: Frontend — Config Edit Page + YAML Preview

**Files:**
- Create: `frontend/src/components/admin/YamlPreviewDialog.tsx`
- Modify: `frontend/src/pages/admin/WorkerConfigEditPage.tsx`

**YamlPreviewDialog:**
- Props: `open`, `onClose`, `configId: string`
- Fetches YAML from `/api/worker-configs/:id/yaml` as text
- Displays in a `<pre>` with monospace font, dark background
- "Download" button triggers file download
- "Copy" button copies to clipboard

**WorkerConfigEditPage (tab-based form):**

Three tabs (user can jump between):

**Tab 1: Basic Settings**
- Worker name (Input)
- Site (Select from `useAdminSites`)
- Poll interval (Input, default "5s")
- On create: POST, then redirect to edit page with ID
- On edit: PUT to update

**Tab 2: Select Machines**
- Fetch site detail with `useSiteDetail(selectedSiteId)`
- Group machines by line
- Each machine has a checkbox + connection fields (host, port, slave_id) shown when checked
- Save button calls `useSetConfigMachines`

**Tab 3: Configure Registers**
- For each selected machine (from Tab 2), show a collapsible section
- Each section contains a RegisterTable component
- Machine name + model shown as section header

**Footer: Preview & Download buttons**
- "Preview YAML" → opens YamlPreviewDialog
- "Download YAML" → calls useDownloadWorkerConfigYAML
- Only enabled when config has been saved (has an ID)

**Route params:**
- `/admin/worker-configs/new` → create mode (no ID)
- `/admin/worker-configs/:id` → edit mode (load existing)

- [ ] **Step 1: Create YamlPreviewDialog**
- [ ] **Step 2: Implement WorkerConfigEditPage with all 3 tabs**
- [ ] **Step 3: Verify: `cd frontend && npm run build`**
- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/WorkerConfigEditPage.tsx frontend/src/components/admin/YamlPreviewDialog.tsx
git commit -m "feat(sp4): implement config edit page with tabs, register editor, and YAML preview"
```

---

### Task 10: Manual Integration Testing

- [ ] **Step 1: `make migrate`**
- [ ] **Step 2: Start backend `make dev`**
- [ ] **Step 3: Start frontend `cd frontend && npm run dev`**
- [ ] **Step 4: Login via dev login**
- [ ] **Step 5: Navigate to Admin → Worker Configs**
- [ ] **Step 6: Create a new config:**
  - Name: "test-config", Site: Factory Alpha, Poll: 5s
  - Select machines: CNC-01, CNC-02
  - Set connections: host 192.168.1.101/102, port 502, slave_id 1
  - Add registers to CNC-01 (manually)
  - Import CSV registers to CNC-02
  - Preview YAML
  - Download YAML
- [ ] **Step 7: Start worker with downloaded YAML:**
  ```bash
  make worker-config CONFIG=./test-config.yaml
  ```
- [ ] **Step 8: Verify worker appears in Workers page as online**
- [ ] **Step 9: Switch language, verify all strings translate**
- [ ] **Step 10: Commit any fixes**
