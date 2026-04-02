import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TitleField, LinePicker, TimeRangePicker, ShowCountdownField } from './CommonFields';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function BarChartConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [lineId, setLineId] = useState((config.line_id as string) || '');
  const [metric, setMetric] = useState((config.metric as string) || '');
  const [timeRange, setTimeRange] = useState((config.time_range as string) || '24h');
  const [aggregation, setAggregation] = useState((config.aggregation as string) || 'avg');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);

  return (
    <div className="space-y-4">
      <TitleField value={title} onChange={setTitle} />
      <LinePicker value={lineId} onChange={setLineId} />
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Metric</Label>
        <Select value={metric} onValueChange={(v) => setMetric(v ?? '')}>
          <SelectTrigger><SelectValue placeholder="Enter metric name" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="temperature">temperature</SelectItem>
            <SelectItem value="speed">speed</SelectItem>
            <SelectItem value="power">power</SelectItem>
            <SelectItem value="output">output</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Aggregation</Label>
        <Select value={aggregation} onValueChange={(v) => setAggregation(v ?? 'avg')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="avg">Average</SelectItem>
            <SelectItem value="max">Max</SelectItem>
            <SelectItem value="min">Min</SelectItem>
            <SelectItem value="sum">Sum</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <TimeRangePicker value={timeRange} onChange={setTimeRange} />
      <ShowCountdownField value={showCountdown} onChange={setShowCountdown} />
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() =>
            onSave({ ...config, title, line_id: lineId, metric, aggregation, time_range: timeRange, show_countdown: showCountdown })
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
