import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSite } from '@/lib/site-context';
import { useAlertEvents, useAcknowledgeAlert, useAcknowledgeAllInfo } from '@/lib/hooks';

export function AlertsPage() {
  const { t } = useTranslation();
  const { currentSite } = useSite();
  const [severity, setSeverity] = useState('');
  const params: Record<string, string> = { limit: '50' };
  if (severity) params.severity = severity;

  const { data: events, isLoading } = useAlertEvents(currentSite?.id, params);
  const acknowledge = useAcknowledgeAlert();
  const ackAllInfo = useAcknowledgeAllInfo();

  // Count unresolved info events
  const unresolvedInfoCount = events?.filter(
    (e: any) => e.severity === 'info' && !e.resolved_at && !e.acknowledged_by
  ).length ?? 0;

  if (!currentSite) return <div className="text-slate-500">{t('alerts.selectSite')}</div>;

  const severityBadge = (s: string) => {
    const label = t(`alerts.${s}` as any, s);
    switch (s) {
      case 'critical': return <Badge variant="destructive">{label}</Badge>;
      case 'warning': return <Badge className="bg-yellow-100 text-yellow-800">{label}</Badge>;
      default: return <Badge variant="secondary">{label}</Badge>;
    }
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{t('alerts.heading', { siteName: currentSite.name })}</h2>
      <div className="mb-4 flex items-center gap-3">
        <Select value={severity} onValueChange={(v) => setSeverity(v ?? '')}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t('alerts.allSeverities')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alerts.all')}</SelectItem>
            <SelectItem value="critical">{t('alerts.critical')}</SelectItem>
            <SelectItem value="warning">{t('alerts.warning')}</SelectItem>
            <SelectItem value="info">{t('alerts.info')}</SelectItem>
          </SelectContent>
        </Select>
        {unresolvedInfoCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.confirm(t('alertEvents.ackAllInfoConfirm', { count: unresolvedInfoCount }))) {
                ackAllInfo.mutate(currentSite!.id);
              }
            }}
            disabled={ackAllInfo.isPending}
          >
            {t('alertEvents.ackAllInfo')}
          </Button>
        )}
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('alerts.severity')}</TableHead>
              <TableHead>{t('alerts.alert')}</TableHead>
              <TableHead>{t('alerts.machine')}</TableHead>
              <TableHead>{t('alerts.reading')}</TableHead>
              <TableHead>{t('alerts.triggered')}</TableHead>
              <TableHead>{t('alerts.status')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-slate-400">{t('common.loading')}</TableCell></TableRow>
            )}
            {events && events.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-slate-400">{t('alerts.noAlerts')}</TableCell></TableRow>
            )}
            {events?.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{severityBadge(e.severity)}</TableCell>
                <TableCell className="font-medium">{e.alert_name}</TableCell>
                <TableCell>{e.machine_name}</TableCell>
                <TableCell>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    {e.triggered_value != null
                      ? e.condition === '==' && (e.threshold === 0 || e.threshold === 1)
                        ? `${e.metric_name} = ${e.triggered_value === 1 ? 'ON' : 'OFF'}`
                        : `${e.triggered_value} ${e.condition} ${e.threshold}`
                      : `${e.metric_name} ${e.condition} ${e.threshold}`}
                  </code>
                </TableCell>
                <TableCell className="text-sm text-slate-500">{new Date(e.triggered_at).toLocaleString()}</TableCell>
                <TableCell>
                  {e.resolved_at ? (
                    <Badge variant="outline" className="text-green-600">{t('alerts.resolved')}</Badge>
                  ) : e.acknowledged_by ? (
                    <Badge variant="outline" className="text-blue-600">{t('alerts.acknowledged')}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-600">{t('alerts.open')}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!e.resolved_at && !e.acknowledged_by && (
                    <Button size="sm" variant="outline" onClick={() => acknowledge.mutate(e.id)} disabled={acknowledge.isPending}>
                      {t('alerts.acknowledge')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
