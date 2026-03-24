# Fake Worker

A standalone Go binary that simulates Modbus workers by generating realistic sensor data and writing it to the database. Useful for development, demos, and testing dashboards without real hardware.

## What It Does

1. **Provisions** factory structure (sites, lines, machines) from a YAML config via upsert — safe to run repeatedly
2. **Claims** machines via the `machine_workers` coordination table with heartbeat
3. **Generates** fake sensor data at a configurable interval using four patterns (drift, sine, random, spike)
4. **Evaluates** alert thresholds and auto-creates/resolves alert events
5. **Releases** machine claims on graceful shutdown (Ctrl+C / SIGTERM)

## Prerequisites

- Go 1.22+
- TimescaleDB running with migrations applied

```bash
make db-up
make migrate
```

## Build

```bash
# Verify compilation
go build ./cmd/fake-worker

# Or build a binary
go build -o bin/fake-worker ./cmd/fake-worker
```

## Configuration

The worker reads a YAML config file. A default config is included at `cmd/fake-worker/config.yaml`.

### Config Structure

```yaml
site_code: "ALPHA"          # Required. Unique site identifier (matches sites.code)
site_name: "Factory Alpha"  # Optional. Defaults to site_code
timezone: "Asia/Taipei"     # Optional. Defaults to "UTC"
poll_interval: 5s           # Optional. Data generation interval. Defaults to 5s

lines:
  - name: "Assembly Line 1"
    display_order: 1          # Optional. Auto-assigned if omitted
    machines:
      - name: "CNC-01"
        model: "Haas VF-2"
        registers:
          - name: temperature
            min: 60
            max: 95
            unit: "°C"
            pattern: drift    # Optional. One of: drift, sine, random, spike. Defaults to "random"
```

### Data Patterns

| Pattern | Behavior |
|---------|----------|
| `random` | Uniform random values between min and max |
| `sine` | Sine wave oscillation with small noise, stays within min–max |
| `drift` | Random walk with mean reversion toward center of range |
| `spike` | Normal values (bottom 70% of range) with 5% chance of spikes (top 15%) |

### Multiple Sites

To simulate multiple factories, create separate config files and run multiple worker instances:

```yaml
# factory-beta.yaml
site_code: "BETA"
site_name: "Factory Beta"
timezone: "America/New_York"
poll_interval: 10s
lines:
  - name: "Welding Line 1"
    machines:
      - name: "WELD-01"
        model: "Lincoln S350"
        registers:
          - name: temperature
            min: 200
            max: 400
            unit: "°C"
            pattern: drift
```

## Run

```bash
# With default config (cmd/fake-worker/config.yaml)
make fake-worker

# With custom config
make fake-worker-config CONFIG=path/to/my-config.yaml

# Or directly
go run ./cmd/fake-worker -config path/to/my-config.yaml
```

### Environment Variables

The worker uses the same `DATABASE_URL` env var as the API server:

```bash
# Default (no env var needed if using docker compose defaults)
DATABASE_URL=postgres://dashboard:dashboard@localhost:5432/industry_dashboard?sslmode=disable
```

### Expected Output

```
Loaded config: site=ALPHA, lines=2, poll=5s
Site: Factory Alpha (id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  Line: Assembly Line 1 (id: ...)
    Machine: CNC-01 (id: ...)
    Machine: CNC-02 (id: ...)
    Machine: CNC-03 (id: ...)
  Line: Packaging Line 2 (id: ...)
    Machine: PKG-01 (id: ...)
    Machine: PKG-02 (id: ...)
Provisioned 5 machines
Claimed 5 machines as worker macmini-12345
Starting data generation for CNC-01 (interval: 5s)
Starting data generation for CNC-02 (interval: 5s)
...
Fake worker running (worker_id: macmini-12345). Press Ctrl+C to stop.
```

## Test

```bash
# Run unit tests (generator pattern tests)
go test ./internal/worker/ -v

# Run all project tests
make test
```

### Verify Data in Database

While the worker is running, check that data is flowing:

```sql
-- Recent data points
SELECT time, machine_id, metric_name, value
FROM data_points
ORDER BY time DESC
LIMIT 20;

-- Machine claim status
SELECT m.name, mw.worker_id, mw.heartbeat_at
FROM machine_workers mw
JOIN machines m ON m.id = mw.machine_id;

-- Alert events (if alerts are configured)
SELECT a.name, ae.triggered_at, ae.resolved_at
FROM alert_events ae
JOIN alerts a ON a.id = ae.alert_id
ORDER BY ae.triggered_at DESC
LIMIT 10;
```

## Architecture

```
cmd/fake-worker/
  main.go              # Entry point — loads config, connects DB, orchestrates
  config.yaml          # Default factory config

internal/worker/
  config.go            # YAML config types and loader
  provisioner.go       # Upserts sites, lines, machines from config
  coordinator.go       # Machine claiming, heartbeat, release via machine_workers table
  generator.go         # Data generation with four patterns
  alerteval.go         # Alert threshold evaluation and event creation
  runner.go            # Per-machine goroutine that generates data on each tick
```

Each machine runs in its own goroutine with an independent `Generator` instance (no shared state, no data races). The coordinator sends heartbeats every 30s; machines with stale heartbeats (>90s) can be reclaimed by another worker.
