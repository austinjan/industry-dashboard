import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';

export function LoginPage() {
  const { t } = useTranslation();

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold">{t('login.title')}</h1>
        <div className="space-y-3">
          <a href="/api/auth/login" className={buttonVariants({ variant: 'default' }) + ' block'}>
            {t('login.signInMicrosoft')}
          </a>
          {import.meta.env.DEV && (
            <a href="http://localhost:8080/dev/login" className={buttonVariants({ variant: 'outline' }) + ' block'}>
              {t('login.devLogin')}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
