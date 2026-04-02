interface ChartLegendProps {
  items: { label: string; color: string }[];
  show: boolean;
  position: 'top' | 'bottom';
}

export function ChartLegend({ items, show, position }: ChartLegendProps) {
  if (!show || items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-[10px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
