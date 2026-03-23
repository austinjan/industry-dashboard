# Fake Modbus Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone fake Modbus worker binary that reads a YAML config defining factory structure (sites, lines, machines, registers with data ranges and patterns), upserts them into the database, claims machines via the worker coordination system, and generates realistic fake sensor data on a configurable poll interval. Also evaluates alert thresholds and creates alert events.

**Architecture:** Standalone Go binary (`cmd/fake-worker/main.go`) sharing `internal/` packages with the API server. Reads a YAML config file, upserts factory structure, then spawns a goroutine per machine that generates data points at the configured interval. Uses the existing `machine_workers` table for heartbeat/claiming. Evaluates alerts after each data generation cycle.

**Tech Stack:** Go 1.22+, pgx, gopkg.in/yaml.v3

---

## File Structure

```
migrations/
  012_add_unique_constraints.up.sql   # CREATE — unique on (site_id, name) and (line_id, name)
  012_add_unique_constraints.down.sql
cmd/
  fake-worker/
    main.go                  # CREATE — entry point, loads config, connects DB, runs workers
    config.yaml              # CREATE — example factory config
internal/
  worker/
    config.go                # CREATE — YAML config types and loader
    provisioner.go           # CREATE — upserts sites, lines, machines from config
    coordinator.go           # CREATE — claim machines, heartbeat, stale detection
    generator.go             # CREATE — data generation with patterns (drift, sine, random, spike)
    alerteval.go             # CREATE — evaluate alert thresholds, create alert_events
    runner.go                # CREATE — per-machine goroutine orchestrator
Makefile                     # MODIFY — add fake-worker target
```

---

### Task 1: YAML Config Types & Loader

**Files:**
- Create: `internal/worker/config.go`
- Create: `cmd/fake-worker/config.yaml`

- [ ] **Step 1: Create config types and loader**

Create `internal/worker/config.go`:

```go
package worker

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

type WorkerConfig struct {
	SiteCode     string        `yaml:"site_code"`
	SiteName     string        `yaml:"site_name"`
	Timezone     string        `yaml:"timezone"`
	PollInterval time.Duration `yaml:"poll_interval"`
	Lines        []LineConfig  `yaml:"lines"`
}

type LineConfig struct {
	Name         string          `yaml:"name"`
	DisplayOrder int             `yaml:"display_order"`
	Machines     []MachineConfig `yaml:"machines"`
}

type MachineConfig struct {
	Name      string           `yaml:"name"`
	Model     string           `yaml:"model"`
	Registers []RegisterConfig `yaml:"registers"`
}

type RegisterConfig struct {
	Name    string  `yaml:"name"`
	Min     float64 `yaml:"min"`
	Max     float64 `yaml:"max"`
	Unit    string  `yaml:"unit"`
	Pattern string  `yaml:"pattern"` // drift | sine | random | spike
}

func LoadConfig(path string) (*WorkerConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}
	var cfg WorkerConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}
	if cfg.SiteCode == "" {
		return nil, fmt.Errorf("site_code is required")
	}
	if cfg.PollInterval == 0 {
		cfg.PollInterval = 5 * time.Second
	}
	if cfg.Timezone == "" {
		cfg.Timezone = "UTC"
	}
	if cfg.SiteName == "" {
		cfg.SiteName = cfg.SiteCode
	}
	for i := range cfg.Lines {
		if cfg.Lines[i].DisplayOrder == 0 {
			cfg.Lines[i].DisplayOrder = i + 1
		}
		for j := range cfg.Lines[i].Machines {
			for k := range cfg.Lines[i].Machines[j].Registers {
				if cfg.Lines[i].Machines[j].Registers[k].Pattern == "" {
					cfg.Lines[i].Machines[j].Registers[k].Pattern = "random"
				}
			}
		}
	}
	return &cfg, nil
}
```

- [ ] **Step 2: Create example config**

Create `cmd/fake-worker/config.yaml`:

```yaml
site_code: "ALPHA"
site_name: "Factory Alpha"
timezone: "Asia/Taipei"
poll_interval: 5s

lines:
  - name: "Assembly Line 1"
    display_order: 1
    machines:
      - name: "CNC-01"
        model: "Haas VF-2"
        registers:
          - name: temperature
            min: 60
            max: 95
            unit: "°C"
            pattern: drift
          - name: speed
            min: 80
            max: 150
            unit: "rpm"
            pattern: sine
          - name: power
            min: 2.0
            max: 6.0
            unit: "kW"
            pattern: random
          - name: vibration
            min: 0.1
            max: 2.0
            unit: "mm/s"
            pattern: random
      - name: "CNC-02"
        model: "Haas VF-2"
        registers:
          - name: temperature
            min: 65
            max: 90
            unit: "°C"
            pattern: drift
          - name: speed
            min: 90
            max: 140
            unit: "rpm"
            pattern: sine
          - name: power
            min: 2.5
            max: 5.5
            unit: "kW"
            pattern: random
      - name: "CNC-03"
        model: "Haas VF-3"
        registers:
          - name: temperature
            min: 55
            max: 85
            unit: "°C"
            pattern: spike
          - name: speed
            min: 100
            max: 160
            unit: "rpm"
            pattern: sine

  - name: "Packaging Line 2"
    display_order: 2
    machines:
      - name: "PKG-01"
        model: "Bosch PK-200"
        registers:
          - name: temperature
            min: 30
            max: 60
            unit: "°C"
            pattern: random
          - name: speed
            min: 40
            max: 80
            unit: "pcs/min"
            pattern: sine
      - name: "PKG-02"
        model: "Bosch PK-200"
        registers:
          - name: temperature
            min: 35
            max: 55
            unit: "°C"
            pattern: drift
          - name: speed
            min: 45
            max: 75
            unit: "pcs/min"
            pattern: sine
```

- [ ] **Step 3: Create unique constraints migration**

Create `migrations/012_add_unique_constraints.up.sql`:

```sql
CREATE UNIQUE INDEX idx_production_lines_site_name ON production_lines(site_id, name);
CREATE UNIQUE INDEX idx_machines_line_name ON machines(line_id, name);
```

Create `migrations/012_add_unique_constraints.down.sql`:

```sql
DROP INDEX IF EXISTS idx_machines_line_name;
DROP INDEX IF EXISTS idx_production_lines_site_name;
```

These are required for the provisioner's `ON CONFLICT` upsert logic to work correctly.

- [ ] **Step 4: Install yaml dependency**

```bash
go get gopkg.in/yaml.v3
go mod tidy
```

- [ ] **Step 4: Verify compilation**

```bash
go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add internal/worker/config.go cmd/fake-worker/config.yaml go.mod go.sum
git commit -m "feat: add worker YAML config types and example factory config"
```

---

### Task 2: Factory Provisioner

**Files:**
- Create: `internal/worker/provisioner.go`

- [ ] **Step 1: Create provisioner**

Create `internal/worker/provisioner.go`:

```go
package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ProvisionedMachine struct {
	ID        string
	Name      string
	Registers []RegisterConfig
}

type ProvisionResult struct {
	SiteID   string
	Machines []ProvisionedMachine
}

func Provision(ctx context.Context, db *pgxpool.Pool, cfg *WorkerConfig) (*ProvisionResult, error) {
	result := &ProvisionResult{}

	// Upsert site
	err := db.QueryRow(ctx,
		`INSERT INTO sites (name, code, timezone)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, timezone = EXCLUDED.timezone, updated_at = NOW()
		 RETURNING id`,
		cfg.SiteName, cfg.SiteCode, cfg.Timezone,
	).Scan(&result.SiteID)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert site: %w", err)
	}
	log.Printf("Site: %s (id: %s)", cfg.SiteName, result.SiteID)

	for _, lineCfg := range cfg.Lines {
		// Upsert production line
		var lineID string
		err := db.QueryRow(ctx,
			`INSERT INTO production_lines (site_id, name, display_order)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (site_id, name) DO UPDATE SET display_order = EXCLUDED.display_order, updated_at = NOW()
			 RETURNING id`,
			result.SiteID, lineCfg.Name, lineCfg.DisplayOrder,
		).Scan(&lineID)
		if err != nil {
			// Line may already exist, try to find it
			err = db.QueryRow(ctx,
				`SELECT id FROM production_lines WHERE site_id = $1 AND name = $2`,
				result.SiteID, lineCfg.Name,
			).Scan(&lineID)
			if err != nil {
				return nil, fmt.Errorf("failed to upsert line %s: %w", lineCfg.Name, err)
			}
		}
		log.Printf("  Line: %s (id: %s)", lineCfg.Name, lineID)

		for _, machineCfg := range lineCfg.Machines {
			// Build modbus_config JSONB from registers
			modbusConfig := map[string]interface{}{
				"registers": machineCfg.Registers,
			}
			modbusJSON, _ := json.Marshal(modbusConfig)

			var machineID string
			err := db.QueryRow(ctx,
				`INSERT INTO machines (line_id, name, model, status, modbus_config)
				 VALUES ($1, $2, $3, 'running', $4)
				 ON CONFLICT (line_id, name) DO UPDATE SET model = EXCLUDED.model, modbus_config = EXCLUDED.modbus_config, status = 'running', updated_at = NOW()
				 RETURNING id`,
				lineID, machineCfg.Name, machineCfg.Model, modbusJSON,
			).Scan(&machineID)
			if err != nil {
				// Machine may already exist
				err = db.QueryRow(ctx,
					`SELECT id FROM machines WHERE line_id = $1 AND name = $2`,
					lineID, machineCfg.Name,
				).Scan(&machineID)
				if err != nil {
					return nil, fmt.Errorf("failed to upsert machine %s: %w", machineCfg.Name, err)
				}
				// Update modbus config and status
				db.Exec(ctx,
					`UPDATE machines SET modbus_config = $1, status = 'running', updated_at = NOW() WHERE id = $2`,
					modbusJSON, machineID)
			}
			log.Printf("    Machine: %s (id: %s)", machineCfg.Name, machineID)

			result.Machines = append(result.Machines, ProvisionedMachine{
				ID:        machineID,
				Name:      machineCfg.Name,
				Registers: machineCfg.Registers,
			})
		}
	}

	return result, nil
}
```

- [ ] **Step 2: Verify and commit**

```bash
go build ./...
git add internal/worker/provisioner.go
git commit -m "feat: add factory provisioner — upserts sites, lines, machines from config"
```

---

### Task 3: Worker Coordinator (Heartbeat & Claiming)

**Files:**
- Create: `internal/worker/coordinator.go`

- [ ] **Step 1: Create coordinator**

Create `internal/worker/coordinator.go`:

```go
package worker

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Coordinator struct {
	db         *pgxpool.Pool
	workerID   string
	heartbeatInterval time.Duration
	staleThreshold    time.Duration
}

func NewCoordinator(db *pgxpool.Pool) *Coordinator {
	hostname, _ := os.Hostname()
	workerID := fmt.Sprintf("%s-%d", hostname, os.Getpid())
	return &Coordinator{
		db:                db,
		workerID:          workerID,
		heartbeatInterval: 30 * time.Second,
		staleThreshold:    90 * time.Second,
	}
}

func (c *Coordinator) WorkerID() string {
	return c.workerID
}

func (c *Coordinator) ClaimMachines(ctx context.Context, machineIDs []string) error {
	for _, id := range machineIDs {
		_, err := c.db.Exec(ctx,
			`INSERT INTO machine_workers (machine_id, worker_id, claimed_at, heartbeat_at)
			 VALUES ($1, $2, NOW(), NOW())
			 ON CONFLICT (machine_id) DO UPDATE SET
			   worker_id = EXCLUDED.worker_id,
			   claimed_at = NOW(),
			   heartbeat_at = NOW()
			 WHERE machine_workers.heartbeat_at < NOW() - interval '90 seconds'
			    OR machine_workers.worker_id = $2`,
			id, c.workerID,
		)
		if err != nil {
			return fmt.Errorf("failed to claim machine %s: %w", id, err)
		}
	}
	log.Printf("Claimed %d machines as worker %s", len(machineIDs), c.workerID)
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
			for _, id := range machineIDs {
				c.db.Exec(ctx,
					`UPDATE machine_workers SET heartbeat_at = NOW() WHERE machine_id = $1 AND worker_id = $2`,
					id, c.workerID,
				)
			}
		}
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
```

- [ ] **Step 2: Verify and commit**

```bash
go build ./...
git add internal/worker/coordinator.go
git commit -m "feat: add worker coordinator — claim machines, heartbeat, release"
```

---

### Task 4: Data Generator with Patterns

**Files:**
- Create: `internal/worker/generator.go`
- Test: `internal/worker/generator_test.go`

- [ ] **Step 1: Write tests for data patterns**

Create `internal/worker/generator_test.go`:

```go
package worker_test

import (
	"testing"

	"github.com/industry-dashboard/server/internal/worker"
	"github.com/stretchr/testify/assert"
)

func TestGenerateValue_Random(t *testing.T) {
	g := worker.NewGenerator()
	for i := 0; i < 100; i++ {
		v := g.Generate("random", 10, 20, i)
		assert.GreaterOrEqual(t, v, 10.0)
		assert.LessOrEqual(t, v, 20.0)
	}
}

func TestGenerateValue_Sine(t *testing.T) {
	g := worker.NewGenerator()
	for i := 0; i < 100; i++ {
		v := g.Generate("sine", 50, 100, i)
		assert.GreaterOrEqual(t, v, 50.0)
		assert.LessOrEqual(t, v, 100.0)
	}
}

func TestGenerateValue_Drift(t *testing.T) {
	g := worker.NewGenerator()
	v1 := g.Generate("drift", 60, 90, 0)
	v2 := g.Generate("drift", 60, 90, 1)
	// Values should be close but not identical
	assert.InDelta(t, v1, v2, 10.0)
	assert.GreaterOrEqual(t, v1, 60.0)
	assert.LessOrEqual(t, v1, 90.0)
}

func TestGenerateValue_Spike(t *testing.T) {
	g := worker.NewGenerator()
	values := make([]float64, 200)
	spikeCount := 0
	for i := 0; i < 200; i++ {
		values[i] = g.Generate("spike", 50, 100, i)
		assert.GreaterOrEqual(t, values[i], 50.0)
		assert.LessOrEqual(t, values[i], 100.0)
		if values[i] > 90 { // Spike zone (top 10% of range)
			spikeCount++
		}
	}
	// Should have at least some spikes but not all
	assert.Greater(t, spikeCount, 0)
	assert.Less(t, spikeCount, 100)
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
go test ./internal/worker/ -v
```

- [ ] **Step 3: Implement generator**

Create `internal/worker/generator.go`:

```go
package worker

import (
	"math"
	"math/rand"
)

type Generator struct {
	rng        *rand.Rand
	driftState map[string]float64
}

func NewGenerator() *Generator {
	return &Generator{
		rng:        rand.New(rand.NewSource(rand.Int63())),
		driftState: make(map[string]float64),
	}
}

// GenerateFor generates a value for a specific metric, maintaining per-metric drift state.
func (g *Generator) GenerateFor(metricName, pattern string, min, max float64, tick int) float64 {
	rng := max - min
	switch pattern {
	case "sine":
		return g.sine(min, rng, tick)
	case "drift":
		return g.drift(metricName, min, max, rng, tick)
	case "spike":
		return g.spike(min, rng, tick)
	default: // random
		return min + g.rng.Float64()*rng
	}
}

// Generate is a convenience wrapper without metric name (for tests).
func (g *Generator) Generate(pattern string, min, max float64, tick int) float64 {
	return g.GenerateFor("default", pattern, min, max, tick)
}

func (g *Generator) sine(min, rng float64, tick int) float64 {
	// Sine wave centered in range with small noise
	base := (math.Sin(float64(tick)*0.1) + 1) / 2 // 0..1
	noise := (g.rng.Float64() - 0.5) * 0.1         // -0.05..0.05
	v := min + (base+noise)*rng
	return clamp(v, min, min+rng)
}

func (g *Generator) drift(metricName string, min, max, rng float64, tick int) float64 {
	key := metricName
	current, exists := g.driftState[key]
	if !exists {
		current = min + rng*0.5 // Start in middle
	}
	// Random walk with mean reversion
	step := (g.rng.Float64() - 0.5) * rng * 0.05
	// Pull toward center
	center := min + rng*0.5
	reversion := (center - current) * 0.02
	current += step + reversion
	current = clamp(current, min, max)
	g.driftState[key] = current
	return current
}

func (g *Generator) spike(min, rng float64, tick int) float64 {
	// Normal values with occasional spikes
	if g.rng.Float64() < 0.05 { // 5% chance of spike
		return min + rng*(0.85+g.rng.Float64()*0.15) // Top 15% of range
	}
	return min + g.rng.Float64()*rng*0.7 // Normal: bottom 70%
}

func clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./internal/worker/ -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/worker/generator.go internal/worker/generator_test.go
git commit -m "feat: add data generator with drift, sine, random, and spike patterns"
```

---

### Task 5: Alert Evaluator

**Files:**
- Create: `internal/worker/alerteval.go`

- [ ] **Step 1: Create alert evaluator**

Create `internal/worker/alerteval.go`:

```go
package worker

import (
	"context"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AlertEvaluator struct {
	db *pgxpool.Pool
}

func NewAlertEvaluator(db *pgxpool.Pool) *AlertEvaluator {
	return &AlertEvaluator{db: db}
}

type alertRule struct {
	ID        string
	Name      string
	Metric    string
	Condition string
	Threshold float64
}

func (e *AlertEvaluator) Evaluate(ctx context.Context, machineID string, values map[string]float64) {
	// Fetch active alerts for this machine
	rows, err := e.db.Query(ctx,
		`SELECT id, name, metric_name, condition, threshold
		 FROM alerts
		 WHERE machine_id = $1 AND is_active = true`,
		machineID,
	)
	if err != nil {
		return
	}
	defer rows.Close()

	var rules []alertRule
	for rows.Next() {
		var r alertRule
		if err := rows.Scan(&r.ID, &r.Name, &r.Metric, &r.Condition, &r.Threshold); err != nil {
			continue
		}
		rules = append(rules, r)
	}

	for _, rule := range rules {
		value, ok := values[rule.Metric]
		if !ok {
			continue
		}
		triggered := false
		switch rule.Condition {
		case ">":
			triggered = value > rule.Threshold
		case ">=":
			triggered = value >= rule.Threshold
		case "<":
			triggered = value < rule.Threshold
		case "<=":
			triggered = value <= rule.Threshold
		case "==":
			triggered = value == rule.Threshold
		}

		if triggered {
			// Check if there's already an unresolved event for this alert
			var exists bool
			e.db.QueryRow(ctx,
				`SELECT EXISTS(SELECT 1 FROM alert_events WHERE alert_id = $1 AND resolved_at IS NULL)`,
				rule.ID,
			).Scan(&exists)

			if !exists {
				_, err := e.db.Exec(ctx,
					`INSERT INTO alert_events (alert_id, triggered_at) VALUES ($1, NOW())`,
					rule.ID,
				)
				if err == nil {
					log.Printf("  ALERT triggered: %s (value=%.2f %s %.2f)", rule.Name, value, rule.Condition, rule.Threshold)
				}
			}
		} else {
			// Auto-resolve if condition no longer met
			e.db.Exec(ctx,
				`UPDATE alert_events SET resolved_at = NOW()
				 WHERE alert_id = $1 AND resolved_at IS NULL`,
				rule.ID,
			)
		}
	}
}
```

- [ ] **Step 2: Verify and commit**

```bash
go build ./...
git add internal/worker/alerteval.go
git commit -m "feat: add alert evaluator — checks thresholds and auto-creates/resolves events"
```

---

### Task 6: Machine Runner

**Files:**
- Create: `internal/worker/runner.go`

- [ ] **Step 1: Create runner**

Create `internal/worker/runner.go`:

```go
package worker

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Runner struct {
	db           *pgxpool.Pool
	alertEval    *AlertEvaluator
	pollInterval time.Duration
}

func NewRunner(db *pgxpool.Pool, pollInterval time.Duration) *Runner {
	return &Runner{
		db:           db,
		alertEval:    NewAlertEvaluator(db),
		pollInterval: pollInterval,
	}
}

func (r *Runner) RunMachine(ctx context.Context, machine ProvisionedMachine) {
	log.Printf("Starting data generation for %s (interval: %s)", machine.Name, r.pollInterval)
	ticker := time.NewTicker(r.pollInterval)
	defer ticker.Stop()

	// Each machine gets its own generator — no shared state, no data race
	gen := NewGenerator()
	tick := 0
	for {
		select {
		case <-ctx.Done():
			log.Printf("Stopping %s", machine.Name)
			return
		case <-ticker.C:
			values := make(map[string]float64)
			for _, reg := range machine.Registers {
				value := gen.GenerateFor(reg.Name, reg.Pattern, reg.Min, reg.Max, tick)
				values[reg.Name] = value

				_, err := r.db.Exec(ctx,
					`INSERT INTO data_points (time, machine_id, metric_name, value) VALUES (NOW(), $1, $2, $3)`,
					machine.ID, reg.Name, value,
				)
				if err != nil {
					log.Printf("  Error writing %s/%s: %v", machine.Name, reg.Name, err)
				}
			}

			// Evaluate alerts
			r.alertEval.Evaluate(ctx, machine.ID, values)

			// Update machine status (occasionally toggle to simulate issues)
			if tick%60 == 0 && r.generator.rng.Float64() < 0.05 {
				// 5% chance every 60 ticks to go to error
				r.db.Exec(ctx, `UPDATE machines SET status = 'error', updated_at = NOW() WHERE id = $1`, machine.ID)
				log.Printf("  %s status -> error", machine.Name)
			} else if tick%60 == 30 {
				// Recover at tick 30 of cycle
				r.db.Exec(ctx, `UPDATE machines SET status = 'running', updated_at = NOW() WHERE id = $1`, machine.ID)
			}

			tick++
		}
	}
}
```

- [ ] **Step 2: Verify and commit**

```bash
go build ./...
git add internal/worker/runner.go
git commit -m "feat: add machine runner — per-machine goroutine generating data and evaluating alerts"
```

---

### Task 7: Main Entry Point & Makefile

**Files:**
- Create: `cmd/fake-worker/main.go`
- Modify: `Makefile`

- [ ] **Step 1: Create main.go**

Create `cmd/fake-worker/main.go`:

```go
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/industry-dashboard/server/internal/config"
	"github.com/industry-dashboard/server/internal/database"
	"github.com/industry-dashboard/server/internal/worker"
)

func main() {
	configPath := flag.String("config", "cmd/fake-worker/config.yaml", "Path to worker config YAML")
	flag.Parse()

	// Load worker config
	workerCfg, err := worker.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}
	log.Printf("Loaded config: site=%s, lines=%d, poll=%s",
		workerCfg.SiteCode, len(workerCfg.Lines), workerCfg.PollInterval)

	// Connect to database
	appCfg := config.Load()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := database.Connect(ctx, appCfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Provision factory structure
	result, err := worker.Provision(ctx, pool, workerCfg)
	if err != nil {
		log.Fatalf("Failed to provision: %v", err)
	}
	log.Printf("Provisioned %d machines", len(result.Machines))

	// Claim machines
	coordinator := worker.NewCoordinator(pool)
	machineIDs := make([]string, len(result.Machines))
	for i, m := range result.Machines {
		machineIDs[i] = m.ID
	}
	if err := coordinator.ClaimMachines(ctx, machineIDs); err != nil {
		log.Fatalf("Failed to claim machines: %v", err)
	}

	// Start heartbeat
	go coordinator.StartHeartbeat(ctx, machineIDs)

	// Start runners
	runner := worker.NewRunner(pool, workerCfg.PollInterval)
	var wg sync.WaitGroup
	for _, machine := range result.Machines {
		wg.Add(1)
		go func(m worker.ProvisionedMachine) {
			defer wg.Done()
			runner.RunMachine(ctx, m)
		}(machine)
	}

	log.Printf("Fake worker running (worker_id: %s). Press Ctrl+C to stop.", coordinator.WorkerID())

	// Wait for shutdown signal
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down...")
	cancel()
	wg.Wait()
	coordinator.ReleaseMachines(context.Background(), machineIDs)
	log.Println("Done.")
}
```

- [ ] **Step 2: Add Makefile target**

Add to `Makefile`:

```makefile
fake-worker:
	go run ./cmd/fake-worker

fake-worker-config:
	go run ./cmd/fake-worker -config $(CONFIG)
```

- [ ] **Step 3: Verify and commit**

```bash
go build ./...
git add cmd/fake-worker/main.go Makefile
git commit -m "feat: add fake-worker entry point and Makefile target"
```

---

### Task 8: Update CLAUDE.md & Test Run

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Add to the Build & Dev Commands section:

```markdown
### Fake Worker
```bash
make fake-worker      # Run fake worker with default config (cmd/fake-worker/config.yaml)
make fake-worker-config CONFIG=path/to/config.yaml  # Run with custom config
```
```

Add to Architecture backend structure:

```
cmd/fake-worker/       # Fake Modbus worker for testing
internal/
  worker/              # Worker coordination, data generation, alert evaluation
```

- [ ] **Step 2: Run all tests**

```bash
go test ./... -v
```

- [ ] **Step 3: Verify fake worker starts (requires DB running)**

```bash
make fake-worker &
sleep 10
# Check data was inserted
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore: update CLAUDE.md with fake worker commands and architecture"
```
