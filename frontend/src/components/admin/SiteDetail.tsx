import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PencilIcon, TrashIcon, PlusIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSiteDetail, useDeleteSite, useDeleteLine, useDeleteMachine } from '@/lib/hooks';
import { SiteDialog } from './SiteDialog';
import { LineDialog } from './LineDialog';
import { MachineDialog } from './MachineDialog';
import { DeleteDialog } from './DeleteDialog';

interface SiteDetailProps {
  siteId: string;
  onSiteDeleted?: () => void;
}

type DeleteTarget =
  | { type: 'site'; id: string; name: string }
  | { type: 'line'; id: string; name: string }
  | { type: 'machine'; id: string; name: string }
  | null;

type EditLineTarget = { id: string; name: string; display_order: number } | undefined;
type EditMachineTarget = { id: string; name: string; model?: string; host?: string; port?: number; slave_id?: number } | undefined;

function statusDotClass(status: string) {
  switch (status) {
    case 'running': return 'bg-green-500';
    case 'error': return 'bg-red-500';
    default: return 'bg-slate-400';
  }
}

export function SiteDetail({ siteId, onSiteDeleted }: SiteDetailProps) {
  const { t } = useTranslation();
  const { data: detail, isLoading } = useSiteDetail(siteId);

  const deleteSite = useDeleteSite();
  const deleteLine = useDeleteLine();
  const deleteMachine = useDeleteMachine();

  // Dialog states
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const [editLine, setEditLine] = useState<EditLineTarget>(undefined);
  const [editMachine, setEditMachine] = useState<EditMachineTarget>(undefined);
  const [activeLine, setActiveLine] = useState<string>('');

  const isDeleting = deleteSite.isPending || deleteLine.isPending || deleteMachine.isPending;

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'site') {
      await deleteSite.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      onSiteDeleted?.();
    } else if (deleteTarget.type === 'line') {
      await deleteLine.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } else if (deleteTarget.type === 'machine') {
      await deleteMachine.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const deleteConfirmLabel = deleteTarget?.type === 'site'
    ? t('admin.deleteSite')
    : deleteTarget?.type === 'line'
    ? t('admin.deleteLine')
    : t('admin.deleteMachine');

  const deleteWarning = deleteTarget?.type === 'site'
    ? t('admin.deleteSiteWarning')
    : deleteTarget?.type === 'line'
    ? t('admin.deleteLineWarning')
    : undefined;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  if (!detail) return null;

  return (
    <div className="space-y-4">
      {/* Site header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">{detail.name}</h2>
          <p className="text-sm text-muted-foreground">
            {detail.code} · {detail.timezone}
            {detail.address && ` · ${detail.address}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setSiteDialogOpen(true)}>
            <PencilIcon className="h-3.5 w-3.5 mr-1" />
            {t('admin.editSite')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:text-red-700"
            onClick={() => setDeleteTarget({ type: 'site', id: detail.id, name: detail.name })}
          >
            <TrashIcon className="h-3.5 w-3.5 mr-1" />
            {t('admin.deleteSite')}
          </Button>
        </div>
      </div>

      {/* Lines */}
      {(!detail.lines || detail.lines.length === 0) && (
        <p className="text-sm text-muted-foreground">{t('admin.noLines')}</p>
      )}
      {detail.lines?.map((line: any) => (
        <Card key={line.id} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="font-semibold">{line.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">#{line.display_order}</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditLine({ id: line.id, name: line.name, display_order: line.display_order });
                  setLineDialogOpen(true);
                }}
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-600"
                onClick={() => setDeleteTarget({ type: 'line', id: line.id, name: line.name })}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveLine(line.id);
                  setEditMachine(undefined);
                  setMachineDialogOpen(true);
                }}
              >
                <PlusIcon className="h-3.5 w-3.5 mr-1" />
                {t('admin.addMachine')}
              </Button>
            </div>
          </div>

          {/* Machines table */}
          {(!line.machines || line.machines.length === 0) ? (
            <p className="text-sm text-muted-foreground">{t('admin.noMachines')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>{t('admin.machineName')}</TableHead>
                  <TableHead>{t('admin.machineModel')}</TableHead>
                  <TableHead>{t('admin.hostAddress')}</TableHead>
                  <TableHead>{t('admin.status')}</TableHead>
                  <TableHead>{t('admin.workerLabel')}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {line.machines.map((machine: any) => (
                  <TableRow key={machine.id}>
                    <TableCell>
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${statusDotClass(machine.status)}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{machine.name}</TableCell>
                    <TableCell className="text-muted-foreground">{machine.model ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">
                      {machine.host ? `${machine.host}:${machine.port ?? 502}` : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{machine.status ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {machine.worker_name ?? t('admin.noWorkerAssigned')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setActiveLine(line.id);
                            setEditMachine({ id: machine.id, name: machine.name, model: machine.model, host: machine.host, port: machine.port, slave_id: machine.slave_id });
                            setMachineDialogOpen(true);
                          }}
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => setDeleteTarget({ type: 'machine', id: machine.id, name: machine.name })}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ))}

      {/* Add production line */}
      <button
        className="w-full rounded-lg border-2 border-dashed border-slate-200 py-3 text-sm text-muted-foreground hover:border-slate-300 hover:text-slate-600 transition-colors"
        onClick={() => {
          setEditLine(undefined);
          setLineDialogOpen(true);
        }}
      >
        + {t('admin.addLine')}
      </button>

      {/* Dialogs */}
      <SiteDialog
        open={siteDialogOpen}
        onClose={() => setSiteDialogOpen(false)}
        site={detail}
      />

      <LineDialog
        open={lineDialogOpen}
        onClose={() => {
          setLineDialogOpen(false);
          setEditLine(undefined);
        }}
        siteId={siteId}
        line={editLine}
      />

      <MachineDialog
        open={machineDialogOpen}
        onClose={() => {
          setMachineDialogOpen(false);
          setEditMachine(undefined);
        }}
        lineId={activeLine}
        machine={editMachine}
      />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        name={deleteTarget?.name ?? ''}
        warning={deleteWarning}
        loading={isDeleting}
        confirmLabel={deleteConfirmLabel}
      />
    </div>
  );
}
