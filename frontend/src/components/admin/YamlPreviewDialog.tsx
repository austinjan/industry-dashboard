import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api';
import { useDownloadWorkerConfigYAML } from '@/lib/hooks';

interface YamlPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  configId: string;
}

export function YamlPreviewDialog({ open, onClose, configId }: YamlPreviewDialogProps) {
  const { t } = useTranslation();
  const [yaml, setYaml] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const downloadYAML = useDownloadWorkerConfigYAML();

  useEffect(() => {
    if (!open || !configId) return;
    setLoading(true);
    apiFetch(`/worker-configs/${configId}/yaml`)
      .then(r => r.text())
      .then(text => {
        setYaml(text);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open, configId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('admin.yamlPreview')}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : (
          <pre className="bg-slate-900 text-slate-200 p-4 rounded overflow-auto max-h-[60vh] text-xs font-mono">
            {yaml}
          </pre>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={loading}>
            {copied ? t('admin.copied') : t('admin.copyToClipboard')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadYAML.mutate(configId)} disabled={downloadYAML.isPending}>
            {t('admin.downloadYaml')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
