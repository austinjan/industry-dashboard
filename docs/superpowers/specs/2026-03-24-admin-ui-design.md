# SP3: Admin UI — Sites & Machines CRUD + Worker Management

**Goal:** Add two admin pages to the React frontend: (1) Sites & Machines master-detail CRUD page, (2) Workers management page with status monitoring and command sending. All UI strings must support i18n via `react-i18next`.

**Architecture:** Frontend-only changes (React pages + components) plus backend CRUD endpoints for sites/lines/machines that don't exist yet. The worker API endpoints from SP2 are already implemented.

**Tech Stack:** React 18 + TypeScript, shadcn/ui + Tailwind CSS, TanStack Query, react-i18next, chi router (backend)

---

## 1. Scope

### In Scope
- **Sites & Machines page** — master-detail layout for full CRUD on sites, production lines, and machines
- **Workers page** — table with expandable rows for monitoring workers and sending stop/restart commands
- **Backend CRUD endpoints** — update/delete for sites, full CRUD for lines and machines
- **i18n** — all UI strings in 4 locale files (en, zh-TW, th, vi)
- **Sidebar navigation** — add two new items under Admin section

### Out of Scope
- Worker config builder UI (SP4)
- Worker binary download (SP4)
- Machine Modbus config editing (SP4)

---

## 2. Backend: Missing CRUD Endpoints

The existing `internal/site/` package has `CreateSite`, `ListSites`, `GetSite`, `ListLinesBySite`, `ListMachinesByLine`. The following endpoints need to be added:

### Sites

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| PUT | `/api/sites/:siteID` | Update site (name, timezone, address) | `site:manage` |
| DELETE | `/api/sites/:siteID` | Delete site (cascades to lines, machines) | `site:manage` |

### Production Lines

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| POST | `/api/sites/:siteID/lines` | Create line | `site:manage` |
| PUT | `/api/lines/:lineID` | Update line (name, display_order) | `site:manage` |
| DELETE | `/api/lines/:lineID` | Delete line (cascades to machines) | `site:manage` |

### Machines

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| POST | `/api/lines/:lineID/machines` | Create machine | `machine:edit` |
| PUT | `/api/machines/:machineID` | Update machine (name, model, status) | `machine:edit` |
| DELETE | `/api/machines/:machineID` | Delete machine | `machine:edit` |

### Site Detail (enhanced)

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/api/sites/:siteID/detail` | Full site with lines, machines, and worker info per machine | `site:manage` |

All endpoints validate `:siteID`, `:lineID`, `:machineID` as valid UUIDs — return 400 if not parseable, 404 if not found.

**Delete cascade:** `ON DELETE CASCADE` foreign keys are confirmed in the schema: `production_lines → sites`, `machines → production_lines`. No manual child deletion needed.

The detail endpoint returns a nested structure for the master-detail right panel. Implementation uses separate Go queries (consistent with existing store pattern): `GetSite` + `ListLinesBySite` + `ListMachinesByLine` per line + worker name lookup per machine.

```json
{
  "site": { "id": "...", "name": "Factory Alpha", "code": "ALPHA", "timezone": "Asia/Taipei" },
  "lines": [
    {
      "id": "...", "name": "Assembly Line 1", "display_order": 1,
      "machines": [
        {
          "id": "...", "name": "CNC-01", "model": "Haas VF-2", "status": "running",
          "worker_name": "line-1-worker",
          "worker_id": "uuid-of-worker"
        }
      ]
    }
  ]
}
```

The `worker_name` and `worker_id` are resolved via `machine_workers` → `workers` join. Null if no worker claims the machine.

### RBAC for Site List in Admin Context

The existing `GET /api/sites` route uses `rbac.SiteFromQuery` which requires a `site_id` query parameter. For the admin Sites & Machines page, we need to list all sites without scoping. Add a new route:

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/api/admin/sites` | List all sites (global admin context) | `site:manage` |

This uses a global scope (empty `siteID`), same pattern as the workers API. The existing `GET /api/sites` remains unchanged for site-scoped views.

### Route Registration Notes

`POST /api/sites/:siteID/lines` extends the existing `r.Route("/{siteID}", ...)` block in `cmd/server/main.go` — add the POST method alongside the existing GET for `/lines`. Do not create a new route block.

---

## 3. Frontend: Sites & Machines Page

### Route
`/admin/sites` — added to App.tsx inside the AppShell admin routes.

### Layout: Master-Detail

**Left panel (280px fixed width):**
- Header: "Sites" title + "+ Add Site" button
- List of all sites (fetched from `GET /api/sites`)
- Each site card shows: name, code, timezone, line count, machine count
- Click to select → loads detail in right panel
- Selected site highlighted with blue left border
- Auto-selects first site on load

**Right panel (flex-1):**
- Site header: name, code, timezone + "Edit Site" and "Delete" buttons
- Lines as collapsible cards (expanded by default):
  - Line header: name, display_order + "Edit", "Delete", "+ Machine" buttons
  - Machine table inside each line card:
    - Columns: status indicator, Name, Model, Status (text), Worker, Actions (edit/delete)
    - Worker column shows worker_name or "—" if unclaimed
- "+ Add Production Line" button at bottom (dashed border)

### CRUD Dialogs (shadcn Dialog component)

**Add/Edit Site dialog:**
- Fields: Name (required), Code (required, uppercase), Timezone (required, dropdown), Address (optional)
- Edit pre-fills current values
- Code is read-only on edit (UNIQUE constraint)

**Add/Edit Line dialog:**
- Fields: Name (required), Display Order (number, required)

**Add/Edit Machine dialog:**
- Fields: Name (required), Model (optional)
- Status is not editable via dialog (managed by workers)

**Delete confirmation dialog:**
- "Are you sure you want to delete [name]? This action cannot be undone."
- For sites: warns that all lines and machines will be deleted
- For lines: warns that all machines will be deleted
- Red "Delete" button + "Cancel" button

### Data Fetching

- Site list: `useAdminSites()` → `GET /api/admin/sites` (new hook for global admin context, distinct from the existing site-scoped hooks)
- Site detail: `useSiteDetail(siteId)` → `GET /api/sites/:siteID/detail` — returns lines + machines + worker info in one call
- Mutations: `useCreateSite`, `useUpdateSite`, `useDeleteSite`, `useCreateLine`, `useUpdateLine`, `useDeleteLine`, `useCreateMachine`, `useUpdateMachine`, `useDeleteMachine` — all invalidate relevant queries on success

---

## 4. Frontend: Workers Page

### Route
`/admin/workers` — added to App.tsx inside the AppShell admin routes.

### Layout: Expandable Table

**Table columns:**
| Column | Content |
|--------|---------|
| Name | Worker name (clickable to expand/collapse) |
| Status | Badge: online (green), offline (gray) |
| Host / IP | hostname / ip_address |
| Machines | Machine count |
| Last Heartbeat | Relative time (e.g., "5s ago") |
| Actions | Restart button (yellow), Stop button (red). Disabled for offline workers. |

**Expanded row (shown below the worker row when clicked):**
- Grid of metadata: Version, OS, PID, Uptime (calculated from `started_at`)
- Machines: horizontal list of chips with status indicators (🟢/🔴/⚫ + machine name)
- Recent Commands: last 3 commands with command name, status badge, relative time

**Auto-refresh:** `refetchInterval: 30000` (30s) on both the workers list query and the worker detail query (when expanded) to keep status/heartbeat/commands current.

**Command confirmation:** Clicking Restart or Stop opens a confirmation dialog:
- "Are you sure you want to [restart/stop] worker '[name]'?"
- Confirm button matches the action color (yellow for restart, red for stop)

### Data Fetching

- Workers list: `useWorkers()` → `GET /api/workers` (already implemented in SP2)
- Worker detail (on expand): `useWorkerDetail(workerId)` → `GET /api/workers/:id` (already implemented)
- Send command: `useSendWorkerCommand()` → `POST /api/workers/:id/commands` (already implemented)
- All hooks invalidate `workers` query on command success

---

## 5. Sidebar Navigation

Add two new items under the existing "Admin" section in `Sidebar.tsx`:

```
Admin
  User Management     /admin/users
  RBAC Settings        /admin/roles
  Audit Log            /admin/audit
  Sites & Machines     /admin/sites      ← NEW
  Workers              /admin/workers    ← NEW
```

Icons: `Building2` for Sites & Machines, `Cpu` for Workers (from lucide-react). The existing `NavGroup` component renders plain text links. Extend the `NavGroup` item type to include an optional `icon` field (`React.ElementType`), and render the icon inline before the label when present. All existing admin items continue to work without icons (field is optional).

---

## 6. i18n

Add new keys to all 4 locale files under `admin` section:

```json
{
  "admin": {
    "sitesAndMachines": "Sites & Machines",
    "workers": "Workers",
    "sites": "Sites",
    "addSite": "Add Site",
    "editSite": "Edit Site",
    "deleteSite": "Delete Site",
    "siteName": "Site name",
    "siteCode": "Site code",
    "timezone": "Timezone",
    "address": "Address",
    "lines": "Lines",
    "machines": "Machines",
    "addLine": "Add Production Line",
    "editLine": "Edit Line",
    "deleteLine": "Delete Line",
    "lineName": "Line name",
    "displayOrder": "Display order",
    "addMachine": "Add Machine",
    "editMachine": "Edit Machine",
    "deleteMachine": "Delete Machine",
    "machineName": "Machine name",
    "machineModel": "Model",
    "worker": "Worker",
    "noWorker": "—",
    "deleteConfirm": "Are you sure you want to delete {{name}}?",
    "deleteWarning": "This action cannot be undone.",
    "deleteSiteWarning": "All production lines and machines in this site will also be deleted.",
    "deleteLineWarning": "All machines in this line will also be deleted.",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "online": "Online",
    "offline": "Offline",
    "hostname": "Hostname",
    "ipAddress": "IP Address",
    "version": "Version",
    "os": "OS",
    "pid": "PID",
    "uptime": "Uptime",
    "lastHeartbeat": "Last Heartbeat",
    "machineCount": "Machines",
    "actions": "Actions",
    "restart": "Restart",
    "stop": "Stop",
    "restartConfirm": "Are you sure you want to restart worker '{{name}}'?",
    "stopConfirm": "Are you sure you want to stop worker '{{name}}'?",
    "recentCommands": "Recent Commands",
    "completed": "Completed",
    "failed": "Failed",
    "pending": "Pending",
    "inProgress": "In Progress",
    "autoRefresh": "Auto-refreshes every 30s",
    "noSites": "No sites configured.",
    "noLines": "No production lines.",
    "noMachines": "No machines.",
    "noWorkers": "No workers registered.",
    "selectSite": "Select a site to view details."
  }
}
```

All other locales (zh-TW, th, vi) get the same keys with translated values.

---

## 7. File Structure

### New Frontend Files

| File | Description |
|------|-------------|
| `frontend/src/pages/admin/SitesPage.tsx` | Sites & Machines master-detail page |
| `frontend/src/pages/admin/WorkersPage.tsx` | Workers management page |
| `frontend/src/components/admin/SiteList.tsx` | Left panel site list |
| `frontend/src/components/admin/SiteDetail.tsx` | Right panel with lines + machines |
| `frontend/src/components/admin/SiteDialog.tsx` | Add/Edit site dialog |
| `frontend/src/components/admin/LineDialog.tsx` | Add/Edit line dialog |
| `frontend/src/components/admin/MachineDialog.tsx` | Add/Edit machine dialog |
| `frontend/src/components/admin/DeleteDialog.tsx` | Shared delete confirmation dialog |
| `frontend/src/components/admin/WorkerTable.tsx` | Worker table with expandable rows |
| `frontend/src/components/admin/WorkerDetail.tsx` | Expanded worker detail section |
| `frontend/src/components/admin/CommandConfirmDialog.tsx` | Stop/Restart confirmation dialog |

### Modified Frontend Files

| File | Changes |
|------|---------|
| `frontend/src/App.tsx` | Add routes for `/admin/sites` and `/admin/workers` |
| `frontend/src/components/layout/Sidebar.tsx` | Add two nav items under Admin |
| `frontend/src/lib/hooks.ts` | Add `useAdminSites`, `useSiteDetail`, CRUD mutation hooks (`useCreateSite`, `useUpdateSite`, `useDeleteSite`, `useCreateLine`, `useUpdateLine`, `useDeleteLine`, `useCreateMachine`, `useUpdateMachine`, `useDeleteMachine`), `useWorkers`, `useWorkerDetail`, `useSendWorkerCommand` |
| `frontend/src/locales/en.json` | Add admin.* i18n keys |
| `frontend/src/locales/zh-TW.json` | Add admin.* i18n keys (Chinese) |
| `frontend/src/locales/th.json` | Add admin.* i18n keys (Thai) |
| `frontend/src/locales/vi.json` | Add admin.* i18n keys (Vietnamese) |

### New Backend Files

| File | Description |
|------|-------------|
| `internal/site/handler.go` | Add UpdateSite, DeleteSite, CreateLine, UpdateLine, DeleteLine, CreateMachine, UpdateMachine, DeleteMachine, GetSiteDetail handlers |
| `internal/site/store.go` | Add corresponding store methods |

### Modified Backend Files

| File | Changes |
|------|---------|
| `cmd/server/main.go` | Register new CRUD routes |

---

## 8. Testing

### Backend
- Unit tests for new store methods (UpdateSite, DeleteSite, CreateLine, etc.)
- Handler tests for request validation (missing required fields, invalid UUIDs)

### Frontend
- Manual test: navigate to Sites & Machines, create a site, add lines, add machines
- Manual test: edit and delete at each level
- Manual test: navigate to Workers, verify auto-refresh, expand a worker, send restart command
- Manual test: switch language, verify all strings translate

### Integration
- Create site via UI → verify appears in `GET /api/sites`
- Delete site → verify cascades (lines and machines deleted)
- Send worker command → verify command appears in worker's command history
