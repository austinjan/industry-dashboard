import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  HeaderFields,
  StyleFields,
  DataSourceMachine,
  LegendFields,
  ConfigSection,
  TimeRangePicker,
} from './CommonFields';

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
  style: string;
}

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function LineChartConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [machineId, setMachineId] = useState((config.machine_id as string) || '');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    (config.metrics as string[]) || []
  );
  const [metricStyles, setMetricStyles] = useState<Record<string, MetricStyle>>(
    (config.metric_styles as Record<string, MetricStyle>) || {}
  );
  const [timeRange, setTimeRange] = useState((config.time_range as string) || '24h');
  const [showLegend, setShowLegend] = useState(config.show_legend !== false);
  const [legendPosition, setLegendPosition] = useState((config.legend_position as string) || 'bottom');

  const handleMachineChange = (v: string) => {
    setMachineId(v);
    setSelectedMetrics([]);
    setMetricStyles({});
  };

  const handleMetricsChange = (metrics: string[]) => {
    const newStyles = { ...metricStyles };
    for (const m of metrics) {
      if (!newStyles[m]) {
        const usedColors = Object.values(newStyles).map((s) => s.color);
        const nextColor = COLOR_PRESETS.find((c) => !usedColors.includes(c)) || COLOR_PRESETS[0];
        newStyles[m] = { color: nextColor, style: 'solid' };
      }
    }
    setMetricStyles(newStyles);
    setSelectedMetrics(metrics);
  };

  const updateStyle = (metric: string, key: keyof MetricStyle, value: string) => {
    setMetricStyles((prev) => ({
      ...prev,
      [metric]: { ...prev[metric], [key]: value },
    }));
  };

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
        machineId={machineId} onMachineChange={handleMachineChange}
        metrics={selectedMetrics} onMetricsChange={handleMetricsChange}
        multi
      />

      <ConfigSection label="Time Range" />
      <TimeRangePicker value={timeRange} onChange={setTimeRange} />

      {selectedMetrics.length > 0 && (
        <>
          <ConfigSection label="Metric Style" />
          <div className="space-y-3 rounded-md border p-3">
            {selectedMetrics.map((metric) => {
              const ms = metricStyles[metric] || { color: COLOR_PRESETS[0], style: 'solid' };
              return (
                <div key={metric} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full border" style={{ backgroundColor: ms.color }} />
                    <span className="text-sm font-medium">{metric}</span>
                  </div>
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
        </>
      )}

      <LegendFields
        showLegend={showLegend} onShowLegendChange={setShowLegend}
        legendPosition={legendPosition} onLegendPositionChange={setLegendPosition}
      />

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() =>
            onSave({
              ...config,
              title, title_color: titleColor, show_countdown: showCountdown,
              widget_style: widgetStyle, accent_color: accentColor,
              machine_id: machineId, metrics: selectedMetrics,
              metric_styles: metricStyles, time_range: timeRange,
              show_legend: showLegend, legend_position: legendPosition,
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
