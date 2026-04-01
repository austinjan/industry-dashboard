import { Badge } from '@/components/ui/badge';
import { useAlertEvents } from '@/lib/hooks';
import { useSite } from '@/lib/site-context';

function relativeTime(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day ago`;
}

export function AlertListWidget({ config }: { config: Record<string, unknown> }) {
  const { currentSite } = useSite();
  const limit = config.limit as number | undefined;
  const { data } = useAlertEvents(currentSite?.id, {
    limit: String(limit || 5),
    sort_by: 'triggered_at',
    sort_order: 'desc',
  });
  const events = data?.events;
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
