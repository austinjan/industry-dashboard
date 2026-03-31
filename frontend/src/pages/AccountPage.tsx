import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function AccountPage() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [providers, setProviders] = useState<string[]>([]);

  const justBound = searchParams.get('bound') === '1';

  // Fetch providers to check if Microsoft is available
  useEffect(() => {
    apiFetch('/auth/providers')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.providers) {
          setProviders(data.providers);
        }
      });
  }, []);

  // If we just completed a bind, refresh the user data then clear the query param
  useEffect(() => {
    if (justBound) {
      refreshUser();
      navigate('/account', { replace: true });
    }
  }, [justBound, navigate, refreshUser]);

  if (!user) return null;

  const hasMicrosoftProvider = providers.includes('microsoft');
  const localPasswordSet = user.registered_via === 'local';

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">{t('account.title')}</h1>

      {justBound && (
        <div className="rounded-lg border border-green-500 bg-green-50 px-4 py-3 text-green-800">
          {t('account.bindSuccess')}
        </div>
      )}

      {/* User Information */}
      <Card>
        <CardHeader>
          <CardTitle>{t('account.userInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{t('account.emailLabel')}</span>
            <span className="text-sm">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{t('account.nameLabel')}</span>
            <span className="text-sm">{user.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{t('account.registeredVia')}</span>
            <span className="text-sm">{user.registered_via}</span>
          </div>
        </CardContent>
      </Card>

      {/* Authentication Methods */}
      <Card>
        <CardHeader>
          <CardTitle>{t('account.authMethods')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Local Password Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('account.localPassword')}</span>
            {localPasswordSet ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                {t('account.localPasswordSet')}
              </Badge>
            ) : (
              <Badge variant="secondary">
                {t('account.localPasswordNotSet')}
              </Badge>
            )}
          </div>

          {/* Microsoft Account Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('account.microsoftAccount')}</span>
            <div className="flex items-center gap-3">
              {user.has_microsoft ? (
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                  {t('account.microsoftLinked', { email: user.microsoft_email ?? '' })}
                </Badge>
              ) : (
                <>
                  <Badge variant="secondary">
                    {t('account.microsoftNotLinked')}
                  </Badge>
                  {hasMicrosoftProvider && (
                    <a href="/api/auth/bind/microsoft" className={buttonVariants({ size: 'sm' })}>
                      {t('account.linkMicrosoft')}
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
