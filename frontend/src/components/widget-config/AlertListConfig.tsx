import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TitleField, LimitField, ShowCountdownField } from './CommonFields';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function AlertListConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [limit, setLimit] = useState((config.limit as number) || 10);
  const [severities, setSeverities] = useState<string[]>(
    (config.severity as string[]) || ['critical', 'warning'],
  );
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);

  const toggleSeverity = (s: string) => {
    setSeverities((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <div className="space-y-4">
      <TitleField value={title} onChange={setTitle} />
      <div className="space-y-2">
        <Label className="text-xs uppercase text-slate-500">Severity Filter</Label>
        {['critical', 'warning', 'info'].map((s) => (
          <label key={s} className="flex items-center gap-2 text-sm">
            <Checkbox checked={severities.includes(s)} onCheckedChange={() => toggleSeverity(s)} />
            <span className="capitalize">{s}</span>
          </label>
        ))}
      </div>
      <LimitField value={limit} onChange={setLimit} />
      <ShowCountdownField value={showCountdown} onChange={setShowCountdown} />
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({ ...config, title, severity: severities, limit, show_countdown: showCountdown })}
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
