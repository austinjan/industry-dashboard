import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  HeaderFields,
  StyleFields,
  DataSourceList,
  ConfigSection,
} from './CommonFields';
import type { DataSource } from './CommonFields';

type Animation = 'none' | 'blink' | 'marquee' | 'warning';

interface ValueMapping {
  id: string;
  value: string;      // numeric value or range like "0" or ">100"
  text: string;        // display text
  color: string;       // text color
  animation: Animation;
}

const ANIMATION_OPTIONS: { value: Animation; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'blink', label: 'Blink (閃爍)' },
  { value: 'marquee', label: 'Marquee (走馬燈)' },
  { value: 'warning', label: 'Warning (警告)' },
];

const FONT_SIZES = ['sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];

const PRESET_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#94a3b8'];

function newMapping(): ValueMapping {
  return { id: crypto.randomUUID(), value: '', text: '', color: '#22c55e', animation: 'none' };
}

interface Props {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function IndicatorConfig({ config, onSave, onCancel }: Props) {
  const [title, setTitle] = useState((config.title as string) || '');
  const [titleColor, setTitleColor] = useState((config.title_color as string) || '');
  const [showCountdown, setShowCountdown] = useState(config.show_countdown !== false);
  const [widgetStyle, setWidgetStyle] = useState((config.widget_style as string) || 'default');
  const [accentColor, setAccentColor] = useState((config.accent_color as string) || '#3b82f6');
  const [dataSources, setDataSources] = useState<DataSource[]>(
    (config.data_sources as DataSource[]) || []
  );
  const [mappings, setMappings] = useState<ValueMapping[]>(
    (config.mappings as ValueMapping[]) || [newMapping()]
  );
  const [defaultText, setDefaultText] = useState((config.default_text as string) || 'N/A');
  const [defaultColor, setDefaultColor] = useState((config.default_color as string) || '#94a3b8');
  const [defaultAnimation, setDefaultAnimation] = useState<Animation>(
    (config.default_animation as Animation) || 'none'
  );
  const [fontSize, setFontSize] = useState((config.font_size as string) || '3xl');
  const [fontWeight, setFontWeight] = useState((config.font_weight as string) || 'bold');

  const updateMapping = (index: number, updated: ValueMapping) => {
    const next = [...mappings];
    next[index] = updated;
    setMappings(next);
  };

  const removeMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

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
        mode="single"
        dataSources={dataSources}
        onChange={setDataSources}
      />

      <ConfigSection label="Font" />
      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <Label className="text-xs uppercase text-slate-500">Size</Label>
          <div className="flex flex-wrap gap-1">
            {FONT_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setFontSize(s)}
                className={`rounded px-2 py-0.5 text-xs ${
                  fontSize === s ? 'bg-slate-800 text-white' : 'border bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase text-slate-500">Weight</Label>
          <div className="flex gap-1">
            {(['normal', 'bold'] as const).map((w) => (
              <button
                key={w}
                onClick={() => setFontWeight(w)}
                className={`rounded px-2 py-0.5 text-xs capitalize ${
                  fontWeight === w ? 'bg-slate-800 text-white' : 'border bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ConfigSection label="Value Mappings" />
      <div className="space-y-2">
        {mappings.map((m, i) => (
          <div key={m.id} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Rule #{i + 1}</span>
              {mappings.length > 1 && (
                <button onClick={() => removeMapping(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              )}
            </div>
            <div className="flex gap-2">
              <div className="w-24 space-y-1">
                <Label className="text-xs uppercase text-slate-500">Value</Label>
                <Input
                  value={m.value}
                  onChange={(e) => updateMapping(i, { ...m, value: e.target.value })}
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs uppercase text-slate-500">Display Text</Label>
                <Input
                  value={m.text}
                  onChange={(e) => updateMapping(i, { ...m, text: e.target.value })}
                  placeholder="Disabled"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs uppercase text-slate-500">Color</Label>
                <div className="flex items-center gap-0.5">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => updateMapping(i, { ...m, color })}
                      className="h-5 w-5 rounded border-2 transition-transform hover:scale-110"
                      style={{ backgroundColor: color, borderColor: m.color === color ? '#1e293b' : 'transparent' }}
                    />
                  ))}
                  <input
                    type="color"
                    value={m.color}
                    onChange={(e) => updateMapping(i, { ...m, color: e.target.value })}
                    className="ml-0.5 h-5 w-5 cursor-pointer rounded border-0 p-0"
                  />
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs uppercase text-slate-500">Animation</Label>
                <select
                  value={m.animation}
                  onChange={(e) => updateMapping(i, { ...m, animation: e.target.value as Animation })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {ANIMATION_OPTIONS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={() => setMappings([...mappings, newMapping()])}
          className="w-full rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-slate-50"
        >
          + Add Mapping
        </button>
      </div>

      <ConfigSection label="Default (no match)" />
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs uppercase text-slate-500">Text</Label>
          <Input value={defaultText} onChange={(e) => setDefaultText(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase text-slate-500">Color</Label>
          <div className="flex items-center gap-0.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setDefaultColor(color)}
                className="h-5 w-5 rounded border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: color, borderColor: defaultColor === color ? '#1e293b' : 'transparent' }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs uppercase text-slate-500">Default Animation</Label>
        <select
          value={defaultAnimation}
          onChange={(e) => setDefaultAnimation(e.target.value as Animation)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          {ANIMATION_OPTIONS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() =>
            onSave({
              ...config,
              title, title_color: titleColor, show_countdown: showCountdown,
              widget_style: widgetStyle, accent_color: accentColor,
              data_sources: dataSources,
              mappings, default_text: defaultText,
              default_color: defaultColor, default_animation: defaultAnimation,
              font_size: fontSize, font_weight: fontWeight,
            })
          }
          className="flex-1"
          disabled={validSources.length === 0}
        >
          Apply
        </Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}
