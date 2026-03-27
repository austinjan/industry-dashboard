import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Cpu, FileCode, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSite } from '@/lib/site-context';
import { useDashboards } from '@/lib/hooks';

function NavGroup({ label, items }: { label: string; items: { to: string; label: string; icon?: React.ElementType }[] }) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-semibold uppercase text-slate-400">{label}</p>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm',
              isActive ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'
            )
          }
        >
          {item.icon && <item.icon className="h-4 w-4" />}
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const { currentSite } = useSite();
  const { data: dashboards } = useDashboards(currentSite?.id);

  const sharedDashboards = dashboards?.filter((d: any) => d.access_level === 'view' || d.access_level === 'edit') ?? [];

  const staticNav = [
    { label: t('nav.main'), items: [
      { to: '/', label: t('nav.siteOverview') },
      { to: '/machines', label: t('nav.machineList') },
      { to: '/alerts', label: t('nav.alertsAlarms') },
      { to: '/alerts/rules', label: t('alertRules.title') },
      { to: '/reports', label: t('nav.reports') },
    ]},
  ];

  const adminNav = [
    { label: t('nav.admin'), items: [
      { to: '/admin/users', label: t('nav.userManagement') },
      { to: '/admin/roles', label: t('nav.rbacSettings') },
      { to: '/admin/audit', label: t('nav.auditLog') },
      { to: '/admin/sites', label: t('nav.sitesAndMachines'), icon: Building2 },
      { to: '/admin/workers', label: t('nav.workers'), icon: Cpu },
      { to: '/admin/worker-configs', label: t('nav.workerConfigs'), icon: FileCode },
      { to: '/admin/api-keys', label: t('nav.apiKeys'), icon: KeyRound },
    ]},
  ];

  return (
    <aside className="w-56 border-r bg-slate-50 p-3 overflow-y-auto">
      {staticNav.map((group) => (
        <NavGroup key={group.label} label={group.label} items={group.items} />
      ))}

      {/* Custom dashboards section */}
      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('nav.custom')}</p>
        <NavLink
          to="/dashboards"
          end
          className={({ isActive }) =>
            cn(
              'block rounded-md px-3 py-1.5 text-sm',
              isActive ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'
            )
          }
        >
          {t('nav.myDashboards')}
        </NavLink>
        {sharedDashboards.map((d: any) => (
          <NavLink
            key={d.id}
            to={`/dashboards/${d.id}`}
            className={({ isActive }) =>
              cn(
                'block truncate rounded-md px-3 py-1.5 text-sm',
                isActive ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'
              )
            }
          >
            {d.title}
          </NavLink>
        ))}
      </div>

      {adminNav.map((group) => (
        <NavGroup key={group.label} label={group.label} items={group.items} />
      ))}
    </aside>
  );
}
