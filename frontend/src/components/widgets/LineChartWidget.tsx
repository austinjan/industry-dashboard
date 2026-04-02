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
import { buildLegendLabel } from '../widget-config/legend-utils';
import type { LegendDisplay } from '../widget-config/legend-utils';

const DEFAULT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface DataSource {
  id: string;
  machine_id: string;
  metric: string;
  color: string;
  label: string;
}

function resolveDataSources(config: Record<string, unknown>): DataSource[] {
  // New format
  if (Array.isArray(config.data_sources) && config.data_sources.length > 0) {
    return config.data_sources as DataSource[];
  }
  // Legacy format: machine_id + metrics[]
  const machineId = config.machine_id as string | undefined;
  const metrics = (config.metrics as string[]) || [];
  const metricStyles = (config.metric_styles as Record<string, { color: string; style: string }>) || {};
  if (!machineId || metrics.length === 0) return [];
  return metrics.map((metric, i) => ({
    id: `legacy-${i}`,
    machine_id: machineId,
    metric,
    color: metricStyles[metric]?.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    label: metric,
  }));
}

export function LineChartWidget({ config }: { config: Record<string, unknown> }) {
  const dataSources = resolveDataSources(config);
  const configTimeRange = (config.time_range as string) || '24h';
  const [timeRange, setTimeRange] = useState(configTimeRange);

  const queries = useQueries({
    queries: dataSources.map((ds) => ({
      queryKey: ['datapoints', ds.machine_id, ds.metric, timeRange],
      queryFn: async () => {
        const res = await apiFetch(`/datapoints?machine_id=${ds.machine_id}&metric=${ds.metric}&range=${timeRange}`);
        if (!res.ok) return { ds, data: [] };
        const data = await res.json();
        return { ds, data: Array.isArray(data) ? data as { time: string; value: number }[] : [] };
      },
      enabled: !!ds.machine_id && !!ds.metric,
      refetchInterval: 30000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const allData = queries.filter((q) => q.data).map((q) => q.data!);

  // Merge all data sources into a single dataset keyed by time
  // Use ds.id as the dataKey to avoid collisions when same metric from different machines
  const mergedMap = new Map<string, Record<string, number | string>>();
  for (const { ds, data } of allData) {
    for (const point of data) {
      const key = point.time;
      if (!mergedMap.has(key)) mergedMap.set(key, { time: key });
      mergedMap.get(key)![ds.id] = point.value;
    }
  }
  const chartData = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(a.time as string).getTime() - new Date(b.time as string).getTime()
  );

  const legendDisplay = config.legend_display as LegendDisplay | undefined;
  const legendItems = dataSources.map((ds, i) => ({
    label: buildLegendLabel(ds, legendDisplay),
    color: ds.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));
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
              {dataSources.map((ds, i) => {
                const color = ds.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
                return (
                  <Line key={ds.id} type="monotone" dataKey={ds.id} stroke={color} strokeWidth={2} dot={false} name={buildLegendLabel(ds, legendDisplay)} />
                );
              })}
            </RechartsLineChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-4 text-center text-xs text-slate-400">
            {dataSources.length === 0 ? 'Configure data sources to display chart.' : 'No data for this time range.'}
          </p>
        )}
      </div>
      {legendPosition === 'bottom' && <ChartLegend items={legendItems} show={showLegend} position="bottom" />}
    </div>
  );
}
