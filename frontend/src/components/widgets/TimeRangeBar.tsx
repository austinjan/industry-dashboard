const OPTIONS = ['1h', '6h', '24h', '7d', '30d'];

interface TimeRangeBarProps {
  value: string;
  onChange: (range: string) => void;
}

export function TimeRangeBar({ value, onChange }: TimeRangeBarProps) {
  return (
    <div className="flex gap-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded px-2 py-0.5 text-[10px] ${
            value === o
              ? 'bg-slate-700 text-white'
              : 'text-muted-foreground hover:bg-slate-100'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
