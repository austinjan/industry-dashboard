import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateLine, useUpdateLine } from '@/lib/hooks';

interface LineDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  line?: { id: string; name: string; display_order: number };
}

export function LineDialog({ open, onClose, siteId, line }: LineDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!line;

  const [name, setName] = useState('');
  const [displayOrder, setDisplayOrder] = useState('1');

  const createLine = useCreateLine();
  const updateLine = useUpdateLine();

  useEffect(() => {
    if (open) {
      setName(line?.name ?? '');
      setDisplayOrder(String(line?.display_order ?? 1));
    }
  }, [open, line]);

  const isPending = createLine.isPending || updateLine.isPending;

  const handleSubmit = async () => {
    if (!name) return;
    const order = parseInt(displayOrder, 10);
    if (isNaN(order)) return;
    if (isEdit) {
      await updateLine.mutateAsync({ id: line.id, name, display_order: order });
    } else {
      await createLine.mutateAsync({ siteId, name, display_order: order });
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('admin.editLine') : t('admin.addLine')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t('admin.lineName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('admin.lineName')}
            />
          </div>
          <div className="space-y-1">
            <Label>{t('admin.displayOrder')}</Label>
            <Input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              placeholder={t('admin.displayOrder')}
            />
          </div>
        </div>
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
