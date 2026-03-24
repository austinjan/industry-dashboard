import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface SiteListProps {
  sites: any[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export function SiteList({ sites, selectedId, onSelect, onAdd }: SiteListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-semibold">{t('admin.sites')}</span>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-lg leading-none" onClick={onAdd}>
          +
        </Button>
      </div>
      {sites.length === 0 && (
        <p className="px-3 py-4 text-sm text-muted-foreground">{t('admin.noSites')}</p>
      )}
      <div className="flex flex-col">
        {sites.map((site: any) => {
          const isSelected = site.id === selectedId;
          return (
            <button
              key={site.id}
              onClick={() => onSelect(site.id)}
              className={[
                'w-full text-left px-3 py-3 border-l-2 transition-colors hover:bg-slate-100',
                isSelected
                  ? 'border-l-blue-500 bg-slate-100'
                  : 'border-l-transparent bg-transparent',
              ].join(' ')}
            >
              <p className="font-semibold text-sm truncate">{site.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {site.code} · {site.timezone}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.productionLines')}: {site.line_count ?? 0} ·{' '}
                {t('admin.machineCount')}: {site.machine_count ?? 0}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
