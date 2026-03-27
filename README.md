[English](README.md) | [繁體中文](README-tw.md)

# Industry Dashboard

A customizable industrial monitoring dashboard for tracking production lines, machine status, and operational metrics. Users can configure what data to monitor and how it's displayed through AI-generated dynamic layouts powered by [json-render](https://github.com/vercel-labs/json-render).

## Key Features

- **Production Line Monitoring** - Real-time visibility into production line status and throughput
- **Machine Status Tracking** - Monitor machine health, uptime, and alerts
- **Customizable Dashboards** - Users define what to monitor; AI generates the UI layout using json-render's generative UI framework
- **Role-Based Access Control (RBAC)** - Custom roles with granular permissions, scoped per site
- **Audit Trail** - Full logging of user actions and system changes for compliance and traceability

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite + [json-render](https://github.com/vercel-labs/json-render) (shadcn/ui components) |
| Backend | Go (chi router) |
| Database | TimescaleDB (PostgreSQL + time-series) |
| Auth | Microsoft Entra ID (Azure AD) SSO via OIDC |
| RBAC | Custom roles with permission sets, site-scoped |
| Audit | Structured audit logging |

## Getting Started

### Prerequisites
- Go 1.22+
- Node.js 18+
- Docker (for TimescaleDB)

### Setup
```bash
# Start database
make db-up

# Run migrations
make migrate

# Start backend (port 8080)
make dev

# Start frontend (port 5173, in another terminal)
cd frontend && npm install && npm run dev
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|------------|
| `PORT` | `8080` | Backend server port |
| `DATABASE_URL` | `postgres://dashboard:dashboard@localhost:5432/industry_dashboard?sslmode=disable` | TimescaleDB connection |
| `AZURE_CLIENT_ID` | | Microsoft Entra ID app client ID |
| `AZURE_CLIENT_SECRET` | | Microsoft Entra ID app client secret |
| `AZURE_TENANT_ID` | | Azure AD tenant ID |
| `JWT_SECRET` | `dev-secret-change-in-production` | JWT signing secret |

## Fake Worker

The fake worker generates simulated sensor data for testing without real Modbus hardware. It provisions sites, lines, and machines from a YAML config, then writes random data points to TimescaleDB on a polling interval.

### Running

```bash
# Run with default config (cmd/fake-worker/config.yaml)
make fake-worker

# Run with a custom config
make fake-worker-config CONFIG=path/to/config.yaml
```

Requires a running database (`make db-up && make migrate`) and `DATABASE_URL` set.

### Config Format

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
        connection:
          host: "192.168.1.101"
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

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `site_code` | string | Unique identifier for the site |
| `site_name` | string | Display name for the site |
| `timezone` | string | IANA timezone (e.g. `Asia/Taipei`) |
| `poll_interval` | duration | How often to generate data (e.g. `5s`, `10s`) |
| `lines` | list | Production lines at this site |

### Line Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Production line name |
| `display_order` | int | Sort order for display |
| `machines` | list | Machines on this line |

### Machine Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Machine name |
| `model` | string | Machine model |
| `connection.host` | string | Modbus TCP host (used for real workers) |
| `connection.port` | int | Modbus TCP port |
| `connection.slave_id` | int | Modbus slave ID |
| `registers` | list | Data registers to read/simulate |

### Register Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Metric name (e.g. `temperature`, `speed`) |
| `address` | int | Modbus register address |
| `type` | string | Register type (`holding`) |
| `data_type` | string | `float32`, `uint16`, `int32` |
| `unit` | string | Unit of measurement |
| `fake.min` | number | Minimum generated value |
| `fake.max` | number | Maximum generated value |
| `fake.pattern` | string | Data generation pattern (see below) |

### Fake Data Patterns

| Pattern | Behavior |
|---------|----------|
| `random` | Uniform random values between min and max (default if omitted) |
| `sine` | Sinusoidal wave oscillating between min and max |
| `drift` | Gradual random walk that stays within min/max bounds |
| `spike` | Mostly normal values with occasional spikes to max |
| `monotonic` | Always increasing value (small random steps), useful for counters like runtime hours |

## Dashboard CLI (LLM Integration)

A command-line tool that gives LLM agents (or humans) read-only access to the dashboard. Outputs JSON with pagination and token budgeting (~1K tokens per response).

### Setup

```bash
# Build the CLI
make dashboard-cli

# Create an API key in the dashboard UI:
# Go to Admin → API Keys → Create Key → copy the dk_... key

# Configure the CLI
./bin/dashboard-cli configure --url http://localhost:8080 --api-key dk_YOUR_KEY
```

### Commands

```bash
# Discovery
./bin/dashboard-cli doc                          # list all topics
./bin/dashboard-cli doc alerts                   # learn about alerts command

# Query data
./bin/dashboard-cli sites                        # list sites with stats
./bin/dashboard-cli machines --site ALPHA        # machines grouped by line
./bin/dashboard-cli alerts --site ALPHA --status open  # active alerts
./bin/dashboard-cli alerts --site ALPHA --severity critical --last 7d
./bin/dashboard-cli audit --last 3d              # recent audit trail
./bin/dashboard-cli audit --user "Dev User" --action create
./bin/dashboard-cli metrics --machine MACHINE_ID # latest sensor values
./bin/dashboard-cli metrics --machine MACHINE_ID --metric temperature --last 1h
./bin/dashboard-cli workers                      # worker fleet status
./bin/dashboard-cli alert-rules --site ALPHA     # configured alert rules

# API key management
./bin/dashboard-cli admin create-key --name "my-agent"
./bin/dashboard-cli admin list-keys
./bin/dashboard-cli admin revoke-key --id KEY_UUID
```

### Pagination & Token Budget

Every response includes a `"meta"` field with pagination info:

```json
{
  "meta": {
    "usage": "dashboard-cli alerts --site SITE [--severity X] [--status X] [--last 7d] [--page N] [--head N]",
    "showing": 12,
    "total": 58,
    "remaining": 46,
    "next": "dashboard-cli alerts --site ALPHA --page 2"
  },
  "alerts": [...]
}
```

- `--head 0` — meta only, no data (cheapest way to check a command)
- `--page N` — fetch a specific page
- Output auto-limited to ~1K tokens per response

### Agent Integration

Install the CLI as an agent skill so LLMs discover it automatically:

```bash
# Project-level (current directory)
./bin/dashboard-cli inject-skill claude-code

# Global (all projects)
./bin/dashboard-cli inject-skill claude-code --global

# Custom target
./bin/dashboard-cli inject-skill claude-code --target /path/to/project
```

### Environment Variables

| Variable | Description |
|----------|------------|
| `DASHBOARD_URL` | Override server URL (instead of config file) |
| `DASHBOARD_API_KEY` | Override API key (instead of config file) |

Config file location: `~/.dashboard-cli.yaml`

## License

Copyright © austin.jan@gmail.com. All rights reserved.
