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

const severityStyles: Record<string, { row: string; badge: string; text: string; label: string }> = {
  critical: {
    row: 'bg-red-50 rounded-md px-3 py-2 mb-1.5',
    badge: 'bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0',
    text: 'text-red-800 text-xs truncate flex-1',
    label: 'CRIT',
  },
  warning: {
    row: 'bg-amber-50 rounded-md px-3 py-2 mb-1.5',
    badge: 'bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0',
    text: 'text-amber-800 text-xs truncate flex-1',
    label: 'WARN',
  },
  info: {
    row: 'bg-blue-50 rounded-md px-3 py-2 mb-1.5',
    badge: 'bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0',
    text: 'text-blue-800 text-xs truncate flex-1',
    label: 'INFO',
  },
};

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
      {events?.map((e: { id: string; severity: string; machine_name: string; alert_name: string; triggered_at: string }) => {
        const style = severityStyles[e.severity] || severityStyles.info;
        return (
          <div key={e.id} className={`flex items-center gap-2 ${style.row}`}>
            <span className={style.badge}>{style.label}</span>
            <span className={style.text}>{e.machine_name} — {e.alert_name}</span>
            <span className="text-muted-foreground text-[10px] shrink-0">{relativeTime(e.triggered_at)}</span>
          </div>
        );
      })}
      {(!events || events.length === 0) && (
        <p className="py-2 text-xs text-muted-foreground text-center">No active alerts</p>
      )}
    </div>
  );
}
