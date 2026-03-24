# SP2: Worker Status Reporting & Command Queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the dashboard to see all running workers and send management commands (stop, restart, reload_config) via a DB-based command queue.

**Architecture:** Workers register themselves in a `workers` table, heartbeat every 30s, and poll a `worker_commands` table every 10s. The Go server exposes REST endpoints for listing workers and sending commands. Stale workers (no heartbeat for 90s) are marked offline on API read.

**Tech Stack:** Go, PostgreSQL (existing), chi router, pgx, testify

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `migrations/014_create_workers_table.up.sql` | `workers` table + `worker_ref_id` FK on `machine_workers` |
| `migrations/014_create_workers_table.down.sql` | Reverse: drop FK column, drop table |
| `migrations/015_create_worker_commands.up.sql` | `worker_commands` table + partial index |
| `migrations/015_create_worker_commands.down.sql` | Drop `worker_commands` table |
| `migrations/016_seed_workers_permission.up.sql` | Add `workers:manage` permission + assign to Admin/Manager |
| `migrations/016_seed_workers_permission.down.sql` | Remove `workers:manage` permission |
| `internal/worker_api/store.go` | DB queries: list workers, get worker, stale detection CTE, send command, list commands |
| `internal/worker_api/store_test.go` | Store tests (uses test DB) |
| `internal/worker_api/handler.go` | REST handlers: ListWorkers, GetWorker, SendCommand, ListCommands |
| `internal/worker_api/handler_test.go` | Handler tests with mock store |
| `internal/worker/coordinator_test.go` | Unit tests for registration + command poller logic |

### Modified Files

| File | Changes |
|------|---------|
| `internal/worker/coordinator.go` | Add `workerDBID`, `configPath`, `machineCancels`; register in `workers` table; command poller; graceful shutdown sets offline |
| `cmd/worker/main.go` | Wire command poller, per-machine `context.WithCancel`, version ldflags |
| `cmd/server/main.go` | Import `worker_api`, register `/api/workers` routes |
| `Makefile` | Add `VERSION` ldflags to `worker` target |

---

### Task 1: Database Migrations

**Files:**
- Create: `migrations/014_create_workers_table.up.sql`
- Create: `migrations/014_create_workers_table.down.sql`
- Create: `migrations/015_create_worker_commands.up.sql`
- Create: `migrations/015_create_worker_commands.down.sql`
- Create: `migrations/016_seed_workers_permission.up.sql`
- Create: `migrations/016_seed_workers_permission.down.sql`

- [ ] **Step 1: Create migration 014 — workers table + machine_workers FK**

`migrations/014_create_workers_table.up.sql`:
```sql
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'online',
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

ALTER TABLE machine_workers ADD COLUMN worker_ref_id UUID REFERENCES workers(id);
```

`migrations/014_create_workers_table.down.sql`:
```sql
ALTER TABLE machine_workers DROP COLUMN IF EXISTS worker_ref_id;
DROP TABLE IF EXISTS workers;
```

- [ ] **Step 2: Create migration 015 — worker_commands table**

`migrations/015_create_worker_commands.up.sql`:
```sql
CREATE TABLE worker_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    command VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    params JSONB,
    result TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_worker_commands_pending ON worker_commands(worker_id, status) WHERE status = 'pending';
```

`migrations/015_create_worker_commands.down.sql`:
```sql
DROP TABLE IF EXISTS worker_commands;
```

- [ ] **Step 3: Create migration 016 — seed workers:manage permission**

`migrations/016_seed_workers_permission.up.sql`:
```sql
INSERT INTO permissions (code, group_name, description) VALUES
    ('workers:manage', 'Admin', 'Manage workers (view, send commands)')
ON CONFLICT (code) DO NOTHING;

-- Grant to Admin role (Admin already gets all via CROSS JOIN in 009, but this covers the new permission)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Admin' AND p.code = 'workers:manage'
ON CONFLICT DO NOTHING;

-- Grant to Manager role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Manager' AND p.code = 'workers:manage'
ON CONFLICT DO NOTHING;
```

`migrations/016_seed_workers_permission.down.sql`:
```sql
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'workers:manage');
DELETE FROM permissions WHERE code = 'workers:manage';
```

- [ ] **Step 4: Run migrations to verify they apply cleanly**

Run: `make migrate`
Expected: All migrations applied without errors.

- [ ] **Step 5: Verify rollback works**

Run: `make migrate-down` (3 times to roll back 016, 015, 014)
Then: `make migrate` (re-apply all)
Expected: Clean rollback and re-apply.

- [ ] **Step 6: Commit**

```bash
git add migrations/014_create_workers_table.up.sql migrations/014_create_workers_table.down.sql \
      migrations/015_create_worker_commands.up.sql migrations/015_create_worker_commands.down.sql \
      migrations/016_seed_workers_permission.up.sql migrations/016_seed_workers_permission.down.sql
git commit -m "feat(sp2): add workers, worker_commands tables and workers:manage permission"
```

---

### Task 2: Worker API Store — DB Queries

**Files:**
- Create: `internal/worker_api/store.go`
- Create: `internal/worker_api/store_test.go`

**Context:** This store handles all DB operations for the API side (server reads worker data, inserts commands). The worker-side DB operations (registration, heartbeat, command polling) live in `internal/worker/coordinator.go` (Task 4).

- [ ] **Step 1: Write the store with all query methods**

`internal/worker_api/store.go`:
```go
package worker_api

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

type Worker struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	Hostname     string    `json:"hostname"`
	IPAddress    string    `json:"ip_address"`
	PID          int       `json:"pid"`
	Version      string    `json:"version"`
	ConfigPath   string    `json:"config_path"`
	OSInfo       string    `json:"os_info"`
	MachineCount int       `json:"machine_count"`
	StartedAt    time.Time `json:"started_at"`
	HeartbeatAt  time.Time `json:"heartbeat_at"`
}

type WorkerDetail struct {
	Worker
	Machines       []WorkerMachine  `json:"machines"`
	RecentCommands []CommandSummary `json:"recent_commands"`
}

type WorkerMachine struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	LineName string `json:"line_name"`
}

type Command struct {
	ID          string     `json:"id"`
	WorkerID    string     `json:"worker_id"`
	Command     string     `json:"command"`
	Status      string     `json:"status"`
	Result      *string    `json:"result"`
	CreatedAt   time.Time  `json:"created_at"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

type CommandSummary struct {
	ID          string     `json:"id"`
	Command     string     `json:"command"`
	Status      string     `json:"status"`
	Result      *string    `json:"result"`
	CreatedAt   time.Time  `json:"created_at"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

// ListWorkers runs stale detection then returns all workers.
func (s *Store) ListWorkers(ctx context.Context) ([]Worker, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Stale detection CTE: mark stale workers offline, release machines, mark machines offline
	_, err = tx.Exec(ctx, `
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
		WHERE id IN (SELECT machine_id FROM released)
	`)
	if err != nil {
		return nil, fmt.Errorf("stale detection: %w", err)
	}

	rows, err := tx.Query(ctx, `
		SELECT w.id, w.name, w.status,
		       COALESCE(w.hostname, ''), COALESCE(w.ip_address, ''),
		       COALESCE(w.pid, 0), COALESCE(w.version, ''),
		       COALESCE(w.config_path, ''), COALESCE(w.os_info, ''),
		       COUNT(mw.machine_id)::int,
		       COALESCE(w.started_at, w.created_at), w.heartbeat_at
		FROM workers w
		LEFT JOIN machine_workers mw ON mw.worker_ref_id = w.id
		GROUP BY w.id
		ORDER BY w.name
	`)
	if err != nil {
		return nil, fmt.Errorf("query workers: %w", err)
	}
	defer rows.Close()

	var workers []Worker
	for rows.Next() {
		var w Worker
		if err := rows.Scan(
			&w.ID, &w.Name, &w.Status,
			&w.Hostname, &w.IPAddress,
			&w.PID, &w.Version,
			&w.ConfigPath, &w.OSInfo,
			&w.MachineCount,
			&w.StartedAt, &w.HeartbeatAt,
		); err != nil {
			return nil, fmt.Errorf("scan worker: %w", err)
		}
		workers = append(workers, w)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	if workers == nil {
		workers = []Worker{}
	}
	return workers, nil
}

// GetWorker returns worker detail with machines and recent commands.
func (s *Store) GetWorker(ctx context.Context, workerID string) (*WorkerDetail, error) {
	var w WorkerDetail
	err := s.db.QueryRow(ctx, `
		SELECT id, name, status,
		       COALESCE(hostname, ''), COALESCE(ip_address, ''),
		       COALESCE(pid, 0), COALESCE(version, ''),
		       COALESCE(config_path, ''), COALESCE(os_info, ''),
		       COALESCE(started_at, created_at), heartbeat_at
		FROM workers WHERE id = $1
	`, workerID).Scan(
		&w.ID, &w.Name, &w.Status,
		&w.Hostname, &w.IPAddress,
		&w.PID, &w.Version,
		&w.ConfigPath, &w.OSInfo,
		&w.StartedAt, &w.HeartbeatAt,
	)
	if err != nil {
		return nil, err
	}

	// Machines via machine_workers → machines → production_lines
	machineRows, err := s.db.Query(ctx, `
		SELECT m.id, m.name, m.status, pl.name
		FROM machine_workers mw
		JOIN machines m ON m.id = mw.machine_id
		JOIN production_lines pl ON pl.id = m.line_id
		WHERE mw.worker_ref_id = $1
		ORDER BY pl.name, m.name
	`, workerID)
	if err != nil {
		return nil, fmt.Errorf("query machines: %w", err)
	}
	defer machineRows.Close()

	w.Machines = []WorkerMachine{}
	for machineRows.Next() {
		var m WorkerMachine
		if err := machineRows.Scan(&m.ID, &m.Name, &m.Status, &m.LineName); err != nil {
			return nil, fmt.Errorf("scan machine: %w", err)
		}
		w.Machines = append(w.Machines, m)
	}
	w.MachineCount = len(w.Machines)

	// Recent commands (last 10)
	cmdRows, err := s.db.Query(ctx, `
		SELECT id, command, status, result, created_at, started_at, completed_at
		FROM worker_commands
		WHERE worker_id = $1
		ORDER BY created_at DESC
		LIMIT 10
	`, workerID)
	if err != nil {
		return nil, fmt.Errorf("query commands: %w", err)
	}
	defer cmdRows.Close()

	w.RecentCommands = []CommandSummary{}
	for cmdRows.Next() {
		var c CommandSummary
		if err := cmdRows.Scan(&c.ID, &c.Command, &c.Status, &c.Result, &c.CreatedAt, &c.StartedAt, &c.CompletedAt); err != nil {
			return nil, fmt.Errorf("scan command: %w", err)
		}
		w.RecentCommands = append(w.RecentCommands, c)
	}

	return &w, nil
}

// ErrWorkerNotFound indicates the worker does not exist.
var ErrWorkerNotFound = fmt.Errorf("worker not found")

// ErrWorkerOffline indicates the worker is not online.
var ErrWorkerOffline = fmt.Errorf("worker is offline")

// SendCommand inserts a pending command. Returns the created command.
// Validates worker exists and is online.
func (s *Store) SendCommand(ctx context.Context, workerID, command string) (*Command, error) {
	// Verify worker exists and is online
	var status string
	err := s.db.QueryRow(ctx, `SELECT status FROM workers WHERE id = $1`, workerID).Scan(&status)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrWorkerNotFound
		}
		return nil, fmt.Errorf("query worker: %w", err)
	}
	if status != "online" {
		return nil, ErrWorkerOffline
	}

	var cmd Command
	err = s.db.QueryRow(ctx, `
		INSERT INTO worker_commands (worker_id, command, status)
		VALUES ($1, $2, 'pending')
		RETURNING id, worker_id, command, status, result, created_at, started_at, completed_at
	`, workerID, command).Scan(
		&cmd.ID, &cmd.WorkerID, &cmd.Command, &cmd.Status,
		&cmd.Result, &cmd.CreatedAt, &cmd.StartedAt, &cmd.CompletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert command: %w", err)
	}
	return &cmd, nil
}

// ListCommands returns paginated command history for a worker.
func (s *Store) ListCommands(ctx context.Context, workerID string, limit, offset int) ([]Command, int, error) {
	var total int
	err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM worker_commands WHERE worker_id = $1`, workerID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count commands: %w", err)
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, worker_id, command, status, result, created_at, started_at, completed_at
		FROM worker_commands
		WHERE worker_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, workerID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("query commands: %w", err)
	}
	defer rows.Close()

	var commands []Command
	for rows.Next() {
		var c Command
		if err := rows.Scan(&c.ID, &c.WorkerID, &c.Command, &c.Status, &c.Result, &c.CreatedAt, &c.StartedAt, &c.CompletedAt); err != nil {
			return nil, 0, fmt.Errorf("scan command: %w", err)
		}
		commands = append(commands, c)
	}
	if commands == nil {
		commands = []Command{}
	}
	return commands, total, nil
}
```

- [ ] **Step 2: Run `go build ./...` to verify compilation**

Run: `go build ./...`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add internal/worker_api/store.go
git commit -m "feat(sp2): add worker_api store with list, detail, send command, list commands"
```

---

### Task 3: Worker API Handler — REST Endpoints

**Files:**
- Create: `internal/worker_api/handler.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Write the handler**

`internal/worker_api/handler.go`:
```go
package worker_api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

var validCommands = map[string]bool{
	"stop":          true,
	"restart":       true,
	"reload_config": true,
}

func (h *Handler) ListWorkers(w http.ResponseWriter, r *http.Request) {
	workers, err := h.store.ListWorkers(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(workers)
}

func (h *Handler) GetWorker(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "workerID")
	if _, err := uuid.Parse(id); err != nil {
		http.Error(w, "invalid worker ID", http.StatusBadRequest)
		return
	}
	worker, err := h.store.GetWorker(r.Context(), id)
	if err != nil {
		http.Error(w, "worker not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(worker)
}

func (h *Handler) SendCommand(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "workerID")
	if _, err := uuid.Parse(id); err != nil {
		http.Error(w, "invalid worker ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Command string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if !validCommands[body.Command] {
		http.Error(w, "invalid command: must be stop, restart, or reload_config", http.StatusBadRequest)
		return
	}

	cmd, err := h.store.SendCommand(r.Context(), id, body.Command)
	if err != nil {
		switch err {
		case ErrWorkerNotFound:
			http.Error(w, "worker not found", http.StatusNotFound)
		case ErrWorkerOffline:
			http.Error(w, "worker is offline, cannot send commands", http.StatusBadRequest)
		default:
			http.Error(w, "internal error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cmd)
}

func (h *Handler) ListCommands(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "workerID")
	if _, err := uuid.Parse(id); err != nil {
		http.Error(w, "invalid worker ID", http.StatusBadRequest)
		return
	}

	limit := 20
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	commands, total, err := h.store.ListCommands(r.Context(), id, limit, offset)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"commands": commands,
		"total":    total,
	})
}
```

- [ ] **Step 2: Add `github.com/google/uuid` dependency**

Run: `go get github.com/google/uuid`

- [ ] **Step 3: Wire routes in cmd/server/main.go**

Add import:
```go
"github.com/industry-dashboard/server/internal/worker_api"
```

Add after `dashboardHandler` initialization (around line 72):
```go
workerAPIStore := worker_api.NewStore(pool)
workerAPIHandler := worker_api.NewHandler(workerAPIStore)
```

Add global site extractor function — a `SiteExtractor` that returns empty string for global permissions. Add inside the protected `/api` route group (after the RBAC admin routes, before the closing `}`):
```go
// Workers (global permission — no site scope)
globalScope := func(r *http.Request) string { return "" }
r.Route("/workers", func(r chi.Router) {
    r.With(rbacMW.Require("workers:manage", globalScope)).Get("/", workerAPIHandler.ListWorkers)
    r.Route("/{workerID}", func(r chi.Router) {
        r.With(rbacMW.Require("workers:manage", globalScope)).Get("/", workerAPIHandler.GetWorker)
        r.With(rbacMW.Require("workers:manage", globalScope), auditMW.Log("worker", "command")).Post("/commands", workerAPIHandler.SendCommand)
        r.With(rbacMW.Require("workers:manage", globalScope)).Get("/commands", workerAPIHandler.ListCommands)
    })
})
```

- [ ] **Step 4: Verify compilation**

Run: `go build ./...`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add internal/worker_api/handler.go cmd/server/main.go go.mod go.sum
git commit -m "feat(sp2): add worker API handler with list, detail, send command, list commands endpoints"
```

---

### Task 4: Coordinator — Worker Registration & Command Poller

**Files:**
- Modify: `internal/worker/coordinator.go`
- Create: `internal/worker/coordinator_test.go`

**Context:** The existing `Coordinator` struct has: `db`, `workerID` (string), `heartbeatInterval`, `staleThreshold`. We need to add: `workerDBID` (UUID from `workers` table), `configPath`, `machineCancels`. We also add: `Register()` (with stale/alive check), `PollCommands()`, updated `StartHeartbeat()`, and `SetOffline()`.

- [ ] **Step 1: Write tests for registration logic**

`internal/worker/coordinator_test.go`:
```go
package worker_test

import (
	"testing"

	"github.com/industry-dashboard/server/internal/worker"
	"github.com/stretchr/testify/assert"
)

func TestCoordinatorWorkerID(t *testing.T) {
	// Verify NewCoordinator generates a non-empty workerID
	c := worker.NewCoordinator(nil, "test-worker", "/tmp/config.yaml", "dev")
	assert.NotEmpty(t, c.WorkerID())
	assert.Equal(t, "test-worker", c.WorkerName())
}

func TestCoordinatorFallbackName(t *testing.T) {
	// When worker_name is empty, should use hostname-PID fallback
	c := worker.NewCoordinator(nil, "", "/tmp/config.yaml", "dev")
	assert.NotEmpty(t, c.WorkerName())
	assert.Contains(t, c.WorkerName(), "-") // hostname-PID format
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `make test-one TEST=TestCoordinator PKG=internal/worker`
Expected: FAIL — `NewCoordinator` signature doesn't match yet.

- [ ] **Step 3: Rewrite coordinator.go**

Replace the contents of `internal/worker/coordinator.go` with:

```go
package worker

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"runtime"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type CommandHandler func(ctx context.Context, command string, params []byte) error

type Coordinator struct {
	db                *pgxpool.Pool
	workerID          string // legacy hostname-PID string
	workerName        string // from config or fallback
	workerDBID        string // UUID from workers table
	configPath        string
	version           string
	heartbeatInterval time.Duration
	staleThreshold    time.Duration
	commandInterval   time.Duration
	machineCancels    map[string]context.CancelFunc
}

func NewCoordinator(db *pgxpool.Pool, workerName, configPath, version string) *Coordinator {
	hostname, _ := os.Hostname()
	workerID := fmt.Sprintf("%s-%d", hostname, os.Getpid())

	if workerName == "" {
		workerName = workerID
	}

	return &Coordinator{
		db:                db,
		workerID:          workerID,
		workerName:        workerName,
		configPath:        configPath,
		version:           version,
		heartbeatInterval: 30 * time.Second,
		staleThreshold:    90 * time.Second,
		commandInterval:   10 * time.Second,
		machineCancels:    make(map[string]context.CancelFunc),
	}
}

func (c *Coordinator) WorkerID() string                        { return c.workerID }
func (c *Coordinator) WorkerName() string                       { return c.workerName }
func (c *Coordinator) WorkerDBID() string                       { return c.workerDBID }
func (c *Coordinator) ConfigPath() string                       { return c.configPath }
func (c *Coordinator) MachineCancels() map[string]context.CancelFunc { return c.machineCancels }

// Register registers or takes over a worker record in the workers table.
// Returns an error if an alive worker with the same name exists.
func (c *Coordinator) Register(ctx context.Context) error {
	tx, err := c.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var existingID, existingIP, existingStatus string
	var existingHeartbeat time.Time
	err = tx.QueryRow(ctx,
		`SELECT id, COALESCE(ip_address, ''), status, heartbeat_at FROM workers WHERE name = $1 FOR UPDATE`,
		c.workerName,
	).Scan(&existingID, &existingIP, &existingStatus, &existingHeartbeat)

	ipAddr := getLocalIP()
	osInfo := runtime.GOOS + "/" + runtime.GOARCH
	now := time.Now()

	if err != nil {
		// Not found — insert new worker
		err = tx.QueryRow(ctx, `
			INSERT INTO workers (name, status, hostname, ip_address, pid, version, config_path, os_info, started_at, heartbeat_at)
			VALUES ($1, 'online', $2, $3, $4, $5, $6, $7, $8, $8)
			RETURNING id`,
			c.workerName, c.hostname(), ipAddr, os.Getpid(), c.version, c.configPath, osInfo, now,
		).Scan(&c.workerDBID)
		if err != nil {
			return fmt.Errorf("insert worker: %w", err)
		}
		log.Printf("Registered new worker: %s (id: %s)", c.workerName, c.workerDBID)
	} else {
		// Found — check if stale
		if now.Sub(existingHeartbeat) > c.staleThreshold {
			// Stale — take over
			_, err = tx.Exec(ctx, `
				UPDATE workers SET status = 'online', hostname = $1, ip_address = $2, pid = $3,
				       version = $4, config_path = $5, os_info = $6, started_at = $7, heartbeat_at = $7, updated_at = $7
				WHERE id = $8`,
				c.hostname(), ipAddr, os.Getpid(), c.version, c.configPath, osInfo, now, existingID,
			)
			if err != nil {
				return fmt.Errorf("update stale worker: %w", err)
			}
			c.workerDBID = existingID
			log.Printf("Took over stale worker: %s (id: %s)", c.workerName, c.workerDBID)
		} else {
			// Alive — reject
			ago := now.Sub(existingHeartbeat).Round(time.Second)
			return fmt.Errorf("worker '%s' is already running on %s (last heartbeat: %s ago)", c.workerName, existingIP, ago)
		}
	}

	return tx.Commit(ctx)
}

func (c *Coordinator) hostname() string {
	h, _ := os.Hostname()
	return h
}

func (c *Coordinator) ClaimMachines(ctx context.Context, machineIDs []string) error {
	for _, id := range machineIDs {
		_, err := c.db.Exec(ctx,
			`INSERT INTO machine_workers (machine_id, worker_id, claimed_at, heartbeat_at, worker_ref_id)
			 VALUES ($1, $2, NOW(), NOW(), $3)
			 ON CONFLICT (machine_id) DO UPDATE SET
			   worker_id = EXCLUDED.worker_id,
			   worker_ref_id = EXCLUDED.worker_ref_id,
			   claimed_at = NOW(),
			   heartbeat_at = NOW()
			 WHERE machine_workers.heartbeat_at < NOW() - interval '90 seconds'
			    OR machine_workers.worker_id = $2`,
			id, c.workerID, c.workerDBID,
		)
		if err != nil {
			return fmt.Errorf("failed to claim machine %s: %w", id, err)
		}
	}
	log.Printf("Claimed %d machines as worker %s", len(machineIDs), c.workerName)
	return nil
}

func (c *Coordinator) StartHeartbeat(ctx context.Context, machineIDs []string) {
	ticker := time.NewTicker(c.heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Primary heartbeat: workers table
			c.db.Exec(ctx,
				`UPDATE workers SET heartbeat_at = NOW(), updated_at = NOW() WHERE id = $1`,
				c.workerDBID,
			)
			// Secondary heartbeat: machine_workers table
			for _, id := range machineIDs {
				c.db.Exec(ctx,
					`UPDATE machine_workers SET heartbeat_at = NOW() WHERE machine_id = $1 AND worker_id = $2`,
					id, c.workerID,
				)
			}
		}
	}
}

// PollCommands polls for pending commands and calls the handler.
func (c *Coordinator) PollCommands(ctx context.Context, handler CommandHandler) {
	ticker := time.NewTicker(c.commandInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.pollOnce(ctx, handler)
		}
	}
}

func (c *Coordinator) pollOnce(ctx context.Context, handler CommandHandler) {
	tx, err := c.db.Begin(ctx)
	if err != nil {
		log.Printf("Command poll begin tx error: %v", err)
		return
	}
	defer tx.Rollback(ctx)

	var cmdID, command string
	var params []byte
	err = tx.QueryRow(ctx, `
		SELECT id, command, params FROM worker_commands
		WHERE worker_id = $1 AND status = 'pending'
		ORDER BY created_at ASC
		LIMIT 1
		FOR UPDATE SKIP LOCKED
	`, c.workerDBID).Scan(&cmdID, &command, &params)
	if err != nil {
		// No pending commands (pgx.ErrNoRows) or error
		return
	}

	_, err = tx.Exec(ctx,
		`UPDATE worker_commands SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
		cmdID,
	)
	if err != nil {
		log.Printf("Command mark in_progress error: %v", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("Command poll commit error: %v", err)
		return
	}

	log.Printf("Executing command: %s (id: %s)", command, cmdID)

	// For stop/restart, mark completed BEFORE executing (process may not return)
	if command == "stop" || command == "restart" {
		c.db.Exec(context.Background(),
			`UPDATE worker_commands SET status = 'completed', result = 'ok', completed_at = NOW() WHERE id = $1`,
			cmdID,
		)
	}

	// Execute the command
	execErr := handler(ctx, command, params)

	// Update command status (for commands that return, i.e. reload_config)
	if execErr != nil {
		c.db.Exec(context.Background(),
			`UPDATE worker_commands SET status = 'failed', result = $1, completed_at = NOW() WHERE id = $2`,
			execErr.Error(), cmdID,
		)
		log.Printf("Command %s failed: %v", command, execErr)
	} else if command != "stop" && command != "restart" {
		c.db.Exec(context.Background(),
			`UPDATE worker_commands SET status = 'completed', result = 'ok', completed_at = NOW() WHERE id = $1`,
			cmdID,
		)
		log.Printf("Command %s completed", command)
	}
}

func (c *Coordinator) ReleaseMachines(ctx context.Context, machineIDs []string) {
	for _, id := range machineIDs {
		c.db.Exec(ctx,
			`DELETE FROM machine_workers WHERE machine_id = $1 AND worker_id = $2`,
			id, c.workerID,
		)
	}
	log.Printf("Released %d machines", len(machineIDs))
}

// SetOffline marks this worker as offline in the workers table.
func (c *Coordinator) SetOffline(ctx context.Context) {
	if c.workerDBID == "" {
		return
	}
	c.db.Exec(ctx,
		`UPDATE workers SET status = 'offline', updated_at = NOW() WHERE id = $1`,
		c.workerDBID,
	)
	log.Printf("Worker %s set to offline", c.workerName)
}

// StoreMachineCancel stores a cancel function for a machine goroutine.
func (c *Coordinator) StoreMachineCancel(name string, cancel context.CancelFunc) {
	c.machineCancels[name] = cancel
}

// CancelMachine cancels a specific machine's goroutine.
func (c *Coordinator) CancelMachine(name string) {
	if cancel, ok := c.machineCancels[name]; ok {
		cancel()
		delete(c.machineCancels, name)
	}
}

func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			return ipnet.IP.String()
		}
	}
	return ""
}
```

- [ ] **Step 4: Run tests**

Run: `make test-one TEST=TestCoordinator PKG=internal/worker`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/worker/coordinator.go internal/worker/coordinator_test.go
git commit -m "feat(sp2): rewrite coordinator with worker registration, command poller, and stale takeover"
```

---

### Task 5: Wire Up cmd/worker/main.go

**Files:**
- Modify: `cmd/worker/main.go`
- Modify: `Makefile`

**Context:** Update the worker entry point to: (1) pass `worker_name` and version to Coordinator, (2) call `Register()`, (3) use per-machine `context.WithCancel`, (4) start command poller, (5) handle commands, (6) set offline on shutdown.

- [ ] **Step 1: Update cmd/worker/main.go**

Replace `cmd/worker/main.go` with:

```go
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/industry-dashboard/server/internal/config"
	"github.com/industry-dashboard/server/internal/database"
	"github.com/industry-dashboard/server/internal/worker"
)

var version = "dev"

func main() {
	configPath := flag.String("config", "cmd/worker/config.yaml", "Path to worker config YAML")
	flag.Parse()

	absConfigPath, _ := filepath.Abs(*configPath)

	workerCfg, err := worker.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}
	log.Printf("Loaded config: site=%s, lines=%d, poll=%s",
		workerCfg.SiteCode, len(workerCfg.Lines), workerCfg.PollInterval)

	// Resolve database URL: env var > YAML config > app config fallback
	dbURL := workerCfg.DatabaseURL
	if dbURL == "" {
		appCfg := config.Load()
		dbURL = appCfg.DatabaseURL
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := database.Connect(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Register worker (stale takeover or alive rejection)
	coordinator := worker.NewCoordinator(pool, workerCfg.WorkerName, absConfigPath, version)
	if err := coordinator.Register(ctx); err != nil {
		log.Fatalf("Failed to register worker: %v", err)
	}

	result, err := worker.Provision(ctx, pool, workerCfg)
	if err != nil {
		log.Fatalf("Failed to provision: %v", err)
	}

	// Create DataSource for each machine
	for i, m := range result.Machines {
		machineCfg := findMachineConfig(workerCfg, m.Name)
		if machineCfg == nil {
			log.Fatalf("Machine config not found for %s", m.Name)
		}
		ds, err := worker.NewDataSource(*machineCfg)
		if err != nil {
			log.Fatalf("Failed to create data source for %s: %v", m.Name, err)
		}
		result.Machines[i].DataSource = ds
	}
	log.Printf("Provisioned %d machines", len(result.Machines))

	machineIDs := make([]string, len(result.Machines))
	for i, m := range result.Machines {
		machineIDs[i] = m.ID
	}
	if err := coordinator.ClaimMachines(ctx, machineIDs); err != nil {
		log.Fatalf("Failed to claim machines: %v", err)
	}

	go coordinator.StartHeartbeat(ctx, machineIDs)

	// Start data collection with per-machine contexts
	runner := worker.NewRunner(pool, workerCfg.PollInterval)
	var wg sync.WaitGroup
	for _, machine := range result.Machines {
		machineCtx, machineCancel := context.WithCancel(ctx)
		coordinator.StoreMachineCancel(machine.Name, machineCancel)
		wg.Add(1)
		go func(m worker.ProvisionedMachine, mCtx context.Context) {
			defer wg.Done()
			runner.RunMachine(mCtx, m)
		}(machine, machineCtx)
	}

	// Command handler
	// Note: cmdID is passed so stop/restart can mark the command completed before exiting.
	// The handler returns nil for stop/restart (process exits before return) or error for failures.
	commandHandler := func(cmdCtx context.Context, command string, params []byte) error {
		switch command {
		case "stop":
			log.Println("Received stop command")
			cancel()
			wg.Wait()
			coordinator.ReleaseMachines(context.Background(), machineIDs)
			coordinator.SetOffline(context.Background())
			log.Println("Worker stopped by command")
			// Note: command is already marked completed by pollOnce before os.Exit
			os.Exit(0)
		case "restart":
			log.Println("Received restart command")
			cancel()
			wg.Wait()
			coordinator.ReleaseMachines(context.Background(), machineIDs)
			// Re-exec the process
			executable, err := os.Executable()
			if err != nil {
				return fmt.Errorf("failed to get executable path: %w", err)
			}
			log.Println("Re-executing worker process...")
			if err := syscall.Exec(executable, os.Args, os.Environ()); err != nil {
				return fmt.Errorf("failed to restart: %w", err)
			}
		case "reload_config":
			return handleReloadConfig(coordinator, ctx, pool, workerCfg, runner, &wg, &machineIDs)
		default:
			return fmt.Errorf("unknown command: %s", command)
		}
		return nil
	}

	go coordinator.PollCommands(ctx, commandHandler)

	log.Printf("Worker running (name: %s, id: %s). Press Ctrl+C to stop.",
		coordinator.WorkerName(), coordinator.WorkerDBID())

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down...")
	cancel()
	wg.Wait()
	coordinator.ReleaseMachines(context.Background(), machineIDs)
	coordinator.SetOffline(context.Background())
	log.Println("Done.")
}

// handleReloadConfig re-reads the config YAML and diffs machines.
// c is the coordinator (captured from outer scope via closure — pass as receiver or arg).
func handleReloadConfig(
	coordinator *worker.Coordinator,
	parentCtx context.Context,
	pool *pgxpool.Pool,
	workerCfg *worker.WorkerConfig,
	runner *worker.Runner,
	wg *sync.WaitGroup,
	machineIDs *[]string,
) error {
	newCfg, err := worker.LoadConfig(coordinator.ConfigPath())
	if err != nil {
		return fmt.Errorf("failed to reload config: %w", err)
	}

	// Re-provision (upserts site/lines/machines in DB)
	result, err := worker.Provision(parentCtx, pool, newCfg)
	if err != nil {
		return fmt.Errorf("failed to re-provision: %w", err)
	}

	// Build maps for diffing by machine name
	oldMachines := make(map[string]worker.ProvisionedMachine)
	for _, m := range workerCfg.Lines {
		// We need the currently running machines — use machineIDs/coordinator state
	}
	_ = oldMachines // diff logic uses coordinator.machineCancels keys

	newNames := make(map[string]bool)
	for _, m := range result.Machines {
		newNames[m.Name] = true
	}

	// Stop removed machines
	for name := range coordinator.MachineCancels() {
		if !newNames[name] {
			log.Printf("Removing machine: %s", name)
			coordinator.CancelMachine(name)
		}
	}

	// Start new/changed machines
	newMachineIDs := make([]string, 0)
	for i, m := range result.Machines {
		machineCfg := findMachineConfig(newCfg, m.Name)
		if machineCfg == nil {
			continue
		}
		ds, err := worker.NewDataSource(*machineCfg)
		if err != nil {
			log.Printf("Failed to create data source for %s: %v", m.Name, err)
			continue
		}
		result.Machines[i].DataSource = ds
		newMachineIDs = append(newMachineIDs, m.ID)

		if _, exists := coordinator.MachineCancels()[m.Name]; exists {
			// Existing machine — cancel old, start new
			coordinator.CancelMachine(m.Name)
		}

		machineCtx, machineCancel := context.WithCancel(parentCtx)
		coordinator.StoreMachineCancel(m.Name, machineCancel)
		wg.Add(1)
		go func(pm worker.ProvisionedMachine, mCtx context.Context) {
			defer wg.Done()
			runner.RunMachine(mCtx, pm)
		}(result.Machines[i], machineCtx)
	}

	// Re-claim machines
	if err := coordinator.ClaimMachines(parentCtx, newMachineIDs); err != nil {
		return fmt.Errorf("failed to reclaim machines: %w", err)
	}

	*machineIDs = newMachineIDs
	*workerCfg = *newCfg
	log.Printf("Config reloaded: %d machines", len(newMachineIDs))
	return nil
}

func findMachineConfig(cfg *worker.WorkerConfig, name string) *worker.MachineConfig {
	for _, line := range cfg.Lines {
		for i, m := range line.Machines {
			if m.Name == name {
				return &line.Machines[i]
			}
		}
	}
	return nil
}
```

- [ ] **Step 2: Update Makefile — add version ldflags to worker target**

Replace the `worker:` target:
```makefile
worker:
	go run -ldflags "-X main.version=$(shell git describe --tags --always --dirty 2>/dev/null || echo dev)" ./cmd/worker

worker-config:
	go run -ldflags "-X main.version=$(shell git describe --tags --always --dirty 2>/dev/null || echo dev)" ./cmd/worker -config $(CONFIG)
```

- [ ] **Step 3: Update cmd/fake-worker/main.go to match new NewCoordinator signature**

The existing `cmd/fake-worker/main.go` calls `worker.NewCoordinator(pool)`. Update to:
```go
coordinator := worker.NewCoordinator(pool, "fake-worker", "", "dev")
```

Note: Using a named worker ("fake-worker") instead of empty string avoids orphan row accumulation in the `workers` table during development. Also add `worker_name: "fake-worker"` to `cmd/fake-worker/config.yaml` if it exists.

- [ ] **Step 4: Verify compilation**

Run: `go build ./...`
Expected: No errors.

- [ ] **Step 5: Run all tests**

Run: `make test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add cmd/worker/main.go cmd/fake-worker/main.go Makefile
git commit -m "feat(sp2): wire worker registration, command poller, per-machine contexts, version ldflags"
```

---

### Task 6: Integration Testing

**Files:**
- Test manually with running worker + API

- [ ] **Step 1: Run migrations**

Run: `make migrate`

- [ ] **Step 2: Start the server**

Run: `make dev` (in a separate terminal)

- [ ] **Step 3: Start the Modbus simulator**

Run: `python3 testing/modbus-simulator.py` (in a separate terminal)

- [ ] **Step 4: Start the worker**

Run: `make worker-config CONFIG=testing/test-modbus-worker.yaml` (in a separate terminal)

Expected output includes:
```
Registered new worker: ... (id: ...)
Claimed 1 machines as worker ...
Worker running (name: ..., id: ...)
```

- [ ] **Step 5: Verify worker appears in API**

Run: `curl -s http://localhost:8080/api/workers | python3 -m json.tool`

Expected: JSON array with one worker entry showing status "online".

Note: If auth is required, use `curl -b` with cookies from `/dev/login`. In DEV_MODE, seed first: `curl http://localhost:8080/dev/seed`, then `curl http://localhost:8080/dev/login` to get cookies.

- [ ] **Step 6: Send a stop command via API**

```bash
# Get worker ID from the list response
WORKER_ID=<uuid from step 5>
curl -X POST http://localhost:8080/api/workers/$WORKER_ID/commands \
  -H "Content-Type: application/json" \
  -d '{"command": "stop"}'
```

Expected: Worker process exits within 10 seconds (next poll cycle).

- [ ] **Step 7: Verify worker is marked offline**

Wait 90 seconds, then:
```bash
curl -s http://localhost:8080/api/workers | python3 -m json.tool
```

Expected: Worker status is "offline".

- [ ] **Step 8: Commit any fixes needed**

If any fixes were made during testing, commit them.

---

### Task 7: Update test-modbus-worker.yaml with worker_name

**Files:**
- Modify: `testing/test-modbus-worker.yaml`

- [ ] **Step 1: Add worker_name to test config**

Add `worker_name: "test-modbus-worker"` at the top of the file (after `site_code`).

- [ ] **Step 2: Commit**

```bash
git add testing/test-modbus-worker.yaml
git commit -m "feat(sp2): add worker_name to test modbus worker config"
```
