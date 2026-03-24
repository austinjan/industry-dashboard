import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkers, useSendWorkerCommand } from '@/lib/hooks';
import { WorkerDetail } from './WorkerDetail';
import { CommandConfirmDialog } from './CommandConfirmDialog';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function heartbeatAge(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
}

export function WorkerTable() {
  const { t } = useTranslation();
  const { data: workers, isLoading } = useWorkers();
  const sendCommand = useSendWorkerCommand();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    open: boolean;
    workerId: string;
    workerName: string;
    command: 'stop' | 'restart';
  } | null>(null);

  const handleCommandClick = (workerId: string, workerName: string, command: 'stop' | 'restart') => {
    setDialog({ open: true, workerId, workerName, command });
  };

  const handleConfirm = () => {
    if (!dialog) return;
    sendCommand.mutate(
      { workerId: dialog.workerId, command: dialog.command },
      { onSettled: () => setDialog(null) }
    );
  };

  const handleClose = () => setDialog(null);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold">{t('admin.workersMgmt')}</h2>
        <p className="text-sm text-muted-foreground">{t('admin.autoRefresh')}</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.name')}</TableHead>
              <TableHead>{t('admin.status')}</TableHead>
              <TableHead>{t('admin.hostnameLabel')} / {t('admin.ipAddressLabel')}</TableHead>
              <TableHead>{t('admin.machineCount')}</TableHead>
              <TableHead>{t('admin.lastHeartbeat')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-400">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (!workers || workers.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-400">
                  {t('admin.noWorkers')}
                </TableCell>
              </TableRow>
            )}
            {workers?.map((w: any) => {
              const isExpanded = expandedId === w.id;
              const isOnline = w.status === 'online';
              const hbAge = w.heartbeat_at ? heartbeatAge(w.heartbeat_at) : null;
              const hbStale = hbAge !== null && hbAge > 60;

              return (
                <>
                  <TableRow key={w.id} className="cursor-pointer hover:bg-slate-50/5">
                    <TableCell>
                      <button
                        className={`flex items-center gap-1.5 font-medium hover:underline ${isExpanded ? 'text-blue-400' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : w.id)}
                      >
                        <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
                        {w.name}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          isOnline
                            ? 'bg-green-500/20 text-green-500 border-0'
                            : 'bg-slate-500/20 text-slate-400 border-0'
                        }
                      >
                        {isOnline ? t('admin.onlineStatus') : t('admin.offlineStatus')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-400">
                      {w.hostname} / {w.ip_address}
                    </TableCell>
                    <TableCell>{w.machine_count ?? 0}</TableCell>
                    <TableCell>
                      {w.heartbeat_at ? (
                        <span className={hbStale ? 'text-red-400' : ''}>
                          {timeAgo(w.heartbeat_at)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isOnline}
                          className="border-amber-500 text-amber-500 hover:bg-amber-500/10 disabled:opacity-40"
                          onClick={() => handleCommandClick(w.id, w.name, 'restart')}
                        >
                          {t('admin.restartWorker')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isOnline}
                          className="border-red-500 text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                          onClick={() => handleCommandClick(w.id, w.name, 'stop')}
                        >
                          {t('admin.stopWorker')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${w.id}-detail`}>
                      <TableCell colSpan={6} className="p-0">
                        <WorkerDetail workerId={w.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {dialog && (
        <CommandConfirmDialog
          open={dialog.open}
          onClose={handleClose}
          onConfirm={handleConfirm}
          workerName={dialog.workerName}
          command={dialog.command}
          loading={sendCommand.isPending}
        />
      )}
    </div>
  );
}
