import { useLineMachines } from '@/lib/hooks';

const STATUS_COLOR: Record<string, string> = {
  running: 'bg-green-100 text-green-800',
  offline: 'bg-slate-100 text-slate-600',
  error: 'bg-red-100 text-red-800',
};

export function MachineStatusWidget({ config }: { config: Record<string, unknown> }) {
  const lineId = config.line_id as string | undefined;
  const { data: machines } = useLineMachines(lineId);
  return (
    <div className="h-full overflow-auto">
      <p className="mb-2 text-xs text-slate-500">{(config.title as string) || 'Machine Status'}</p>
      <div className="grid grid-cols-3 gap-2">
        {machines?.map((m: { id: string; name: string; status: string }) => (
          <div
            key={m.id}
            className={`rounded-md p-2 text-center text-xs ${STATUS_COLOR[m.status] || 'bg-slate-50'}`}
          >
            <div className="font-semibold">{m.name}</div>
            <div className="capitalize">{m.status}</div>
          </div>
        ))}
      </div>
      {(!machines || machines.length === 0) && (
        <p className="py-2 text-xs text-slate-400">No machines</p>
      )}
    </div>
  );
}
