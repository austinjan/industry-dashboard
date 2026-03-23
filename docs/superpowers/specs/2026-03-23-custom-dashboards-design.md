# Custom Dashboard Builder — Design Spec

## Overview

Manual drag-and-drop dashboard builder. Users create custom dashboards by picking widgets from a catalog, placing them on a 12-column grid, and configuring each widget's data source via a guided side panel. Dashboards are shared with role-based view/edit access.

AI-generated dashboards via json-render are deferred to a future sub-project.

## System Components

```
┌─────────────────────────────────────────────────┐
│               Frontend (React)                   │
│  Dashboard List │ Full-Screen Editor │ View Mode  │
│  Widget Picker │ Config Sheet │ react-grid-layout │
└──────────────────┬──────────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────────┐
│               Go Backend                         │
│  Dashboard CRUD │ Widget CRUD │ Access Control    │
└──────────────────┬──────────────────────────────┘
                   │
          ┌────────▼────────┐
          │   TimescaleDB    │
          │  dashboards      │
          │  dashboard_widgets│
          │  dashboard_role_access │
          │  widget_types    │
          └─────────────────┘
```

## Data Model

### Existing Tables (from Foundation)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `dashboards` | id, title, owner_id, site_id, layout_type, is_shared, timestamps | Already created in migration 004 |
| `dashboard_widgets` | id, dashboard_id, widget_type, position_x, position_y, width, height, config (JSONB), timestamps | Already created in migration 004 |
| `widget_types` | id, name, description, default_config (JSONB), schema (JSONB) | Already created in migration 004, needs seeding |

### New Tables

**`dashboard_role_access`** — controls which roles can view or edit a dashboard:

```sql
CREATE TABLE dashboard_role_access (
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    access_level VARCHAR(10) NOT NULL DEFAULT 'view' CHECK (access_level IN ('view', 'edit')),
    PRIMARY KEY (dashboard_id, role_id)
);
```

### Seed Widget Types

9 pre-defined widget types seeded into `widget_types`:

| Name | Description | Default Size (cols x rows) |
|------|------------|---------------------------|
| status_card | Single metric value with trend indicator | 3 x 2 |
| gauge | Radial gauge for OEE, utilization | 3 x 3 |
| line_chart | Time-series trend (multi-metric) | 6 x 3 |
| bar_chart | Compare values across machines or lines | 6 x 3 |
| pie_chart | Proportional breakdown | 4 x 3 |
| data_table | Sortable/filterable tabular data | 6 x 4 |
| alert_list | Filtered alert feed | 4 x 3 |
| machine_status | Compact machine overview grid | 6 x 3 |
| text_markdown | Free text notes with markdown support | 4 x 2 |

### Widget Config JSONB Structure

Each widget type has a specific config shape stored in `dashboard_widgets.config`:

**status_card:**
```json
{
  "title": "Temperature",
  "machine_id": "uuid",
  "metric": "temperature",
  "unit": "°C",
  "thresholds": { "warning": 80, "critical": 95 }
}
```

**gauge:**
```json
{
  "title": "OEE",
  "machine_id": "uuid",
  "metric": "oee",
  "min": 0, "max": 100,
  "zones": [
    { "min": 0, "max": 50, "color": "#ef4444" },
    { "min": 50, "max": 80, "color": "#f59e0b" },
    { "min": 80, "max": 100, "color": "#22c55e" }
  ]
}
```

**line_chart:**
```json
{
  "title": "Temperature Trend",
  "machine_id": "uuid",
  "metrics": ["temperature", "speed"],
  "time_range": "24h",
  "aggregation": "avg"
}
```

**bar_chart:**
```json
{
  "title": "Output by Machine",
  "compare_by": "machines_in_line",
  "line_id": "uuid",
  "metric": "output",
  "aggregation": "sum",
  "time_range": "24h"
}
```

**pie_chart:**
```json
{
  "title": "Downtime Reasons",
  "data_source": "alert_severity",
  "scope": "site",
  "site_id": "uuid"
}
```

**data_table:**
```json
{
  "title": "Machine List",
  "data_source": "machines",
  "line_id": "uuid",
  "columns": ["name", "model", "status"],
  "sort_by": "name",
  "limit": 20
}
```

**alert_list:**
```json
{
  "title": "Recent Alerts",
  "scope": "site",
  "severity": ["critical", "warning"],
  "limit": 10
}
```

**machine_status:**
```json
{
  "title": "Assembly Line 1",
  "line_id": "uuid",
  "display_metrics": ["temperature", "speed"]
}
```

**text_markdown:**
```json
{
  "title": "Shift Notes",
  "content": "## Notes\nLine 4 maintenance tomorrow 06:00."
}
```

## Backend API

### Dashboard CRUD

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|-----------|
| GET | `/api/dashboards?site_id=` | List dashboards visible to current user | `dashboard:view` |
| POST | `/api/dashboards` | Create dashboard | `dashboard:create` |
| GET | `/api/dashboards/{id}` | Get dashboard with widgets | `dashboard:view` |
| PUT | `/api/dashboards/{id}` | Update dashboard title/settings | `dashboard:edit` |
| DELETE | `/api/dashboards/{id}` | Delete dashboard | `dashboard:delete` |

### Widget CRUD

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|-----------|
| PUT | `/api/dashboards/{id}/widgets` | Batch save all widgets (full layout) | `dashboard:edit` |

Batch save replaces all widgets for the dashboard in a single transaction. The frontend sends the complete layout on "Save".

### Access Control

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|-----------|
| GET | `/api/dashboards/{id}/access` | List role access for dashboard | `dashboard:edit` |
| PUT | `/api/dashboards/{id}/access` | Set role access (replace all) | `dashboard:share` |

### Widget Types

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|-----------|
| GET | `/api/widget-types` | List all widget types with schemas | any authenticated |

### Access Logic

Dashboard visibility rules:
1. **Creator** always has edit access
2. **Global admin** always has edit access
3. **Users with matching role** at the dashboard's site see it based on `dashboard_role_access.access_level`
4. List endpoint filters dashboards to only those the user can access

## Frontend Architecture

### Pages & Routing

| Route | Component | Mode |
|-------|-----------|------|
| `/dashboards` | DashboardListPage | Normal app shell |
| `/dashboards/new` | DashboardEditor | Full-screen (no app shell) |
| `/dashboards/:id` | DashboardView | Full content area |
| `/dashboards/:id/edit` | DashboardEditor | Full-screen (no app shell) |

### Full-Screen Editor

The editor exits the normal app shell (no sidebar, no top nav). It has:

1. **Floating toolbar** (centered, top) — dashboard title, "+ Add Widget" button, Share, Cancel, Save
2. **Widget picker popover** — 3x3 grid of widget types with icons and hint text. Opens below the "+ Add Widget" button.
3. **12-column grid** (react-grid-layout) — widgets are draggable and resizable. Empty areas show dashed drop zones.
4. **Config sheet** (shadcn Sheet, right side) — opens when clicking ⚙ on a widget or when adding a new widget. Contains the per-type config form with smart guidance hints.

### Widget Rendering

Each widget type maps to a React component that:
1. Reads its `config` JSONB
2. Calls the appropriate TanStack Query hook to fetch data
3. Renders using existing chart/UI components

| Widget Type | Data Hook | Render Component |
|------------|-----------|-----------------|
| status_card | `useDataPoints` or `useLatestValues` | Custom card |
| gauge | `useLatestValues` | Recharts RadialBarChart |
| line_chart | `useDataPoints` | `LineChart` (existing) |
| bar_chart | custom aggregation hook | `BarChart` (existing) |
| pie_chart | custom aggregation hook | `PieChart` (existing) |
| data_table | `useLineMachines` or `useAlertEvents` | shadcn Table |
| alert_list | `useAlertEvents` | Alert badges list |
| machine_status | `useLineMachines` + `useLatestValues` | Status grid |
| text_markdown | none (static) | Markdown renderer |

### Config Form Pattern

Each widget type has a config form component. All forms follow the same pattern:

1. **Hint box** (colored) — explains what the widget does and what data it needs
2. **Step-by-step fields** — later fields adapt based on earlier choices
3. **Dropdowns auto-populated** from the database (machines, lines, available metrics)
4. **Helper text** under each field in plain language
5. **Apply / Cancel** buttons at the bottom

### Key Libraries

| Library | Purpose |
|---------|---------|
| react-grid-layout | 12-column drag-and-drop grid |
| recharts | Chart rendering (line, bar, pie, gauge) |
| react-markdown | Markdown rendering for text widget |

## Access Control

### Share Dialog

The "Share" button in the editor toolbar opens a dialog where the creator assigns access:

- List of all roles in the system
- Per-role dropdown: "No access" / "View" / "Edit"
- Save updates `dashboard_role_access` table

### Visibility Rules

When listing dashboards (`GET /api/dashboards?site_id=`):

1. Include dashboards where `owner_id = current_user`
2. Include dashboards where current user's role at the site has an entry in `dashboard_role_access`
3. Include all dashboards if user is global admin
4. Return `access_level` for each dashboard so the frontend knows whether to show Edit or View only
