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
