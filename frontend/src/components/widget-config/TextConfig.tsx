import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { HeaderFields, StyleFields, ConfigSection } from './CommonFields';

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function TextConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [content, setContent] = useState((config.content as string) || '');

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
      <ConfigSection label="Content" />
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
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onSave({
            ...config, title, title_color: titleColor, show_countdown: showCountdown,
            widget_style: widgetStyle, accent_color: accentColor, content,
          })}
          className="flex-1"
        >Apply</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}
