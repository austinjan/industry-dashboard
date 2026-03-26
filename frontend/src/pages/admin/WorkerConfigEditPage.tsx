import { useTranslation } from 'react-i18next';
export function WorkerConfigEditPage() {
  const { t } = useTranslation();
  return <div className="p-4"><h2 className="text-xl font-bold">{t('admin.editWorkerConfig')}</h2></div>;
}
