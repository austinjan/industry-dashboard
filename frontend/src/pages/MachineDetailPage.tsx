import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart } from '@/components/charts/LineChart';
import { useDataPoints } from '@/lib/hooks';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function MachineDetailPage() {
  const { t } = useTranslation();
  const { machineId } = useParams<{ machineId: string }>();
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [timeRange, setTimeRange] = useState('24h');

  const { data: metrics } = useQuery({
    queryKey: ['machine-metrics', machineId],
    queryFn: async () => {
      const res = await apiFetch(`/machines/${machineId}/metrics`);
      return res.ok ? res.json() : [];
    },
    enabled: !!machineId,
  });

  const { data: latest } = useQuery({
    queryKey: ['machine-latest', machineId],
    queryFn: async () => {
      const res = await apiFetch(`/machines/${machineId}/latest`);
      return res.ok ? res.json() : {};
    },
    enabled: !!machineId,
    refetchInterval: 30000,
  });

  const { data: timeSeries } = useDataPoints(machineId, selectedMetric, timeRange);

  useEffect(() => {
    if (metrics && metrics.length > 0 && !selectedMetric) {
      setSelectedMetric(metrics[0]);
    }
  }, [metrics, selectedMetric]);

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{t('machineDetail.heading')}</h2>
      <div className="mb-6 grid grid-cols-4 gap-3">
        {latest && Object.entries(latest).map(([key, value]) => (
          <Card key={key} className="p-3">
            <p className="text-xs text-slate-500">{key}</p>
            <p className="text-lg font-bold">{(value as number).toFixed(2)}</p>
          </Card>
        ))}
        {latest && Object.keys(latest).length === 0 && (
          <p className="col-span-4 text-sm text-slate-400">{t('machineDetail.noDataPoints')}</p>
        )}
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="font-semibold">{t('machineDetail.metrics')}</h3>
          {metrics && metrics.length > 0 && (
            <Select value={selectedMetric} onValueChange={(v) => setSelectedMetric(v ?? '')}>
              <SelectTrigger className="w-48"><SelectValue placeholder={t('machineDetail.selectMetric')} /></SelectTrigger>
              <SelectContent>
                {metrics.map((m: string) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v ?? '24h')}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">{t('machineDetail.1h')}</SelectItem>
              <SelectItem value="6h">{t('machineDetail.6h')}</SelectItem>
              <SelectItem value="24h">{t('machineDetail.24h')}</SelectItem>
              <SelectItem value="7d">{t('machineDetail.7d')}</SelectItem>
              <SelectItem value="30d">{t('machineDetail.30d')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {timeSeries && timeSeries.length > 0 ? (
          <LineChart data={timeSeries} yLabel={selectedMetric} />
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">
            {selectedMetric ? t('machineDetail.noDataRange') : t('machineDetail.selectMetricPrompt')}
          </p>
        )}
      </Card>
    </div>
  );
}
