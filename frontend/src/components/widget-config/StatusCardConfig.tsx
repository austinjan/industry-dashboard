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

export function StatusCardConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [machineId, setMachineId] = useState((config.machine_id as string) || '');
  const [metric, setMetric] = useState((config.metric as string) || '');
  const [unit, setUnit] = useState((config.unit as string) || '');

  return (
    <div className="space-y-4">
      <TitleField value={title} onChange={setTitle} />
      <MachinePicker value={machineId} onChange={setMachineId} />
      <MetricPicker machineId={machineId} value={metric} onChange={setMetric} />
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Unit</Label>
        <Input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="°C, rpm, kW..."
          className="w-32"
        />
        <p className="text-xs text-slate-400">Display unit after the value</p>
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({ ...config, title, machine_id: machineId, metric, unit })}
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
