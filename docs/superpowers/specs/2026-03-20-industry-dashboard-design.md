# Industry Dashboard — Design Spec

## Overview

A multi-factory industrial monitoring dashboard for tracking production lines, machine status, and operational metrics. Users customize what to monitor and how it's displayed through a drag-and-drop widget builder and AI-generated layouts powered by json-render.

## System Components

```
┌─────────────────────────────────────────────────┐
│               React Frontend                     │
│  Fixed Pages │ Widget Builder │ json-render Views │
└──────────────┬───────────────────────────────────┘
               │ REST + WebSocket
┌──────────────▼───────────────────────────────────┐
│               Go API Server                       │
│  Auth │ RBAC │ Audit │ Dashboard │ Alerts │ Data  │
└──────────────┬───────────────────────────────────┘
               │ SQL + NOTIFY/LISTEN
┌──────────────▼──────────┐   ┌────────────────────┐
│       TimescaleDB        │◄──│  Go Modbus Workers  │
│  relational + timeseries │   │  (distributed)      │
└──────────────────────────┘   └────────────────────┘
```

Four components:

1. **Go API Server** — REST API + WebSocket server. Handles auth, RBAC, dashboards, alerts, data queries. Listens on PostgreSQL NOTIFY for real-time updates from workers.
2. **Go Modbus Workers** — standalone binaries that poll machines via Modbus protocol. Distributed deployment, DB-coordinated. Write sensor data to TimescaleDB.
3. **React Frontend** — SPA with traditional dashboard pages, drag-and-drop custom dashboard builder, and json-render AI-generated views.
4. **TimescaleDB** — single PostgreSQL database with TimescaleDB extension. Stores relational data (users, roles, sites, machines, dashboards, audit) and time-series sensor readings.

## Data Model

### Factory Hierarchy

```
Organization (implicit — single tenant)
  └── Site (factory)
       └── ProductionLine
            └── Machine
                 └── DataPoint (sensor readings)
```

### Core Tables

**Infrastructure:**

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `sites` | id, name, code, timezone, address | Factory locations |
| `production_lines` | id, site_id, name, display_order | Lines within a site |
| `machines` | id, line_id, name, model, status, modbus_config (JSONB) | Modbus connection config stored as JSONB |

**Time-series:**

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `data_points` | time, machine_id, metric_name, value | TimescaleDB hypertable, partitioned by time |

**Auth & RBAC:**

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `users` | id, email, name, microsoft_id, is_active | microsoft_id links to Entra ID |
| `permissions` | id, code, group_name, description | System-defined permission list |
| `roles` | id, name, description, is_system | Customer-defined roles; is_system marks default templates |
| `role_permissions` | role_id, permission_id | Maps roles to permissions |
| `user_site_roles` | user_id, role_id, site_id | User → role → site assignment |

**Dashboards:**

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `dashboards` | id, title, owner_id, site_id, layout_type (manual/ai_generated), is_shared | User-created dashboard pages |
| `dashboard_widgets` | id, dashboard_id, widget_type, position_x, position_y, width, height, config (JSONB) | Widget instances on a 12-column grid |
| `widget_types` | id, name, description, default_config (JSONB), schema (JSONB) | Pre-defined widget catalog |

**Alerts:**

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `alerts` | id, name, machine_id, metric_name, condition, threshold, severity | Alert rule definitions |
| `alert_events` | id, alert_id, triggered_at, resolved_at, acknowledged_by | Triggered alert instances |

**Audit:**

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `audit_logs` | id, user_id, action, resource_type, resource_id, details (JSONB), ip_address, timestamp | Append-only, never deleted |

**Worker coordination:**

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `machine_workers` | machine_id, worker_id, claimed_at, heartbeat_at | DB-based distributed worker coordination |

## Authentication

### Microsoft Entra ID (Azure AD) SSO

Primary authentication via OAuth2/OIDC with Microsoft Entra ID:

1. Frontend redirects to Microsoft login
2. Microsoft returns authorization code
3. Backend exchanges code for ID token + access token
4. Backend creates/updates user record (JIT provisioning on first login via `microsoft_id`)
5. Backend issues its own JWT pair:
   - Access token: 15-minute expiry, contains user ID and role claims
   - Refresh token: 7-day expiry, rotation on each use

API requests use our JWT, not Microsoft tokens. This decouples the backend from Microsoft's token lifecycle.

### Break-glass Local Auth

Optional local password auth for an emergency admin account. Disabled by default, enabled via config. Passwords hashed with bcrypt.

## RBAC

### Custom Roles with Permission Sets

Customers define their own roles through the admin UI. Each role has a name and a set of permissions selected from a system-defined list.

**Default role templates** (cloneable, editable):

| Template | Typical Permissions |
|----------|-------------------|
| Admin | All permissions, global scope |
| Manager | View all data, manage dashboards and alerts, view audit log |
| Operator | View data, create personal dashboards, acknowledge alerts |
| Viewer | Read-only access to data and shared dashboards |

### Permission Groups

| Group | Permissions |
|-------|-----------|
| Dashboard | `dashboard:view`, `dashboard:create`, `dashboard:edit`, `dashboard:delete`, `dashboard:share` |
| Machine & Data | `machine:view`, `machine:edit`, `datapoint:view`, `datapoint:export` |
| Alerts | `alert:view`, `alert:create`, `alert:manage`, `alert:acknowledge` |
| Admin | `user:manage`, `role:manage`, `site:manage`, `audit:view` |

### Site Scoping

Roles are assigned per-site via `user_site_roles`. A user can hold different roles at different sites (e.g., "Maintenance Lead at Factory A", "Viewer at Factory B"). Admin-template roles have global scope (all sites).

### RBAC Middleware

Every API request passes through RBAC middleware that:

1. Extracts user ID and claims from JWT
2. Determines target site from the request
3. Checks `user_site_roles` for the required permission
4. Rejects with 403 if insufficient

### RBAC Admin UI

- **User Management** — list users, view/edit role assignments per site
- **Role Management** — create/edit/clone roles, assign permissions via checklist UI
- Users are provisioned via Microsoft SSO (JIT), then admins assign roles

## Audit Trail

- Middleware-based — every mutating API call logged automatically
- Append-only `audit_logs` table with JSONB details
- Covers: login/logout, CRUD on dashboards/alerts/machines/users, RBAC changes, config changes
- **Audit Log Viewer** page: searchable, filterable by user/action/resource/time range
  - Admin sees all sites
  - Manager sees their assigned sites only
- Retention: indefinite (compliance), optional archival to cold storage later

## Dashboard System

### Three Layers of Dashboard Content

1. **Fixed pages** — built-in views that every user sees:
   - Site Overview (landing page) — KPI cards, production line status, recent alerts
   - Machine Detail — single machine deep-dive with metrics and history
   - Production Metrics — cross-line/cross-machine analytics
   - Alerts & Alarms — alert list with filtering, acknowledgment
   - Reports — exportable summaries
   - RBAC Admin — user management, role management
   - Audit Log Viewer

2. **Manual custom dashboards** — users drag widgets from a catalog onto a 12-column grid, configure data sources per widget, save and share

3. **AI-generated views (json-render)** — user describes what they want in natural language, OpenAI generates a json-render JSON spec constrained to the widget catalog, frontend renders it. AI-generated dashboards can be manually edited afterward.

### Widget Catalog

9 pre-defined widget types, shared between manual builder and json-render:

| Widget | Purpose | Key Config |
|--------|---------|-----------|
| Status Card | Single metric with trend indicator | metric, unit, thresholds |
| Gauge | Radial gauge (OEE, utilization) | metric, min/max, color zones |
| Bar Chart | Comparisons across lines/machines | data source, grouping, time range |
| Line Chart | Time-series trends (multi-metric) | metrics, time range, interval |
| Pie Chart | Proportional breakdowns | data source, grouping |
| Data Table | Sortable/filterable tabular data | columns, filters, sort, pagination |
| Alert List | Filtered alert feed | severity filter, site/line scope |
| Machine Status | Compact single-machine overview | machine, displayed metrics |
| Text/Markdown | Free text notes, annotations | markdown content |

Each widget instance stores its configuration as JSONB in `dashboard_widgets.config`, including data bindings (which machine, metric, time range, filters).

### Dashboard Builder Flow

1. User clicks "+ New Dashboard"
2. Chooses: **Manual** or **AI Generate**
3. Manual path: drag widgets from catalog onto 12-column grid (react-grid-layout), resize and position, configure data bindings per widget
4. AI path: describe in natural language → OpenAI generates json-render spec → rendered with same widget components → optionally edit manually
5. Save and share with other users

### json-render Integration

- Widget catalog defined as a json-render component catalog with Zod schemas
- OpenAI API generates JSON specs constrained to this catalog
- Frontend renders specs using `@json-render/react` with `@json-render/shadcn` components
- Generated specs are stored in `dashboards` table and can be converted to `dashboard_widgets` rows for manual editing

## Real-time Updates

- **WebSocket** at `/ws` for push updates to the browser
- API server listens on **PostgreSQL NOTIFY/LISTEN** channels for events from Modbus workers
- Workers write sensor data to `data_points` and NOTIFY on status changes
- API server receives NOTIFY, broadcasts to relevant WebSocket clients (filtered by site scope and user permissions)
- Target update frequency: 10-30 seconds

## Modbus Workers

### Architecture

Standalone Go binary, deployed independently from the API server. Multiple instances can run simultaneously.

### Operation

1. Worker starts with a unique ID (hostname + UUID)
2. Queries DB for unclaimed machines, claims them by writing to `machine_workers` table
3. Spawns a goroutine per claimed machine
4. Each goroutine polls Modbus registers on the configured interval
5. Writes readings to `data_points` in batches (buffered, flushed every few seconds)
6. Sends PostgreSQL NOTIFY on status changes

### Register Map Config

Stored per machine in `machines.modbus_config` as JSONB:

```json
{
  "host": "192.168.1.100",
  "port": 502,
  "unit_id": 1,
  "poll_interval_ms": 5000,
  "registers": [
    {"address": 100, "name": "temperature", "type": "float32", "unit": "°C"},
    {"address": 102, "name": "speed", "type": "uint16", "unit": "rpm"},
    {"address": 103, "name": "status", "type": "uint16", "enum": {"0": "stopped", "1": "running", "2": "error"}}
  ]
}
```

### Distributed Coordination

DB-based, no external coordinator (no etcd/Consul/Redis):

| Mechanism | Detail |
|-----------|--------|
| Claiming | Worker writes its ID to `machine_workers` for unclaimed machines |
| Heartbeat | Updated every 30 seconds |
| Stale detection | Heartbeat older than 90 seconds = stale, machine can be reclaimed |
| Rebalancing | Workers periodically check for stale claims and new unclaimed machines |
| Scaling | Start more worker instances — they self-coordinate |

### Operational Features

- Reconnect with exponential backoff on connection loss
- Health check endpoint (`/healthz`)
- Logs connection errors and read failures

## Frontend Architecture

### Tech Stack

| Library | Purpose |
|---------|---------|
| React + TypeScript | UI framework |
| Vite | Build tool / dev server |
| shadcn/ui + Tailwind CSS | Component library + styling |
| React Router | Page navigation |
| TanStack Query | Data fetching and caching |
| Recharts | Chart rendering (bar, line, pie, gauge) |
| react-grid-layout | Drag-and-drop 12-column grid for dashboard builder |
| @json-render/react + @json-render/shadcn | AI-generated view rendering |

### App Shell

- **Top nav** — app title, site selector dropdown, user menu
- **Left sidebar** — navigation grouped into:
  - Main pages (Site Overview, Production Lines, Machine List, Alerts, Reports)
  - Custom Dashboards (My Dashboards, + New Dashboard)
  - Admin (User Management, RBAC Settings, Audit Log)
- **Content area** — breadcrumb + page content

### Real-time

- WebSocket connection established on app load
- TanStack Query cache invalidated on relevant WebSocket messages
- Components re-render with fresh data automatically

## Backend Architecture

### Go Project Structure

```
cmd/
  server/              # API + WebSocket server entry point
  modbus-worker/       # Modbus collector entry point
internal/
  auth/                # Microsoft Entra ID OIDC, JWT issuance, session management
  rbac/                # Permission checking, site-scoped middleware
  audit/               # Audit log writing and querying
  site/                # Site/line/machine CRUD
  dashboard/           # Dashboard and widget CRUD, layout persistence
  datapoint/           # Sensor data queries and aggregations
  alert/               # Alert definitions, evaluation, event creation
  modbus/              # Modbus protocol client, register reading
  worker/              # Worker coordination, heartbeat, claiming
  jsonrender/          # OpenAI integration, catalog definition, spec generation
  middleware/          # Auth, RBAC, audit, CORS middleware chain
pkg/
  ws/                  # WebSocket hub — manages connections, broadcasts updates
```

### API Design

- REST (JSON over HTTP) for all CRUD
- WebSocket at `/ws` for real-time push
- JWT auth on all endpoints (except login/callback)
- Audit middleware on all mutating endpoints

## Sub-projects (Build Order)

1. **Foundation** — project scaffolding, database schema + migrations, auth (Entra ID + JWT), RBAC (custom roles, permissions, middleware), audit trail
2. **Data Ingestion** — Modbus worker binary, register reading, distributed coordination, PostgreSQL NOTIFY integration
3. **Traditional Dashboard** — fixed pages (site overview, machine detail, production metrics, alerts, reports, RBAC admin, audit log viewer), WebSocket real-time updates
4. **Custom Dashboards** — widget catalog, drag-and-drop builder (react-grid-layout), widget config UI, json-render integration (OpenAI spec generation, rendering), save/share/edit flow
