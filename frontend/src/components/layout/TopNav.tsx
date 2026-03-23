import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/site-context';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function TopNav() {
  const { user, logout } = useAuth();
  const { sites, currentSite, setCurrentSite } = useSite();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-slate-900 px-4 text-white">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold">Industry Dashboard</h1>
        {sites.length > 0 && (
          <Select
            value={currentSite?.id ?? ''}
            onValueChange={(id) => {
              const site = sites.find((s) => s.id === id);
              if (site) setCurrentSite(site);
            }}
          >
            <SelectTrigger className="w-48 border-slate-700 bg-slate-800 text-white">
              <SelectValue placeholder="Select site" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <>
            <span className="text-sm text-slate-300">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={logout} className="text-slate-300 hover:text-white">
              Logout
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
