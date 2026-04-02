import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  HeaderFields,
  StyleFields,
  DataSourceList,
  LegendFields,
  ConfigSection,
  TimeRangePicker,
} from './CommonFields';
import type { DataSource } from './CommonFields';
import type { LegendDisplay } from './legend-utils';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

const DEFAULT_LEGEND_DISPLAY: LegendDisplay = { show_site: false, show_line: false, show_machine: true };

export function LineChartConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [dataSources, setDataSources] = useState<DataSource[]>(
    (config.data_sources as DataSource[]) || []
  );
  const [timeRange, setTimeRange] = useState((config.time_range as string) || '24h');
  const [showLegend, setShowLegend] = useState(config.show_legend !== false);
  const [legendPosition, setLegendPosition] = useState((config.legend_position as string) || 'bottom');
  const [legendDisplay, setLegendDisplay] = useState<LegendDisplay>(
    (config.legend_display as LegendDisplay) || DEFAULT_LEGEND_DISPLAY
  );

  const validSources = dataSources.filter((ds) => ds.machine_id && ds.metric);

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
      <DataSourceList
        mode="multiple"
        dataSources={dataSources}
        onChange={setDataSources}
      />
      <ConfigSection label="Time Range" />
      <TimeRangePicker value={timeRange} onChange={setTimeRange} />
      <LegendFields
        showLegend={showLegend} onShowLegendChange={setShowLegend}
        legendPosition={legendPosition} onLegendPositionChange={setLegendPosition}
        legendDisplay={legendDisplay} onLegendDisplayChange={setLegendDisplay}
      />
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() =>
            onSave({
              ...config,
              title, title_color: titleColor, show_countdown: showCountdown,
              widget_style: widgetStyle, accent_color: accentColor,
              data_sources: dataSources, time_range: timeRange,
              show_legend: showLegend, legend_position: legendPosition,
              legend_display: legendDisplay,
              machine_id: undefined, metrics: undefined, metric_styles: undefined,
            })
          }
          className="flex-1"
          disabled={validSources.length === 0}
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
