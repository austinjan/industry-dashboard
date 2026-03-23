import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TitleField, MachinePicker, MetricPicker, TimeRangePicker } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function LineChartConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [machineId, setMachineId] = useState((config.machine_id as string) || '');
  const metrics = config.metrics as string[] | undefined;
  const [metric, setMetric] = useState(metrics?.[0] || (config.metric as string) || '');
  const [timeRange, setTimeRange] = useState((config.time_range as string) || '24h');

  return (
    <div className="space-y-4">
      <TitleField value={title} onChange={setTitle} />
      <MachinePicker value={machineId} onChange={setMachineId} />
      <MetricPicker machineId={machineId} value={metric} onChange={setMetric} />
      <TimeRangePicker value={timeRange} onChange={setTimeRange} />
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() =>
            onSave({ ...config, title, machine_id: machineId, metrics: [metric], time_range: timeRange })
          }
          className="flex-1"
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
