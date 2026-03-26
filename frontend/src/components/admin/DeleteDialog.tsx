import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DeleteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  name: string;
  warning?: string;
  loading?: boolean;
  confirmLabel?: string;
}

export function DeleteDialog({
  open,
  onClose,
  onConfirm,
  name,
  warning,
  loading,
  confirmLabel,
}: DeleteDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.deleteConfirm', { name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          {warning && <p>{warning}</p>}
          <p>{t('admin.deleteWarning')}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t('admin.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {confirmLabel ?? t('admin.deleteSite')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
