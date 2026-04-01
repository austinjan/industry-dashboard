import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateSite, useUpdateSite } from '@/lib/hooks';
import { useSite } from '@/lib/site-context';

const TIMEZONES = [
  'UTC',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Bangkok',
  'Asia/Ho_Chi_Minh',
  'America/New_York',
  'Europe/London',
];

interface SiteDialogProps {
  open: boolean;
  onClose: () => void;
  site?: { id: string; name: string; code: string; timezone: string; address?: string };
}

export function SiteDialog({ open, onClose, site }: SiteDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!site;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [address, setAddress] = useState('');

  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const { refreshSites } = useSite();

  useEffect(() => {
    if (open) {
      setName(site?.name ?? '');
      setCode(site?.code ?? '');
      setTimezone(site?.timezone ?? 'UTC');
      setAddress(site?.address ?? '');
    }
  }, [open, site]);

  const isPending = createSite.isPending || updateSite.isPending;
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name || !code || !timezone) return;
    setError('');
    try {
      if (isEdit) {
        await updateSite.mutateAsync({ id: site.id, name, timezone, address: address || undefined });
      } else {
        await createSite.mutateAsync({ name, code, timezone, address: address || undefined });
      }
      refreshSites();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('admin.editSite') : t('admin.addSite')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t('admin.siteName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('admin.siteName')}
            />
          </div>
          <div className="space-y-1">
            <Label>{t('admin.siteCode')}</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t('admin.siteCode')}
              disabled={isEdit}
            />
          </div>
          <div className="space-y-1">
            <Label>{t('admin.timezone')}</Label>
            <Select value={timezone} onValueChange={(v) => setTimezone(v ?? 'UTC')}>
              <SelectTrigger>
                <SelectValue placeholder={t('admin.timezone')}>{timezone}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('admin.address')}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('admin.address')}
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('admin.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!name || !code || !timezone || isPending}>
            {t('admin.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
