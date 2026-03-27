import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSiteMachines, useMachineMetrics, useCreateAlert, useUpdateAlert } from '@/lib/hooks';

interface AlertRule {
  id: string;
  name: string;
  machine_id: string;
  metric_name: string;
  condition: string;
  threshold: number;
  severity: string;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  siteId: string;
  editRule?: AlertRule | null;
}

const CONDITIONS = ['>', '<', '>=', '<=', '=='] as const;

export default function AlertRuleDialog({ open, onClose, siteId, editRule }: Props) {
  const { t } = useTranslation();
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();
  const { data: machines } = useSiteMachines(siteId);

  const [name, setName] = useState('');
  const [machineId, setMachineId] = useState('');
  const [metricName, setMetricName] = useState('');
  const [condition, setCondition] = useState('>');
  const [threshold, setThreshold] = useState(0);
  const [severity, setSeverity] = useState('warning');
  const [coilValue, setCoilValue] = useState<0 | 1>(1);
  const [error, setError] = useState('');

  const { data: metrics } = useMachineMetrics(machineId || undefined);
  const selectedMetric = metrics?.find((m) => m.name === metricName);
  const isCoil = selectedMetric?.type === 'coil';
  const isEdit = !!editRule;

  useEffect(() => {
    if (open) {
      if (editRule) {
        setName(editRule.name);
        setMachineId(editRule.machine_id);
        setMetricName(editRule.metric_name);
        setCondition(editRule.condition);
        setThreshold(editRule.threshold);
        setSeverity(editRule.severity);
        setCoilValue(editRule.threshold === 1 ? 1 : 0);
      } else {
        setName('');
        setMachineId('');
        setMetricName('');
        setCondition('>');
        setThreshold(0);
        setSeverity('warning');
        setCoilValue(1);
      }
      setError('');
    }
  }, [open, editRule]);

  // Reset metric when machine changes (only in create mode)
  useEffect(() => {
    if (!isEdit) {
      setMetricName('');
    }
  }, [machineId, isEdit]);

  const handleSubmit = async () => {
    setError('');
    const finalCondition = isCoil ? '==' : condition;
    const finalThreshold = isCoil ? coilValue : threshold;

    try {
      if (isEdit) {
        await updateAlert.mutateAsync({
          id: editRule!.id,
          siteId,
          name,
          metric_name: metricName,
          condition: finalCondition,
          threshold: finalThreshold,
          severity,
          is_active: editRule!.is_active,
        });
      } else {
        await createAlert.mutateAsync({
          siteId,
          name,
          machine_id: machineId,
          metric_name: metricName,
          condition: finalCondition,
          threshold: finalThreshold,
          severity,
        });
      }
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save alert rule');
    }
  };

  const isPending = createAlert.isPending || updateAlert.isPending;
  const isValid = name && machineId && metricName && (!isCoil ? condition : true);

  const conditionLabel = isCoil
    ? coilValue === 1
      ? t('alertRules.alertWhenOn')
      : t('alertRules.alertWhenOff')
    : `${condition} ${threshold}`;

  const machineName = machines?.find((m: any) => m.id === machineId)?.name ?? machineId;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('alertRules.editTitle') : t('alertRules.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label>{t('alertRules.name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Machine */}
          <div>
            <Label>{t('alertRules.machine')}</Label>
            <Select value={machineId} onValueChange={(v) => setMachineId(v ?? '')} disabled={isEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {machines?.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Metric */}
          {machineId && (
            <div>
              <Label>{t('alertRules.metric')}</Label>
              <Select value={metricName} onValueChange={(v) => setMetricName(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metrics?.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name} ({m.register_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMetric && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('alertRules.registerType', { type: selectedMetric.type })}
                </p>
              )}
            </div>
          )}

          {/* Condition + Threshold (analog) */}
          {metricName && !isCoil && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>{t('alertRules.condition')}</Label>
                <Select value={condition} onValueChange={(v) => setCondition(v ?? '>')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`alertRules.conditions.${c === '>' ? 'gt' : c === '<' ? 'lt' : c === '>=' ? 'gte' : c === '<=' ? 'lte' : 'eq'}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label>{t('alertRules.threshold')}</Label>
                <Input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          )}

          {/* Coil ON/OFF */}
          {metricName && isCoil && (
            <div>
              <Label>{t('alertRules.condition')}</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  variant={coilValue === 1 ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setCoilValue(1)}
                  type="button"
                >
                  {t('alertRules.alertWhenOn')}
                </Button>
                <Button
                  variant={coilValue === 0 ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setCoilValue(0)}
                  type="button"
                >
                  {t('alertRules.alertWhenOff')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t('alertRules.coilHint')}</p>
            </div>
          )}

          {/* Severity */}
          {metricName && (
            <div>
              <Label>{t('alertRules.severity')}</Label>
              <div className="flex gap-2 mt-1">
                {(['info', 'warning', 'critical'] as const).map((s) => (
                  <Button
                    key={s}
                    variant={severity === s ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setSeverity(s)}
                    type="button"
                  >
                    {t(`alerts.${s}`)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {metricName && (
            <div className="bg-muted rounded-md p-3">
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">{t('alertRules.previewLabel')}</p>
              <p className="text-sm">
                {t('alertRules.preview', {
                  metric: metricName,
                  machine: machineName,
                  condition: conditionLabel,
                  severity: t(`alerts.${severity}`),
                })}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={!isValid || isPending}>
              {isEdit ? t('alertRules.saveChanges') : t('alertRules.createButton')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
