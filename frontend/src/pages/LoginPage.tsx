import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { mapAuthError } from '@/lib/auth-errors';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<string[]>(['local']);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.providers) setProviders(data.providers);
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/auth/login/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        navigate('/');
        window.location.reload();
      } else {
        const body = await res.json().catch(() => ({ code: '', message: '' }));
        setError(mapAuthError(body.code, body.message, res.status, t));
      }
    } catch {
      setError(t('auth.errorNetworkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t('login.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.emailLabel')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.passwordLabel')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : t('auth.loginButton')}
            </Button>
          </form>

          {providers.includes('microsoft') && (
            <>
              <div className="relative my-4">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  {t('auth.orDivider')}
                </span>
              </div>
              <a href="/api/auth/login" className={buttonVariants({ variant: 'outline' }) + ' w-full'}>
                {t('auth.signInWithMicrosoft')}
              </a>
            </>
          )}

          {import.meta.env.DEV && (
            <a href="http://localhost:8080/dev/login" className={buttonVariants({ variant: 'outline' }) + ' mt-2 w-full'}>
              {t('login.devLogin')}
            </a>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <Link to="/register" className="text-sm text-muted-foreground hover:underline">
            {t('auth.registerLink')}
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
