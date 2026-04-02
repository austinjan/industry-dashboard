import { useQueries } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
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

export function PieChartWidget({ config }: { config: Record<string, unknown> }) {
  const dataSources = (config.data_sources as DataSource[]) || [];

  // Fetch latest value for each data source
  const queries = useQueries({
    queries: dataSources.map((ds) => ({
      queryKey: ['datapoints-latest', ds.machine_id, ds.metric],
      queryFn: async () => {
        const res = await apiFetch(`/machines/${ds.machine_id}/latest`);
        if (!res.ok) return { ds, value: 0 };
        const data = await res.json();
        return { ds, value: (data as Record<string, number>)[ds.metric] ?? 0 };
      },
      enabled: !!ds.machine_id && !!ds.metric,
      refetchInterval: 30000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const legendDisplay = config.legend_display as LegendDisplay | undefined;
  const chartData = queries
    .filter((q) => q.data && q.data.value !== 0)
    .map((q) => {
      const { ds, value } = q.data!;
      return { name: buildLegendLabel(ds, legendDisplay), value, color: ds.color || DEFAULT_COLORS[0] };
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
            <RechartsPieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius="70%"
                dataKey="value"
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                fontSize={10}
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} />
            </RechartsPieChart>
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
