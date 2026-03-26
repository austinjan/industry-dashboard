import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useWorkerDetail, useWorkerRunningConfig } from '@/lib/hooks';

interface WorkerDetailProps {
  workerId: string;
}

function formatUptime(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatNanoseconds(ns: number | null | undefined): string {
  if (ns == null) return '—';
  const ms = ns / 1_000_000;
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (Number.isInteger(s)) return `${s}s`;
  return `${parseFloat(s.toFixed(1))}s`;
}

const machineStatusDot: Record<string, string> = {
  running: 'bg-green-500',
  error: 'bg-red-500',
  offline: 'bg-slate-500',
};

const commandStatusBadge: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-500',
  failed: 'bg-red-500/20 text-red-500',
  pending: 'bg-yellow-500/20 text-yellow-500',
  in_progress: 'bg-blue-500/20 text-blue-500',
};

const commandStatusKey: Record<string, string> = {
  completed: 'admin.commandCompleted',
  failed: 'admin.commandFailed',
  pending: 'admin.commandPending',
  in_progress: 'admin.commandInProgress',
};

export function WorkerDetail({ workerId }: WorkerDetailProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useWorkerDetail(workerId);
  const { data: configData } = useWorkerRunningConfig(workerId);
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());

  const toggleMachine = (key: string) => {
    setExpandedMachines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading || !data) {
    return (
      <div className="px-6 py-4 text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  const recentCommands = (data.recent_commands ?? []).slice(0, 3);

  return (
    <div className="px-6 py-4 space-y-4 bg-slate-900/40">
      {/* Metadata grid */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: t('admin.versionLabel'), value: data.version ?? '—' },
          { label: t('admin.osLabel'), value: data.os ?? '—' },
          { label: t('admin.pidLabel'), value: data.pid ?? '—' },
          {
            label: t('admin.uptimeLabel'),
            value: data.started_at ? formatUptime(data.started_at) : '—',
          },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-medium mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Machines */}
      {data.machines && data.machines.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">{t('admin.machineCount')}</p>
          <div className="flex flex-wrap gap-2">
            {data.machines.map((m: any) => (
              <span
                key={m.id}
                className="flex items-center gap-1.5 bg-slate-800 text-slate-200 px-2 py-1 rounded text-xs"
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${machineStatusDot[m.status] ?? 'bg-slate-500'}`}
                />
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent Commands */}
      {recentCommands.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">{t('admin.recentCommands')}</p>
          <div className="space-y-1">
            {recentCommands.map((cmd: any) => (
              <div key={cmd.id} className="flex items-center gap-3 text-sm">
                <span className="font-mono">{cmd.command}</span>
                <Badge
                  className={`text-xs ${commandStatusBadge[cmd.status] ?? 'bg-slate-500/20 text-slate-400'}`}
                >
                  {t(commandStatusKey[cmd.status] ?? 'admin.commandPending')}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {cmd.created_at ? timeAgo(cmd.created_at) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Running Config */}
      {configData && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{t('admin.runningConfig')}</p>

          {/* Config Summary Bar */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: t('admin.pollInterval'), value: formatNanoseconds(configData.poll_interval) },
              { label: t('admin.siteLabel'), value: configData.site_name ?? '—' },
              { label: t('admin.timezone'), value: configData.timezone ?? '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Production Lines */}
          {(!configData.lines || configData.lines.length === 0) ? (
            <p className="text-xs text-muted-foreground">{t('admin.noLinesConfigured')}</p>
          ) : (
            [...configData.lines]
              .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
              .map((line: any) => (
                <div key={line.name}>
                  <p className="text-sm font-semibold mb-2">{line.name}</p>
                  {(!line.machines || line.machines.length === 0) ? (
                    <p className="text-xs text-muted-foreground">{t('admin.noMachines')}</p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {line.machines.map((machine: any) => {
                        const machineKey = `${line.name}::${machine.name}`;
                        const isExpanded = expandedMachines.has(machineKey);
                        return (
                          <div
                            key={machineKey}
                            className={`bg-slate-800 rounded-lg p-3 min-w-[220px] ${isExpanded ? '' : 'max-w-[320px]'}`}
                          >
                            {/* Machine header */}
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-semibold">{machine.name}</p>
                                {machine.model && (
                                  <p className="text-xs text-muted-foreground">{machine.model}</p>
                                )}
                              </div>
                              <button
                                onClick={() => toggleMachine(machineKey)}
                                aria-expanded={isExpanded}
                                className="text-muted-foreground hover:text-slate-200 transition-transform p-1"
                              >
                                <svg
                                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>

                            {/* Register badges */}
                            {(!machine.registers || machine.registers.length === 0) ? (
                              <p className="text-xs text-muted-foreground mt-2">{t('admin.noRegisters')}</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {machine.registers.map((reg: any) => (
                                  <span key={reg.name} className="flex items-center gap-1">
                                    <Badge variant="secondary" className="text-xs">
                                      {reg.name}
                                    </Badge>
                                    {reg.fake && (
                                      <Badge className="text-[10px] bg-amber-500/20 text-amber-500 hover:bg-amber-500/20">
                                        {t('admin.simulated')}
                                      </Badge>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Expanded technical details */}
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-slate-700 space-y-3">
                                {/* Connection */}
                                {machine.connection && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1">{t('admin.connection')}</p>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                      <span className="text-muted-foreground">{t('admin.hostAddress')}</span>
                                      <span>{machine.connection.host}</span>
                                      <span className="text-muted-foreground">{t('admin.portLabel')}</span>
                                      <span>{machine.connection.port}</span>
                                      <span className="text-muted-foreground">{t('admin.slaveIdLabel')}</span>
                                      <span>{machine.connection.slave_id}</span>
                                      <span className="text-muted-foreground">{t('admin.timeout')}</span>
                                      <span>{formatNanoseconds(machine.connection.timeout)}</span>
                                    </div>
                                  </div>
                                )}

                                {/* Registers table */}
                                {machine.registers && machine.registers.length > 0 && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1">{t('admin.registers')}</p>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-muted-foreground">
                                          <th className="text-left font-normal pr-2">{t('admin.registerName')}</th>
                                          <th className="text-left font-normal pr-2">{t('admin.registerType')}</th>
                                          <th className="text-left font-normal pr-2">{t('admin.registerAddress')}</th>
                                          <th className="text-left font-normal pr-2">{t('admin.registerDataType')}</th>
                                          <th className="text-left font-normal pr-2">{t('admin.registerByteOrder')}</th>
                                          <th className="text-left font-normal">{t('admin.registerScale')}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {machine.registers.map((reg: any) => (
                                          <tr key={reg.name}>
                                            <td className="pr-2">{reg.name}</td>
                                            <td className="pr-2">{reg.type}</td>
                                            <td className="pr-2">{reg.address}</td>
                                            <td className="pr-2">{reg.data_type}</td>
                                            <td className="pr-2">{reg.byte_order}</td>
                                            <td>{reg.scale}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
