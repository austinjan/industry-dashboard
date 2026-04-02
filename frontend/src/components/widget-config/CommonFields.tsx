import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useSite } from '@/lib/site-context';
import { useSiteLines, useLineMachines } from '@/lib/hooks';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function TitleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase text-slate-500">Title</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Widget title" />
    </div>
  );
}

export function MachinePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { currentSite } = useSite();
  const { data: lines, isLoading: linesLoading } = useSiteLines(currentSite?.id);
  const [lineId, setLineId] = useState('');
  const { data: machines, isLoading: machinesLoading } = useLineMachines(lineId || undefined);

  // Auto-select first line when lines load
  useEffect(() => {
    if (lines && lines.length > 0 && !lineId) {
      setLineId(lines[0].id);
    }
  }, [lines, lineId]);

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Production Line</Label>
        {linesLoading ? (
          <p className="text-xs text-slate-400">Loading lines...</p>
        ) : !lines || lines.length === 0 ? (
          <p className="text-xs text-slate-400">No production lines found. Is a site selected?</p>
        ) : (
          <select
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select line</option>
            {lines.map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Machine</Label>
        {machinesLoading ? (
          <p className="text-xs text-slate-400">Loading machines...</p>
        ) : !machines || machines.length === 0 ? (
          <p className="text-xs text-slate-400">{lineId ? 'No machines in this line.' : 'Select a line first.'}</p>
        ) : (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select machine</option>
            {machines.map((m: any) => (
              <option key={m.id} value={m.id}>{m.name} ({m.model})</option>
            ))}
          </select>
        )}
        <p className="text-xs text-slate-400">Choose which machine to monitor</p>
      </div>
    </div>
  );
}

export function LinePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { currentSite } = useSite();
  const { data: lines, isLoading } = useSiteLines(currentSite?.id);

  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase text-slate-500">Production Line</Label>
      {isLoading ? (
        <p className="text-xs text-slate-400">Loading lines...</p>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select line</option>
          {lines?.map((l: any) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export function MetricPicker({ machineId, value, onChange }: { machineId: string; value: string; onChange: (v: string) => void }) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['machine-metrics', machineId],
    queryFn: async () => {
      const r = await apiFetch(`/machines/${machineId}/metrics`);
      return r.ok ? r.json() : [];
    },
    enabled: !!machineId,
  });

  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase text-slate-500">Metric</Label>
      {isLoading ? (
        <p className="text-xs text-slate-400">Loading metrics...</p>
      ) : !machineId ? (
        <p className="text-xs text-slate-400">Select a machine first.</p>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select metric</option>
          {((metrics as string[]) || []).map((m: string) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
      <p className="text-xs text-slate-400">Auto-populated from machine's data points</p>
    </div>
  );
}

export function TimeRangePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = ['1h', '6h', '24h', '7d', '30d'];
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase text-slate-500">Time Range</Label>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`rounded px-3 py-1 text-xs ${
              value === o ? 'bg-blue-500 text-white' : 'border bg-white text-slate-600'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LimitField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase text-slate-500">Max Items</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 5)}
        className="w-24"
      />
    </div>
  );
}

export function ShowCountdownField({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={value} onCheckedChange={(checked) => onChange(!!checked)} />
      <span>Show polling countdown</span>
    </label>
  );
}

export function ConfigSection({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

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

import type { LegendDisplay } from './legend-utils';
export type { LegendDisplay } from './legend-utils';

const DEFAULT_LEGEND_DISPLAY: LegendDisplay = { show_site: false, show_line: false, show_machine: true };

export function LegendFields({
  showLegend,
  onShowLegendChange,
  legendPosition,
  onLegendPositionChange,
  legendDisplay,
  onLegendDisplayChange,
}: {
  showLegend: boolean;
  onShowLegendChange: (v: boolean) => void;
  legendPosition: string;
  onLegendPositionChange: (v: string) => void;
  legendDisplay?: LegendDisplay;
  onLegendDisplayChange?: (v: LegendDisplay) => void;
}) {
  const display = legendDisplay || DEFAULT_LEGEND_DISPLAY;

  return (
    <>
      <ConfigSection label="Legend" />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={showLegend} onCheckedChange={(checked) => onShowLegendChange(!!checked)} />
        <span>Show legend</span>
      </label>
      {showLegend && (
        <>
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
          {onLegendDisplayChange && (
            <div className="space-y-1">
              <Label className="text-xs uppercase text-slate-500">Label includes</Label>
              <div className="flex gap-3">
                {([
                  { key: 'show_site', label: 'Site' },
                  { key: 'show_line', label: 'Line' },
                  { key: 'show_machine', label: 'Machine' },
                ] as const).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={display[key]}
                      onCheckedChange={(checked) =>
                        onLegendDisplayChange({ ...display, [key]: !!checked })
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Preview: {[
                  display.show_site && 'Site',
                  display.show_line && 'Line',
                  display.show_machine && 'Machine',
                  'Metric',
                ].filter(Boolean).join(' : ')}
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}

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

// --- Multi Data Source support ---

const DS_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1'];

export interface DataSource {
  id: string;
  machine_id: string;
  metric: string;
  color: string;
  label: string;
  // Denormalized names for legend display
  site_name?: string;
  line_name?: string;
  machine_name?: string;
}

function newDataSource(existing: DataSource[]): DataSource {
  const usedColors = existing.map((ds) => ds.color);
  const color = DS_COLORS.find((c) => !usedColors.includes(c)) || DS_COLORS[0];
  return { id: crypto.randomUUID(), machine_id: '', metric: '', color, label: '' };
}

function DataSourceItem({
  ds,
  index,
  onChange,
  onRemove,
  showRemove,
}: {
  ds: DataSource;
  index: number;
  onChange: (updated: DataSource) => void;
  onRemove: () => void;
  showRemove: boolean;
}) {
  const { currentSite } = useSite();
  const { data: lines, isLoading: linesLoading } = useSiteLines(currentSite?.id);
  const [lineId, setLineId] = useState('');
  const { data: machines } = useLineMachines(lineId || undefined);
  const { data: metrics } = useQuery({
    queryKey: ['machine-metrics', ds.machine_id],
    queryFn: async () => {
      const r = await apiFetch(`/machines/${ds.machine_id}/metrics`);
      return r.ok ? r.json() : [];
    },
    enabled: !!ds.machine_id,
  });

  // Auto-select first line
  useEffect(() => {
    if (lines && lines.length > 0 && !lineId) setLineId(lines[0].id);
  }, [lines, lineId]);

  const currentLine = lines?.find((l: { id: string }) => l.id === lineId) as { id: string; name: string } | undefined;
  const currentMachine = machines?.find((m: { id: string }) => m.id === ds.machine_id) as { id: string; name: string } | undefined;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
        {showRemove && (
          <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">Remove</button>
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Production Line</Label>
        {linesLoading ? (
          <p className="text-xs text-slate-400">Loading...</p>
        ) : (
          <select
            value={lineId}
            onChange={(e) => { setLineId(e.target.value); onChange({ ...ds, machine_id: '', metric: '', machine_name: '', line_name: '' }); }}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Select line</option>
            {lines?.map((l: { id: string; name: string }) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Machine</Label>
        <select
          value={ds.machine_id}
          onChange={(e) => {
            const mid = e.target.value;
            const mach = machines?.find((m: { id: string }) => m.id === mid) as { id: string; name: string } | undefined;
            onChange({
              ...ds, machine_id: mid, metric: '',
              machine_name: mach?.name || '',
              line_name: currentLine?.name || '',
              site_name: currentSite?.name || '',
            });
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">Select machine</option>
          {(machines || []).map((m: { id: string; name: string; model: string }) => <option key={m.id} value={m.id}>{m.name} ({m.model})</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Metric</Label>
        <select
          value={ds.metric}
          onChange={(e) => {
            const metric = e.target.value;
            onChange({
              ...ds, metric,
              machine_name: currentMachine?.name || ds.machine_name || '',
              line_name: currentLine?.name || ds.line_name || '',
              site_name: currentSite?.name || ds.site_name || '',
            });
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">Select metric</option>
          {((metrics as string[]) || []).map((m: string) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <div className="space-y-1 flex-1">
          <Label className="text-xs uppercase text-slate-500">Label</Label>
          <Input
            value={ds.label}
            onChange={(e) => onChange({ ...ds, label: e.target.value })}
            placeholder={currentMachine?.name ? `${currentMachine.name} - ${ds.metric}` : 'Auto'}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase text-slate-500">Color</Label>
          <div className="flex items-center gap-0.5">
            {DS_COLORS.slice(0, 6).map((color) => (
              <button
                key={color}
                onClick={() => onChange({ ...ds, color })}
                className="h-6 w-6 rounded-md border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: color, borderColor: ds.color === color ? '#1e293b' : 'transparent' }}
              />
            ))}
            <input
              type="color"
              value={ds.color}
              onChange={(e) => onChange({ ...ds, color: e.target.value })}
              className="ml-0.5 h-6 w-6 cursor-pointer rounded border-0 p-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DataSourceList({
  mode,
  dataSources,
  onChange,
}: {
  mode: 'single' | 'multiple';
  dataSources: DataSource[];
  onChange: (ds: DataSource[]) => void;
}) {
  // Ensure at least one entry
  const items = dataSources.length > 0 ? dataSources : [newDataSource([])];

  const updateItem = (index: number, updated: DataSource) => {
    const next = [...items];
    next[index] = updated;
    onChange(next);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const addItem = () => {
    onChange([...items, newDataSource(items)]);
  };

  return (
    <>
      <ConfigSection label={mode === 'single' ? 'Data Source' : 'Data Sources'} />
      <div className="space-y-2">
        {items.map((ds, i) => (
          <DataSourceItem
            key={ds.id}
            ds={ds}
            index={i}
            onChange={(updated) => updateItem(i, updated)}
            onRemove={() => removeItem(i)}
            showRemove={mode === 'multiple' && items.length > 1}
          />
        ))}
        {mode === 'multiple' && (
          <button
            onClick={addItem}
            className="w-full rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-slate-50"
          >
            + Add Data Source
          </button>
        )}
      </div>
    </>
  );
}
