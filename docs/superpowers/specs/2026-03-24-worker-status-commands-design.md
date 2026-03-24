# SP2: Worker Status Reporting & Command Queue — Design Spec

**Goal:** Enable the dashboard to see all running workers and send management commands (stop, restart, reload_config) via a DB-based command queue.

**Architecture:** Workers register themselves in a `workers` table on startup, heartbeat every 30s, and poll a `worker_commands` table every 10s. The Go server exposes REST endpoints for listing workers and sending commands.

**Tech Stack:** Go, PostgreSQL (existing), chi router (existing), pgx (existing)

---

## 1. Database Schema

### `workers` table (new)

Note: This is a new table distinct from the existing `machine_workers` table (migration 008). The `machine_workers` table tracks per-machine claims; the `workers` table tracks worker processes themselves.

```sql
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'online',  -- online, offline, error
    hostname VARCHAR(255),
    ip_address VARCHAR(45),
    pid INTEGER,
    version VARCHAR(50),
    config_path TEXT,
    os_info VARCHAR(255),
    started_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `worker_commands` table (new)

```sql
CREATE TABLE worker_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    command VARCHAR(50) NOT NULL,          -- stop, restart, reload_config
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, in_progress, completed, failed
    params JSONB,                          -- reserved for future commands (e.g. {"config_path": "..."} for remote config update)
    result TEXT,                           -- execution result or error message
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_worker_commands_pending ON worker_commands(worker_id, status) WHERE status = 'pending';
```

### Modify `machine_workers` (existing table from migration 008)

The existing `machine_workers.worker_id` column is `VARCHAR(255)` containing `hostname-PID` strings. We migrate this to reference the new `workers` table:

```sql
-- Add FK to workers table
ALTER TABLE machine_workers ADD COLUMN worker_ref_id UUID REFERENCES workers(id);

-- The legacy worker_id VARCHAR column is kept for backward compatibility during migration.
-- After SP2 is fully deployed, a future migration can drop it.
-- Going forward, ClaimMachines sets BOTH worker_id (string) and worker_ref_id (UUID).
```

### Down migration order for migration 014

The down migration must reverse in order: drop `worker_ref_id` column from `machine_workers` first (removes FK), then drop the `workers` table.

```sql
-- 014 down
ALTER TABLE machine_workers DROP COLUMN IF EXISTS worker_ref_id;
DROP TABLE IF EXISTS workers;
```

---

## 2. Worker Identity & Takeover Rule

Workers are identified by `worker_name` from the config YAML, mapped to `workers.name` (UNIQUE constraint).

### Stale = Take Over, Alive = Reject

When a worker starts with a `worker_name` that already exists in the DB:

- **Stale** (heartbeat_at older than 90 seconds): The existing worker is considered dead. The new worker takes over — updates the record with its own metadata (IP, PID, hostname, started_at) and proceeds normally. This covers:
  - Process crash → restart on same machine
  - Migration → start on a different machine after old one is decommissioned
  - No manual cleanup needed

- **Alive** (heartbeat_at within 90 seconds): The existing worker is still running. The new worker **exits with an error**:
  ```
  worker 'line-1-worker' is already running on 192.168.1.10 (last heartbeat: 2s ago)
  ```
  This prevents two workers from competing for the same machines.

- **Not found**: Normal startup — INSERT new worker record.

### Fallback Name

If `worker_name` is not set in config YAML, the coordinator already generates `hostname-PID` (existing behavior in `coordinator.go`). This auto-generated name is now registered into the `workers` table.

**Warning:** Auto-generated names are not recommended for production. Since PID changes on every restart, the old `hostname-oldPID` row becomes an orphan (stale but with a different name). It will be marked offline by stale detection after 90s, but accumulates as noise over time. A future cleanup job can periodically delete offline workers with no machine claims older than e.g. 24 hours. For SP2, this is an accepted limitation — always set `worker_name` in production configs.

---

## 3. Worker Lifecycle

### Startup Sequence

1. Load config YAML
2. Connect to DB
3. **Register worker** (uses `SELECT ... FOR UPDATE` to prevent race conditions):
   ```sql
   SELECT id, status, heartbeat_at, ip_address FROM workers WHERE name = $1 FOR UPDATE;
   ```
   - Not found → INSERT new worker (status=online, fill all metadata)
   - Found + stale (heartbeat > 90s) → UPDATE with new metadata, set status=online
   - Found + alive (heartbeat < 90s) → log error with existing worker's IP/hostname, EXIT
4. Provision site/lines/machines (existing flow)
5. Claim machines (existing flow, sets both `worker_id` string and `worker_ref_id` UUID)
6. Start heartbeat loop (updates `workers.heartbeat_at` every 30s)
7. Start command poller loop (polls `worker_commands` every 10s)
8. Start data collection (existing RunMachine goroutines)

### Worker Metadata

Collected at startup and stored in the `workers` table:

| Field | Source |
|-------|--------|
| `hostname` | `os.Hostname()` |
| `ip_address` | First non-loopback interface IP via `net.InterfaceAddrs()` |
| `pid` | `os.Getpid()` |
| `version` | Build-time variable injected via `go build -ldflags "-X main.version=1.0.0"`, defaults to `"dev"` |
| `config_path` | Absolute path of the config YAML file passed via `-config` flag |
| `os_info` | `runtime.GOOS + "/" + runtime.GOARCH` |
| `started_at` | `time.Now()` at registration |

### Coordinator State

After SP2, the `Coordinator` struct must hold these fields:

| Field | Type | Source |
|-------|------|--------|
| `workerID` | `string` | Legacy `hostname-PID` string (kept for `machine_workers.worker_id` VARCHAR column) |
| `workerDBID` | `uuid.UUID` | UUID returned from `workers.id` at registration — used for all `workers` table operations |
| `configPath` | `string` | Absolute path of config YAML, frozen at startup for `reload_config` |
| `machineCancels` | `map[string]context.CancelFunc` | Per-machine cancel functions keyed by machine name — enables `reload_config` to stop individual machines |

### Heartbeat

Every 30s, updates both tables. Uses `workerDBID` (UUID) for the `workers` table:

```sql
UPDATE workers SET heartbeat_at = NOW(), updated_at = NOW() WHERE id = $1;  -- $1 = workerDBID (UUID)
UPDATE machine_workers SET heartbeat_at = NOW() WHERE worker_id = $2 AND machine_id = ANY($3);  -- $2 = workerID (string)
```

The `workers` table heartbeat is the primary one — stale detection depends on it.

### Graceful Shutdown

1. Cancel context → stops all RunMachine goroutines
2. Release machines (delete from `machine_workers`)
3. Set worker status to `offline` in `workers` table
4. Exit

### Stale Detection (on API read)

When the API lists workers, stale detection runs as an idempotent UPDATE within the same transaction as the SELECT:

```sql
-- Inside the list-workers transaction:
UPDATE workers SET status = 'offline', updated_at = NOW()
WHERE status != 'offline' AND heartbeat_at < NOW() - INTERVAL '90 seconds';

-- Then SELECT all workers
SELECT ... FROM workers ORDER BY name;
```

This is safe for concurrent API calls because `WHERE status != 'offline'` makes it idempotent. The response reflects post-update status.

Additionally, stale detection releases machine claims and marks orphaned machines offline. This runs as a single CTE to avoid capturing machine IDs after deletion:

```sql
-- Run inside the same transaction as the list query (READ COMMITTED isolation):
WITH stale AS (
    UPDATE workers SET status = 'offline', updated_at = NOW()
    WHERE status != 'offline' AND heartbeat_at < NOW() - INTERVAL '90 seconds'
    RETURNING id
),
released AS (
    DELETE FROM machine_workers
    WHERE worker_ref_id IN (SELECT id FROM stale)
    RETURNING machine_id
)
UPDATE machines SET status = 'offline', updated_at = NOW()
WHERE id IN (SELECT machine_id FROM released);

-- Then SELECT all workers
SELECT ... FROM workers ORDER BY name;
```

The entire stale detection + list runs inside a single `pgxpool.BeginTx` transaction with READ COMMITTED isolation. This ensures the SELECT sees the just-updated rows.

**Transition period:** During migration (before all workers have `worker_ref_id` set), any `machine_workers` rows with `worker_ref_id IS NULL` are handled by the legacy `worker_id` VARCHAR column. The CTE above only operates on rows with `worker_ref_id` set. Legacy rows without `worker_ref_id` will be cleaned up when those workers restart under SP2 code (which sets both columns).

---

## 4. Command Queue

### Sending Commands

Dashboard inserts a row:

```sql
INSERT INTO worker_commands (worker_id, command, status) VALUES ($1, 'restart', 'pending');
```

### Worker Polling (every 10s)

Uses `FOR UPDATE SKIP LOCKED` to prevent TOCTOU races (safe even though only one worker polls its own commands — future-proofs against implementation bugs):

```sql
-- In a transaction:
SELECT id, command, params FROM worker_commands
WHERE worker_id = $1 AND status = 'pending'
ORDER BY created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- If found, immediately:
UPDATE worker_commands SET status = 'in_progress', started_at = NOW() WHERE id = $2;
-- COMMIT
```

### Command Execution

1. Pick up oldest pending command (atomic select+update as above)
2. Execute the command
3. `UPDATE status = 'completed'` (or `'failed'`), `result = '...'`, `completed_at = NOW()`

### Supported Commands

| Command | Behavior |
|---------|----------|
| `stop` | Mark command `in_progress`, cancel context, release machines, set worker status=offline, mark command `completed`, `os.Exit(0)` |
| `restart` | Mark command `in_progress`, cancel context, release machines. Before calling `syscall.Exec`: mark command `completed` and flush to DB. If `syscall.Exec` fails, mark command `failed` with error message, log the error, and `os.Exit(1)` |
| `reload_config` | Re-read YAML from the `config_path` frozen at startup (not from DB), diff machine list: stop removed, start added, recreate DataSource for changed machines |

### `reload_config` Security Note

The `config_path` used for reload is the path stored in-memory at startup — not re-read from the DB. The DB `config_path` column is informational only (for the dashboard to display). This prevents a compromised DB from directing the worker to read arbitrary files.

### Edge Cases

- **Worker dies mid-command:** Command stays `in_progress`. Dashboard can see `started_at` was long ago and infer failure. The stale detection (Section 3) will eventually mark the worker offline.
- **Multiple pending commands:** Executed one at a time, oldest first. If `stop` is pending, later commands won't execute (worker exits).
- **`restart` exec failure:** The command is marked `completed` before exec. If exec fails, the command is updated to `failed` with the error, and the process exits with code 1. The stale detection will mark the worker offline.
- **`reload_config` details:** Re-reads YAML, calls `Provision()` to upsert site/lines/machines in DB, then diffs the returned `ProvisionedMachine` list against the in-memory list. Comparison key is `machine name` (unique per line). Machines no longer in config → call `machineCancels[name]()` to cancel their goroutine, release from `machine_workers`. New machines → create DataSource, claim, create per-machine context via `context.WithCancel(parentCtx)`, store cancel func in `machineCancels`, start goroutine with `runner.RunMachine(machineCtx, machine)`. Existing machines where any register field changed (address, type, data_type, scale, offset, byte_order) → cancel goroutine, recreate DataSource, start new goroutine. Note: `runner.go` remains unchanged — per-machine context is created by the caller (`cmd/worker/main.go` or Coordinator) before passing to `RunMachine`.

---

## 5. API Endpoints

New routes under `/api/workers`, protected by existing auth + RBAC middleware.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workers` | List all workers (with stale detection) |
| GET | `/api/workers/:id` | Worker detail + its machines |
| POST | `/api/workers/:id/commands` | Send command |
| GET | `/api/workers/:id/commands` | Command history for a worker |

### GET /api/workers

`machine_count` is computed as `COUNT(*)` from `machine_workers` where `worker_ref_id = workers.id` (LEFT JOIN, so workers with no machines return 0).

Response:
```json
[
  {
    "id": "uuid",
    "name": "line-1-worker",
    "status": "online",
    "hostname": "factory-server",
    "ip_address": "192.168.1.10",
    "pid": 12345,
    "version": "1.0.0",
    "os_info": "linux/amd64",
    "config_path": "/opt/worker/config.yaml",
    "machine_count": 3,
    "started_at": "2026-03-24T10:00:00Z",
    "heartbeat_at": "2026-03-24T15:30:00Z"
  }
]
```

### GET /api/workers/:id

Response includes worker info + list of machines it owns + last 10 commands.

**Machines join path:** `machine_workers` (via `worker_ref_id`) → `machines` (via `machine_id`) → `production_lines` (via `machines.line_id`). This produces `line_name` from `production_lines.name`.

```json
{
  "id": "uuid",
  "name": "line-1-worker",
  "status": "online",
  "hostname": "factory-server",
  "ip_address": "192.168.1.10",
  "pid": 12345,
  "version": "1.0.0",
  "os_info": "linux/amd64",
  "config_path": "/opt/worker/config.yaml",
  "started_at": "2026-03-24T10:00:00Z",
  "heartbeat_at": "2026-03-24T15:30:00Z",
  "machines": [
    { "id": "uuid", "name": "CNC-01", "status": "running", "line_name": "Line A" },
    { "id": "uuid", "name": "CNC-02", "status": "running", "line_name": "Line A" }
  ],
  "recent_commands": [
    { "id": "uuid", "command": "reload_config", "status": "completed", "result": "ok", "created_at": "...", "started_at": "...", "completed_at": "..." }
  ]
}
```

`recent_commands` returns the last 10 commands ordered by `created_at DESC`.

### POST /api/workers/:id/commands

Request:
```json
{ "command": "restart" }
```

Response:
```json
{ "id": "cmd-uuid", "command": "restart", "status": "pending", "created_at": "..." }
```

Validation: command must be one of `stop`, `restart`, `reload_config`. Worker must exist and be online (reject commands to offline workers). `:id` must be a valid UUID — return 400 if not parseable.

### GET /api/workers/:id/commands

Query params: `?limit=20&offset=0` (defaults: limit=20, offset=0)

Response:
```json
{
  "commands": [
    { "id": "uuid", "command": "restart", "status": "completed", "result": "ok", "created_at": "...", "started_at": "...", "completed_at": "..." }
  ],
  "total": 42
}
```

---

## 6. File Structure

### New Files

| File | Description |
|------|-------------|
| `migrations/014_create_workers_table.up.sql` | `workers` table + alter `machine_workers` to add `worker_ref_id` (verify number against latest merged state) |
| `migrations/014_create_workers_table.down.sql` | Drop `worker_ref_id` column, then drop `workers` table |
| `migrations/015_create_worker_commands.up.sql` | `worker_commands` table + partial index |
| `migrations/015_create_worker_commands.down.sql` | Drop `worker_commands` table |
| `internal/worker_api/handler.go` | REST handlers for worker management |
| `internal/worker_api/store.go` | DB queries for workers and commands |

### Modified Files

| File | Changes |
|------|---------|
| `internal/worker/coordinator.go` | Register in `workers` table, duplicate name check with FOR UPDATE, command poller with FOR UPDATE SKIP LOCKED |
| `internal/worker/config.go` | (no changes needed — `worker_name` already exists) |
| `cmd/worker/main.go` | Wire up command poller, add `-ldflags` version variable, pass `worker_name` to coordinator, use per-machine `context.WithCancel` for goroutines |
| `cmd/server/main.go` | Register `/api/workers` routes |
| `Makefile` | Add `version` ldflags to worker build target |

### Unchanged

- `runner.go`, `datasource*.go`, `decoder.go`, `provisioner.go` — data collection layer untouched

---

## 7. RBAC

Worker management is a **global** (non-site-scoped) permission since workers operate across the system, not within a single site.

New permission: `workers:manage`. The RBAC check uses an empty `siteID` (global scope), bypassing the site extractor. Only users with this permission can:
- View worker list and details
- Send commands to workers

Add to the existing permission seed migration (new migration 016).

---

## 8. Testing

### Unit Tests
- Coordinator registration logic: new worker, stale takeover, alive rejection
- Command poller: correct SQL with FOR UPDATE SKIP LOCKED, parsing command types
- Stale detection: idempotent offline marking
- Command execution: stop/restart/reload_config handlers

### Integration Tests
- Full flow with test DB: register worker → send command via API → verify command picked up and executed
- Concurrent registration: two workers with same name, verify only one succeeds
- Stale detection on API list: create worker with old heartbeat, verify list returns offline status

### Manual Tests
- Start worker, verify it appears in `GET /api/workers`
- Send restart command, verify worker restarts and re-registers
- Kill worker process, wait 90s, verify stale detection marks it offline
