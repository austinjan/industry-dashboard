import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HeaderFields, StyleFields, DataSourceMachine, ConfigSection } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function StatusCardConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [machineId, setMachineId] = useState((config.machine_id as string) || '');
  const [metric, setMetric] = useState((config.metric as string) || '');
  const [unit, setUnit] = useState((config.unit as string) || '');

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
        machineId={machineId} onMachineChange={setMachineId}
        metrics={metric ? [metric] : []}
        onMetricsChange={(v) => setMetric(v[0] || '')}
      />
      <ConfigSection label="Display" />
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Unit</Label>
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="°C, rpm, kW..." className="w-32" />
        <p className="text-xs text-slate-400">Display unit after the value</p>
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({
            ...config, title, title_color: titleColor, show_countdown: showCountdown,
            widget_style: widgetStyle, accent_color: accentColor,
            machine_id: machineId, metric, unit,
          })}
          className="flex-1"
        >Apply</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}
