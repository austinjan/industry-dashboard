import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSite } from '@/lib/site-context';
import { useAlertEvents, useAcknowledgeAlert, useAcknowledgeAllInfo, useSiteLines, useSiteMachines } from '@/lib/hooks';

const PAGE_SIZE = 20;

export function AlertsPage() {
  const { t } = useTranslation();
  const { currentSite } = useSite();

  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [lineId, setLineId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [sortBy, setSortBy] = useState('triggered_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

  const { data: lines } = useSiteLines(currentSite?.id);
  const { data: machines } = useSiteMachines(currentSite?.id);

  // Build query params
  const params: Record<string, string> = {
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    sort_by: sortBy,
    sort_order: sortOrder,
  };
  if (severity) params.severity = severity;
  if (status) params.status = status;
  if (lineId) params.line_id = lineId;
  if (machineId) params.machine_id = machineId;

  const { data, isLoading } = useAlertEvents(currentSite?.id, params);
  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const acknowledge = useAcknowledgeAlert();
  const ackAllInfo = useAcknowledgeAllInfo();

  const unresolvedInfoCount = (Array.isArray(events) ? events : []).filter(
    (e: any) => e.severity === 'info' && !e.resolved_at && !e.acknowledged_by
  ).length ?? 0;

  // Filter machines by selected line
  const filteredMachines = lineId
    ? machines?.filter((m: any) => m.line_id === lineId)
    : machines;

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder(col === 'triggered_at' ? 'desc' : 'asc');
    }
    setPage(0);
  };

  const handleFilterChange = (setter: (v: string) => void) => (v: string | null) => {
    setter(v ?? '');
    setPage(0);
  };

  const sortIcon = (col: string) => {
    if (sortBy !== col) return ' ↕';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

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

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={severity} onValueChange={handleFilterChange(setSeverity)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder={t('alerts.allSeverities')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alerts.all')}</SelectItem>
            <SelectItem value="critical">{t('alerts.critical')}</SelectItem>
            <SelectItem value="warning">{t('alerts.warning')}</SelectItem>
            <SelectItem value="info">{t('alerts.info')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={handleFilterChange(setStatus)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder={t('alerts.allStatus')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alerts.allStatus')}</SelectItem>
            <SelectItem value="open">{t('alerts.open')}</SelectItem>
            <SelectItem value="acknowledged">{t('alerts.acknowledged')}</SelectItem>
            <SelectItem value="resolved">{t('alerts.resolved')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={lineId} onValueChange={(v) => { handleFilterChange(setLineId)(v); setMachineId(''); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('alerts.allLines')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alerts.allLines')}</SelectItem>
            {lines?.map((l: any) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={machineId} onValueChange={handleFilterChange(setMachineId)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('alerts.allMachines')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alerts.allMachines')}</SelectItem>
            {filteredMachines?.map((m: any) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
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

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('severity')}>
                {t('alerts.severity')}{sortIcon('severity')}
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('alert_name')}>
                {t('alerts.alert')}{sortIcon('alert_name')}
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('line_name')}>
                {t('alerts.line')}{sortIcon('line_name')}
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('machine_name')}>
                {t('alerts.machine')}{sortIcon('machine_name')}
              </TableHead>
              <TableHead>{t('alerts.reading')}</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('triggered_at')}>
                {t('alerts.triggered')}{sortIcon('triggered_at')}
              </TableHead>
              <TableHead>{t('alerts.status')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center text-slate-400">{t('common.loading')}</TableCell></TableRow>
            )}
            {!isLoading && (Array.isArray(events) ? events : []).length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-slate-400">{t('alerts.noAlerts')}</TableCell></TableRow>
            )}
            {(Array.isArray(events) ? events : []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{severityBadge(e.severity)}</TableCell>
                <TableCell className="font-medium">{e.alert_name}</TableCell>
                <TableCell className="text-sm">{e.line_name}</TableCell>
                <TableCell className="text-sm">{e.machine_name}</TableCell>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('alerts.page', { page: page + 1, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              {t('alerts.prev')}
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              {t('alerts.next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
