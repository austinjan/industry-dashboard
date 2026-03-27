import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSite } from '@/lib/site-context';
import { useSiteSummary, useSiteLines, useAlertEvents } from '@/lib/hooks';

export function DashboardPage() {
  const { t } = useTranslation();
  const { currentSite } = useSite();
  const queryClient = useQueryClient();
  const { data: summary } = useSiteSummary(currentSite?.id);
  const { data: lines } = useSiteLines(currentSite?.id);
  const { data: alertData } = useAlertEvents(currentSite?.id, { limit: '5' });
  const alertEvents = alertData?.events;

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  if (!currentSite) {
    return <div className="text-slate-500">{t('common.selectSite')}</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('dashboard.overview', { siteName: currentSite.name })}</h2>
        <Button size="sm" variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-1" />
          {t('common.refresh')}
        </Button>
      </div>
      <div className="mb-6 grid grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">{t('dashboard.machinesOnline')}</p>
          <p className="text-2xl font-bold text-green-600">
            {summary ? `${summary.online_machines}/${summary.total_machines}` : '--'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">{t('dashboard.productionLines')}</p>
          <p className="text-2xl font-bold text-blue-600">{summary?.total_lines ?? '--'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">{t('dashboard.activeAlerts')}</p>
          <p className="text-2xl font-bold text-red-600">{summary?.active_alerts ?? '--'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">{t('dashboard.site')}</p>
          <p className="text-lg font-semibold">{currentSite.code}</p>
          <p className="text-xs text-slate-400">{currentSite.timezone}</p>
        </Card>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-4">
          <h3 className="mb-3 font-semibold">{t('dashboard.productionLines')}</h3>
          {lines && lines.length > 0 ? (
            <div className="space-y-2">
              {lines.map((line: any) => (
                <div key={line.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium">{line.name}</span>
                  <Badge variant="outline">Order: {line.display_order}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t('dashboard.noProductionLines')}</p>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 font-semibold">{t('dashboard.recentAlerts')}</h3>
          {alertEvents && alertEvents.length > 0 ? (
            <div className="space-y-2">
              {alertEvents.map((event: any) => (
                <div key={event.id} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant={event.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                      {event.severity}
                    </Badge>
                    <span className="font-medium">{event.machine_name}</span>
                  </div>
                  <p className="mt-1 text-slate-500">{event.alert_name}</p>
                  <p className="text-slate-400">{new Date(event.triggered_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t('dashboard.noRecentAlerts')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
