export function BarChartWidget({ config }: { config: Record<string, unknown> }) {
  return (
    <div className="h-full">
      <p className="mb-1 text-xs text-slate-500">{(config.title as string) || 'Bar Chart'}</p>
      <p className="py-4 text-center text-xs text-slate-400">Configure data source to display chart</p>
    </div>
  );
}
