import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RegisterTable } from '@/components/admin/RegisterTable';
import { YamlPreviewDialog } from '@/components/admin/YamlPreviewDialog';
import {
  useWorkerConfig,
  useAdminSites,
  useSiteDetail,
  useCreateWorkerConfig,
  useUpdateWorkerConfig,
  useSetConfigMachines,
  useDownloadWorkerConfigYAML,
} from '@/lib/hooks';
import { cn } from '@/lib/utils';

interface SelectedMachine {
  machine_id: string;
  machine_name: string;
  model: string;
  line_name: string;
  host: string;
  port: number;
  slave_id: number;
}

type TabKey = 'basic' | 'machines' | 'registers';

export function WorkerConfigEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [activeTab, setActiveTab] = useState<TabKey>('basic');

  // Basic settings state
  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [pollInterval, setPollInterval] = useState('5s');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Machines state
  const [selectedMachines, setSelectedMachines] = useState<SelectedMachine[]>([]);

  // Collapsible state for register sections
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());

  // YAML preview dialog
  const [yamlOpen, setYamlOpen] = useState(false);

  // Data fetching
  const { data: config, isLoading: configLoading } = useWorkerConfig(id);
  const { data: sites } = useAdminSites();
  const { data: siteDetail } = useSiteDetail(siteId || undefined);

  // Mutations
  const createConfig = useCreateWorkerConfig();
  const updateConfig = useUpdateWorkerConfig();
  const setConfigMachines = useSetConfigMachines();
  const downloadYAML = useDownloadWorkerConfigYAML();

  // Pre-fill form in edit mode
  useEffect(() => {
    if (config) {
      setName(config.name ?? '');
      setSiteId(config.site_id ?? '');
      setPollInterval(config.poll_interval ?? '5s');
    }
  }, [config]);

  // Initialize selected machines from config
  useEffect(() => {
    if (config?.machines) {
      setSelectedMachines(
        config.machines.map((m: any) => ({
          machine_id: m.machine_id,
          machine_name: m.machine_name,
          model: m.model || '',
          line_name: m.line_name,
          host: m.host,
          port: m.port,
          slave_id: m.slave_id,
        }))
      );
    }
  }, [config]);

  // ---- Basic settings save ----
  const handleSaveBasic = async () => {
    setSaveError('');
    setSaveSuccess(false);
    try {
      if (isNew) {
        const result: any = await createConfig.mutateAsync({ name, site_id: siteId, poll_interval: pollInterval });
        navigate(`/admin/worker-configs/${result.id}`);
      } else {
        await updateConfig.mutateAsync({ id: id!, name, site_id: siteId, poll_interval: pollInterval });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (e: any) {
      setSaveError(e.message || 'Unknown error');
    }
  };

  // ---- Machine selection helpers ----
  const isMachineSelected = (machineId: string) =>
    selectedMachines.some(m => m.machine_id === machineId);

  const toggleMachine = (machine: any, lineName: string) => {
    if (isMachineSelected(machine.id)) {
      setSelectedMachines(prev => prev.filter(m => m.machine_id !== machine.id));
    } else {
      setSelectedMachines(prev => [
        ...prev,
        {
          machine_id: machine.id,
          machine_name: machine.name,
          model: machine.model || '',
          line_name: lineName,
          host: machine.host || '',
          port: machine.port || 502,
          slave_id: machine.slave_id || 1,
        },
      ]);
    }
  };

  const updateMachineField = (machineId: string, field: keyof SelectedMachine, value: string | number) => {
    setSelectedMachines(prev =>
      prev.map(m => m.machine_id === machineId ? { ...m, [field]: value } : m)
    );
  };

  const getMachineConn = (machineId: string): SelectedMachine | undefined =>
    selectedMachines.find(m => m.machine_id === machineId);

  // ---- Save machines ----
  const [machinesSaveError, setMachinesSaveError] = useState('');
  const [machinesSaveSuccess, setMachinesSaveSuccess] = useState(false);

  const handleSaveMachines = async () => {
    if (!id) return;
    setMachinesSaveError('');
    setMachinesSaveSuccess(false);
    try {
      await setConfigMachines.mutateAsync({
        configId: id,
        machines: selectedMachines.map(m => ({
          machine_id: m.machine_id,
          host: m.host,
          port: m.port,
          slave_id: m.slave_id,
        })),
      });
      setMachinesSaveSuccess(true);
      setTimeout(() => setMachinesSaveSuccess(false), 3000);
    } catch (e: any) {
      setMachinesSaveError(e.message || 'Unknown error');
    }
  };

  // ---- Register section toggle ----
  const toggleExpanded = (machineId: string) => {
    setExpandedMachines(prev => {
      const next = new Set(prev);
      if (next.has(machineId)) next.delete(machineId);
      else next.add(machineId);
      return next;
    });
  };

  // ---- Render ----
  if (!isNew && configLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">{t('common.loading')}</div>
    );
  }

  const tabClass = (tab: TabKey) =>
    cn(
      'px-4 py-2 text-sm border-b-2 transition-colors',
      activeTab === tab
        ? 'border-blue-500 font-medium text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/admin/worker-configs"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-xl font-bold">
          {isNew ? t('admin.addWorkerConfig') : t('admin.editWorkerConfig')}
        </h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b">
        <button className={tabClass('basic')} onClick={() => setActiveTab('basic')}>
          {t('admin.basicSettings')}
        </button>
        {!isNew && (
          <button className={tabClass('machines')} onClick={() => setActiveTab('machines')}>
            {t('admin.selectMachines')}
          </button>
        )}
        {!isNew && (
          <button className={tabClass('registers')} onClick={() => setActiveTab('registers')}>
            {t('admin.configureRegisters')}
          </button>
        )}
      </div>

      {/* Tab: Basic Settings */}
      {activeTab === 'basic' && (
        <Card className="p-4">
          <div className="space-y-4 max-w-md">
            <div className="space-y-1">
              <Label htmlFor="config-name">{t('admin.configName')}</Label>
              <Input
                id="config-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('admin.configName')}
                required
              />
            </div>

            <div className="space-y-1">
              <Label>{t('admin.sites')}</Label>
              <Select value={siteId} onValueChange={v => { if (v != null) setSiteId(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.selectSite')} />
                </SelectTrigger>
                <SelectContent>
                  {sites?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="poll-interval">{t('admin.pollInterval')}</Label>
              <Input
                id="poll-interval"
                value={pollInterval}
                onChange={e => setPollInterval(e.target.value)}
                placeholder="5s"
              />
            </div>

            {saveError && (
              <p className="text-sm text-red-500">{saveError}</p>
            )}
            {saveSuccess && (
              <p className="text-sm text-green-500">{t('admin.save')} ✓</p>
            )}

            <Button
              onClick={handleSaveBasic}
              disabled={createConfig.isPending || updateConfig.isPending || !name || !siteId}
            >
              {t('admin.save')}
            </Button>
          </div>
        </Card>
      )}

      {/* Tab: Select Machines */}
      {activeTab === 'machines' && !isNew && (
        <div className="space-y-3">
          {!siteDetail && (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          )}
          {siteDetail?.lines?.map((line: any) => (
            <Card key={line.id} className="p-4">
              <h3 className="font-medium text-sm mb-3">{line.name}</h3>
              <div className="space-y-3">
                {line.machines?.map((machine: any) => {
                  const checked = isMachineSelected(machine.id);
                  const conn = getMachineConn(machine.id);
                  return (
                    <div key={machine.id} className="space-y-2">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={`machine-${machine.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleMachine(machine, line.name)}
                        />
                        <label
                          htmlFor={`machine-${machine.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {machine.name}
                        </label>
                        {machine.model && (
                          <span className="text-xs text-muted-foreground">{machine.model}</span>
                        )}
                      </div>
                      {checked && conn && (
                        <div className="ml-7 grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">{t('admin.hostAddress')}</Label>
                            <Input
                              className="h-7 text-xs"
                              value={conn.host}
                              onChange={e => updateMachineField(machine.id, 'host', e.target.value)}
                              placeholder="192.168.1.1"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t('admin.portLabel')}</Label>
                            <Input
                              className="h-7 text-xs"
                              type="number"
                              value={conn.port}
                              onChange={e => updateMachineField(machine.id, 'port', parseInt(e.target.value) || 502)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t('admin.slaveIdLabel')}</Label>
                            <Input
                              className="h-7 text-xs"
                              type="number"
                              value={conn.slave_id}
                              onChange={e => updateMachineField(machine.id, 'slave_id', parseInt(e.target.value) || 1)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!line.machines || line.machines.length === 0) && (
                  <p className="text-sm text-muted-foreground">{t('admin.noMachines')}</p>
                )}
              </div>
            </Card>
          ))}
          {siteDetail?.lines?.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('admin.noLines')}</p>
          )}

          {machinesSaveError && (
            <p className="text-sm text-red-500">{machinesSaveError}</p>
          )}
          {machinesSaveSuccess && (
            <p className="text-sm text-green-500">{t('admin.save')} ✓</p>
          )}

          <Button onClick={handleSaveMachines} disabled={setConfigMachines.isPending}>
            {t('admin.selectMachines')} — {t('admin.save')}
          </Button>
        </div>
      )}

      {/* Tab: Configure Registers */}
      {activeTab === 'registers' && !isNew && (
        <div className="space-y-3">
          {selectedMachines.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('admin.noMachines')}</p>
          )}
          {selectedMachines.map(machine => {
            const expanded = expandedMachines.has(machine.machine_id);
            return (
              <Card key={machine.machine_id} className="overflow-hidden">
                <button
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => toggleExpanded(machine.machine_id)}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-medium text-sm">{machine.machine_name}</span>
                  {machine.model && (
                    <span className="text-xs text-muted-foreground">{machine.model}</span>
                  )}
                </button>
                {expanded && (
                  <div className="px-4 pb-4 border-t">
                    <RegisterTable
                      machineId={machine.machine_id}
                      machineName={machine.machine_name}
                      copyFromMachines={selectedMachines
                        .filter(m => m.machine_id !== machine.machine_id)
                        .map(m => ({ machineId: m.machine_id, machineName: m.machine_name }))}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Footer: Preview & Download (edit mode only) */}
      {!isNew && (
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => setYamlOpen(true)}>
            {t('admin.previewYaml')}
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadYAML.mutate(id!)}
            disabled={downloadYAML.isPending}
          >
            {t('admin.downloadYaml')}
          </Button>
        </div>
      )}

      {/* YAML Preview Dialog */}
      {!isNew && id && (
        <YamlPreviewDialog
          open={yamlOpen}
          onClose={() => setYamlOpen(false)}
          configId={id}
        />
      )}
    </div>
  );
}
