import type { FC } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StatusCardConfig } from './StatusCardConfig';
import { LineChartConfig } from './LineChartConfig';
import { BarChartConfig } from './BarChartConfig';
import { AlertListConfig } from './AlertListConfig';
import { MachineStatusConfig } from './MachineStatusConfig';
import { TextConfig } from './TextConfig';

interface ConfigFormProps {
  config: Record<string, unknown>;
  onSave: (c: Record<string, unknown>) => void;
  onCancel: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  widgetType: string;
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
}

const CONFIG_FORMS: Record<string, FC<ConfigFormProps>> = {
  status_card: StatusCardConfig,
  gauge: StatusCardConfig, // Same fields as status card (machine + metric)
  line_chart: LineChartConfig,
  bar_chart: BarChartConfig,
  pie_chart: BarChartConfig, // Similar fields
  data_table: MachineStatusConfig, // Uses line picker
  alert_list: AlertListConfig,
  machine_status: MachineStatusConfig,
  text_markdown: TextConfig,
};

const WIDGET_HINTS: Record<string, { color: string; bg: string; text: string }> = {
  status_card: { color: '#3b82f6', bg: '#eff6ff', text: 'Displays a single metric value. Select a machine and metric to monitor.' },
  gauge: { color: '#3b82f6', bg: '#eff6ff', text: 'Radial gauge showing a value relative to min/max range.' },
  line_chart: { color: '#3b82f6', bg: '#eff6ff', text: 'Time-series trend chart. Select a machine and metrics to plot over time.' },
  bar_chart: { color: '#3b82f6', bg: '#eff6ff', text: 'Compare values across machines or production lines.' },
  pie_chart: { color: '#3b82f6', bg: '#eff6ff', text: 'Proportional breakdown of values.' },
  data_table: { color: '#22c55e', bg: '#f0fdf4', text: 'Tabular view of machines in a production line.' },
  alert_list: { color: '#f59e0b', bg: '#fffbeb', text: 'Recent alert events. Filter by severity and limit count.' },
  machine_status: { color: '#22c55e', bg: '#f0fdf4', text: 'Grid overview of machine statuses in a production line.' },
  text_markdown: { color: '#8b5cf6', bg: '#f5f3ff', text: 'Static text block. Supports Markdown for formatting.' },
};

export function WidgetConfigSheet({ open, onClose, widgetType, config, onSave }: Props) {
  const FormComponent = CONFIG_FORMS[widgetType];
  const hint = WIDGET_HINTS[widgetType];
  const typeName = widgetType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-[340px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{typeName}</SheetTitle>
        </SheetHeader>
        {hint && (
          <div className="my-3 rounded-md p-3 text-xs" style={{ background: hint.bg, color: hint.color }}>
            {hint.text}
          </div>
        )}
        {FormComponent ? (
          <FormComponent config={config} onSave={onSave} onCancel={onClose} />
        ) : (
          <p className="text-sm text-slate-400">No configuration available.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
