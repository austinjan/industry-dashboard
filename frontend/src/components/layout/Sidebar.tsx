import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSite } from '@/lib/site-context';
import { useDashboards } from '@/lib/hooks';

const staticNav = [
  { label: 'Main', items: [
    { to: '/', label: 'Site Overview' },
    { to: '/machines', label: 'Machine List' },
    { to: '/alerts', label: 'Alerts & Alarms' },
    { to: '/reports', label: 'Reports' },
  ]},
];

const adminNav = [
  { label: 'Admin', items: [
    { to: '/admin/users', label: 'User Management' },
    { to: '/admin/roles', label: 'RBAC Settings' },
    { to: '/admin/audit', label: 'Audit Log' },
  ]},
];

function NavGroup({ label, items }: { label: string; items: { to: string; label: string }[] }) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-semibold uppercase text-slate-400">{label}</p>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'block rounded-md px-3 py-1.5 text-sm',
              isActive ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export function Sidebar() {
  const { currentSite } = useSite();
  const { data: dashboards } = useDashboards(currentSite?.id);

  // Shared dashboards the user can at least view
  const sharedDashboards = dashboards?.filter((d: any) => d.access_level === 'view' || d.access_level === 'edit') ?? [];

  return (
    <aside className="w-56 border-r bg-slate-50 p-3 overflow-y-auto">
      {staticNav.map((group) => (
        <NavGroup key={group.label} label={group.label} items={group.items} />
      ))}

      {/* Custom dashboards section */}
      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Dashboards</p>
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
          All Dashboards
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
