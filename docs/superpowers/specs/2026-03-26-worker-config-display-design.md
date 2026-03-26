# Worker Running Config Display — Structured Cards

## Problem

The worker running config is displayed as raw JSON in `WorkerDetail.tsx`. Users are non-engineers (factory managers, IT/OT operations) who need meaningful, visual information — not a JSON dump.

## Target Audience

- **Factory floor managers**: care about which machines are monitored and what data is collected
- **IT/OT operations**: also need connection details (host, port, slave ID) and register-level config

## Design

### Config Summary Bar

Replace the `{/* Running Config */}` section with a metadata row (matching the existing grid style) showing:

| Poll Interval | Site | Timezone |
|---|---|---|
| 5s | Factory Alpha | Asia/Taipei |

- Poll interval converted from nanoseconds to human-readable:
  - `5000000000` → "5s", `500000000` → "500ms", `7500000000` → "7.5s"
  - If `0`, `null`, or missing → display "—"
- Sits directly below the existing metadata grid (version, OS, PID, uptime)
- The existing `configData &&` guard is preserved — the entire structured config section only renders when configData is truthy

### Production Lines & Machine Cards

Each production line is a section with its name as a header. Lines are sorted by `display_order`. Machines shown as cards in a horizontal flex-wrap layout.

Each machine card shows:
- **Machine name** (bold) and **model** (muted text)
- **Register badges**: pill/tag per monitored register name
  - Registers with `fake` settings get a "Simulated" badge in amber (`bg-amber-500/20 text-amber-500`)
  - Registers without `fake` show as default slate badges
- **Expand arrow** (ChevronDown) for technical details, with `aria-expanded` attribute

Cards use `bg-slate-800` styling consistent with existing machine badges in WorkerDetail.

### Edge Cases

- **No lines or empty `lines` array**: show a muted placeholder "No production lines configured" (i18n key: `admin.noLinesConfigured`)
- **Line with empty `machines` array**: show the line header with a muted "No machines" text (i18n key: `admin.noMachines`)
- **Machine with empty `registers` array**: show machine name/model but display muted "No registers" text instead of badges (i18n key: `admin.noRegisters`)

### Per-Machine Technical Details (Expanded)

Clicking the expand arrow on a machine card reveals:

**Connection table:**

| Host | Port | Slave ID | Timeout |
|---|---|---|---|
| 192.168.1.12 | 502 | 1 | 3s |

**Registers table:**

| Name | Type | Address | Data Type | Byte Order | Scale |
|---|---|---|---|---|---|
| water | holding | 0 | uint32 | big | 1 |
| presure | holding | 0 | float32 | big | 1 |

- Compact tables with muted text styling (`text-xs`)
- Hidden by default; toggle via expand arrow click
- Local state: `useState` with `Set<string>` of expanded machine names
- Timeout displayed in human-readable format (same converter as poll interval)

### Fields Intentionally Omitted

`log_level`, `worker_name`, `site_code` are not displayed — they are either developer-only or redundant with the worker detail header above.

## Component Changes

All changes in `WorkerDetail.tsx` — no new component files. The `{/* Running Config */}` section is replaced with the structured card layout. The existing `showConfig` state variable is removed and replaced with `expandedMachines: Set<string>` state.

## Data Shape

The `config_json` from `/workers/{id}/config` returns:

```json
{
  "worker_name": "Alpha-site",
  "site_name": "Factory Alpha",
  "site_code": "ALPHA",
  "timezone": "Asia/Taipei",
  "poll_interval": 5000000000,
  "log_level": "info",
  "lines": [
    {
      "name": "Assembly Line 1",
      "display_order": 1,
      "machines": [
        {
          "name": "CNC-01",
          "model": "Haas VF-2",
          "connection": { "host": "192.168.1.12", "port": 502, "slave_id": 1, "timeout": 3000000000 },
          "registers": [
            {
              "name": "water",
              "type": "holding",
              "address": 0,
              "data_type": "uint32",
              "byte_order": "big",
              "scale": 1,
              "fake": { "min": 200, "max": 500, "pattern": "sine" }
            }
          ]
        }
      ]
    }
  ]
}
```

## i18n

New keys added to all 4 locale files (`en.json`, `zh-TW.json`, `th.json`, `vi.json`):

- `admin.pollIntervalLabel` — "Poll Interval"
- `admin.siteLabel` — "Site"
- `admin.timezoneLabel` — "Timezone"
- `admin.simulated` — "Simulated"
- `admin.connection` — "Connection"
- `admin.registers` — "Registers"
- `admin.host` / `admin.port` / `admin.slaveId` / `admin.timeout`
- `admin.registerName` / `admin.registerType` / `admin.registerAddress` / `admin.dataType` / `admin.byteOrder` / `admin.scale`
- `admin.noLinesConfigured` — "No production lines configured"
- `admin.noMachines` — "No machines"
- `admin.noRegisters` — "No registers"

## Dependencies

None. Uses existing Badge, Button components and Tailwind classes.
