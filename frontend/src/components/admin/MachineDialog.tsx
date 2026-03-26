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
  machine?: { id: string; name: string; model?: string };
}

export function MachineDialog({ open, onClose, lineId, machine }: MachineDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!machine;

  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState('');

  const createMachine = useCreateMachine();
  const updateMachine = useUpdateMachine();

  useEffect(() => {
    if (open) {
      setName(machine?.name ?? '');
      setModel(machine?.model ?? '');
      setError('');
    }
  }, [open, machine]);

  const isPending = createMachine.isPending || updateMachine.isPending;

  const handleSubmit = async () => {
    if (!name) return;
    setError('');
    try {
      if (isEdit) {
        await updateMachine.mutateAsync({ id: machine.id, name, model: model || undefined });
      } else {
        await createMachine.mutateAsync({ lineId, name, model: model || undefined });
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
