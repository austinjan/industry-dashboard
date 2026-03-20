import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Main', items: [
    { to: '/', label: 'Site Overview' },
    { to: '/machines', label: 'Machine List' },
    { to: '/alerts', label: 'Alerts & Alarms' },
    { to: '/reports', label: 'Reports' },
  ]},
  { label: 'Custom', items: [
    { to: '/dashboards', label: 'My Dashboards' },
  ]},
  { label: 'Admin', items: [
    { to: '/admin/users', label: 'User Management' },
    { to: '/admin/roles', label: 'RBAC Settings' },
    { to: '/admin/audit', label: 'Audit Log' },
  ]},
];

export function Sidebar() {
  return (
    <aside className="w-56 border-r bg-slate-50 p-3">
      {navItems.map((group) => (
        <div key={group.label} className="mb-4">
          <p className="mb-1 text-xs font-semibold uppercase text-slate-400">{group.label}</p>
          {group.items.map((item) => (
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
      ))}
    </aside>
  );
}
