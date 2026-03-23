import { useDataPoints } from '@/lib/hooks';
import { LineChart } from '@/components/charts/LineChart';

export function LineChartWidget({ config }: { config: Record<string, unknown> }) {
  const metrics = config.metrics as string[] | undefined;
  const metric = metrics?.[0] || (config.metric as string) || '';
  const machineId = config.machine_id as string | undefined;
  const { data } = useDataPoints(machineId, metric, (config.time_range as string) || '24h');
  return (
    <div className="h-full">
      <p className="mb-1 text-xs text-slate-500">{(config.title as string) || 'Line Chart'}</p>
      {data && data.length > 0 ? (
        <LineChart data={data} yLabel={metric} />
      ) : (
        <p className="py-4 text-center text-xs text-slate-400">No data</p>
      )}
    </div>
  );
}
