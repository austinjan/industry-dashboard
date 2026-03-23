import { Badge } from '@/components/ui/badge';
import { useAlertEvents } from '@/lib/hooks';
import { useSite } from '@/lib/site-context';

export function AlertListWidget({ config }: { config: Record<string, unknown> }) {
  const { currentSite } = useSite();
  const limit = config.limit as number | undefined;
  const { data: events } = useAlertEvents(currentSite?.id, { limit: String(limit || 5) });
  return (
    <div className="h-full overflow-auto">
      <p className="mb-1 text-xs text-slate-500">{(config.title as string) || 'Alerts'}</p>
      {events?.map((e: { id: string; severity: string; machine_name: string; alert_name: string }) => (
        <div key={e.id} className="border-b py-1 text-xs">
          <Badge
            variant={e.severity === 'critical' ? 'destructive' : 'secondary'}
            className="mr-1 text-xs"
          >
            {e.severity}
          </Badge>
          {e.machine_name} — {e.alert_name}
        </div>
      ))}
      {(!events || events.length === 0) && (
        <p className="py-2 text-xs text-slate-400">No alerts</p>
      )}
    </div>
  );
}
