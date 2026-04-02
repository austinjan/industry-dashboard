import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ArrowLeft, Check, AlertCircle, Copy, Download, Terminal } from 'lucide-react';
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
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
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

type StepKey = 'basic' | 'machines' | 'registers' | 'deploy';

const STEPS: { key: StepKey; num: number }[] = [
  { key: 'basic', num: 1 },
  { key: 'machines', num: 2 },
  { key: 'registers', num: 3 },
  { key: 'deploy', num: 4 },
];

// --- Validation helpers ---
function isValidPollInterval(v: string): boolean {
  return /^\d+[smh]$/.test(v.trim());
}

function isValidHost(v: string): boolean {
  if (!v) return false;
  // IP or hostname
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(v);
}

function isValidPort(v: number): boolean {
  return Number.isInteger(v) && v >= 1 && v <= 65535;
}

function isValidSlaveId(v: number): boolean {
  return Number.isInteger(v) && v >= 1 && v <= 247;
}

export function WorkerConfigEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [activeStep, setActiveStep] = useState<StepKey>('basic');

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

  // Deploy guide copy state
  const [copiedCmd, setCopiedCmd] = useState('');

  // Data fetching
  const { data: config, isLoading: configLoading } = useWorkerConfig(id);
  const { data: sites } = useAdminSites();
  const { data: siteDetail } = useSiteDetail(siteId || undefined);

  // DB env info for deploy guide
  const { data: dbEnv } = useQuery({
    queryKey: ['system-db-env'],
    queryFn: async () => {
      const res = await apiFetch('/system/db-env');
      if (!res.ok) return null;
      return res.json() as Promise<{ host: string; port: string; user: string; db_name: string; sslmode: string }>;
    },
    enabled: activeStep === 'deploy',
  });

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

  // --- Step completion checks ---
  const isBasicComplete = !!name && !!siteId && isValidPollInterval(pollInterval);
  const isMachinesComplete = selectedMachines.length > 0;
  const machinesWithBadConn = selectedMachines.filter(
    m => !isValidHost(m.host) || !isValidPort(m.port) || !isValidSlaveId(m.slave_id)
  );
  const isMachinesValid = isMachinesComplete && machinesWithBadConn.length === 0;

  function getStepStatus(key: StepKey): 'complete' | 'warning' | 'active' | 'pending' {
    if (key === activeStep) return 'active';
    switch (key) {
      case 'basic': return isBasicComplete ? 'complete' : 'warning';
      case 'machines': return !isMachinesComplete ? 'pending' : isMachinesValid ? 'complete' : 'warning';
      case 'registers': return 'pending';
      case 'deploy': return 'pending';
    }
  }

  // ---- Basic settings save ----
  const handleSaveBasic = async () => {
    setSaveError('');
    setSaveSuccess(false);
    try {
      if (isNew) {
        const result: any = await createConfig.mutateAsync({ name, site_id: siteId, poll_interval: pollInterval });
        navigate(`/admin/worker-configs/${result.id}`, { replace: true });
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

  // ---- Copy command helper ----
  const copyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(''), 2000);
  };

  // ---- Render ----
  if (!isNew && configLoading) {
    return <div className="p-4 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  const siteName = sites?.find((s: any) => s.id === siteId)?.name || '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/admin/worker-configs" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-xl font-bold">
          {isNew ? t('admin.addWorkerConfig') : t('admin.editWorkerConfig')}
          {name && !isNew && <span className="ml-2 font-normal text-muted-foreground">— {name}</span>}
        </h2>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const status = isNew && step.key !== 'basic' ? 'pending' : getStepStatus(step.key);
          const isClickable = !isNew || step.key === 'basic';
          return (
            <div key={step.key} className="flex items-center">
              {i > 0 && <div className={cn('h-px w-8', status === 'complete' ? 'bg-green-400' : 'bg-border')} />}
              <button
                onClick={() => isClickable && setActiveStep(step.key)}
                disabled={!isClickable}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  status === 'active' && 'bg-blue-500 text-white',
                  status === 'complete' && 'bg-green-100 text-green-700 hover:bg-green-200',
                  status === 'warning' && 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                  status === 'pending' && 'bg-muted text-muted-foreground',
                  isClickable && status !== 'active' && 'cursor-pointer',
                  !isClickable && 'cursor-not-allowed opacity-50',
                )}
              >
                {status === 'complete' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : status === 'warning' ? (
                  <AlertCircle className="h-3.5 w-3.5" />
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/20 text-[10px]">{step.num}</span>
                )}
                {t(`admin.step_${step.key}`)}
              </button>
            </div>
          );
        })}
      </div>

      {/* Step 1: Basic Settings */}
      {activeStep === 'basic' && (
        <Card className="p-5">
          <div className="space-y-4 max-w-md">
            <div className="space-y-1">
              <Label htmlFor="config-name">{t('admin.configName')}</Label>
              <Input
                id="config-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('admin.configNameHint')}
                required
              />
              <p className="text-xs text-muted-foreground">{t('admin.configNameDesc')}</p>
            </div>

            <div className="space-y-1">
              <Label>{t('admin.sites')}</Label>
              <Select value={siteId} onValueChange={v => { if (v != null) setSiteId(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.selectSite')} />
                </SelectTrigger>
                <SelectContent>
                  {sites?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('admin.siteDesc')}</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="poll-interval">{t('admin.pollInterval')}</Label>
              <Input
                id="poll-interval"
                value={pollInterval}
                onChange={e => setPollInterval(e.target.value)}
                placeholder="5s"
                className={cn(!isValidPollInterval(pollInterval) && pollInterval && 'border-red-300 focus-visible:ring-red-300')}
              />
              {!isValidPollInterval(pollInterval) && pollInterval ? (
                <p className="text-xs text-red-500">{t('admin.pollIntervalError')}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('admin.pollIntervalHint')}</p>
              )}
            </div>

            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            {saveSuccess && <p className="text-sm text-green-500">{t('admin.save')} ✓</p>}

            <div className="flex gap-2">
              <Button
                onClick={handleSaveBasic}
                disabled={createConfig.isPending || updateConfig.isPending || !name || !siteId || !isValidPollInterval(pollInterval)}
              >
                {isNew ? t('admin.saveAndContinue') : t('admin.save')}
              </Button>
              {!isNew && isBasicComplete && (
                <Button variant="outline" onClick={() => setActiveStep('machines')}>
                  {t('admin.nextStep')} →
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: Select Machines */}
      {activeStep === 'machines' && !isNew && (
        <div className="space-y-3">
          <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
            {t('admin.machinesHint')}
          </div>
          {!siteDetail && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {siteDetail?.lines?.map((line: any) => (
            <Card key={line.id} className="p-4">
              <h3 className="font-medium text-sm mb-3">{line.name}</h3>
              <div className="space-y-3">
                {line.machines?.map((machine: any) => {
                  const checked = isMachineSelected(machine.id);
                  const conn = getMachineConn(machine.id);
                  const hostBad = conn && conn.host && !isValidHost(conn.host);
                  const portBad = conn && !isValidPort(conn.port);
                  const slaveBad = conn && !isValidSlaveId(conn.slave_id);
                  return (
                    <div key={machine.id} className="space-y-2">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={`machine-${machine.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleMachine(machine, line.name)}
                        />
                        <label htmlFor={`machine-${machine.id}`} className="text-sm font-medium cursor-pointer">
                          {machine.name}
                        </label>
                        {machine.model && <span className="text-xs text-muted-foreground">{machine.model}</span>}
                      </div>
                      {checked && conn && (
                        <div className="ml-7 grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">{t('admin.hostAddress')}</Label>
                            <Input
                              className={cn('h-7 text-xs', hostBad && 'border-red-300')}
                              value={conn.host}
                              onChange={e => updateMachineField(machine.id, 'host', e.target.value)}
                              placeholder="192.168.1.1"
                            />
                            {hostBad && <p className="text-[10px] text-red-500">{t('admin.invalidHost')}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t('admin.portLabel')}</Label>
                            <Input
                              className={cn('h-7 text-xs', portBad && 'border-red-300')}
                              type="number"
                              value={conn.port}
                              onChange={e => updateMachineField(machine.id, 'port', parseInt(e.target.value) || 502)}
                            />
                            {portBad && <p className="text-[10px] text-red-500">1–65535</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t('admin.slaveIdLabel')}</Label>
                            <Input
                              className={cn('h-7 text-xs', slaveBad && 'border-red-300')}
                              type="number"
                              value={conn.slave_id}
                              onChange={e => updateMachineField(machine.id, 'slave_id', parseInt(e.target.value) || 1)}
                            />
                            {slaveBad && <p className="text-[10px] text-red-500">1–247</p>}
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

          {machinesSaveError && <p className="text-sm text-red-500">{machinesSaveError}</p>}
          {machinesSaveSuccess && <p className="text-sm text-green-500">{t('admin.save')} ✓</p>}

          <div className="flex gap-2">
            <Button onClick={handleSaveMachines} disabled={setConfigMachines.isPending || !isMachinesComplete}>
              {t('admin.save')}
            </Button>
            {isMachinesComplete && (
              <Button variant="outline" onClick={() => setActiveStep('registers')}>
                {t('admin.nextStep')} →
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Configure Registers */}
      {activeStep === 'registers' && !isNew && (
        <div className="space-y-3">
          <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
            {t('admin.registersHint')}
          </div>
          {selectedMachines.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">{t('admin.noMachinesSelected')}</p>
              <Button variant="link" className="mt-1" onClick={() => setActiveStep('machines')}>
                ← {t('admin.goToMachines')}
              </Button>
            </Card>
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
                  {machine.model && <span className="text-xs text-muted-foreground">{machine.model}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{machine.line_name}</span>
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
          {selectedMachines.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setActiveStep('deploy')}>
                {t('admin.nextStep')} →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Deploy */}
      {activeStep === 'deploy' && !isNew && (
        <div className="space-y-4">
          {/* Readiness checklist */}
          <Card className="p-5">
            <h3 className="font-medium text-sm mb-3">{t('admin.deployChecklist')}</h3>
            <div className="space-y-2 text-sm">
              {[
                { ok: isBasicComplete, label: t('admin.checkBasic') },
                { ok: isMachinesValid, label: t('admin.checkMachines') },
                { ok: selectedMachines.length > 0, label: t('admin.checkRegisters') },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  {item.ok ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className={item.ok ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Download config */}
          <Card className="p-5">
            <h3 className="font-medium text-sm mb-2">{t('admin.deployStep1')}</h3>
            <p className="text-xs text-muted-foreground mb-3">{t('admin.deployStep1Desc')}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setYamlOpen(true)}>
                <Terminal className="h-4 w-4 mr-1" />
                {t('admin.previewYaml')}
              </Button>
              <Button size="sm" onClick={() => downloadYAML.mutate(id!)} disabled={downloadYAML.isPending}>
                <Download className="h-4 w-4 mr-1" />
                {t('admin.downloadYaml')}
              </Button>
            </div>
          </Card>

          {/* Run instructions */}
          <Card className="p-5">
            <h3 className="font-medium text-sm mb-2">{t('admin.deployStep2')}</h3>
            <p className="text-xs text-muted-foreground mb-3">{t('admin.deployStep2Desc')}</p>

            <div className="space-y-4">
              {/* Prerequisites */}
              <div>
                <h4 className="text-xs font-medium uppercase text-muted-foreground mb-1">{t('admin.deployPrereqs')}</h4>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>{t('admin.deployPrereq1')}</li>
                  <li>{t('admin.deployPrereq2')}</li>
                  <li>{t('admin.deployPrereq3')}</li>
                </ul>
              </div>

              {/* Environment */}
              <div>
                <h4 className="text-xs font-medium uppercase text-muted-foreground mb-1">{t('admin.deployEnv')}</h4>
                <p className="text-xs text-muted-foreground mb-2">{t('admin.deployEnvDesc')}</p>
                <CodeBlock
                  code={`# Option 1: Single connection string\nexport DATABASE_URL="postgres://${dbEnv?.user ?? 'dashboard'}:<password>@${dbEnv?.host ?? 'localhost'}:${dbEnv?.port ?? '5432'}/${dbEnv?.db_name ?? 'industry_dashboard'}?sslmode=${dbEnv?.sslmode ?? 'disable'}"\n\n# Option 2: Individual variables (current server values shown)\nexport DB_HOST=${dbEnv?.host ?? 'localhost'}\nexport DB_PORT=${dbEnv?.port ?? '5432'}\nexport DB_USER=${dbEnv?.user ?? 'dashboard'}\nexport DB_PASSWORD=<password>\nexport DB_NAME=${dbEnv?.db_name ?? 'industry_dashboard'}`}
                  copied={copiedCmd}
                  onCopy={copyCmd}
                />
                <p className="mt-1.5 text-[10px] text-muted-foreground">{t('admin.deployEnvNote')}</p>
              </div>

              {/* Fake worker (testing) */}
              <div>
                <h4 className="text-xs font-medium uppercase text-muted-foreground mb-1">
                  {t('admin.deployFakeWorker')}
                </h4>
                <p className="text-xs text-muted-foreground mb-2">{t('admin.deployFakeWorkerDesc')}</p>
                <CodeBlock
                  code={`# ${t('admin.deployFromProjectRoot')}\nmake fake-worker-config CONFIG=./${name || 'worker'}.yaml`}
                  copied={copiedCmd}
                  onCopy={copyCmd}
                />
              </div>

              {/* Production worker */}
              <div>
                <h4 className="text-xs font-medium uppercase text-muted-foreground mb-1">
                  {t('admin.deployRealWorker')}
                </h4>
                <p className="text-xs text-muted-foreground mb-2">{t('admin.deployRealWorkerDesc')}</p>
                <CodeBlock
                  code={`./fake-worker -config ./${name || 'worker'}.yaml`}
                  copied={copiedCmd}
                  onCopy={copyCmd}
                />
              </div>

              {/* Docker */}
              <div>
                <h4 className="text-xs font-medium uppercase text-muted-foreground mb-1">Docker</h4>
                <CodeBlock
                  code={`docker run -d \\\n  -e DATABASE_URL="postgres://user:pass@db-host:5432/industry_dashboard" \\\n  -v $(pwd)/${name || 'worker'}.yaml:/app/config.yaml \\\n  industry-dashboard-worker \\\n  -config /app/config.yaml`}
                  copied={copiedCmd}
                  onCopy={copyCmd}
                />
              </div>
            </div>
          </Card>

          {/* Verify */}
          <Card className="p-5">
            <h3 className="font-medium text-sm mb-2">{t('admin.deployStep3')}</h3>
            <p className="text-xs text-muted-foreground mb-3">{t('admin.deployStep3Desc')}</p>
            <div className="flex gap-2">
              <Link to="/admin/workers">
                <Button size="sm" variant="outline">
                  {t('admin.goToWorkers')} →
                </Button>
              </Link>
            </div>
          </Card>

          {/* Config summary */}
          <Card className="p-5 bg-muted/30">
            <h3 className="text-xs font-medium uppercase text-muted-foreground mb-2">{t('admin.configSummary')}</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">{t('admin.configName')}</span>
              <span className="font-medium">{name}</span>
              <span className="text-muted-foreground">{t('admin.siteLabel')}</span>
              <span className="font-medium">{siteName}</span>
              <span className="text-muted-foreground">{t('admin.pollInterval')}</span>
              <span className="font-medium">{pollInterval}</span>
              <span className="text-muted-foreground">{t('admin.machineCount')}</span>
              <span className="font-medium">{selectedMachines.length}</span>
            </div>
          </Card>
        </div>
      )}

      {/* YAML Preview Dialog */}
      {!isNew && id && (
        <YamlPreviewDialog open={yamlOpen} onClose={() => setYamlOpen(false)} configId={id} />
      )}
    </div>
  );
}

// --- Code block with copy button ---
function CodeBlock({ code, copied, onCopy }: { code: string; copied: string; onCopy: (v: string) => void }) {
  return (
    <div className="group relative">
      <pre className="bg-slate-900 text-slate-200 p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
        {code}
      </pre>
      <button
        onClick={() => onCopy(code)}
        className="absolute right-2 top-2 rounded bg-slate-700 p-1 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-600"
        title="Copy"
      >
        {copied === code ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
