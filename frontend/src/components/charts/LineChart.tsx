import { ResponsiveContainer, LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface Props {
  data: { time: string; value: number }[];
  color?: string;
  yLabel?: string;
}

export function LineChart({ data, color = '#3b82f6', yLabel }: Props) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <RechartsLineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="time" tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} fontSize={11} stroke="#94a3b8" />
        <YAxis fontSize={11} stroke="#94a3b8" label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fontSize: 11 } : undefined} />
        <Tooltip labelFormatter={(v) => new Date(v as string).toLocaleString()} contentStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
