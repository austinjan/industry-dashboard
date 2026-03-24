# Testing the Modbus Worker

This directory contains tools for testing the unified worker with a simulated Modbus TCP device.

## Prerequisites

```bash
# Database
make db-up
make migrate

# Python Modbus simulator
pip3 install pymodbus
```

## Quick Start

You need 3 terminals:

### Terminal 1: Start the Modbus simulator

```bash
python3 testing/modbus-simulator.py
```

This starts a Modbus TCP server on port 5020 with these registers:

| Address | Name | Data Type | Value |
|---------|------|-----------|-------|
| 40001-40002 | temperature | float32 | 72.5 |
| 40003 | speed | uint16 | 1200 |
| 40004-40005 | power | float32 | 3.75 |

Use `--port` to change the port:
```bash
python3 testing/modbus-simulator.py --port 5021
```

### Terminal 2: Start the worker

```bash
make worker-config CONFIG=testing/test-modbus-worker.yaml
```

You should see:
```
Loaded config: site=TEST, lines=1, poll=5s
Site: Test Site (id: ...)
  Line: Test Line (id: ...)
    Machine: Simulator-01 (id: ...)
Provisioned 1 machines
Claimed 1 machines as worker ...
Starting data collection for Simulator-01
Worker running (worker_id: ...). Press Ctrl+C to stop.
```

If it's working, you'll see **no error messages** after "Starting data collection." Data is being written to the database every 5 seconds.

### Terminal 3: Verify data in the database

```bash
psql postgres://dashboard:dashboard@localhost:5432/industry_dashboard
```

```sql
-- Check recent data points
SELECT time, metric_name, value
FROM data_points
WHERE machine_id = (SELECT id FROM machines WHERE name = 'Simulator-01')
ORDER BY time DESC
LIMIT 15;

-- Expected output:
--           time          | metric_name |  value
-- ------------------------+-------------+---------
--  2026-03-24 15:00:05+08 | temperature |    72.5
--  2026-03-24 15:00:05+08 | speed       |    1200
--  2026-03-24 15:00:05+08 | power       |    3.75
--  ...

-- Check machine status
SELECT name, status, updated_at FROM machines WHERE name = 'Simulator-01';

-- Expected: status = 'running'
```

## Testing Reconnection

1. Start the simulator and worker as above
2. Wait for a few successful polls (no errors in worker logs)
3. **Kill the simulator** (Ctrl+C in Terminal 1)
4. Watch the worker logs — you should see:
   ```
   Error reading Simulator-01: read temperature (addr=40001) failed: ... (consecutive: 1)
   Error reading Simulator-01: ... (consecutive: 2)
   Error reading Simulator-01: ... (consecutive: 3)
   ```
   After 3 consecutive errors, machine status changes to `error`.
5. **Restart the simulator**: `python3 testing/modbus-simulator.py`
6. The worker reconnects automatically (with backoff: 1s, 2s, 4s, ..., max 30s)
7. Verify in DB: `SELECT status FROM machines WHERE name = 'Simulator-01';` — should return to `running`

## Testing Fake Mode

The unified worker also supports fake (simulated) data — no Modbus device needed:

```bash
make worker-config CONFIG=cmd/fake-worker/config.yaml
```

This uses the same binary but auto-detects fake mode because all registers have `fake:` config blocks.

## Files

| File | Description |
|------|-------------|
| `modbus-simulator.py` | Modbus TCP server with static test values |
| `test-modbus-worker.yaml` | Worker config pointing to the simulator |
| `README.md` | This file |
