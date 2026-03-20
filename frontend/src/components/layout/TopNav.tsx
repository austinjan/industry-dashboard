import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export function TopNav() {
  const { user, logout } = useAuth();
  return (
    <header className="flex h-14 items-center justify-between border-b bg-slate-900 px-4 text-white">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold">Industry Dashboard</h1>
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
