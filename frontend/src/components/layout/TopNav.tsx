import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/site-context';
import { useRefreshInterval } from '@/lib/refresh-interval';
import { useUpdateLocale } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const languages = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'th', label: 'ไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
];

export function TopNav() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { sites, currentSite, setCurrentSite } = useSite();
  const updateLocale = useUpdateLocale();
  const { interval, setInterval: setRefreshInterval } = useRefreshInterval();

  const refreshOptions = [
    { value: 5000, label: '5s' },
    { value: 10000, label: '10s' },
    { value: 30000, label: '30s' },
    { value: 60000, label: '1m' },
    { value: 300000, label: '5m' },
  ];

  const handleLanguageChange = (code: string | null) => {
    if (!code) return;
    i18n.changeLanguage(code);
    updateLocale.mutate(code);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-slate-900 px-4 text-white">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold">{t('topnav.title')}</h1>
        {sites.length > 0 && (
          <Select
            value={currentSite?.id ?? ''}
            onValueChange={(id) => {
              const site = sites.find((s) => s.id === id);
              if (site) setCurrentSite(site);
            }}
          >
            <SelectTrigger className="w-48 border-slate-700 bg-slate-800 text-white">
              <SelectValue placeholder={t('common.selectSite')}>
                {currentSite?.name ?? t('common.selectSite')}
              </SelectValue>
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
        <Select value={String(interval)} onValueChange={(v) => { if (v) setRefreshInterval(parseInt(v, 10)); }}>
          <SelectTrigger className="w-24 border-slate-700 bg-slate-800 text-white text-xs">
            <SelectValue>⟳ {refreshOptions.find((o) => o.value === interval)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {refreshOptions.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                ⟳ {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={i18n.language} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-36 border-slate-700 bg-slate-800 text-white">
            <SelectValue>{languages.find((l) => l.code === i18n.language)?.label ?? i18n.language}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {user && (
          <>
            <Link to="/account" className="text-sm text-slate-300 hover:text-white">
              {t('nav.account')}
            </Link>
            <span className="text-sm text-slate-300">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={logout} className="text-slate-300 hover:text-white">
              {t('common.logout')}
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
