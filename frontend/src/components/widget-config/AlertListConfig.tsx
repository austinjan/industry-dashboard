import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { HeaderFields, StyleFields, ConfigSection, LimitField } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function AlertListConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [limit, setLimit] = useState((config.limit as number) || 10);
  const [severities, setSeverities] = useState<string[]>(
    (config.severity as string[]) || ['critical', 'warning'],
  );

  const toggleSeverity = (s: string) => {
    setSeverities((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
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
      <ConfigSection label="Limits" />
      <LimitField value={limit} onChange={setLimit} />
      <ConfigSection label="Filters" />
      <div className="space-y-2">
        <Label className="text-xs uppercase text-slate-500">Severity Filter</Label>
        {['critical', 'warning', 'info'].map((s) => (
          <label key={s} className="flex items-center gap-2 text-sm">
            <Checkbox checked={severities.includes(s)} onCheckedChange={() => toggleSeverity(s)} />
            <span className="capitalize">{s}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({
            ...config, title, title_color: titleColor, show_countdown: showCountdown,
            widget_style: widgetStyle, accent_color: accentColor,
            severity: severities, limit,
          })}
          className="flex-1"
        >Apply</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}
