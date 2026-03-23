import { buttonVariants } from '@/components/ui/button';

export function LoginPage() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold">Industry Dashboard</h1>
        <div className="space-y-3">
          <a href="/api/auth/login" className={buttonVariants({ variant: 'default' }) + ' block'}>
            Sign in with Microsoft
          </a>
          {import.meta.env.DEV && (
            <a href="http://localhost:8080/dev/login" className={buttonVariants({ variant: 'outline' }) + ' block'}>
              Dev Login (local only)
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
