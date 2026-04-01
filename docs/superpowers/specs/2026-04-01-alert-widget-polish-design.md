# Alert List Widget Polish

## Overview

Comprehensive visual and functional overhaul of the `AlertListWidget` dashboard component. The widget serves as a glanceable summary for factory floor operators to quickly assess whether there are active problems.

## Changes

### 1. Severity Row Styling — Full Background Tint

Each alert row gets a color-tinted background based on severity:

| Severity | Background | Badge | Text Color |
|----------|-----------|-------|------------|
| critical | `rgba(239,68,68,0.15)` | `bg-red-500 text-white` "CRIT" | `text-red-300` |
| warning | `rgba(245,158,11,0.12)` | `bg-amber-500 text-slate-900` "WARN" | `text-amber-300` |
| info | `rgba(59,130,246,0.1)` | `bg-blue-500 text-white` "INFO" | `text-blue-300` |

Badges use abbreviated labels (CRIT, WARN, INFO) — short, bold, uppercase.

### 2. Relative Timestamps

Each row displays a relative timestamp on the right side, computed from `triggered_at`:

- Format: `3 sec ago`, `5 min ago`, `2 hr ago`, `1 day ago`
- Abbreviated units: sec, min, hr, day
- Inline helper function — no external library

### 3. Sort Order — Most Recent First

Pass `sort_by=triggered_at&sort_order=desc` to the `useAlertEvents` hook so the most recent alert appears at the top.

### 4. Clickable Title

The widget title (default "Alerts") becomes a link to `/alerts` with a `↗` suffix. Uses `react-router-dom` `Link` component. Styled with subtle underline on hover.

### 5. Empty State

When no alerts exist, display muted centered text: "No active alerts". No icons, no green indicators — keep it minimal.

### 6. Auto-Refresh

Uses the existing global polling interval via `useRefreshIntervalValue()`. No per-widget refresh config needed — already wired in the `useAlertEvents` hook.

### 7. Widget Config

No changes to `AlertListConfig.tsx`. Existing config (title, limit, severity filters) is sufficient.

## Files to Modify

- `frontend/src/components/widgets/AlertListWidget.tsx` — all visual and functional changes

## Out of Scope

- Acknowledge from widget (operator goes to full alerts page for actions)
- Summary header / count badges
- Per-widget refresh interval config
- New components or abstractions
