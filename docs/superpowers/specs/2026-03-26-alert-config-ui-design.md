# Alert Config UI Design

## Overview

Add a full CRUD management interface for alert rules, with adaptive form support for both analog (numeric threshold) and coil (bit/boolean) register types. Includes bulk operations on the rules table and a batch acknowledge button for info-level events on the existing alerts page.

## Scope

### In scope
- Alert Rules management page (`/alerts/rules`) with full CRUD
- Adaptive create/edit dialog (analog vs coil metrics)
- Multi-select with bulk actions (enable, disable, delete)
- Metrics dropdown populated from machine's known registers
- "Acknowledge All Info" button on existing Alert Events page
- Backend endpoints: Update, Delete, Bulk operations, Ack-all-info, List machine metrics
- i18n support for all 4 languages (en, zh-TW, th, vi)

### Out of scope
- Duration-based alerts ("for at least N seconds")
- Range alerts (between X and Y)
- Alert notification channels (email, SMS, webhook)
- Alert rule templates or presets

## Data Model

### Existing `alerts` table (no schema changes needed)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| name | VARCHAR(255) | Rule name |
| machine_id | UUID | FK to machines |
| metric_name | VARCHAR(100) | Metric to monitor |
| condition | VARCHAR(20) | `>`, `<`, `>=`, `<=`, `==` |
| threshold | DOUBLE PRECISION | Numeric value (for coils: 1 or 0) |
| severity | VARCHAR(20) | `info`, `warning`, `critical` |
| is_active | BOOLEAN | Toggle on/off |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Go struct update
The existing `Alert` struct in `internal/alert/store.go` is missing the `UpdatedAt` field. Add `UpdatedAt time.Time json:"updated_at"` and update all existing queries (`ListAlerts`, `CreateAlert`) to scan/return it. The `UpdateAlert` method must set `updated_at = NOW()`.

### Coil alert representation
Coil/bit alerts reuse the same schema: condition is always `==`, threshold is `1` (ON) or `0` (OFF). The UI determines the register type from the metrics endpoint and renders the appropriate form controls.

## API Design

### New endpoints

| Method | Route | Permission | Description |
|--------|-------|-----------|-------------|
| PUT | `/api/alerts/{id}` | `alert:manage` | Update an alert rule |
| DELETE | `/api/alerts/{id}` | `alert:manage` | Delete an alert rule |
| POST | `/api/alerts/bulk-action` | `alert:manage` | Bulk update/delete rules |
| POST | `/api/alert-events/acknowledge-info` | `alert:acknowledge` | Ack all unresolved info events for a site |
| GET | `/api/machines/{id}/register-metrics` | `alert:view` | List available metrics with register type |

### PUT `/api/alerts/{id}`
Request body:
```json
{
  "name": "High Temperature",
  "metric_name": "temperature",
  "condition": ">",
  "threshold": 80,
  "severity": "critical",
  "is_active": true
}
```
- `machine_id` is not updatable (delete and recreate to change machine)
- Returns updated alert object

### DELETE `/api/alerts/{id}`
- Hard deletes the alert rule
- Alert events are preserved (historical records)
- Returns 204 No Content

### POST `/api/alerts/bulk-action`
Request body:
```json
{
  "ids": ["uuid1", "uuid2"],
  "action": "enable" | "disable" | "delete"
}
```
- `enable`: sets `is_active = true` for all specified IDs
- `disable`: sets `is_active = false` for all specified IDs
- `delete`: hard deletes all specified rules
- Uses POST (not PUT) since this is an RPC-style command, not an idempotent resource update
- Route must be registered before `/{id}` routes in chi to avoid parameter capture
- Returns 200 with count of affected rows

### POST `/api/alert-events/acknowledge-info`
Request body:
```json
{
  "site_id": "uuid"
}
```
- Acknowledges all unresolved info-severity events for the site
- Sets `acknowledged_by` to the requesting user
- "Unresolved" means: `resolved_at IS NULL AND acknowledged_by IS NULL`
- Requires JOIN chain: `alert_events` → `alerts` (WHERE `severity = 'info'`) → `machines` → `production_lines` (WHERE `site_id = ?`)
- Returns 200 with count of acknowledged events

### GET `/api/machines/{id}/register-metrics`

A new endpoint (separate from the existing `GET /api/machines/{id}/metrics` which returns `[]string`). This richer endpoint provides register type info needed by the alert form.

Response:
```json
[
  { "name": "temperature", "type": "analog", "register_type": "holding" },
  { "name": "pressure", "type": "analog", "register_type": "input" },
  { "name": "e_stop", "type": "coil", "register_type": "coil" },
  { "name": "motor_status", "type": "coil", "register_type": "discrete_input" }
]
```

**Data source:** `machines.modbus_config->'registers'` JSONB field (via existing `site.Store.GetMachineRegisters` or similar).

**Type mapping:**
- `register_type` = `"holding"` or `"input"` → `type` = `"analog"`
- `register_type` = `"coil"` or `"discrete_input"` → `type` = `"coil"`

**Fallback:** If machine has no `modbus_config`, fall back to distinct metric names from `data_points` table with `type` defaulting to `"analog"`.

- Used by the create/edit dialog to populate the metric dropdown

## Frontend Design

### Page: Alert Rules (`/alerts/rules`)

**Layout:**
- Header with title + "Create Alert Rule" button (requires `alert:create`)
- Filter row: Machine dropdown, Severity dropdown, Active status dropdown (all client-side filtering — dataset is small per site)
- Table with columns: checkbox, Name, Machine, Condition, Severity, Active, Actions
- Condition column renders differently per type:
  - Analog: `temperature > 80`
  - Coil: `e_stop = ON` / `motor_status = OFF`

**Multi-select:**
- Checkbox column with select-all header checkbox
- When items selected: blue action bar appears above table with Enable/Disable/Delete buttons
- Bulk actions call `POST /api/alerts/bulk-action`
- Delete requires confirmation dialog

**Row actions** (requires `alert:manage`):
- Edit button → opens edit dialog
- Delete button → confirmation dialog → `DELETE /api/alerts/{id}`

**Active toggle:**
- Inline toggle/indicator per row
- Can also be toggled via bulk actions

### Dialog: Create / Edit Alert Rule

**Fields:**
1. **Rule Name** — text input
2. **Machine** — dropdown, loads machines for current site
3. **Metric** — dropdown, loads after machine selected via `GET /api/machines/{id}/register-metrics`, shows register name + type label
4. **Condition + Threshold** (adaptive):
   - Analog metric: condition dropdown (`>`, `<`, `>=`, `<=`, `==`) + numeric threshold input, side by side
   - Coil metric: ON/OFF toggle buttons (maps to `== 1` / `== 0`)
5. **Severity** — button group: info, warning, critical
6. **Preview bar** — plain-language summary of the rule, i18n-aware

**Edit mode:** Same dialog, pre-populated with existing values, button label changes to "Save Changes".

**Preview i18n:**
```json
// en.json
"alertRules.preview": "Alert when {{metric}} on {{machine}} is {{condition}} → {{severity}}"

// zh-TW.json
"alertRules.preview": "當 {{machine}} 的 {{metric}} {{condition}} 時觸發 → {{severity}}"
```
Condition values and severity labels are also translated.

### Modification to Alert Events Page (`/alerts`)

- Add "Acknowledge All Info" button in the top-right header area
- Visible when there are unresolved info events and user has `alert:acknowledge` permission
- Calls `POST /api/alert-events/acknowledge-info`
- Shows confirmation with count of events to be acknowledged
- Button is disabled/hidden when no unresolved info events exist

### Navigation

Add tab navigation in the alerts section:
- **Alert Events** (`/alerts`) — existing page
- **Alert Rules** (`/alerts/rules`) — new page

### New React Hooks

```typescript
// List alert rules — reuse existing useAlerts(siteId) hook, already calls GET /alerts
// No new query hook needed for listing

// CRUD mutations (all new)
useCreateAlert()
useUpdateAlert()
useDeleteAlert()
useBulkAlertAction()

// Machine metrics for dropdown (new — calls GET /machines/{id}/register-metrics)
useMachineMetrics(machineId: string)

// Batch ack info events (new)
useAcknowledgeAllInfo()
```

## Backend Implementation

### New store methods
- `UpdateAlert(ctx, id, params)` — update mutable fields
- `DeleteAlert(ctx, id)` — hard delete rule, preserve events
- `BulkUpdateAlerts(ctx, ids, isActive)` — bulk toggle
- `BulkDeleteAlerts(ctx, ids)` — bulk delete
- `AcknowledgeInfoEvents(ctx, siteID, userID)` — ack all unresolved info events
- `ListMachineMetrics(ctx, machineID)` — return metric names with register types

### New handler methods
- `UpdateAlert(w, r)` — PUT handler
- `DeleteAlert(w, r)` — DELETE handler
- `BulkAlertAction(w, r)` — bulk operations handler
- `AcknowledgeInfoEvents(w, r)` — batch ack handler
- `ListMachineMetrics(w, r)` — metrics list handler (may live in machine or alert handler)

### RBAC
All new endpoints use existing permissions:
- `alert:manage` for Update, Delete, Bulk operations
- `alert:acknowledge` for Ack All Info
- `alert:view` for List Machine Metrics

No new permissions needed.

**Site scoping for single-resource endpoints:** `PUT /api/alerts/{id}` and `DELETE /api/alerts/{id}` require `?site_id=...` as a query parameter (consistent with existing pattern). The frontend passes the current site ID on all requests. The RBAC middleware uses `rbac.SiteFromQuery` as with existing alert endpoints.

## i18n

New translation keys required across all 4 locale files:

- `alertRules.title` — "Alert Rules"
- `alertRules.createButton` — "Create Alert Rule"
- `alertRules.editTitle` — "Edit Alert Rule"
- `alertRules.createTitle` — "Create Alert Rule"
- `alertRules.name` — "Rule Name"
- `alertRules.machine` — "Machine"
- `alertRules.metric` — "Metric"
- `alertRules.condition` — "Condition"
- `alertRules.threshold` — "Threshold"
- `alertRules.severity` — "Severity"
- `alertRules.active` — "Active"
- `alertRules.preview` — "Alert when {{metric}} on {{machine}} is {{condition}} → {{severity}}"
- `alertRules.alertWhenOn` — "= ON"
- `alertRules.alertWhenOff` — "= OFF"
- `alertRules.coilHint` — "No threshold needed — coils are binary (ON/OFF)"
- `alertRules.registerType` — "Register type: {{type}}"
- `alertRules.bulkSelected` — "{{count}} rules selected"
- `alertRules.bulkEnable` — "Enable"
- `alertRules.bulkDisable` — "Disable"
- `alertRules.bulkDelete` — "Delete"
- `alertRules.confirmDelete` — "Are you sure you want to delete {{count}} alert rule(s)?"
- `alertRules.filters.*` — filter labels
- `alertEvents.ackAllInfo` — "Acknowledge All Info"
- `alertEvents.ackAllInfoConfirm` — "Acknowledge {{count}} info events?"
- Severity labels: reuse existing `alerts.severity.*` keys
- Condition labels: `alertRules.conditions.gt`, `.lt`, `.gte`, `.lte`, `.eq`

## Error Handling

- **Create/Update validation:** name required, metric must exist for machine, threshold required for analog, condition must be valid
- **Bulk operations:** return partial success count if some IDs not found
- **Metrics endpoint:** return empty array if machine has no known metrics (no error)
- **Ack All Info:** return 0 count if no unresolved info events (no error)
