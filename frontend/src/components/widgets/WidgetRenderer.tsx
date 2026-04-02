import { StatusCardWidget } from './StatusCardWidget';
import { GaugeWidget } from './GaugeWidget';
import { LineChartWidget } from './LineChartWidget';
import { BarChartWidget } from './BarChartWidget';
import { PieChartWidget } from './PieChartWidget';
import { DataTableWidget } from './DataTableWidget';
import { AlertListWidget } from './AlertListWidget';
import { MachineStatusWidget } from './MachineStatusWidget';
import { TextWidget } from './TextWidget';
import { PollingCountdown } from './PollingCountdown';

interface Props {
  widgetType: string;
  config: Record<string, unknown>;
}

const DEFAULT_LABELS: Record<string, string> = {
  status_card: 'Status Card',
  gauge: 'Gauge',
  line_chart: 'Line Chart',
  bar_chart: 'Bar Chart',
  pie_chart: 'Pie Chart',
  data_table: 'Data Table',
  alert_list: 'Alerts',
  machine_status: 'Machine Status',
  text_markdown: 'Text',
};

const WIDGETS: Record<string, React.FC<{ config: Record<string, unknown> }>> = {
  status_card: StatusCardWidget,
  gauge: GaugeWidget,
  line_chart: LineChartWidget,
  bar_chart: BarChartWidget,
  pie_chart: PieChartWidget,
  data_table: DataTableWidget,
  alert_list: AlertListWidget,
  machine_status: MachineStatusWidget,
  text_markdown: TextWidget,
};

export function WidgetRenderer({ widgetType, config }: Props) {
  const Component = WIDGETS[widgetType];
  if (!Component) return <div className="p-2 text-sm text-red-500">Unknown widget: {widgetType}</div>;
  const showCountdown = config.show_countdown !== false;
  const title = (config.title as string) || DEFAULT_LABELS[widgetType] || widgetType;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between shrink-0 mb-1">
        <span className="text-xs font-semibold text-foreground truncate">{title}</span>
        {showCountdown && <PollingCountdown />}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Component config={config} />
      </div>
    </div>
  );
}
