import { useLatestValues } from '@/lib/hooks';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

export function GaugeWidget({ config }: { config: Record<string, unknown> }) {
  const machineId = config.machine_id as string | undefined;
  const metric = config.metric as string | undefined;
  const { data: latest } = useLatestValues(machineId);
  const value = (metric ? latest?.[metric] : undefined) ?? 0;
  const max = (config.max as number) || 100;
  const pct = Math.min((value / max) * 100, 100);
  const fill = pct > 80 ? '#22c55e' : pct > 50 ? '#f59e0b' : '#ef4444';
  const data = [{ value: pct, fill }];
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <ResponsiveContainer width="100%" height={120}>
        <RadialBarChart innerRadius="60%" outerRadius="90%" data={data} startAngle={180} endAngle={0}>
          <RadialBar dataKey="value" background cornerRadius={4} />
        </RadialBarChart>
      </ResponsiveContainer>
      <p className="text-lg font-bold">{value.toFixed(1)}</p>
    </div>
  );
}
