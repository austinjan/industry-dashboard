# i18n Support Design

## Overview

Add internationalization (i18n) to the Industry Dashboard frontend using `react-i18next`. Users select their preferred language from a dropdown in the user profile menu. The preference is saved to the database and restored on login.

## Supported Languages

| Code  | Language           |
|-------|--------------------|
| en    | English (default)  |
| zh-TW | Traditional Chinese |
| th    | Thai               |
| vi    | Vietnamese         |

## Decisions

- **Frontend-only translation** — backend keeps English error messages; frontend maps known errors if needed
- **react-i18next** — industry standard, minimal overhead (~13KB gzipped), room to grow
- **Single JSON file per language** — ~70 strings total, namespace splitting unnecessary
- **Language switcher in user profile dropdown** — clean TopNav, "set once, forget" pattern
- **Default English** — no browser detection; always starts EN, then applies saved preference
- **Labels only** — no date/number/currency formatting localization
- **No RTL support** — all target languages are LTR

## Frontend Changes

### 1. Dependencies

Add to `frontend/package.json`:
- `i18next`
- `react-i18next`

### 2. Translation Files

```
frontend/src/locales/
  en.json
  zh-TW.json
  th.json
  vi.json
```

Keys organized by page/feature with nested structure:

```json
{
  "common": {
    "loading": "Loading...",
    "logout": "Logout",
    "selectSite": "Select site"
  },
  "nav": {
    "siteOverview": "Site Overview",
    "machineList": "Machine List",
    "alertsAlarms": "Alerts & Alarms",
    "reports": "Reports",
    "myDashboards": "My Dashboards",
    "userManagement": "User Management",
    "rbacSettings": "RBAC Settings",
    "auditLog": "Audit Log",
    "main": "Main",
    "custom": "Custom",
    "admin": "Admin"
  },
  "dashboard": {
    "machinesOnline": "Machines Online",
    "productionLines": "Production Lines",
    "activeAlerts": "Active Alerts",
    "site": "Site",
    "overview": "{{siteName}} — Overview",
    "noProductionLines": "No production lines configured.",
    "recentAlerts": "Recent Alerts",
    "noRecentAlerts": "No recent alerts."
  },
  "machines": {
    "heading": "Machines — {{siteName}}",
    "machine": "Machine",
    "model": "Model",
    "status": "Status",
    "details": "Details",
    "noMachines": "No machines.",
    "selectSite": "Select a site.",
    "noProductionLines": "No production lines."
  },
  "machineDetail": {
    "heading": "Machine Detail",
    "metrics": "Metrics",
    "selectMetric": "Select metric",
    "noDataPoints": "No data points yet.",
    "noDataRange": "No data for this time range.",
    "selectMetricPrompt": "Select a metric to view chart.",
    "1h": "1 Hour",
    "6h": "6 Hours",
    "24h": "24 Hours",
    "7d": "7 Days",
    "30d": "30 Days"
  },
  "alerts": {
    "heading": "Alerts — {{siteName}}",
    "allSeverities": "All severities",
    "all": "All",
    "critical": "Critical",
    "warning": "Warning",
    "info": "Info",
    "severity": "Severity",
    "alert": "Alert",
    "machine": "Machine",
    "triggered": "Triggered",
    "status": "Status",
    "acknowledge": "Acknowledge",
    "resolved": "Resolved",
    "acknowledged": "Acknowledged",
    "open": "Open",
    "noAlerts": "No alerts.",
    "selectSite": "Select a site."
  },
  "admin": {
    "userManagement": "User Management",
    "name": "Name",
    "email": "Email",
    "status": "Status",
    "roles": "Roles",
    "active": "Active",
    "inactive": "Inactive",
    "noRoles": "No roles",
    "assignRole": "Assign Role",
    "assignRoleTo": "Assign Role to {{name}}",
    "selectRole": "Select role",
    "globalScope": "Global (all sites)",
    "assign": "Assign",
    "global": "(global)",
    "roleManagement": "Role Management",
    "createRole": "Create Role",
    "createNewRole": "Create New Role",
    "roleName": "Role name",
    "description": "Description",
    "showPermissions": "Show Permissions",
    "hidePermissions": "Hide Permissions",
    "create": "Create",
    "system": "System",
    "auditLog": "Audit Log",
    "allActions": "All actions",
    "allResources": "All resources",
    "timestamp": "Timestamp",
    "user": "User",
    "action": "Action",
    "resource": "Resource",
    "ip": "IP",
    "previous": "Previous",
    "next": "Next",
    "page": "Page {{page}}",
    "noAuditLogs": "No audit logs."
  },
  "topnav": {
    "title": "Industry Dashboard",
    "language": "Language"
  },
  "login": {
    "title": "Industry Dashboard",
    "signInMicrosoft": "Sign in with Microsoft",
    "devLogin": "Dev Login (local only)"
  }
}
```

### 3. i18n Initialization

`frontend/src/lib/i18n.ts`:
- Import all 4 locale JSON files statically
- Initialize i18next with `react-i18next` `initReactI18next` plugin
- Default language: `en`, fallback: `en`
- No language detection plugin — language set programmatically

### 4. Component Updates

All pages and layout components updated to use `useTranslation()` hook:

- `LoginPage.tsx` — login title, buttons
- `DashboardPage.tsx` — card labels, section titles, empty states
- `MachineListPage.tsx` — table headers, empty states
- `MachineDetailPage.tsx` — time ranges, empty states, section titles
- `AlertsPage.tsx` — filter options, table headers, badges, actions
- `UsersPage.tsx` — table headers, badges, dialog, buttons
- `RolesPage.tsx` — heading, dialog, badges, buttons
- `AuditLogPage.tsx` — filters, table headers, pagination
- `Sidebar.tsx` — all navigation labels
- `TopNav.tsx` — title, site selector placeholder, logout

### 5. Language Switcher

Added to user profile dropdown in `TopNav.tsx`:
- Dropdown submenu or select showing: English, Traditional Chinese, Thai, Vietnamese
- Selecting a language:
  1. Calls `i18n.changeLanguage(locale)` — instant UI update
  2. Calls `PATCH /api/me/preferences` with `{ "locale": "zh-TW" }` — persists to DB

### 6. Auth Flow Integration

In `AuthProvider` or equivalent auth initialization:
1. User profile response includes `locale` field
2. After auth resolves, if `locale` is set → `i18n.changeLanguage(locale)`
3. If `locale` is null → remains on default English

## Backend Changes

### 1. Database Migration

```sql
ALTER TABLE users ADD COLUMN locale VARCHAR(10);
```

Nullable, null means default English.

### 2. API Endpoints

**`PATCH /api/me/preferences`**
- Request: `{ "locale": "zh-TW" }`
- Validates locale is one of: `en`, `zh-TW`, `th`, `vi`
- Returns 400 for unknown locales
- Updates `users.locale` column

**Existing user/session endpoint**
- Include `locale` field in response JSON

## What's NOT in Scope

- Date/time/number formatting
- RTL (right-to-left) layout support
- Backend error message translation
- Lazy loading of locale files
- Namespace splitting of translation files
- Pluralization rules (can be added later if needed)
- `index.html` `lang` attribute dynamic update (nice-to-have for future)
