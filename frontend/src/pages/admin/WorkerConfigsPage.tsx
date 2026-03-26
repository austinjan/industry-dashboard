import { useTranslation } from 'react-i18next';
export function WorkerConfigsPage() {
  const { t } = useTranslation();
  return <div className="p-4"><h2 className="text-xl font-bold">{t('admin.workerConfigs')}</h2></div>;
}
