import { useState } from 'react';
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
} from 'recharts';
import { ChartLegend } from './ChartLegend';
import { TimeRangeBar } from './TimeRangeBar';

const DEFAULT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const STYLE_TO_DASHARRAY: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '8 4',
  dotted: '2 3',
};

interface MetricStyle {
  color: string;
  style: string;
}

export function LineChartWidget({ config }: { config: Record<string, unknown> }) {
  const metrics = (config.metrics as string[]) || [];
  const metricStyles = (config.metric_styles as Record<string, MetricStyle>) || {};
  const machineId = config.machine_id as string | undefined;
  const configTimeRange = (config.time_range as string) || '24h';
  const [timeRange, setTimeRange] = useState(configTimeRange);

  // Fetch data for each metric in parallel
  const queries = useQueries({
    queries: metrics.map((metric) => ({
      queryKey: ['datapoints', machineId, metric, timeRange],
      queryFn: async () => {
        const res = await apiFetch(`/datapoints?machine_id=${machineId}&metric=${metric}&range=${timeRange}`);
        if (!res.ok) return { metric, data: [] };
        const data = await res.json();
        return { metric, data: Array.isArray(data) ? data as { time: string; value: number }[] : [] };
      },
      enabled: !!machineId && !!metric,
      refetchInterval: 30000,
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

  const legendItems = metrics.map((metric: string, i: number) => {
    const ms = metricStyles[metric];
    return {
      label: metric,
      color: ms?.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    };
  });
  const showLegend = config.show_legend !== false;
  const legendPosition = (config.legend_position as string) || 'bottom';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between mb-1">
        <TimeRangeBar value={timeRange} onChange={setTimeRange} />
      </div>
      {legendPosition === 'top' && <ChartLegend items={legendItems} show={showLegend} position="top" />}
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <p className="py-4 text-center text-xs text-slate-400">Loading...</p>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} fontSize={10} stroke="#94a3b8" />
              <YAxis fontSize={10} stroke="#94a3b8" />
              <Tooltip labelFormatter={(v) => new Date(v as string).toLocaleString()} contentStyle={{ fontSize: 11 }} />
              {metrics.map((metric, i) => {
                const ms = metricStyles[metric];
                const color = ms?.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
                const dashArray = STYLE_TO_DASHARRAY[ms?.style || 'solid'];
                return (
                  <Line key={metric} type="monotone" dataKey={metric} stroke={color} strokeWidth={2} strokeDasharray={dashArray} dot={false} name={metric} />
                );
              })}
            </RechartsLineChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-4 text-center text-xs text-slate-400">
            {metrics.length === 0 ? 'Configure metrics to display chart.' : 'No data for this time range.'}
          </p>
        )}
      </div>
      {legendPosition === 'bottom' && <ChartLegend items={legendItems} show={showLegend} position="bottom" />}
    </div>
  );
}
