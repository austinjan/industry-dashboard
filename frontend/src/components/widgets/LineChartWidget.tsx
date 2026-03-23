import { useQueries } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function LineChartWidget({ config }: { config: Record<string, unknown> }) {
  const metrics = (config.metrics as string[]) || [];
  const machineId = config.machine_id as string | undefined;
  const timeRange = (config.time_range as string) || '24h';

  // Fetch data for each metric in parallel
  const queries = useQueries({
    queries: metrics.map((metric) => ({
      queryKey: ['datapoints', machineId, metric, timeRange],
      queryFn: async () => {
        const res = await apiFetch(`/datapoints?machine_id=${machineId}&metric=${metric}&range=${timeRange}`);
        if (!res.ok) return [];
        const data = await res.json();
        return { metric, data: data as { time: string; value: number }[] };
      },
      enabled: !!machineId && !!metric,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const allData = queries
    .filter((q) => q.data)
    .map((q) => q.data as { metric: string; data: { time: string; value: number }[] });

  // Merge all metrics into a single dataset keyed by time
  const mergedMap = new Map<string, Record<string, number | string>>();
  for (const { metric, data } of allData) {
    for (const point of data) {
      const key = point.time;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, { time: key });
      }
      mergedMap.get(key)![metric] = point.value;
    }
  }
  const chartData = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(a.time as string).getTime() - new Date(b.time as string).getTime()
  );

  return (
    <div className="h-full">
      <p className="mb-1 text-xs text-slate-500">{(config.title as string) || 'Line Chart'}</p>
      {isLoading ? (
        <p className="py-4 text-center text-xs text-slate-400">Loading...</p>
      ) : chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height="85%">
          <RechartsLineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="time"
              tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              fontSize={10}
              stroke="#94a3b8"
            />
            <YAxis fontSize={10} stroke="#94a3b8" />
            <Tooltip
              labelFormatter={(v) => new Date(v as string).toLocaleString()}
              contentStyle={{ fontSize: 11 }}
            />
            {metrics.length > 1 && <Legend fontSize={10} />}
            {metrics.map((metric, i) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                name={metric}
              />
            ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      ) : (
        <p className="py-4 text-center text-xs text-slate-400">
          {metrics.length === 0 ? 'Configure metrics to display chart.' : 'No data for this time range.'}
        </p>
      )}
    </div>
  );
}
