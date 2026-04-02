import { useQueries } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { ChartLegend } from './ChartLegend';
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

export function BarChartWidget({ config }: { config: Record<string, unknown> }) {
  const dataSources = (config.data_sources as DataSource[]) || [];
  const timeRange = (config.time_range as string) || '24h';

  // Fetch latest value for each data source
  const queries = useQueries({
    queries: dataSources.map((ds) => ({
      queryKey: ['datapoints-latest-avg', ds.machine_id, ds.metric, timeRange],
      queryFn: async () => {
        const res = await apiFetch(`/datapoints?machine_id=${ds.machine_id}&metric=${ds.metric}&range=${timeRange}`);
        if (!res.ok) return { ds, value: 0 };
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return { ds, value: 0 };
        // Use average of all values in range
        const avg = data.reduce((sum: number, p: { value: number }) => sum + p.value, 0) / data.length;
        return { ds, value: Math.round(avg * 100) / 100 };
      },
      enabled: !!ds.machine_id && !!ds.metric,
      refetchInterval: 30000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const legendDisplay = config.legend_display as LegendDisplay | undefined;
  const chartData = queries
    .filter((q) => q.data)
    .map((q) => {
      const { ds, value } = q.data!;
      return { name: buildLegendLabel(ds, legendDisplay), value, fill: ds.color || DEFAULT_COLORS[0] };
    });

  const legendItems = dataSources.map((ds, i) => ({
    label: buildLegendLabel(ds, legendDisplay),
    color: ds.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));
  const showLegend = config.show_legend !== false;
  const legendPosition = (config.legend_position as string) || 'bottom';

  return (
    <div className="flex h-full flex-col">
      {legendPosition === 'top' && <ChartLegend items={legendItems} show={showLegend} position="top" />}
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <p className="py-4 text-center text-xs text-slate-400">Loading...</p>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={10} stroke="#94a3b8" />
              <YAxis fontSize={10} stroke="#94a3b8" />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-4 text-center text-xs text-slate-400">
            {dataSources.length === 0 ? 'Configure data sources to display chart.' : 'No data available.'}
          </p>
        )}
      </div>
      {legendPosition === 'bottom' && <ChartLegend items={legendItems} show={showLegend} position="bottom" />}
    </div>
  );
}
