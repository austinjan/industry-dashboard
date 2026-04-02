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
