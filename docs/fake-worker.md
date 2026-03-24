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

The config file uses the **same format as the real Modbus worker**. The fake worker extends it with an optional `fake` block per register for simulation parameters. The real worker ignores `fake`; the fake worker ignores `connection`.

A default config is included at `cmd/fake-worker/config.yaml`.

### Config Structure

```yaml
site_code: "ALPHA"              # REQUIRED — unique site identifier (matches sites.code)
site_name: "Factory Alpha"      # default: same as site_code
timezone: "Asia/Taipei"         # default: "UTC"
poll_interval: 5s               # default: 5s

lines:
  - name: "Assembly Line 1"    # REQUIRED
    display_order: 1            # default: auto-increment (1, 2, 3...)
    machines:
      - name: "CNC-01"         # REQUIRED
        model: "Haas VF-2"     # default: "" (empty)

        # Modbus connection (REQUIRED for real worker, ignored by fake worker)
        connection:
          host: "192.168.1.100" # REQUIRED for real worker
          port: 502             # default: 502 (standard Modbus TCP)
          slave_id: 1           # default: 1
          timeout: 3s           # default: 3s

        registers:
          - name: temperature   # REQUIRED
            # Modbus register settings (REQUIRED for real worker, ignored by fake worker)
            address: 40001      # Modbus register address
            type: holding       # default: "holding" (holding | input | coil | discrete)
            data_type: float32  # default: "float32" (int16 | uint16 | float32 | int32)
            byte_order: big     # default: "big" (big | little)
            scale: 1.0          # default: 1.0 (multiplier applied to raw value)
            offset: 0           # default: 0 (added after scaling)
            unit: "°C"          # default: "" (empty)

            # Fake worker simulation (ignored by real worker)
            fake:
              min: 60           # default: 0
              max: 95           # default: 100
              pattern: drift    # default: "random" (drift | sine | random | spike)
```

### Defaults Summary

| Field | Default | Notes |
|-------|---------|-------|
| `site_name` | same as `site_code` | |
| `timezone` | `"UTC"` | |
| `poll_interval` | `5s` | |
| `display_order` | auto-increment | 1, 2, 3... based on position |
| `connection.port` | `502` | Standard Modbus TCP port |
| `connection.slave_id` | `1` | |
| `connection.timeout` | `3s` | |
| `type` | `"holding"` | Register type |
| `data_type` | `"float32"` | |
| `byte_order` | `"big"` | |
| `scale` | `1.0` | No scaling |
| `offset` | `0` | No offset |
| `fake.min` | `0` | |
| `fake.max` | `100` | |
| `fake.pattern` | `"random"` | |

### Missing Field Behavior

| Field | Fake Worker | Real Worker |
|-------|------------|-------------|
| `connection` block missing | Runs fine — not needed | **Error** — cannot poll without connection |
| `fake` block missing | Uses defaults (0–100, random) | Ignored entirely |
| `registers[].address` missing | Ignored | **Error** — must know which register to read |

A **minimal fake-only config** just needs `site_code`, line `name`, machine `name`, and register `name`. Everything else has sensible defaults.

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
        connection:
          host: "192.168.3.101"
        registers:
          - name: temperature
            address: 40001
            unit: "°C"
            fake:
              min: 200
              max: 400
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
  config.go            # YAML config types and loader (shared with real worker)
  provisioner.go       # Upserts sites, lines, machines from config
  coordinator.go       # Machine claiming, heartbeat, release via machine_workers table
  generator.go         # Data generation with four patterns
  alerteval.go         # Alert threshold evaluation and event creation
  runner.go            # Per-machine goroutine that generates data on each tick
```

Each machine runs in its own goroutine with an independent `Generator` instance (no shared state, no data races). The coordinator sends heartbeats every 30s; machines with stale heartbeats (>90s) can be reclaimed by another worker.

### Shared with Real Worker

When the real Modbus worker is built, it will reuse:
- `config.go` — same YAML config format
- `provisioner.go` — same factory upsert logic
- `coordinator.go` — same heartbeat/claiming system
- `alerteval.go` — same alert evaluation

Only `runner.go` and `generator.go` are fake-worker-specific. The real worker will replace them with actual Modbus polling via `connection` settings.
