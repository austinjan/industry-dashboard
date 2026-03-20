import { buttonVariants } from '@/components/ui/button';

export function LoginPage() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold">Industry Dashboard</h1>
        <a href="/api/auth/login" className={buttonVariants({ variant: 'default' })}>
          Sign in with Microsoft
        </a>
      </div>
    </div>
  );
}
