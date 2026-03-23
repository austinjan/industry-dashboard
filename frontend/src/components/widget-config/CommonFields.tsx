import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
