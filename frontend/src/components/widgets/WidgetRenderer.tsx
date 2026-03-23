import { StatusCardWidget } from './StatusCardWidget';
import { GaugeWidget } from './GaugeWidget';
import { LineChartWidget } from './LineChartWidget';
import { BarChartWidget } from './BarChartWidget';
import { PieChartWidget } from './PieChartWidget';
import { DataTableWidget } from './DataTableWidget';
import { AlertListWidget } from './AlertListWidget';
import { MachineStatusWidget } from './MachineStatusWidget';
import { TextWidget } from './TextWidget';

interface Props {
  widgetType: string;
  config: Record<string, unknown>;
}

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
  return <Component config={config} />;
}
