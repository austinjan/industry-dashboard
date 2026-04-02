# Shared Widget Config Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor widget configuration into reusable grouped components with shared legend, runtime time range switching, and style presets.

**Architecture:** Extract shared config group components into CommonFields.tsx, create ChartLegend and TimeRangeBar rendering components, move card styling from dashboard pages into WidgetRenderer so style presets work, then migrate all widget configs to use the new grouped structure.

**Tech Stack:** React, TypeScript, Tailwind CSS, Recharts (existing)

---

## File Structure

**Create:**
- `frontend/src/components/widgets/ChartLegend.tsx` — Shared legend rendering
- `frontend/src/components/widgets/TimeRangeBar.tsx` — Runtime time range switcher

**Modify:**
- `frontend/src/components/widget-config/CommonFields.tsx` — Add ConfigSection, HeaderFields, StyleFields, LegendFields, DataSourceMachine, DataSourceLine
- `frontend/src/components/widgets/WidgetRenderer.tsx` — Apply style presets, title color, move card styling here
- `frontend/src/components/widgets/LineChartWidget.tsx` — Use ChartLegend, TimeRangeBar
- `frontend/src/components/widget-config/LineChartConfig.tsx` — Refactor with shared components
- `frontend/src/components/widget-config/StatusCardConfig.tsx` — Refactor with shared components
- `frontend/src/components/widget-config/AlertListConfig.tsx` — Refactor with shared components
- `frontend/src/components/widget-config/MachineStatusConfig.tsx` — Refactor with shared components
- `frontend/src/components/widget-config/BarChartConfig.tsx` — Refactor with shared components
- `frontend/src/components/widget-config/TextConfig.tsx` — Refactor with shared components
- `frontend/src/pages/dashboards/DashboardViewPage.tsx` — Remove card styling (moved to WidgetRenderer)
- `frontend/src/pages/dashboards/DashboardEditorPage.tsx` — Remove card styling (moved to WidgetRenderer)

---

### Task 1: ConfigSection and HeaderFields

**Files:**
- Modify: `frontend/src/components/widget-config/CommonFields.tsx`

- [ ] **Step 1: Add ConfigSection component**

Add to the bottom of `CommonFields.tsx`:

```tsx
export function ConfigSection({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
```

- [ ] **Step 2: Add HeaderFields component**

Add below ConfigSection:

```tsx
export function HeaderFields({
  title,
  onTitleChange,
  titleColor,
  onTitleColorChange,
  showCountdown,
  onShowCountdownChange,
}: {
  title: string;
  onTitleChange: (v: string) => void;
  titleColor: string;
  onTitleColorChange: (v: string) => void;
  showCountdown: boolean;
  onShowCountdownChange: (v: boolean) => void;
}) {
  return (
    <>
      <ConfigSection label="Header" />
      <TitleField value={title} onChange={onTitleChange} />
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Title Color</Label>
        <div className="flex items-center gap-1">
          {['', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6'].map((color) => (
            <button
              key={color}
              onClick={() => onTitleColorChange(color)}
              className="h-6 w-6 rounded-md border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: color || undefined,
                borderColor: titleColor === color ? '#1e293b' : 'transparent',
              }}
            >
              {color === '' && <span className="text-[10px] text-muted-foreground">Auto</span>}
            </button>
          ))}
          <input
            type="color"
            value={titleColor || '#000000'}
            onChange={(e) => onTitleColorChange(e.target.value)}
            className="ml-1 h-6 w-6 cursor-pointer rounded border-0 p-0"
            title="Custom color"
          />
        </div>
      </div>
      <ShowCountdownField value={showCountdown} onChange={onShowCountdownChange} />
    </>
  );
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/widget-config/CommonFields.tsx
git commit -m "feat: add ConfigSection and HeaderFields shared components"
```

---

### Task 2: StyleFields

**Files:**
- Modify: `frontend/src/components/widget-config/CommonFields.tsx`

- [ ] **Step 1: Add StyleFields component**

Add below HeaderFields in `CommonFields.tsx`:

```tsx
const STYLE_PRESETS = [
  { value: 'default', label: 'Default' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'accent', label: 'Accent' },
];

const ACCENT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function StyleFields({
  widgetStyle,
  onWidgetStyleChange,
  accentColor,
  onAccentColorChange,
}: {
  widgetStyle: string;
  onWidgetStyleChange: (v: string) => void;
  accentColor: string;
  onAccentColorChange: (v: string) => void;
}) {
  return (
    <>
      <ConfigSection label="Style" />
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Widget Style</Label>
        <div className="flex gap-1">
          {STYLE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => onWidgetStyleChange(p.value)}
              className={`rounded px-3 py-1 text-xs ${
                widgetStyle === p.value ? 'bg-slate-800 text-white' : 'border bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {widgetStyle === 'accent' && (
        <div className="space-y-1">
          <Label className="text-xs uppercase text-slate-500">Accent Color</Label>
          <div className="flex items-center gap-1">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onAccentColorChange(color)}
                className="h-6 w-6 rounded-md border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: accentColor === color ? '#1e293b' : 'transparent',
                }}
              />
            ))}
            <input
              type="color"
              value={accentColor}
              onChange={(e) => onAccentColorChange(e.target.value)}
              className="ml-1 h-6 w-6 cursor-pointer rounded border-0 p-0"
              title="Custom color"
            />
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/widget-config/CommonFields.tsx
git commit -m "feat: add StyleFields shared component with presets"
```

---

### Task 3: LegendFields and DataSource components

**Files:**
- Modify: `frontend/src/components/widget-config/CommonFields.tsx`

- [ ] **Step 1: Add LegendFields component**

Add to `CommonFields.tsx`:

```tsx
export function LegendFields({
  showLegend,
  onShowLegendChange,
  legendPosition,
  onLegendPositionChange,
}: {
  showLegend: boolean;
  onShowLegendChange: (v: boolean) => void;
  legendPosition: string;
  onLegendPositionChange: (v: string) => void;
}) {
  return (
    <>
      <ConfigSection label="Legend" />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={showLegend} onCheckedChange={(checked) => onShowLegendChange(!!checked)} />
        <span>Show legend</span>
      </label>
      {showLegend && (
        <div className="space-y-1">
          <Label className="text-xs uppercase text-slate-500">Position</Label>
          <div className="flex gap-1">
            {(['top', 'bottom'] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => onLegendPositionChange(pos)}
                className={`rounded px-3 py-1 text-xs capitalize ${
                  legendPosition === pos ? 'bg-slate-800 text-white' : 'border bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Add DataSourceMachine component**

Add to `CommonFields.tsx`:

```tsx
export function DataSourceMachine({
  machineId,
  onMachineChange,
  metrics,
  onMetricsChange,
  multi = false,
}: {
  machineId: string;
  onMachineChange: (v: string) => void;
  metrics: string[];
  onMetricsChange: (v: string[]) => void;
  multi?: boolean;
}) {
  return (
    <>
      <ConfigSection label="Data Source" />
      <MachinePicker value={machineId} onChange={onMachineChange} />
      {multi ? (
        <MultiMetricPicker machineId={machineId} values={metrics} onChange={onMetricsChange} />
      ) : (
        <MetricPicker
          machineId={machineId}
          value={metrics[0] || ''}
          onChange={(v) => onMetricsChange(v ? [v] : [])}
        />
      )}
    </>
  );
}

function MultiMetricPicker({
  machineId,
  values,
  onChange,
}: {
  machineId: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['machine-metrics', machineId],
    queryFn: async () => {
      const r = await apiFetch(`/machines/${machineId}/metrics`);
      return r.ok ? r.json() : [];
    },
    enabled: !!machineId,
  });

  const toggle = (m: string) => {
    onChange(values.includes(m) ? values.filter((v) => v !== m) : [...values, m]);
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase text-slate-500">Metrics (select multiple)</Label>
      {!machineId ? (
        <p className="text-xs text-slate-400">Select a machine first.</p>
      ) : isLoading ? (
        <p className="text-xs text-slate-400">Loading metrics...</p>
      ) : !metrics || (metrics as string[]).length === 0 ? (
        <p className="text-xs text-slate-400">No metrics available.</p>
      ) : (
        <div className="space-y-1 rounded-md border p-2">
          {(metrics as string[]).map((m: string) => (
            <label key={m} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
              <input type="checkbox" checked={values.includes(m)} onChange={() => toggle(m)} className="rounded" />
              <span>{m}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add DataSourceLine component**

Add to `CommonFields.tsx`:

```tsx
export function DataSourceLine({
  lineId,
  onLineChange,
}: {
  lineId: string;
  onLineChange: (v: string) => void;
}) {
  return (
    <>
      <ConfigSection label="Data Source" />
      <LinePicker value={lineId} onChange={onLineChange} />
    </>
  );
}
```

- [ ] **Step 4: Add missing imports at top of CommonFields.tsx**

Add `useQuery` and `apiFetch` imports if not already present (they are already imported for MetricPicker):

```tsx
// These should already be at the top:
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
```

- [ ] **Step 5: Verify compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/widget-config/CommonFields.tsx
git commit -m "feat: add LegendFields, DataSourceMachine, DataSourceLine shared components"
```

---

### Task 4: ChartLegend component

**Files:**
- Create: `frontend/src/components/widgets/ChartLegend.tsx`

- [ ] **Step 1: Create ChartLegend component**

```tsx
interface ChartLegendProps {
  items: { label: string; color: string }[];
  show: boolean;
  position: 'top' | 'bottom';
}

export function ChartLegend({ items, show, position }: ChartLegendProps) {
  if (!show || items.length === 0) return null;

  const legend = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-[10px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );

  // position is handled by the parent — this component just renders the legend content
  // Parent wraps it in a flex column and places it before or after the chart
  return legend;
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/widgets/ChartLegend.tsx
git commit -m "feat: add ChartLegend shared component"
```

---

### Task 5: TimeRangeBar component

**Files:**
- Create: `frontend/src/components/widgets/TimeRangeBar.tsx`

- [ ] **Step 1: Create TimeRangeBar component**

```tsx
const OPTIONS = ['1h', '6h', '24h', '7d', '30d'];

interface TimeRangeBarProps {
  value: string;
  onChange: (range: string) => void;
}

export function TimeRangeBar({ value, onChange }: TimeRangeBarProps) {
  return (
    <div className="flex gap-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded px-2 py-0.5 text-[10px] ${
            value === o
              ? 'bg-slate-700 text-white'
              : 'text-muted-foreground hover:bg-slate-100'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/widgets/TimeRangeBar.tsx
git commit -m "feat: add TimeRangeBar runtime switcher component"
```

---

### Task 6: WidgetRenderer — style presets and title color

**Files:**
- Modify: `frontend/src/components/widgets/WidgetRenderer.tsx`
- Modify: `frontend/src/pages/dashboards/DashboardViewPage.tsx`
- Modify: `frontend/src/pages/dashboards/DashboardEditorPage.tsx`

- [ ] **Step 1: Add style preset logic to WidgetRenderer**

Replace the entire `WidgetRenderer.tsx` content:

```tsx
import { StatusCardWidget } from './StatusCardWidget';
import { GaugeWidget } from './GaugeWidget';
import { LineChartWidget } from './LineChartWidget';
import { BarChartWidget } from './BarChartWidget';
import { PieChartWidget } from './PieChartWidget';
import { DataTableWidget } from './DataTableWidget';
import { AlertListWidget } from './AlertListWidget';
import { MachineStatusWidget } from './MachineStatusWidget';
import { TextWidget } from './TextWidget';
import { PollingCountdown } from './PollingCountdown';

interface Props {
  widgetType: string;
  config: Record<string, unknown>;
}

const DEFAULT_LABELS: Record<string, string> = {
  status_card: 'Status Card',
  gauge: 'Gauge',
  line_chart: 'Line Chart',
  bar_chart: 'Bar Chart',
  pie_chart: 'Pie Chart',
  data_table: 'Data Table',
  alert_list: 'Alerts',
  machine_status: 'Machine Status',
  text_markdown: 'Text',
};

const WIDGETS: Record<string, React.FC<{ config: Record<string, unknown> }>> = {
  status_card: StatusCardWidget,
  gauge: GaugeWidget,
  line_chart: LineChartWidget,
  bar_chart: BarChartWidget,
  pie_chart: PieChartWidget,
  data_table: DataTableWidget,
  alert_list: AlertListWidget,
  machine_status: MachineStatusWidget,
  text_markdown: TextWidget,
};

function getCardClass(style: string, accentColor?: string): string {
  switch (style) {
    case 'minimal':
      return 'rounded-lg p-3';
    case 'accent':
      return 'rounded-lg border-l-4 bg-white p-3 shadow-sm';
    default:
      return 'rounded-lg border bg-white p-3 shadow-sm';
  }
}

export function WidgetRenderer({ widgetType, config }: Props) {
  const Component = WIDGETS[widgetType];
  if (!Component) return <div className="p-2 text-sm text-red-500">Unknown widget: {widgetType}</div>;
  const showCountdown = config.show_countdown !== false;
  const title = (config.title as string) || DEFAULT_LABELS[widgetType] || widgetType;
  const titleColor = (config.title_color as string) || undefined;
  const widgetStyle = (config.widget_style as string) || 'default';
  const accentColor = (config.accent_color as string) || '#3b82f6';
  const cardClass = getCardClass(widgetStyle, accentColor);
  const accentStyle = widgetStyle === 'accent' ? { borderLeftColor: accentColor } : undefined;

  return (
    <div className={cardClass} style={accentStyle}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between shrink-0 mb-1">
          <span
            className="text-xs font-semibold truncate"
            style={{ color: titleColor || undefined }}
          >
            {title}
          </span>
          {showCountdown && <PollingCountdown />}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <Component config={config} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove card styling from DashboardViewPage**

In `frontend/src/pages/dashboards/DashboardViewPage.tsx`, change both widget wrapper divs (normal mode ~line 73 and fullscreen mode ~line 112) from:

```tsx
<div key={w.id} className="rounded-lg border bg-white p-3 shadow-sm">
  <WidgetRenderer widgetType={w.widget_type} config={w.config} />
</div>
```

To:

```tsx
<div key={w.id}>
  <WidgetRenderer widgetType={w.widget_type} config={w.config} />
</div>
```

- [ ] **Step 3: Remove card styling from DashboardEditorPage**

In `frontend/src/pages/dashboards/DashboardEditorPage.tsx`, change the widget wrapper (~line 160) from:

```tsx
<div key={w.id} className="group relative rounded-lg border bg-white shadow-sm">
```

To:

```tsx
<div key={w.id} className="group relative">
```

- [ ] **Step 4: Verify compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Verify visually**

Run: `cd frontend && npm run dev`
Open a dashboard — widgets should still look the same (default style = same border/shadow as before).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/widgets/WidgetRenderer.tsx frontend/src/pages/dashboards/DashboardViewPage.tsx frontend/src/pages/dashboards/DashboardEditorPage.tsx
git commit -m "feat: move card styling to WidgetRenderer with style preset support"
```

---

### Task 7: Refactor LineChartConfig with shared components

**Files:**
- Modify: `frontend/src/components/widget-config/LineChartConfig.tsx`

- [ ] **Step 1: Rewrite LineChartConfig using shared components**

Replace entire file:

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  HeaderFields,
  StyleFields,
  DataSourceMachine,
  LegendFields,
  ConfigSection,
  TimeRangePicker,
} from './CommonFields';

const COLOR_PRESETS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
];

const LINE_STYLES = [
  { value: 'solid', label: 'Solid', preview: '────' },
  { value: 'dashed', label: 'Dashed', preview: '─ ─ ─' },
  { value: 'dotted', label: 'Dotted', preview: '· · · ·' },
];

interface MetricStyle {
  color: string;
  style: string;
}

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function LineChartConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [machineId, setMachineId] = useState((config.machine_id as string) || '');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    (config.metrics as string[]) || []
  );
  const [metricStyles, setMetricStyles] = useState<Record<string, MetricStyle>>(
    (config.metric_styles as Record<string, MetricStyle>) || {}
  );
  const [timeRange, setTimeRange] = useState((config.time_range as string) || '24h');
  const [showLegend, setShowLegend] = useState(config.show_legend !== false);
  const [legendPosition, setLegendPosition] = useState((config.legend_position as string) || 'bottom');

  const handleMachineChange = (v: string) => {
    setMachineId(v);
    setSelectedMetrics([]);
    setMetricStyles({});
  };

  const handleMetricsChange = (metrics: string[]) => {
    // Auto-assign colors for new metrics
    const newStyles = { ...metricStyles };
    for (const m of metrics) {
      if (!newStyles[m]) {
        const usedColors = Object.values(newStyles).map((s) => s.color);
        const nextColor = COLOR_PRESETS.find((c) => !usedColors.includes(c)) || COLOR_PRESETS[0];
        newStyles[m] = { color: nextColor, style: 'solid' };
      }
    }
    setMetricStyles(newStyles);
    setSelectedMetrics(metrics);
  };

  const updateStyle = (metric: string, key: keyof MetricStyle, value: string) => {
    setMetricStyles((prev) => ({
      ...prev,
      [metric]: { ...prev[metric], [key]: value },
    }));
  };

  return (
    <div className="space-y-4">
      <HeaderFields
        title={title} onTitleChange={setTitle}
        titleColor={titleColor} onTitleColorChange={setTitleColor}
        showCountdown={showCountdown} onShowCountdownChange={setShowCountdown}
      />
      <StyleFields
        widgetStyle={widgetStyle} onWidgetStyleChange={setWidgetStyle}
        accentColor={accentColor} onAccentColorChange={setAccentColor}
      />
      <DataSourceMachine
        machineId={machineId} onMachineChange={handleMachineChange}
        metrics={selectedMetrics} onMetricsChange={handleMetricsChange}
        multi
      />

      <ConfigSection label="Time Range" />
      <TimeRangePicker value={timeRange} onChange={setTimeRange} />

      {selectedMetrics.length > 0 && (
        <>
          <ConfigSection label="Metric Style" />
          <div className="space-y-3 rounded-md border p-3">
            {selectedMetrics.map((metric) => {
              const ms = metricStyles[metric] || { color: COLOR_PRESETS[0], style: 'solid' };
              return (
                <div key={metric} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full border" style={{ backgroundColor: ms.color }} />
                    <span className="text-sm font-medium">{metric}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        onClick={() => updateStyle(metric, 'color', color)}
                        className="h-6 w-6 rounded-md border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: color,
                          borderColor: ms.color === color ? '#1e293b' : 'transparent',
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={ms.color}
                      onChange={(e) => updateStyle(metric, 'color', e.target.value)}
                      className="ml-1 h-6 w-6 cursor-pointer rounded border-0 p-0"
                      title="Custom color"
                    />
                  </div>
                  <div className="flex gap-1">
                    {LINE_STYLES.map((ls) => (
                      <button
                        key={ls.value}
                        onClick={() => updateStyle(metric, 'style', ls.value)}
                        className={`rounded px-2 py-0.5 text-xs font-mono ${
                          ms.style === ls.value
                            ? 'bg-slate-800 text-white'
                            : 'border bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {ls.preview}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <LegendFields
        showLegend={showLegend} onShowLegendChange={setShowLegend}
        legendPosition={legendPosition} onLegendPositionChange={setLegendPosition}
      />

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() =>
            onSave({
              ...config,
              title, title_color: titleColor, show_countdown: showCountdown,
              widget_style: widgetStyle, accent_color: accentColor,
              machine_id: machineId, metrics: selectedMetrics,
              metric_styles: metricStyles, time_range: timeRange,
              show_legend: showLegend, legend_position: legendPosition,
            })
          }
          className="flex-1"
          disabled={selectedMetrics.length === 0}
        >
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

- [ ] **Step 2: Verify compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/widget-config/LineChartConfig.tsx
git commit -m "refactor: LineChartConfig using shared config components"
```

---

### Task 8: Update LineChartWidget with ChartLegend and TimeRangeBar

**Files:**
- Modify: `frontend/src/components/widgets/LineChartWidget.tsx`

- [ ] **Step 1: Add imports and runtime time range state**

At the top of `LineChartWidget.tsx`, add imports:

```tsx
import { useState } from 'react';
import { ChartLegend } from './ChartLegend';
import { TimeRangeBar } from './TimeRangeBar';
```

Inside the component function, add local state for runtime time range:

```tsx
const configTimeRange = (config.time_range as string) || '24h';
const [timeRange, setTimeRange] = useState(configTimeRange);
```

And replace the existing `timeRange` constant that reads from config.

- [ ] **Step 2: Replace Recharts Legend with ChartLegend and add TimeRangeBar**

Remove the `Legend` import from recharts. Remove `{metrics.length > 1 && <Legend fontSize={10} />}` from the JSX.

Build legend items from metric styles:

```tsx
const legendItems = metrics.map((metric: string, i: number) => {
  const ms = metricStyles[metric];
  return {
    label: metric,
    color: ms?.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  };
});
const showLegend = config.show_legend !== false;
const legendPosition = (config.legend_position as string) || 'bottom';
```

Wrap the chart in a flex column with ChartLegend and TimeRangeBar:

```tsx
return (
  <div className="flex h-full flex-col">
    <div className="flex items-center justify-between mb-1">
      <TimeRangeBar value={timeRange} onChange={setTimeRange} />
    </div>
    {legendPosition === 'top' && <ChartLegend items={legendItems} show={showLegend} position="top" />}
    <div className="min-h-0 flex-1">
      {isLoading ? (
        <p className="py-4 text-center text-xs text-slate-400">Loading...</p>
      ) : chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          {/* existing chart JSX without Legend */}
        </ResponsiveContainer>
      ) : (
        <p className="py-4 text-center text-xs text-slate-400">No data for this range.</p>
      )}
    </div>
    {legendPosition === 'bottom' && <ChartLegend items={legendItems} show={showLegend} position="bottom" />}
  </div>
);
```

- [ ] **Step 3: Verify compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/widgets/LineChartWidget.tsx
git commit -m "feat: LineChartWidget uses ChartLegend and TimeRangeBar"
```

---

### Task 9: Refactor remaining config panels

**Files:**
- Modify: `frontend/src/components/widget-config/StatusCardConfig.tsx`
- Modify: `frontend/src/components/widget-config/AlertListConfig.tsx`
- Modify: `frontend/src/components/widget-config/MachineStatusConfig.tsx`
- Modify: `frontend/src/components/widget-config/BarChartConfig.tsx`
- Modify: `frontend/src/components/widget-config/TextConfig.tsx`

- [ ] **Step 1: Rewrite StatusCardConfig**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HeaderFields, StyleFields, DataSourceMachine, ConfigSection } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function StatusCardConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [machineId, setMachineId] = useState((config.machine_id as string) || '');
  const [metric, setMetric] = useState((config.metric as string) || '');
  const [unit, setUnit] = useState((config.unit as string) || '');

  return (
    <div className="space-y-4">
      <HeaderFields
        title={title} onTitleChange={setTitle}
        titleColor={titleColor} onTitleColorChange={setTitleColor}
        showCountdown={showCountdown} onShowCountdownChange={setShowCountdown}
      />
      <StyleFields
        widgetStyle={widgetStyle} onWidgetStyleChange={setWidgetStyle}
        accentColor={accentColor} onAccentColorChange={setAccentColor}
      />
      <DataSourceMachine
        machineId={machineId} onMachineChange={setMachineId}
        metrics={metric ? [metric] : []}
        onMetricsChange={(v) => setMetric(v[0] || '')}
      />
      <ConfigSection label="Display" />
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Unit</Label>
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="°C, rpm, kW..." className="w-32" />
        <p className="text-xs text-slate-400">Display unit after the value</p>
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({
            ...config, title, title_color: titleColor, show_countdown: showCountdown,
            widget_style: widgetStyle, accent_color: accentColor,
            machine_id: machineId, metric, unit,
          })}
          className="flex-1"
        >Apply</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite AlertListConfig**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { HeaderFields, StyleFields, ConfigSection, LimitField } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function AlertListConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [limit, setLimit] = useState((config.limit as number) || 10);
  const [severities, setSeverities] = useState<string[]>(
    (config.severity as string[]) || ['critical', 'warning'],
  );

  const toggleSeverity = (s: string) => {
    setSeverities((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <div className="space-y-4">
      <HeaderFields
        title={title} onTitleChange={setTitle}
        titleColor={titleColor} onTitleColorChange={setTitleColor}
        showCountdown={showCountdown} onShowCountdownChange={setShowCountdown}
      />
      <StyleFields
        widgetStyle={widgetStyle} onWidgetStyleChange={setWidgetStyle}
        accentColor={accentColor} onAccentColorChange={setAccentColor}
      />
      <ConfigSection label="Limits" />
      <LimitField value={limit} onChange={setLimit} />
      <ConfigSection label="Filters" />
      <div className="space-y-2">
        <Label className="text-xs uppercase text-slate-500">Severity Filter</Label>
        {['critical', 'warning', 'info'].map((s) => (
          <label key={s} className="flex items-center gap-2 text-sm">
            <Checkbox checked={severities.includes(s)} onCheckedChange={() => toggleSeverity(s)} />
            <span className="capitalize">{s}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({
            ...config, title, title_color: titleColor, show_countdown: showCountdown,
            widget_style: widgetStyle, accent_color: accentColor,
            severity: severities, limit,
          })}
          className="flex-1"
        >Apply</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite MachineStatusConfig**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HeaderFields, StyleFields, DataSourceLine } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function MachineStatusConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [lineId, setLineId] = useState((config.line_id as string) || '');

  return (
    <div className="space-y-4">
      <HeaderFields
        title={title} onTitleChange={setTitle}
        titleColor={titleColor} onTitleColorChange={setTitleColor}
        showCountdown={showCountdown} onShowCountdownChange={setShowCountdown}
      />
      <StyleFields
        widgetStyle={widgetStyle} onWidgetStyleChange={setWidgetStyle}
        accentColor={accentColor} onAccentColorChange={setAccentColor}
      />
      <DataSourceLine lineId={lineId} onLineChange={setLineId} />
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({
            ...config, title, title_color: titleColor, show_countdown: showCountdown,
            widget_style: widgetStyle, accent_color: accentColor, line_id: lineId,
          })}
          className="flex-1"
        >Apply</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite BarChartConfig**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  HeaderFields,
  StyleFields,
  DataSourceMachine,
  LegendFields,
  ConfigSection,
  TimeRangePicker,
} from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function BarChartConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [machineId, setMachineId] = useState((config.machine_id as string) || '');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    (config.metrics as string[]) || []
  );
  const [timeRange, setTimeRange] = useState((config.time_range as string) || '24h');
  const [showLegend, setShowLegend] = useState(config.show_legend !== false);
  const [legendPosition, setLegendPosition] = useState((config.legend_position as string) || 'bottom');

  return (
    <div className="space-y-4">
      <HeaderFields
        title={title} onTitleChange={setTitle}
        titleColor={titleColor} onTitleColorChange={setTitleColor}
        showCountdown={showCountdown} onShowCountdownChange={setShowCountdown}
      />
      <StyleFields
        widgetStyle={widgetStyle} onWidgetStyleChange={setWidgetStyle}
        accentColor={accentColor} onAccentColorChange={setAccentColor}
      />
      <DataSourceMachine
        machineId={machineId} onMachineChange={(v) => { setMachineId(v); setSelectedMetrics([]); }}
        metrics={selectedMetrics} onMetricsChange={setSelectedMetrics}
        multi
      />
      <ConfigSection label="Time Range" />
      <TimeRangePicker value={timeRange} onChange={setTimeRange} />
      <LegendFields
        showLegend={showLegend} onShowLegendChange={setShowLegend}
        legendPosition={legendPosition} onLegendPositionChange={setLegendPosition}
      />
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({
            ...config, title, title_color: titleColor, show_countdown: showCountdown,
            widget_style: widgetStyle, accent_color: accentColor,
            machine_id: machineId, metrics: selectedMetrics, time_range: timeRange,
            show_legend: showLegend, legend_position: legendPosition,
          })}
          className="flex-1"
        >Apply</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rewrite TextConfig**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { HeaderFields, StyleFields, ConfigSection } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function TextConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [content, setContent] = useState((config.content as string) || '');

  return (
    <div className="space-y-4">
      <HeaderFields
        title={title} onTitleChange={setTitle}
        titleColor={titleColor} onTitleColorChange={setTitleColor}
        showCountdown={showCountdown} onShowCountdownChange={setShowCountdown}
      />
      <StyleFields
        widgetStyle={widgetStyle} onWidgetStyleChange={setWidgetStyle}
        accentColor={accentColor} onAccentColorChange={setAccentColor}
      />
      <ConfigSection label="Content" />
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Content (Markdown)</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder={'## Heading\n\nYour notes here...'}
          className="font-mono text-xs"
        />
        <p className="text-xs text-slate-400">Supports **bold**, *italic*, lists, headings</p>
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({
            ...config, title, title_color: titleColor, show_countdown: showCountdown,
            widget_style: widgetStyle, accent_color: accentColor, content,
          })}
          className="flex-1"
        >Apply</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/widget-config/StatusCardConfig.tsx frontend/src/components/widget-config/AlertListConfig.tsx frontend/src/components/widget-config/MachineStatusConfig.tsx frontend/src/components/widget-config/BarChartConfig.tsx frontend/src/components/widget-config/TextConfig.tsx
git commit -m "refactor: all widget configs use shared HeaderFields, StyleFields, and config sections"
```
