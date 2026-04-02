import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import './indicator-animations.css';

type Animation = 'none' | 'blink' | 'marquee' | 'warning';

interface DataSource {
  machine_id: string;
  metric: string;
}

interface ValueMapping {
  value: string;
  text: string;
  color: string;
  animation: Animation;
}

const FONT_SIZE_CLASS: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
  '5xl': 'text-5xl',
};

const ANIMATION_CLASS: Record<Animation, string> = {
  none: '',
  blink: 'indicator-blink',
  marquee: 'indicator-marquee',
  warning: 'indicator-warning',
};

function matchMapping(value: number | undefined, mappings: ValueMapping[]): ValueMapping | null {
  if (value === undefined || value === null) return null;
  for (const m of mappings) {
    const v = m.value.trim();
    // Exact match
    if (v === String(value)) return m;
    // Comparison operators
    if (v.startsWith('>=') && value >= Number(v.slice(2))) return m;
    if (v.startsWith('<=') && value <= Number(v.slice(2))) return m;
    if (v.startsWith('>') && value > Number(v.slice(1))) return m;
    if (v.startsWith('<') && value < Number(v.slice(1))) return m;
    // Range: "10-20"
    const rangeMatch = v.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]);
      const hi = Number(rangeMatch[2]);
      if (value >= lo && value <= hi) return m;
    }
  }
  return null;
}

export function IndicatorWidget({ config }: { config: Record<string, unknown> }) {
  const dataSources = (config.data_sources as DataSource[]) || [];
  const ds = dataSources[0];
  const mappings = (config.mappings as ValueMapping[]) || [];
  const defaultText = (config.default_text as string) || 'N/A';
  const defaultColor = (config.default_color as string) || '#94a3b8';
  const defaultAnimation = (config.default_animation as Animation) || 'none';
  const fontSize = (config.font_size as string) || '3xl';
  const fontWeight = (config.font_weight as string) || 'bold';

  const { data: latest, isLoading } = useQuery({
    queryKey: ['machine-latest', ds?.machine_id],
    queryFn: async () => {
      const res = await apiFetch(`/machines/${ds.machine_id}/latest`);
      if (!res.ok) return {};
      return res.json() as Promise<Record<string, number>>;
    },
    enabled: !!ds?.machine_id,
    refetchInterval: 5000,
  });

  const rawValue = ds?.metric ? latest?.[ds.metric] : undefined;
  const matched = matchMapping(rawValue, mappings);

  const displayText = matched?.text || defaultText;
  const displayColor = matched?.color || defaultColor;
  const animation = matched?.animation || defaultAnimation;

  const sizeClass = FONT_SIZE_CLASS[fontSize] || 'text-3xl';
  const weightClass = fontWeight === 'bold' ? 'font-bold' : 'font-normal';
  const animClass = ANIMATION_CLASS[animation];

  if (!ds?.machine_id || !ds?.metric) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-slate-400">Configure data source to display indicator.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center overflow-hidden">
      <div
        className={`${sizeClass} ${weightClass} ${animClass} whitespace-nowrap`}
        style={{ color: displayColor }}
        title={rawValue !== undefined ? `Raw: ${rawValue}` : undefined}
      >
        {displayText}
      </div>
    </div>
  );
}
