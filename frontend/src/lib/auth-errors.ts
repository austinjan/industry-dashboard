import type { TFunction } from 'i18next';

export function mapAuthError(code: string, message: string, status: number, t: TFunction): string {
  if (status === 429) return t('auth.errorRateLimited');
  switch (code) {
    case 'auth.invalid_credentials': return t('auth.errorInvalidCredentials');
    case 'auth.email_taken':
      return message.includes('SSO') ? t('auth.errorEmailTakenSso') : t('auth.errorEmailTaken');
    case 'auth.password_too_long': return t('auth.errorPasswordTooLong');
    case 'auth.invalid_input': return t('auth.errorInvalidInput');
    case 'auth.account_disabled': return t('auth.errorAccountDisabled');
    default: return t('auth.errorUnexpected');
  }
}
