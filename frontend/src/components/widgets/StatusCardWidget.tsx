import { useLatestValues } from '@/lib/hooks';

export function StatusCardWidget({ config }: { config: Record<string, unknown> }) {
  const machineId = config.machine_id as string | undefined;
  const metric = config.metric as string | undefined;
  const { data: latest } = useLatestValues(machineId);
  const value = metric ? latest?.[metric] : undefined;
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="text-2xl font-bold">
        {value !== undefined ? `${value.toFixed(1)}${(config.unit as string) || ''}` : '--'}
      </p>
    </div>
  );
}
