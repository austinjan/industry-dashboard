import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { mapAuthError } from '@/lib/auth-errors';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface FieldError {
  field: string;
  message: string;
}

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const clearErrors = (field?: string) => {
    if (!field || fieldError?.field === field) setFieldError(null);
    setFormError(null);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setFormError(null);

    if (!email) {
      setFieldError({ field: 'email', message: t('auth.errorEmailRequired') });
      return;
    }
    if (!password) {
      setFieldError({ field: 'password', message: t('auth.errorPasswordRequired') });
      return;
    }
    if (password !== confirmPassword) {
      setFieldError({ field: 'confirmPassword', message: t('auth.errorPasswordMismatch') });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 201) {
        navigate('/');
        window.location.reload();
      } else {
        const body = await res.json().catch(() => ({ code: '', message: '' }));
        const msg = mapAuthError(body.code, body.message, res.status, t);
        if (body.code === 'auth.email_taken') {
          setFieldError({ field: 'email', message: msg });
        } else {
          setFormError(msg);
        }
      }
    } catch {
      setFormError(t('auth.errorNetworkError'));
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
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.emailLabel')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); clearErrors('email'); }}
                required
                autoComplete="email"
              />
              {fieldError?.field === 'email' && (
                <p className="text-sm text-destructive">{fieldError.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.passwordLabel')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); clearErrors('password'); }}
                required
                autoComplete="new-password"
              />
              {fieldError?.field === 'password' && (
                <p className="text-sm text-destructive">{fieldError.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('auth.confirmPasswordLabel')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); clearErrors('confirmPassword'); }}
                required
                autoComplete="new-password"
              />
              {fieldError?.field === 'confirmPassword' && (
                <p className="text-sm text-destructive">{fieldError.message}</p>
              )}
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : t('auth.registerButton')}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Link to="/login" className="text-sm text-muted-foreground hover:underline">
            {t('auth.loginLink')}
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
