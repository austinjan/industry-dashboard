import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const { data: lines } = useSiteLines(currentSite?.id);
  const [lineId, setLineId] = useState('');
  const { data: machines } = useLineMachines(lineId || undefined);

  // Auto-select first line
  useEffect(() => {
    if (lines && lines.length > 0 && !lineId) setLineId(lines[0].id);
  }, [lines, lineId]);

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Production Line</Label>
        <Select value={lineId} onValueChange={(v) => setLineId(v ?? '')}>
          <SelectTrigger><SelectValue placeholder="Select line" /></SelectTrigger>
          <SelectContent>
            {lines?.map((l: { id: string; name: string }) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Machine</Label>
        <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
          <SelectTrigger><SelectValue placeholder="Select machine" /></SelectTrigger>
          <SelectContent>
            {machines?.map((m: { id: string; name: string; model: string }) => (
              <SelectItem key={m.id} value={m.id}>{m.name} ({m.model})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-400">Choose which machine to monitor</p>
      </div>
    </div>
  );
}

export function LinePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { currentSite } = useSite();
  const { data: lines } = useSiteLines(currentSite?.id);
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase text-slate-500">Production Line</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger><SelectValue placeholder="Select line" /></SelectTrigger>
        <SelectContent>
          {lines?.map((l: { id: string; name: string }) => (
            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function MetricPicker({
  machineId,
  value,
  onChange,
}: {
  machineId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: metrics } = useQuery({
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
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger><SelectValue placeholder="Select metric" /></SelectTrigger>
        <SelectContent>
          {((metrics as string[]) || []).map((m: string) => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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
