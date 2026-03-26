import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWorkerDetail, useWorkerConfig } from '@/lib/hooks';

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
  const { data: configData } = useWorkerConfig(workerId);
  const [showConfig, setShowConfig] = useState(false);

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
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-muted-foreground">{t('admin.runningConfig')}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowConfig(!showConfig)}
            >
              {showConfig ? t('admin.hideConfig') : t('admin.showConfig')}
            </Button>
          </div>
          {showConfig && (
            <div className="bg-slate-950 rounded p-3 overflow-auto max-h-96">
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(configData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
