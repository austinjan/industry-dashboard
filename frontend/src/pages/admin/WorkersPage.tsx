import { useTranslation } from 'react-i18next';
export function WorkersPage() {
  const { t } = useTranslation();
  return <div className="p-4"><h2 className="text-xl font-bold">{t('admin.workersMgmt')}</h2></div>;
}
