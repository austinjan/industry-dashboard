# Shared Widget Config Components + Legend + Chart Enhancements

## Overview

Refactor widget configuration panels into reusable, grouped components with consistent UX. Add shared legend rendering, runtime time range switching, and widget style presets. This lays the foundation for implementing BarChart and PieChart widgets.

## Shared Config Groups

All config groups are reusable components in `CommonFields.tsx`. Each widget config panel composes them as needed. Every widget instance stores its own values.

### 1. Header Group

**Used by:** All widgets

| Field | Type | Default |
|-------|------|---------|
| Title | text input | widget type name |
| Title color | color picker | inherit (foreground) |
| Show countdown | checkbox | true |

### 2. Style Group

**Used by:** All widgets

| Field | Type | Default |
|-------|------|---------|
| Preset | radio: Default / Minimal / Accent | Default |
| Accent color | color picker (only when Accent selected) | `#3b82f6` (blue-500) |

**Preset definitions:**
- **Default** — `rounded-lg border bg-white p-3 shadow-sm` (current look)
- **Minimal** — `rounded-lg p-3` (no border, no shadow, transparent blend)
- **Accent** — `rounded-lg border-l-4 bg-white p-3 shadow-sm` + accent color on left border

These styles are applied by `WidgetRenderer` via config values `widget_style` and `accent_color`.

### 3. Data Source (Machine) Group

**Used by:** StatusCard, Gauge, LineChart, BarChart, PieChart

| Field | Type | Notes |
|-------|------|-------|
| Production Line | dropdown | Filters machine list |
| Machine | dropdown | Depends on selected line |
| Metric(s) | dropdown or checkboxes | `multi` prop controls single/multi select |

Replaces the current separate `MachinePicker` + `MetricPicker`. Combines into one `DataSourceMachine` component.

Props: `{ machineId, onMachineChange, metrics: string[], onMetricsChange, multi?: boolean }`

### 4. Data Source (Line) Group

**Used by:** MachineStatus, DataTable

| Field | Type |
|-------|------|
| Production Line | dropdown |

Wrapper around existing `LinePicker` with `ConfigSection` label.

### 5. Time Range Group

**Used by:** LineChart, BarChart

| Field | Type | Default |
|-------|------|---------|
| Default time range | button group: 1h / 6h / 24h / 7d / 30d | 24h |

This sets the **default** value. At runtime, users can temporarily switch time range via buttons rendered inside the widget content area. Temporary switches reset on page reload.

### 6. Metric Style Group

**Used by:** LineChart, BarChart, PieChart

| Field | Type |
|-------|------|
| Per-metric color | 10 presets + custom color picker |
| Per-metric line style | Solid / Dashed / Dotted (LineChart only) |

Existing implementation in `LineChartConfig.tsx` to be extracted as a shared component.

Props: `{ metrics: string[], styles: Record<string, MetricStyle>, onChange }}`

### 7. Legend Group

**Used by:** LineChart, BarChart, PieChart

| Field | Type | Default |
|-------|------|---------|
| Show legend | checkbox | true |
| Position | radio: Top / Bottom | Bottom |

Config keys: `show_legend` (boolean), `legend_position` ("top" | "bottom")

### 8. Limits Group

**Used by:** AlertList, DataTable

| Field | Type | Default |
|-------|------|---------|
| Max items | number input | 10 |

Existing `LimitField` wrapped with `ConfigSection`.

## ConfigSection Component

Visual separator for grouping fields in config panels.

```tsx
<ConfigSection label="Header" />
```

Renders as: thin horizontal line with uppercase small label text.

## ChartLegend Component

**File:** `frontend/src/components/widgets/ChartLegend.tsx`

Shared legend rendering component, replacing Recharts `<Legend>`.

Props:
```typescript
interface ChartLegendProps {
  items: { label: string; color: string }[];
  show: boolean;
  position: 'top' | 'bottom';
}
```

Renders horizontal list of color dot + label. Positioned above or below chart content based on `position`.

## Runtime Time Range Switcher

**File:** `frontend/src/components/widgets/TimeRangeBar.tsx`

Small button bar rendered inside chart widgets for runtime time range switching.

Props:
```typescript
interface TimeRangeBarProps {
  value: string;
  onChange: (range: string) => void;
}
```

- Rendered inside widget content area (not in header)
- Uses local component state (not persisted to config)
- Initialized from config's `time_range` default
- Options: 1h, 6h, 24h, 7d, 30d

## WidgetRenderer Changes

WidgetRenderer reads config to apply:
- **Header:** title text, title color, countdown
- **Style:** card class based on `widget_style` preset + `accent_color`

Current card styling in `DashboardViewPage` (`rounded-lg border bg-white p-3 shadow-sm`) moves into `WidgetRenderer` so it can vary per widget.

## Config Panel Structure Per Widget

**LineChart:**
```
── Header ──
── Style ──
── Data Source ──        (DataSourceMachine, multi metrics)
── Time Range ──
── Metric Style ──       (per-metric color + line style)
── Legend ──
```

**BarChart:**
```
── Header ──
── Style ──
── Data Source ──        (DataSourceMachine, multi metrics)
── Time Range ──
── Metric Style ──       (per-metric color)
── Legend ──
```

**PieChart:**
```
── Header ──
── Style ──
── Data Source ──        (DataSourceMachine, multi metrics)
── Metric Style ──       (per-metric color)
── Legend ──
```

**StatusCard:**
```
── Header ──
── Style ──
── Data Source ──        (DataSourceMachine, single metric)
── [Widget Specific] ──  (unit)
```

**Gauge:**
```
── Header ──
── Style ──
── Data Source ──        (DataSourceMachine, single metric)
── [Widget Specific] ──  (max value)
```

**AlertList:**
```
── Header ──
── Style ──
── Limits ──
── [Widget Specific] ──  (severity filter)
```

**MachineStatus / DataTable:**
```
── Header ──
── Style ──
── Data Source ──        (DataSourceLine)
── Limits ──             (DataTable only)
```

**Text:**
```
── Header ──
── Style ──
── [Widget Specific] ──  (markdown content)
```

## Files to Create

| File | Purpose |
|------|---------|
| `widgets/ChartLegend.tsx` | Shared legend rendering |
| `widgets/TimeRangeBar.tsx` | Runtime time range switcher |

## Files to Modify

| File | Changes |
|------|---------|
| `widget-config/CommonFields.tsx` | Add `ConfigSection`, `LegendFields`, `DataSourceMachine`, `DataSourceLine`, `StyleFields`, `HeaderFields` |
| `widgets/WidgetRenderer.tsx` | Apply style presets, title color |
| `LineChartConfig.tsx` | Refactor with shared components + sections |
| `LineChartWidget.tsx` | Use `ChartLegend`, `TimeRangeBar` |
| `BarChartConfig.tsx` | Rebuild with shared components |
| `PieChartConfig.tsx` | Rebuild (currently reuses BarChartConfig) |
| `StatusCardConfig.tsx` | Add sections |
| `AlertListConfig.tsx` | Add sections |
| `MachineStatusConfig.tsx` | Add sections |
| `TextConfig.tsx` | Add sections |
| `DashboardViewPage.tsx` | Move card styling to WidgetRenderer |
| `DashboardEditorPage.tsx` | Move card styling to WidgetRenderer |

## Out of Scope

- BarChart / PieChart actual data fetching and rendering (separate spec)
- Backend API changes (existing datapoints API is sufficient)
- Dark mode support
- Global theme settings
