import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, PlusCircle, Upload } from 'lucide-react';
import { useMachineRegisters, useSetMachineRegisters } from '@/lib/hooks';
import { apiFetch } from '@/lib/api';
import { CsvImportDialog } from './CsvImportDialog';

interface CopySource {
  machineId: string;
  machineName: string;
}

interface RegisterTableProps {
  machineId: string;
  machineName: string;
  copyFromMachines?: CopySource[];
}

const TYPE_OPTIONS = ['holding', 'input', 'coil', 'discrete'];
const DATA_TYPE_OPTIONS = ['uint16', 'int16', 'uint32', 'int32', 'float32', 'float64', 'bool', 'string', 'timestamp_unix'];
const BYTE_ORDER_OPTIONS = ['big', 'little', 'mid-big', 'mid-little'];
const FAKE_PATTERN_OPTIONS = ['', 'random', 'sine', 'drift', 'monotonic', 'spike'];

function newRow() {
  return {
    name: '',
    address: 0,
    type: 'holding',
    data_type: 'float32',
    unit: '',
    scale: 1.0,
    offset: 0,
    byte_order: 'big',
    fake: null as { min: number; max: number; pattern: string } | null,
  };
}

export function RegisterTable({ machineId, copyFromMachines }: RegisterTableProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useMachineRegisters(machineId);
  const setRegisters = useSetMachineRegisters();

  const registers = data?.registers ?? data ?? [];
  const [rows, setRows] = useState<any[]>([]);
  const [dataKey, setDataKey] = useState<string>('');
  const [csvOpen, setCsvOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Re-initialize rows whenever data changes (handles navigation back)
  const currentKey = JSON.stringify(registers);
  if (!isLoading && data && currentKey !== dataKey) {
    setRows(Array.isArray(registers) ? registers : []);
    setDataKey(currentKey);
  }

  const updateRow = (index: number, field: string, value: any) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    setRows(prev => [...prev, newRow()]);
  };

  const deleteRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaveStatus('idle');
    setErrorMsg('');
    try {
      await setRegisters.mutateAsync({ machineId, registers: rows });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e: any) {
      setSaveStatus('error');
      setErrorMsg(e.message || 'Unknown error');
    }
  };

  const handleImport = (registers: any[], mode: 'replace' | 'append') => {
    if (mode === 'replace') {
      setRows(registers);
    } else {
      setRows(prev => [...prev, ...registers]);
    }
    setCsvOpen(false);
  };

  if (isLoading) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addRow}>
            <PlusCircle className="h-4 w-4 mr-1" />
            {t('admin.addRegister')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            {t('admin.importCsv')}
          </Button>
          {copyFromMachines && copyFromMachines.length > 0 && (
            <div className="relative inline-block">
              <select
                className="h-8 rounded border border-input bg-background px-2 text-xs appearance-none pr-6 cursor-pointer"
                value=""
                onChange={async (e) => {
                  const srcId = e.target.value;
                  if (!srcId) return;
                  try {
                    const res = await apiFetch(`/machines/${srcId}/registers`);
                    if (!res.ok) return;
                    const data = await res.json();
                    const regs = data?.registers ?? [];
                    if (regs.length > 0) {
                      setRows(regs);
                    }
                  } catch {}
                  e.target.value = '';
                }}
              >
                <option value="">{t('admin.copyFrom')}</option>
                {copyFromMachines.map(m => (
                  <option key={m.machineId} value={m.machineId}>{m.machineName}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <Button size="sm" onClick={handleSave} disabled={setRegisters.isPending}>
          {t('admin.save')}
        </Button>
      </div>

      {saveStatus === 'success' && (
        <p className="text-sm text-green-500">{t('admin.save')} ✓</p>
      )}
      {saveStatus === 'error' && (
        <p className="text-sm text-red-500">{errorMsg}</p>
      )}

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{t('admin.registerName')}</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{t('admin.registerAddress')}</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{t('admin.registerType')}</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{t('admin.registerDataType')}</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{t('admin.registerUnit')}</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{t('admin.registerScale')}</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{t('admin.registerOffset')}</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">{t('admin.registerByteOrder')}</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">Fake</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">Min</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">Max</th>
              <th className="px-2 py-2 text-left font-medium text-xs text-muted-foreground whitespace-nowrap">Pattern</th>
              <th className="px-2 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {t('admin.noMachines')}
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-2 py-1">
                  <Input
                    className="h-7 text-xs min-w-[100px]"
                    value={row.name}
                    onChange={e => updateRow(i, 'name', e.target.value)}
                    placeholder="name"
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    className="h-7 text-xs w-20"
                    type="number"
                    value={row.address}
                    onChange={e => updateRow(i, 'address', parseInt(e.target.value) || 0)}
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    className="h-7 rounded border border-input bg-background px-2 text-xs"
                    value={row.type}
                    onChange={e => updateRow(i, 'type', e.target.value)}
                  >
                    {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select
                    className="h-7 rounded border border-input bg-background px-2 text-xs"
                    value={row.data_type}
                    onChange={e => updateRow(i, 'data_type', e.target.value)}
                  >
                    {DATA_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <Input
                    className="h-7 text-xs w-16"
                    value={row.unit}
                    onChange={e => updateRow(i, 'unit', e.target.value)}
                    placeholder="unit"
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    className="h-7 text-xs w-16"
                    type="number"
                    step="any"
                    value={row.scale}
                    onChange={e => updateRow(i, 'scale', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    className="h-7 text-xs w-16"
                    type="number"
                    step="any"
                    value={row.offset}
                    onChange={e => updateRow(i, 'offset', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    className="h-7 rounded border border-input bg-background px-2 text-xs"
                    value={row.byte_order}
                    onChange={e => updateRow(i, 'byte_order', e.target.value)}
                  >
                    {BYTE_ORDER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!row.fake}
                    onChange={e => {
                      if (e.target.checked) {
                        updateRow(i, 'fake', { min: 0, max: 100, pattern: 'random' });
                      } else {
                        updateRow(i, 'fake', null);
                      }
                    }}
                  />
                </td>
                <td className="px-2 py-1">
                  {row.fake && (
                    <Input
                      className="h-7 text-xs w-24"
                      type="text"
                      inputMode="decimal"
                      defaultValue={row.fake.min}
                      onBlur={e => updateRow(i, 'fake', { ...row.fake, min: parseFloat(e.target.value) || 0 })}
                    />
                  )}
                </td>
                <td className="px-2 py-1">
                  {row.fake && (
                    <Input
                      className="h-7 text-xs w-16"
                      type="text"
                      inputMode="decimal"
                      defaultValue={row.fake.max}
                      onBlur={e => updateRow(i, 'fake', { ...row.fake, max: parseFloat(e.target.value) || 0 })}
                    />
                  )}
                </td>
                <td className="px-2 py-1">
                  {row.fake && (
                    <select
                      className="h-7 rounded border border-input bg-background px-2 text-xs"
                      value={row.fake.pattern}
                      onChange={e => updateRow(i, 'fake', { ...row.fake, pattern: e.target.value })}
                    >
                      {FAKE_PATTERN_OPTIONS.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-2 py-1">
                  <button
                    onClick={() => deleteRow(i)}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                    title={t('admin.deleteRegister')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} onImport={handleImport} />
    </div>
  );
}
