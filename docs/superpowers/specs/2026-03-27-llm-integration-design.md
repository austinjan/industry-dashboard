# LLM Integration — dashboard-cli Design

## Overview

A Go CLI binary (`cmd/dashboard-cli/`) that gives LLM agents shell-based access to the industry dashboard. The CLI calls existing REST API endpoints, formats responses as token-budgeted XML, and provides progressive disclosure documentation. Any agent with shell access can discover and use it.

## Scope

### In scope
- Go CLI binary with 10 commands: `configure`, `doc`, `sites`, `alerts`, `alert-rules`, `audit`, `machines`, `metrics`, `workers`, `inject-skill`
- Admin key management: `admin create-key`, `admin list-keys`, `admin revoke-key`
- XML output format with mandatory `<meta>` header, ~1K token budget
- `--head N` flag on all commands (0 = meta only)
- Progressive disclosure `doc` command
- API key authentication (new `llm_api_keys` table + auth middleware)
- `inject-skill` for Claude Code (project/global/custom target)
- Config file (`~/.dashboard-cli.yaml`) + env var override

### Out of scope
- Write operations (CLI is read-only, except key management)
- MCP server mode
- Codex/other agent system injection (future)
- Frontend UI for key management (admin CLI only)

## Architecture

```
LLM Agent
  └─ shell exec: dashboard-cli alerts --site factory1
       └─ reads ~/.dashboard-cli.yaml (url + api-key)
       └─ calls GET /api/alert-events?site_id=X&limit=15
       └─ auth: Authorization: Bearer dk_...
       └─ formats JSON response → XML with <meta>
       └─ enforces ~1K token budget
       └─ outputs to stdout
```

The CLI is a **smart client** — it owns formatting, pagination, token budgeting, and documentation. The backend is unchanged except for API key auth.

## Output Format

### Standard Output

```xml
<meta>
  <usage>dashboard-cli alerts [--site ID|CODE] [--severity critical|warning|info] [--status open|ack|resolved] [--last 1h|6h|24h|3d|7d|30d] [--page N] [--head N]</usage>
  <showing>15</showing>
  <total>58</total>
  <remaining>43</remaining>
  <next>dashboard-cli alerts --site factory1 --page 2</next>
</meta>
<alerts>
  <alert id="abc" severity="critical" status="open" alert_name="High Temperature"
         line="Assembly Line 1" machine="CNC-01" metric="temperature"
         reading="419.44" condition=">" threshold="400.00"
         triggered_at="2026-03-27T09:52:22Z"/>
  ...
</alerts>
```

### Meta-Only Output (`--head 0`)

```xml
<meta>
  <usage>dashboard-cli alerts [--site ID|CODE] [--severity critical|warning|info] [--status open|ack|resolved] [--last 1h|6h|24h|3d|7d|30d] [--page N] [--head N]</usage>
  <showing>0</showing>
  <total>58</total>
  <remaining>58</remaining>
  <next>dashboard-cli alerts --site factory1 --page 1</next>
</meta>
```

### Error Output

```xml
<error>
  <message>Site 'factory99' not found</message>
  <hint>Run `dashboard-cli sites` to list available sites</hint>
</error>
```

### Token Budget

Target ~1K tokens (~3KB text) per output. The CLI auto-calculates page size:
- Dense data (alerts, audit, metrics): ~10-12 records
- Light data (sites, workers, alert-rules): ~15-20 records
- `<meta>` block consumes ~100 tokens, leaving ~900 for data

## Authentication

### `llm_api_keys` Table

```sql
CREATE TABLE llm_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(8) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_llm_api_keys_prefix ON llm_api_keys(key_prefix);
```

### Key Format

Keys use prefix `dk_` (dashboard key) followed by 32 random hex chars: `dk_a3f29b4c...`

The `key_prefix` stores the first 8 chars for identification without exposing the full key.

### Auth Middleware

The existing auth middleware is extended to accept API keys alongside JWT:
- Check `Authorization: Bearer dk_...` header
- If prefix is `dk_`, validate against `llm_api_keys` table (bcrypt hash comparison)
- If valid, set a synthetic claims context with `user_id = "llm:<key_name>"` for audit logging
- API keys are read-only — reject non-GET requests (except key management endpoints)

### Key Management Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/llm/keys` | JWT (admin) | Create new API key |
| GET | `/api/llm/keys` | JWT (admin) | List keys (prefix, name, created_at, active) |
| DELETE | `/api/llm/keys/{prefix}` | JWT (admin) | Revoke key |

### CLI Configuration

```yaml
# ~/.dashboard-cli.yaml
url: http://localhost:8080
api_key: dk_a3f29b4c...
```

Env var override: `DASHBOARD_URL`, `DASHBOARD_API_KEY`

Priority: env var > config file > error

## Commands

### `dashboard-cli configure`

```bash
dashboard-cli configure --url http://localhost:8080 --api-key dk_xxx
```

Writes `~/.dashboard-cli.yaml`. Validates connection by calling `/healthz`.

### `dashboard-cli doc [topic]`

Built-in progressive disclosure documentation. No API call needed.

```bash
dashboard-cli doc                    # list all topics
dashboard-cli doc alerts             # how to use alerts command
dashboard-cli doc alerts filters     # detailed filter options
dashboard-cli doc auth               # how authentication works
```

Topic tree:
```
doc
├── alerts          — querying alert events
│   └── filters     — severity, status, time range, line, machine
├── alert-rules     — viewing alert rule configurations
├── audit           — querying audit trail
│   └── filters     — user, action, resource type, time range
├── machines        — machine status and hierarchy
├── metrics         — time-series data queries
├── sites           — site listing and summaries
├── workers         — worker fleet status
├── auth            — API key setup and configuration
└── output          — understanding XML output format and pagination
```

### `dashboard-cli sites`

```bash
dashboard-cli sites [--head N]
```

Calls `GET /api/sites` then `GET /api/sites/{id}/summary` for each site.

Output:
```xml
<sites>
  <site id="xxx" name="Factory A" code="factory-a" timezone="Asia/Taipei"
        total_machines="12" online_machines="10" active_alerts="3" total_lines="4"/>
</sites>
```

### `dashboard-cli alerts`

```bash
dashboard-cli alerts --site ID|CODE [--severity critical|warning|info] [--status open|ack|resolved] [--last 7d] [--page N] [--head N]
```

Calls `GET /api/alert-events?site_id=X&severity=X&status=X&limit=N&offset=N`

`--last` converts to a `since` timestamp filter. The CLI passes calculated offset/limit based on token budget.

`--site` accepts site ID (UUID) or site code. CLI resolves code → ID by querying sites.

### `dashboard-cli alert-rules`

```bash
dashboard-cli alert-rules --site ID|CODE [--head N]
```

Calls `GET /api/alerts?site_id=X`

Output:
```xml
<alert_rules>
  <rule id="xxx" name="High Temp" machine_id="yyy" metric="temperature"
        condition=">" threshold="400" severity="critical" active="true"/>
</alert_rules>
```

### `dashboard-cli audit`

```bash
dashboard-cli audit [--user NAME|EMAIL] [--action create|update|delete|acknowledge] [--resource site|alert|machine|dashboard] [--last 3d] [--page N] [--head N]
```

Calls `GET /api/audit-logs?user_id=X&action=X&resource_type=X&limit=N&offset=N`

`--user` accepts name or email. CLI resolves to user_id by querying `GET /api/users`.

`--last` converts to time filter. Since the backend doesn't have a `since` parameter for audit logs, the CLI fetches and filters client-side, or we add a `since` parameter to the backend.

Output:
```xml
<audit_logs>
  <log id="xxx" user="John Doe" email="john@example.com" action="create"
       resource_type="alert" resource_id="yyy"
       ip="192.168.1.1" timestamp="2026-03-27T09:00:00Z">
    <details>{"name":"High Temp","severity":"critical","threshold":400}</details>
  </log>
</audit_logs>
```

### `dashboard-cli machines`

```bash
dashboard-cli machines --site ID|CODE [--head N]
```

Calls `GET /api/sites/X/lines` then `GET /api/site-machines?site_id=X`

Output grouped by line:
```xml
<machines site="Factory A">
  <line id="xxx" name="Assembly Line 1">
    <machine id="yyy" name="CNC-01" model="Fanuc" status="running"/>
    <machine id="zzz" name="CNC-02" model="Fanuc" status="offline"/>
  </line>
</machines>
```

### `dashboard-cli metrics`

```bash
dashboard-cli metrics --machine ID [--metric NAME] [--last 1h|6h|24h|7d|30d] [--head N]
```

Without `--metric`: calls `GET /api/machines/X/latest` to show latest values for all metrics.

With `--metric`: calls `GET /api/datapoints?machine_id=X&metric_name=Y&time_range=Z` for time-series.

Output (latest):
```xml
<metrics machine="CNC-01">
  <metric name="temperature" value="85.20" unit="C"/>
  <metric name="pressure" value="312.50" unit="kPa"/>
  <metric name="water" value="398.00" unit="L"/>
</metrics>
```

Output (time-series):
```xml
<timeseries machine="CNC-01" metric="temperature" range="1h">
  <point time="2026-03-27T09:00:00Z" value="85.20"/>
  <point time="2026-03-27T09:05:00Z" value="86.10"/>
</timeseries>
```

### `dashboard-cli workers`

```bash
dashboard-cli workers [--head N]
```

Calls `GET /api/workers`

Output:
```xml
<workers>
  <worker id="xxx" name="worker-1" status="online" hostname="prod-01"
          machines="5" started_at="2026-03-27T08:00:00Z"
          heartbeat_at="2026-03-27T09:55:00Z"/>
</workers>
```

### `dashboard-cli inject-skill`

```bash
dashboard-cli inject-skill claude-code              # → .claude/skills/dashboard-cli.md
dashboard-cli inject-skill claude-code --global      # → ~/.claude/skills/dashboard-cli.md
dashboard-cli inject-skill claude-code --target DIR  # → DIR/.claude/skills/dashboard-cli.md
```

Writes a skill markdown file with frontmatter:

```markdown
---
name: dashboard-cli
description: Query industry monitoring dashboard for alerts, audit logs, machine status, metrics, and worker information
---

You have access to `dashboard-cli` for querying the industry monitoring dashboard.

Start with `dashboard-cli doc` to discover topics.
Use `dashboard-cli doc <topic>` for details on a specific area.

All output is XML. The `<meta>` block always comes first — use `--head 0` to read meta only (pagination info, total records, next command).

When investigating issues:
1. `dashboard-cli alerts --site ID --status open` — check active alerts
2. `dashboard-cli audit --last 24h` — recent system changes
3. `dashboard-cli machines --site ID` — machine health overview
4. `dashboard-cli metrics --machine ID` — latest sensor readings
```

### `dashboard-cli admin` (Key Management)

```bash
dashboard-cli admin create-key --name "claude-agent"
# Output: dk_a3f29b4c... (shown once)

dashboard-cli admin list-keys
# XML list of keys (prefix, name, created_at, active)

dashboard-cli admin revoke-key --prefix dk_a3f29b
# Confirms revocation
```

Admin commands require JWT auth (login flow) or an existing API key with admin scope (future).

For initial bootstrap: the first key can be created via environment variable `DASHBOARD_BOOTSTRAP_KEY=true` which auto-generates a key on server startup and prints it to stdout.

## Backend Changes

### New files
| File | Responsibility |
|------|---------------|
| `internal/llmauth/store.go` | `llm_api_keys` CRUD |
| `internal/llmauth/middleware.go` | API key validation middleware |
| `internal/llmauth/handler.go` | Key management handlers |
| `migrations/021_create_llm_api_keys.{up,down}.sql` | Table creation |

### Modified files
| File | Change |
|------|--------|
| `cmd/server/main.go` | Register `/api/llm/keys` routes, add API key auth to middleware chain |
| `internal/audit/store.go` | Add `since` filter parameter to `ListParams` and `List()` query |

### Auth middleware change

The existing JWT auth middleware in `internal/auth/middleware.go` is extended:
- If `Authorization: Bearer dk_...` (dk_ prefix), delegate to llmauth middleware
- If valid API key, inject synthetic claims: `UserID = "llm:<key_name>"`, `Email = "llm:<key_name>@api"`
- Continue to next handler (RBAC middleware will see a valid user context)
- Reject non-GET methods for API key auth (read-only)

## CLI Binary Structure

```
cmd/dashboard-cli/
├── main.go              — entry point, cobra root command
├── config.go            — configure command, yaml read/write
├── doc.go               — doc command, built-in topic tree
├── output.go            — XML formatting, meta generation, token budget
├── client.go            — HTTP client, auth, error handling
├── cmd_sites.go         — sites command
├── cmd_alerts.go        — alerts command
├── cmd_alert_rules.go   — alert-rules command
├── cmd_audit.go         — audit command
├── cmd_machines.go      — machines command
├── cmd_metrics.go       — metrics command
├── cmd_workers.go       — workers command
├── cmd_inject_skill.go  — inject-skill command
├── cmd_admin.go         — admin key management commands
└── skills/              — embedded skill templates
    └── claude-code.md   — Claude Code skill template
```

Dependencies: `cobra` for CLI framework, `gopkg.in/yaml.v3` for config.

## Makefile Addition

```makefile
dashboard-cli:
	go build -o bin/dashboard-cli ./cmd/dashboard-cli
```
