import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TitleField, ShowCountdownField } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function TextConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [content, setContent] = useState((config.content as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);

  return (
    <div className="space-y-4">
      <TitleField value={title} onChange={setTitle} />
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Content (Markdown)</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder={'## Heading\n\nYour notes here...'}
          className="font-mono text-xs"
        />
        <p className="text-xs text-slate-400">Supports **bold**, *italic*, lists, headings</p>
      </div>
      <ShowCountdownField value={showCountdown} onChange={setShowCountdown} />
      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave({ ...config, title, content, show_countdown: showCountdown })} className="flex-1">
          Apply
        </Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}
