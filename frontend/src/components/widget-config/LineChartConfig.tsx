import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TitleField, MachinePicker, TimeRangePicker } from './CommonFields';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

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
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    );
  };

  return (
    <div className="space-y-4">
      <TitleField value={title} onChange={setTitle} />
      <MachinePicker value={machineId} onChange={(v) => { setMachineId(v); setSelectedMetrics([]); }} />

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
        <p className="text-xs text-slate-400">Each metric shows as a separate line on the chart</p>
      </div>

      <TimeRangePicker value={timeRange} onChange={setTimeRange} />

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() =>
            onSave({ ...config, title, machine_id: machineId, metrics: selectedMetrics, time_range: timeRange })
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
