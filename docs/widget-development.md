# Widget Development Guide

How to add a new widget to the Industry Dashboard. Each widget is independent — its own display component, config form, and DB registration.

## Quick Reference: Files to Touch

| # | File | Action |
|---|------|--------|
| 1 | `migrations/011_seed_widget_types.up.sql` | Add INSERT for new widget type |
| 2 | `frontend/src/components/widgets/MyWidget.tsx` | **Create** display component |
| 3 | `frontend/src/components/widgets/WidgetRenderer.tsx` | Add to `WIDGETS` map |
| 4 | `frontend/src/components/widget-config/MyWidgetConfig.tsx` | **Create** config form |
| 5 | `frontend/src/components/widget-config/WidgetConfigSheet.tsx` | Add to `CONFIG_FORMS` + `WIDGET_HINTS` |

That's it. No backend Go code needed unless your widget requires a new API endpoint.

---

## Step-by-Step Example: "Progress Bar" Widget

### Step 1: Register the Widget Type (Database)

Add a row to `migrations/011_seed_widget_types.up.sql`:

```sql
INSERT INTO widget_types (name, description, default_config) VALUES
    -- ... existing types ...
    ('progress_bar', 'Horizontal progress bar showing a metric as percentage of a range', '{"width": 4, "height": 2}');
```

- `name` — snake_case identifier, used as the key everywhere
- `default_config` — `width` and `height` in grid units (12-column grid)
- Run `make migrate-down && make migrate` to re-seed, or manually INSERT

### Step 2: Create the Display Component

Create `frontend/src/components/widgets/ProgressBarWidget.tsx`:

```tsx
import { useLatestValues } from '@/lib/hooks';

export function ProgressBarWidget({ config }: { config: Record<string, unknown> }) {
  const machineId = config.machine_id as string | undefined;
  const metric = config.metric as string | undefined;
  const min = (config.min as number) ?? 0;
  const max = (config.max as number) ?? 100;
  const unit = (config.unit as string) || '';

  const { data: latest } = useLatestValues(machineId);
  const value = metric ? latest?.[metric] : undefined;
  const pct = value !== undefined ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;

  return (
    <div className="flex h-full flex-col justify-center">
      <p className="mb-1 text-xs text-slate-500">{(config.title as string) || metric || 'Progress'}</p>
      <div className="h-4 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-sm font-medium">
        {value !== undefined ? `${value.toFixed(1)}${unit}` : '--'}{' '}
        <span className="text-xs text-slate-400">/ {max}{unit}</span>
      </p>
    </div>
  );
}
```

#### Display Component Contract

```typescript
// Signature — must match exactly
export function MyWidget({ config }: { config: Record<string, unknown> }) {
```

- Extract typed values from `config` with defaults
- Fetch data via TanStack Query hooks (see Available Hooks below)
- Return JSX — the widget grid cell handles the container

### Step 3: Register in WidgetRenderer

Edit `frontend/src/components/widgets/WidgetRenderer.tsx`:

```typescript
import { ProgressBarWidget } from './ProgressBarWidget';

const WIDGETS: Record<string, React.FC<{ config: Record<string, unknown> }>> = {
  // ... existing ...
  progress_bar: ProgressBarWidget,
};
```

### Step 4: Create the Config Form

Create `frontend/src/components/widget-config/ProgressBarConfig.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TitleField, MachinePicker, MetricPicker } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function ProgressBarConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [machineId, setMachineId] = useState((config.machine_id as string) || '');
  const [metric, setMetric] = useState((config.metric as string) || '');
  const [unit, setUnit] = useState((config.unit as string) || '');
  const [min, setMin] = useState((config.min as number) ?? 0);
  const [max, setMax] = useState((config.max as number) ?? 100);

  return (
    <div className="space-y-4">
      <TitleField value={title} onChange={setTitle} />
      <MachinePicker value={machineId} onChange={setMachineId} />
      <MetricPicker machineId={machineId} value={metric} onChange={setMetric} />
      <div className="flex gap-2">
        <div className="space-y-1">
          <Label className="text-xs uppercase text-slate-500">Min</Label>
          <Input type="number" value={min} onChange={(e) => setMin(Number(e.target.value))} className="w-24" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase text-slate-500">Max</Label>
          <Input type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} className="w-24" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Unit</Label>
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="°C, rpm, kW..." className="w-32" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave({ ...config, title, machine_id: machineId, metric, unit, min, max })} className="flex-1">
          Apply
        </Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}
```

#### Config Form Contract

```typescript
// Signature — must match exactly
interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}
```

- Initialize state from `config` using `useState`
- Use `CommonFields` helpers where possible (see below)
- Call `onSave({ ...config, ...yourFields })` — always spread existing config
- Call `onCancel()` to close the sheet

### Step 5: Register in WidgetConfigSheet

Edit `frontend/src/components/widget-config/WidgetConfigSheet.tsx`:

```typescript
import { ProgressBarConfig } from './ProgressBarConfig';

const CONFIG_FORMS: Record<string, FC<ConfigFormProps>> = {
  // ... existing ...
  progress_bar: ProgressBarConfig,
};

const WIDGET_HINTS: Record<string, { color: string; bg: string; text: string }> = {
  // ... existing ...
  progress_bar: {
    color: '#3b82f6',
    bg: '#eff6ff',
    text: 'Horizontal progress bar showing a metric value as percentage of a configurable range.',
  },
};
```

#### Hint Color Conventions

| Category | `color` | `bg` |
|----------|---------|------|
| Data visualization | `#3b82f6` (blue) | `#eff6ff` |
| Machine/status | `#22c55e` (green) | `#f0fdf4` |
| Alerts | `#f59e0b` (amber) | `#fffbeb` |
| Text/content | `#8b5cf6` (purple) | `#f5f3ff` |

---

## Available CommonFields Helpers

Import from `./CommonFields`:

| Component | Props | Description |
|-----------|-------|-------------|
| `TitleField` | `value, onChange` | Standard title input |
| `MachinePicker` | `value, onChange` | Cascading Line → Machine selectors |
| `LinePicker` | `value, onChange` | Single line selector |
| `MetricPicker` | `machineId, value, onChange` | Metric dropdown (fetches from API) |
| `TimeRangePicker` | `value, onChange` | Button group: 1h / 6h / 24h / 7d / 30d |
| `LimitField` | `value, onChange` | Numeric input for list limits |

## Available Data Hooks

Import from `@/lib/hooks`:

| Hook | Args | Returns | Polling |
|------|------|---------|---------|
| `useLatestValues(machineId)` | machine UUID | `Record<string, number>` | 30s |
| `useSiteSummary(siteId)` | site UUID | Summary stats | 30s |
| `useAlertEvents(siteId, params)` | site UUID + filters | Alert event list | 30s |
| `useLineMachines(lineId)` | line UUID | Machine list | — |

For custom data fetching, use `useQuery` from `@tanstack/react-query` with `apiFetch`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const { data } = useQuery({
  queryKey: ['my-data', machineId],
  queryFn: async () => {
    const r = await apiFetch(`/my-endpoint?machine_id=${machineId}`);
    return r.ok ? r.json() : null;
  },
  enabled: !!machineId,
  refetchInterval: 30000,  // Always add polling for live data
});
```

---

## Checklist

Before considering a widget done, verify:

- [ ] **DB migration** — widget type registered in `011_seed_widget_types.up.sql`
- [ ] **Display component** — correct signature `({ config }) => JSX`
- [ ] **Config form** — correct signature `({ config, onSave, onCancel }) => JSX`
- [ ] **WidgetRenderer** — imported and added to `WIDGETS` map
- [ ] **WidgetConfigSheet** — imported and added to `CONFIG_FORMS` + `WIDGET_HINTS`
- [ ] **Polling** — live data queries have `refetchInterval: 30000`
- [ ] **Loading state** — shows `<p className="py-4 text-center text-xs text-slate-400">Loading...</p>`
- [ ] **Empty state** — shows helpful message when no data or unconfigured
- [ ] **Config spread** — `onSave` spreads existing config: `onSave({ ...config, ...fields })`
- [ ] **Style consistency** — follows [style-guide.md](style-guide.md):
  - Widget title: `text-xs text-slate-500` with `mb-1`
  - Form labels: `text-xs uppercase text-slate-500`
  - Buttons: primary = `default`, cancel = `outline`, wrapped in `flex gap-2 pt-2`
  - Container: `h-full` on root div, `overflow-auto` if scrollable
- [ ] **TypeScript** — `npx tsc --noEmit` passes
- [ ] **No backend needed?** — If your widget uses existing endpoints, no Go changes required

## Existing Widgets Reference

| Type | Display | Config | Notes |
|------|---------|--------|-------|
| `status_card` | StatusCardWidget | StatusCardConfig | Single metric value |
| `gauge` | GaugeWidget | StatusCardConfig (shared) | Radial gauge |
| `line_chart` | LineChartWidget | LineChartConfig | Multi-metric time series |
| `bar_chart` | BarChartWidget | BarChartConfig | Comparison chart |
| `pie_chart` | PieChartWidget | BarChartConfig (shared) | Proportional breakdown |
| `data_table` | DataTableWidget | MachineStatusConfig (shared) | Machine data table |
| `alert_list` | AlertListWidget | AlertListConfig | Alert event feed |
| `machine_status` | MachineStatusWidget | MachineStatusConfig | Machine status grid |
| `text_markdown` | TextWidget | TextConfig | Markdown text block |

Config forms can be shared across widget types when the fields are the same (e.g., `gauge` reuses `StatusCardConfig`).
