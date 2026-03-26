import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminSites } from '@/lib/hooks';
import { SiteList } from '@/components/admin/SiteList';
import { SiteDetail } from '@/components/admin/SiteDetail';
import { SiteDialog } from '@/components/admin/SiteDialog';

export function SitesPage() {
  const { t } = useTranslation();
  const { data: sites } = useAdminSites();
  const [selectedSiteId, setSelectedSiteId] = useState<string>();
  const [addSiteOpen, setAddSiteOpen] = useState(false);

  useEffect(() => {
    if (sites?.length && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
    }
  }, [sites, selectedSiteId]);

  const handleSiteDeleted = () => {
    setSelectedSiteId(undefined);
  };

  return (
    <div className="flex h-full">
      <div className="w-[280px] border-r bg-slate-50 overflow-y-auto">
        <SiteList
          sites={sites ?? []}
          selectedId={selectedSiteId}
          onSelect={setSelectedSiteId}
          onAdd={() => setAddSiteOpen(true)}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {selectedSiteId ? (
          <SiteDetail siteId={selectedSiteId} onSiteDeleted={handleSiteDeleted} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">{t('admin.selectSitePrompt')}</p>
          </div>
        )}
      </div>

      <SiteDialog
        open={addSiteOpen}
        onClose={() => setAddSiteOpen(false)}
      />
    </div>
  );
}
