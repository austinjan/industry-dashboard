import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TitleField, MachinePicker, TimeRangePicker } from './CommonFields';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

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
  style: string; // solid | dashed | dotted
}

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function LineChartConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [machineId, setMachineId] = useState((config.machine_id as string) || '');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    (config.metrics as string[]) || []
  );
  const [metricStyles, setMetricStyles] = useState<Record<string, MetricStyle>>(
    (config.metric_styles as Record<string, MetricStyle>) || {}
  );
  const [timeRange, setTimeRange] = useState((config.time_range as string) || '24h');

  const { data: availableMetrics } = useQuery({
    queryKey: ['machine-metrics', machineId],
    queryFn: async () => {
      const r = await apiFetch(`/machines/${machineId}/metrics`);
      return r.ok ? r.json() : [];
    },
    enabled: !!machineId,
  });

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) => {
      if (prev.includes(metric)) {
        return prev.filter((m) => m !== metric);
      }
      // Auto-assign a color when adding
      const newStyles = { ...metricStyles };
      if (!newStyles[metric]) {
        const usedColors = Object.values(newStyles).map((s) => s.color);
        const nextColor = COLOR_PRESETS.find((c) => !usedColors.includes(c)) || COLOR_PRESETS[0];
        newStyles[metric] = { color: nextColor, style: 'solid' };
        setMetricStyles(newStyles);
      }
      return [...prev, metric];
    });
  };

  const updateStyle = (metric: string, key: keyof MetricStyle, value: string) => {
    setMetricStyles((prev) => ({
      ...prev,
      [metric]: { ...prev[metric], [key]: value },
    }));
  };

  return (
    <div className="space-y-4">
      <TitleField value={title} onChange={setTitle} />
      <MachinePicker value={machineId} onChange={(v) => { setMachineId(v); setSelectedMetrics([]); setMetricStyles({}); }} />

      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Metrics (select multiple)</Label>
        {!machineId ? (
          <p className="text-xs text-slate-400">Select a machine first.</p>
        ) : !availableMetrics || (availableMetrics as string[]).length === 0 ? (
          <p className="text-xs text-slate-400">No metrics available for this machine.</p>
        ) : (
          <div className="space-y-1 rounded-md border p-2">
            {(availableMetrics as string[]).map((m: string) => (
              <label key={m} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                <input
                  type="checkbox"
                  checked={selectedMetrics.includes(m)}
                  onChange={() => toggleMetric(m)}
                  className="rounded"
                />
                <span>{m}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Per-metric color and style */}
      {selectedMetrics.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase text-slate-500">Line Color & Style</Label>
          <div className="space-y-3 rounded-md border p-3">
            {selectedMetrics.map((metric) => {
              const ms = metricStyles[metric] || { color: COLOR_PRESETS[0], style: 'solid' };
              return (
                <div key={metric} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full border"
                      style={{ backgroundColor: ms.color }}
                    />
                    <span className="text-sm font-medium">{metric}</span>
                  </div>
                  {/* Color picker */}
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
                  {/* Line style */}
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
        </div>
      )}

      <TimeRangePicker value={timeRange} onChange={setTimeRange} />

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() =>
            onSave({
              ...config,
              title,
              machine_id: machineId,
              metrics: selectedMetrics,
              metric_styles: metricStyles,
              time_range: timeRange,
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
