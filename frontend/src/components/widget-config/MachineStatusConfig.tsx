import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TitleField, LinePicker } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function MachineStatusConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [lineId, setLineId] = useState((config.line_id as string) || '');

  return (
    <div className="space-y-4">
      <TitleField value={title} onChange={setTitle} />
      <LinePicker value={lineId} onChange={setLineId} />
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({ ...config, title, line_id: lineId })}
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
