import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CommandConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  workerName: string;
  command: 'stop' | 'restart';
  loading?: boolean;
}

export function CommandConfirmDialog({
  open,
  onClose,
  onConfirm,
  workerName,
  command,
  loading,
}: CommandConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {command === 'restart'
              ? t('admin.restartConfirm', { name: workerName })
              : t('admin.stopConfirm', { name: workerName })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t('admin.cancel')}
          </Button>
          {command === 'restart' ? (
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={onConfirm}
              disabled={loading}
            >
              {t('admin.restartWorker')}
            </Button>
          ) : (
            <Button variant="destructive" onClick={onConfirm} disabled={loading}>
              {t('admin.stopWorker')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
