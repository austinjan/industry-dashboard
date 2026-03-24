import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateMachine, useUpdateMachine } from '@/lib/hooks';

interface MachineDialogProps {
  open: boolean;
  onClose: () => void;
  lineId: string;
  machine?: { id: string; name: string; model?: string; host?: string; port?: number; slave_id?: number };
}

export function MachineDialog({ open, onClose, lineId, machine }: MachineDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!machine;

  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(502);
  const [slaveId, setSlaveId] = useState(1);
  const [error, setError] = useState('');

  const createMachine = useCreateMachine();
  const updateMachine = useUpdateMachine();

  useEffect(() => {
    if (open) {
      setName(machine?.name ?? '');
      setModel(machine?.model ?? '');
      setHost(machine?.host ?? '');
      setPort(machine?.port ?? 502);
      setSlaveId(machine?.slave_id ?? 1);
      setError('');
    }
  }, [open, machine]);

  const isPending = createMachine.isPending || updateMachine.isPending;

  const handleSubmit = async () => {
    if (!name) return;
    setError('');
    try {
      const data = {
        name,
        model: model || undefined,
        host: host || undefined,
        port: host ? port : undefined,
        slave_id: host ? slaveId : undefined,
      };
      if (isEdit) {
        await updateMachine.mutateAsync({ id: machine.id, ...data });
      } else {
        await createMachine.mutateAsync({ lineId, ...data });
      }
      onClose();
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('admin.editMachine') : t('admin.addMachine')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t('admin.machineName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('admin.machineName')}
            />
          </div>
          <div className="space-y-1">
            <Label>{t('admin.machineModel')}</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t('admin.machineModel')}
            />
          </div>

          <div className="border-t pt-3 mt-3">
            <p className="text-sm font-medium mb-2">{t('admin.modbusConnection')}</p>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label>{t('admin.hostAddress')}</Label>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.1.100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('admin.portLabel')}</Label>
                  <Input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(parseInt(e.target.value) || 502)}
                    placeholder="502"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('admin.slaveIdLabel')}</Label>
                  <Input
                    type="number"
                    value={slaveId}
                    onChange={(e) => setSlaveId(parseInt(e.target.value) || 1)}
                    placeholder="1"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('admin.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!name || isPending}>
            {t('admin.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
