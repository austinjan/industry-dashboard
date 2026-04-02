import { useTranslation } from 'react-i18next';
import { RefreshCw, Factory, Bell, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSite } from '@/lib/site-context';
import { useSiteSummary, useSiteLines, useAlertEvents, useLineMachines } from '@/lib/hooks';

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
    row: 'bg-red-50 rounded-md px-3 py-2',
    badge: 'bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0',
    text: 'text-red-800 text-xs truncate flex-1',
    label: 'CRIT',
  },
  warning: {
    row: 'bg-amber-50 rounded-md px-3 py-2',
    badge: 'bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0',
    text: 'text-amber-800 text-xs truncate flex-1',
    label: 'WARN',
  },
  info: {
    row: 'bg-blue-50 rounded-md px-3 py-2',
    badge: 'bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0',
    text: 'text-blue-800 text-xs truncate flex-1',
    label: 'INFO',
  },
};

function LineStatusRow({ line }: { line: { id: string; name: string } }) {
  const { t } = useTranslation();
  const { data: machines } = useLineMachines(line.id);

  const counts = { running: 0, offline: 0, error: 0 };
  if (machines) {
    for (const m of machines) {
      const s = (m as any).status as string;
      if (s in counts) counts[s as keyof typeof counts]++;
    }
  }
  const total = machines?.length ?? 0;

  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5">
      <span className="text-sm font-medium">{line.name}</span>
      <div className="flex items-center gap-4">
        {total > 0 ? (
          <div className="flex items-center gap-3 text-xs">
            {counts.running > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span className="text-green-700">{t('dashboard.running', { count: counts.running })}</span>
              </span>
            )}
            {counts.offline > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                <span className="text-slate-500">{t('dashboard.offline', { count: counts.offline })}</span>
              </span>
            )}
            {counts.error > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                <span className="text-red-700">{t('dashboard.error', { count: counts.error })}</span>
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{t('dashboard.noMachines')}</span>
        )}
        <Link to={`/alerts?line_id=${line.id}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
          <Bell className="h-3 w-3" /> {t('dashboard.viewAlerts')}
        </Link>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { currentSite } = useSite();
  const queryClient = useQueryClient();
  const { data: summary } = useSiteSummary(currentSite?.id);
  const { data: lines } = useSiteLines(currentSite?.id);
  const { data: alertData } = useAlertEvents(currentSite?.id, {
    limit: '5',
    sort_by: 'triggered_at',
    sort_order: 'desc',
  });
  const alertEvents = alertData?.events;

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  if (!currentSite) {
    return <div className="text-muted-foreground">{t('common.selectSite')}</div>;
  }

  const hasAlerts = (summary?.active_alerts ?? 0) > 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('dashboard.overview', { siteName: currentSite.name })}</h2>
        <Button size="sm" variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-1" />
          {t('common.refresh')}
        </Button>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Factory className="h-4 w-4 text-blue-600" />
            <p className="text-sm text-muted-foreground">{t('dashboard.productionLines')}</p>
          </div>
          <p className="text-2xl font-bold text-blue-600">{summary?.total_lines ?? '--'}</p>
          {summary && (
            <p className="text-xs text-slate-500 mt-1">{t('dashboard.machinesTotal', { count: summary.total_machines })}</p>
          )}
        </Card>
        <Link to="/alerts">
          <Card className="p-4 transition-colors hover:bg-slate-50">
            <div className="flex items-center gap-2 mb-2">
              <Bell className={`h-4 w-4 ${hasAlerts ? 'text-red-600' : 'text-muted-foreground'}`} />
              <p className="text-sm text-muted-foreground">{t('dashboard.activeAlerts')}</p>
            </div>
            <p className={`text-2xl font-bold ${hasAlerts ? 'text-red-600' : 'text-muted-foreground'}`}>
              {summary?.active_alerts ?? '--'}
            </p>
            {hasAlerts && (
              <p className="text-xs text-red-500 mt-1">{t('dashboard.requiresAttention')}</p>
            )}
          </Card>
        </Link>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('dashboard.site')}</p>
          </div>
          <p className="text-lg font-semibold">{currentSite.name}</p>
          <p className="text-xs text-muted-foreground mt-1">{currentSite.code} · {currentSite.timezone}</p>
          <Link to="/alerts" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <Bell className="h-3 w-3" /> {t('dashboard.viewAlerts')}
          </Link>
        </Card>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-4">
          <h3 className="mb-3 font-semibold">{t('dashboard.productionLines')}</h3>
          {lines && lines.length > 0 ? (
            <div className="space-y-2">
              {lines.map((line: any) => (
                <LineStatusRow key={line.id} line={line} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('dashboard.noProductionLines')}</p>
          )}
        </Card>
        <Card className="p-4">
          <Link
            to="/alerts"
            className="mb-3 block font-semibold hover:underline underline-offset-2 decoration-muted-foreground"
          >
            {t('dashboard.recentAlerts')} ↗
          </Link>
          {alertEvents && alertEvents.length > 0 ? (
            <div className="space-y-1.5">
              {alertEvents.map((event: any) => {
                const style = severityStyles[event.severity] || severityStyles.info;
                return (
                  <div key={event.id} className={`flex items-center gap-2 ${style.row}`}>
                    <span className={style.badge}>{style.label}</span>
                    <span className={style.text}>{event.machine_name} — {event.alert_name}</span>
                    <span className="text-muted-foreground text-[10px] shrink-0">
                      {relativeTime(event.triggered_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('dashboard.noRecentAlerts')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
