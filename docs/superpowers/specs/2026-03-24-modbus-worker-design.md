# SP1: Modbus DataSource + Unified Worker

**Date:** 2026-03-24
**Status:** Draft
**Scope:** Core Modbus TCP reads, DataSource abstraction, unified worker binary

## Overview

Replace the hardcoded fake data generation in the worker with a `DataSource` interface that supports both fake (simulated) and real Modbus TCP data sources. Unify the worker into a single binary that auto-detects the mode per machine based on config.

This is Sub-Project 1 of 4:
- **SP1: Modbus DataSource + Unified Worker** (this spec)
- SP2: Worker status reporting + command queue
- SP3: Admin UI — site/line/machine management
- SP4: Worker config builder + deploy flow

## DataSource Interface

```go
// internal/worker/datasource.go

type DataSource interface {
    // Read all configured registers, return metric_name -> value
    Read(ctx context.Context) (map[string]float64, error)
    Close() error
}
```

Each machine gets one `DataSource` instance. The Runner is source-agnostic.

### FakeDataSource

Wraps the existing `Generator`. Constructed when all registers have `fake:` blocks.

```go
type FakeDataSource struct {
    gen       *Generator
    registers []RegisterConfig
    tick      int
}
```

### ModbusDataSource

Holds a `modbus.TCPClientHandler` and `modbus.Client` from `github.com/goburrow/modbus`. One TCP connection per machine.

```go
type ModbusDataSource struct {
    handler   *modbus.TCPClientHandler
    client    modbus.Client
    registers []RegisterConfig
    connected bool
}
```

### Auto-Detection Logic

**Config change required:** `FakeConfig` in `RegisterConfig` must change from a value type to a pointer (`*FakeConfig`). Currently `applyMachineDefaults()` unconditionally sets `Fake.Max=100` and `Fake.Pattern="random"` on every register, making it impossible to distinguish "user specified fake" from "defaults applied." With a pointer, `nil` means real Modbus, non-nil means fake. The default-filling logic must only apply when `Fake != nil` (i.e., the user provided a `fake:` block in YAML).

Per machine, when building `DataSource`:

- ALL registers have `Fake != nil` -> `FakeDataSource`
- ALL registers have `Fake == nil` -> `ModbusDataSource`
- Mixed -> error: "machine X has mixed fake/real registers, not supported"

## Register Decoding

```go
// internal/worker/decoder.go

func DecodeRegister(raw []byte, cfg RegisterConfig) (float64, error)
```

### Supported Register Types

| Register Type | Function Code | Description |
|---|---|---|
| `holding` | 0x03 | Read holding registers |
| `input` | 0x04 | Read input registers |
| `coil` | 0x01 | Read coil status (bool -> 0.0/1.0) |
| `discrete` | 0x02 | Read discrete inputs (bool -> 0.0/1.0) |

### Supported Data Types

| Data Type | Size (registers) | Decoding |
|---|---|---|
| `uint16` | 1 | Direct unsigned |
| `int16` | 1 | Signed |
| `uint32` | 2 | Byte order applied |
| `int32` | 2 | Byte order applied |
| `float32` | 2 | Byte order applied, IEEE 754 |
| `float64` | 4 | Byte order applied, IEEE 754 |
| `bool` | 1 bit | Coil/discrete only |
| `string` | N (via `length` field) | ASCII, 2 chars per register, null-trimmed |
| `timestamp_unix` | 2 | Decoded as uint32 epoch, stored as float64. Included because it decodes as a simple uint32 — no vendor-specific logic needed. |

### Byte Orders

| Byte Order | Description |
|---|---|
| `big` | Big-endian (default, most common) |
| `little` | Little-endian |
| `mid-big` | Mid-big-endian (CDAB, common in some PLCs) |
| `mid-little` | Mid-little-endian (BADC) |

### Value Transformation

Final value: `(decoded_value * scale) + offset`

### String Handling

String registers are stored in a `machine_metadata` table (not `data_points`), since they rarely change and aren't used for alerts or charts.

```sql
CREATE TABLE machine_metadata (
    machine_id  UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    key         VARCHAR NOT NULL,       -- register name (e.g. "serial_number")
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (machine_id, key)
);
```

On each read, upsert: `INSERT ... ON CONFLICT (machine_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`. Only write if value has changed to avoid unnecessary DB churn.

### `length` Field

The `length` field on `RegisterConfig` is only required when `data_type` is `string`. For all numeric types, the register count is derived from the data type size. Validation should error if `data_type=string` and `length` is missing.

## Config Changes

### New Top-Level Fields

```yaml
database_url: "postgres://dashboard:dashboard@db-server:5432/industry_dashboard"
log_level: "info"           # debug, info, warn, error
worker_name: "factory-alpha-01"  # optional, defaults to hostname-pid

site_code: "ALPHA"
site_name: "Factory Alpha"
timezone: "Asia/Taipei"
poll_interval: 5s
```

**Priority for database_url:** `DATABASE_URL` env var > `database_url` in YAML > error

### New Register Fields

```yaml
registers:
  - name: serial_number
    address: 40100
    type: holding
    data_type: string
    length: 10        # number of registers to read (string/timestamp_bcd only)
```

### Full Config Example

```yaml
database_url: "postgres://dashboard:dashboard@db-server:5432/industry_dashboard"
log_level: "info"
worker_name: "factory-alpha-01"

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
        connection:
          host: "192.168.1.101"
          port: 502
          slave_id: 1
          timeout: 3s
        registers:
          - name: temperature
            address: 40001
            type: holding
            data_type: float32
            unit: "°C"
            # no fake: block -> real Modbus read

          - name: serial_number
            address: 40100
            type: holding
            data_type: string
            length: 10

      - name: "SIM-01"
        model: "Virtual"
        connection:
          host: "127.0.0.1"
          port: 502
          slave_id: 1
        registers:
          - name: temperature
            address: 40001
            type: holding
            data_type: float32
            unit: "°C"
            fake:
              min: 60
              max: 95
              pattern: drift
```

## Unified Worker Binary

### Location

```
cmd/worker/main.go     # new unified worker
cmd/fake-worker/       # deprecated, kept for backwards compatibility
```

### Makefile Targets

```makefile
worker:
	go run ./cmd/worker

worker-config:
	go run ./cmd/worker -config $(CONFIG)
```

### ProvisionedMachine Changes

```go
type ProvisionedMachine struct {
    ID         string
    Name       string
    Registers  []RegisterConfig
    DataSource DataSource        // new field, injected during setup
}
```

## Runner Changes

The Runner no longer calls `Generator` directly. It uses the `DataSource` interface.

```go
func (r *Runner) RunMachine(ctx context.Context, machine ProvisionedMachine) {
    source := machine.DataSource
    defer source.Close()

    ticker := time.NewTicker(r.pollInterval)
    defer ticker.Stop()

    consecutiveErrors := 0

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            values, err := source.Read(ctx)
            if err != nil {
                consecutiveErrors++
                log.Printf("Error reading %s: %v", machine.Name, err)
                if consecutiveErrors >= 3 {
                    r.updateMachineStatus(ctx, machine.ID, "error")
                }
                continue
            }
            consecutiveErrors = 0
            r.updateMachineStatus(ctx, machine.ID, "running")
            r.writeDataPoints(ctx, machine.ID, values)  // batch insert, replaces per-register writes
            r.alertEval.Evaluate(ctx, machine.ID, values)
        }
    }
}
```

## Error Handling & Reconnection

### Connection Lifecycle

```
startup: connect to Modbus device
    |
poll loop: read registers every poll_interval
    | (connection lost)
retry with backoff: 1s -> 2s -> 4s -> 8s -> max 30s
    | (recovered)
resume normal polling
```

### ModbusDataSource.Read() Behavior

1. If not connected, attempt reconnect with exponential backoff
2. Read each register sequentially
3. If any read fails, mark as disconnected, return error
4. On next call, reconnect attempt happens automatically

### Runner Error Escalation

- Read error -> increment `consecutiveErrors`, skip this poll cycle, log warning
- 3 consecutive errors -> update machine status to `error` in DB
- Successful read -> reset counter, update machine status to `running`

Backoff logic lives inside `ModbusDataSource`, not the Runner. This keeps the Runner source-agnostic.

### Important Deployment Note

When deploying workers on remote machines, ensure:
- Network connectivity to Modbus devices (TCP port 502 by default)
- Network connectivity to TimescaleDB
- Firewall rules allow outbound connections on both paths
- The worker handles transient network issues via automatic reconnection with backoff
- If a worker loses DB connectivity, it will fail to write data points but continue attempting reads. DB reconnection is handled by the pgx connection pool.

## Modbus Protocol: TCP Only

This spec covers Modbus TCP only. Modbus RTU (serial) is out of scope and can be added later behind the same `DataSource` interface.

## File Structure

### New Files

```
internal/worker/
  datasource.go          # DataSource interface
  datasource_fake.go     # FakeDataSource implementation
  datasource_modbus.go   # ModbusDataSource implementation
  decoder.go             # Register decoding (all types + byte orders)
  decoder_test.go        # Unit tests for decoding
  datasource_test.go     # Unit tests for both data sources

cmd/worker/
  main.go                # Unified worker entry point
```

### Modified Files

```
internal/worker/
  config.go              # Add database_url, log_level, worker_name, string/length fields
  runner.go              # Use DataSource interface instead of Generator directly
  provisioner.go         # Attach DataSource to ProvisionedMachine

go.mod                   # Add github.com/goburrow/modbus
Makefile                 # Add `make worker` target
```

### Unchanged Files

```
internal/worker/
  generator.go           # Used by FakeDataSource, no changes
  alerteval.go           # No changes
  coordinator.go         # No changes (SP2 will extend)
```

## External Dependencies

- `github.com/goburrow/modbus` — Modbus TCP client library (de facto standard in Go)

## Out of Scope (Future Sub-Projects)

- SP2: Worker status reporting, `workers` table, `worker_commands` table, heartbeat extensions
- SP3: Admin UI for site/line/machine CRUD
- SP4: Worker config builder UI, binary download, deployment verification
- Modbus RTU (serial) support
- `timestamp_bcd` data type
- `reload-config` command
