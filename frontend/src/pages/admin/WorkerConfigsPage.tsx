import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, PencilIcon, TrashIcon, PlusIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkerConfigs, useDeleteWorkerConfig, useDownloadWorkerConfigYAML } from '@/lib/hooks';
import { DeleteDialog } from '@/components/admin/DeleteDialog';

export function WorkerConfigsPage() {
  const { t } = useTranslation();
  const { data: configs, isLoading } = useWorkerConfigs();
  const deleteConfig = useDeleteWorkerConfig();
  const downloadYAML = useDownloadWorkerConfigYAML();

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  function workerStatusBadge(status: string | undefined) {
    if (status === 'online') {
      return <Badge className="bg-green-500/20 text-green-500">{t('admin.onlineStatus')}</Badge>;
    }
    if (status === 'offline') {
      return <Badge variant="secondary">{t('admin.offlineStatus')}</Badge>;
    }
    return <span className="text-muted-foreground text-xs">{t('admin.notDeployed')}</span>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('admin.workerConfigs')}</h2>
        <Link to="/admin/worker-configs/new" className={buttonVariants({ size: 'sm' })}>
          <PlusIcon className="mr-1 h-4 w-4" />
          {t('admin.addWorkerConfig')}
        </Link>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.name')}</TableHead>
              <TableHead>{t('admin.site')}</TableHead>
              <TableHead>{t('admin.machineCount')}</TableHead>
              <TableHead>{t('admin.pollInterval')}</TableHead>
              <TableHead>{t('admin.status')}</TableHead>
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
            {!isLoading && (!configs || configs.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t('admin.noWorkerConfigs')}
                </TableCell>
              </TableRow>
            )}
            {configs?.map((cfg: any) => (
              <TableRow key={cfg.id}>
                <TableCell className="font-medium">{cfg.name}</TableCell>
                <TableCell className="text-slate-500">{cfg.site_name ?? cfg.site_id}</TableCell>
                <TableCell>{cfg.machine_count ?? (cfg.machines?.length ?? 0)}</TableCell>
                <TableCell>{cfg.poll_interval}</TableCell>
                <TableCell>{workerStatusBadge(cfg.worker_status)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/admin/worker-configs/${cfg.id}`}
                      className={buttonVariants({ size: 'sm', variant: 'outline' })}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadYAML.mutate(cfg.id)}
                      disabled={downloadYAML.isPending}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget({ id: cfg.id, name: cfg.name })}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteConfig.mutate(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
            });
          }
        }}
        name={deleteTarget?.name ?? ''}
        loading={deleteConfig.isPending}
        confirmLabel={t('admin.deleteWorkerConfig')}
      />
    </div>
  );
}
