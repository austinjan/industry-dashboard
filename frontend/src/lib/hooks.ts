import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { getRefreshInterval } from './refresh-interval';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function mutateJSON<T>(path: string, options: RequestInit): Promise<T> {
  const res = await apiFetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.trim() || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function useSiteLines(siteId: string | undefined) {
  return useQuery({
    queryKey: ['lines', siteId],
    queryFn: () => fetchJSON<any[]>(`/sites/${siteId}/lines`),
    enabled: !!siteId,
  });
}

export function useLineMachines(lineId: string | undefined) {
  return useQuery({
    queryKey: ['machines', lineId],
    queryFn: () => fetchJSON<any[]>(`/lines/${lineId}/machines`),
    enabled: !!lineId,
  });
}

export function useSiteSummary(siteId: string | undefined) {
  return useQuery({
    queryKey: ['site-summary', siteId],
    queryFn: () => fetchJSON<any>(`/sites/${siteId}/summary`),
    enabled: !!siteId,
    refetchInterval: getRefreshInterval(),
  });
}

export function useAlerts(siteId: string | undefined, params?: Record<string, string>) {
  const query = new URLSearchParams({ site_id: siteId ?? '', ...params }).toString();
  return useQuery({
    queryKey: ['alerts', siteId, params],
    queryFn: () => fetchJSON<any[]>(`/alerts?${query}`),
    enabled: !!siteId,
  });
}

export function useAlertEvents(siteId: string | undefined, params?: Record<string, string>) {
  const query = new URLSearchParams({ site_id: siteId ?? '', ...params }).toString();
  return useQuery({
    queryKey: ['alert-events', siteId, params],
    queryFn: () => fetchJSON<any[]>(`/alert-events?${query}`),
    enabled: !!siteId,
    refetchInterval: getRefreshInterval(),
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      apiFetch(`/alert-events/${eventId}/acknowledge`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-events'] }),
  });
}

export function useDataPoints(machineId: string | undefined, metric: string, timeRange: string) {
  return useQuery({
    queryKey: ['datapoints', machineId, metric, timeRange],
    queryFn: () => fetchJSON<any[]>(`/datapoints?machine_id=${machineId}&metric=${metric}&range=${timeRange}`),
    enabled: !!machineId && !!metric,
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => fetchJSON<any[]>('/users'),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => fetchJSON<any[]>('/rbac/roles'),
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: () => fetchJSON<any[]>('/rbac/permissions'),
  });
}

export function useRolePermissions(roleId: string | undefined) {
  return useQuery({
    queryKey: ['role-permissions', roleId],
    queryFn: () => fetchJSON<any[]>(`/rbac/roles/${roleId}/permissions`),
    enabled: !!roleId,
  });
}

export function useAuditLogs(params?: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => fetchJSON<any[]>(`/audit-logs?${query}`),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description: string; permission_ids: string[] }) =>
      apiFetch('/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useAssignRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string; role_id: string; site_id?: string }) =>
      apiFetch('/rbac/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useRemoveRoleAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/rbac/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

// Dashboards
export function useDashboards(siteId: string | undefined) {
  return useQuery({
    queryKey: ['dashboards', siteId],
    queryFn: () => fetchJSON<any[]>(`/dashboards?site_id=${siteId}`),
    enabled: !!siteId,
  });
}

export function useDashboard(id: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => fetchJSON<any>(`/dashboards/${id}`),
    enabled: !!id,
  });
}

export function useWidgetTypes() {
  return useQuery({
    queryKey: ['widget-types'],
    queryFn: () => fetchJSON<any[]>('/widget-types'),
  });
}

export function useDashboardAccess(id: string | undefined) {
  return useQuery({
    queryKey: ['dashboard-access', id],
    queryFn: () => fetchJSON<any[]>(`/dashboards/${id}/access`),
    enabled: !!id,
  });
}

export function useCreateDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; site_id: string }) =>
      apiFetch('/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
  });
}

export function useUpdateDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiFetch(`/dashboards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
  });
}

export function useDeleteDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/dashboards/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
  });
}

export function useSaveWidgets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, widgets }: { dashboardId: string; widgets: any[] }) =>
      apiFetch(`/dashboards/${dashboardId}/widgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['dashboard', vars.dashboardId] }),
  });
}

export function useSetDashboardAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, access }: { dashboardId: string; access: any[] }) =>
      apiFetch(`/dashboards/${dashboardId}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['dashboard-access', vars.dashboardId] }),
  });
}

export function useUpdateLocale() {
  return useMutation({
    mutationFn: async (locale: string) => {
      const res = await apiFetch('/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) throw new Error('Failed to update locale');
      return res.json();
    },
  });
}

export function useLatestValues(machineId: string | undefined) {
  return useQuery({
    queryKey: ['machine-latest', machineId],
    queryFn: () => fetchJSON<Record<string, number>>(`/machines/${machineId}/latest`),
    enabled: !!machineId,
    refetchInterval: getRefreshInterval(),
  });
}

// Admin: Sites & Machines

export function useAdminSites() {
  return useQuery({
    queryKey: ['admin-sites'],
    queryFn: () => fetchJSON<any[]>('/admin/sites'),
  });
}

export function useSiteDetail(siteId: string | undefined) {
  return useQuery({
    queryKey: ['site-detail', siteId],
    queryFn: () => fetchJSON<any>(`/sites/${siteId}/detail`),
    enabled: !!siteId,
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; code: string; timezone: string; address?: string }) =>
      mutateJSON('/sites', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-sites'] }),
  });
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; timezone: string; address?: string }) =>
      mutateJSON(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-sites'] });
      qc.invalidateQueries({ queryKey: ['site-detail'] });
    },
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateJSON(`/sites/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-sites'] }),
  });
}

export function useCreateLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, ...data }: { siteId: string; name: string; display_order: number }) =>
      mutateJSON(`/sites/${siteId}/lines`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site-detail'] }),
  });
}

export function useUpdateLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; display_order: number }) =>
      mutateJSON(`/lines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site-detail'] }),
  });
}

export function useDeleteLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateJSON(`/lines/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-detail'] });
      qc.invalidateQueries({ queryKey: ['admin-sites'] });
    },
  });
}

export function useCreateMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, ...data }: { lineId: string; name: string; model?: string; host?: string; port?: number; slave_id?: number }) =>
      mutateJSON(`/lines/${lineId}/machines`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site-detail'] }),
  });
}

export function useUpdateMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; model?: string; host?: string; port?: number; slave_id?: number }) =>
      mutateJSON(`/machines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site-detail'] }),
  });
}

export function useDeleteMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateJSON(`/machines/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-detail'] });
      qc.invalidateQueries({ queryKey: ['admin-sites'] });
    },
  });
}

// Admin: Workers

export function useWorkers() {
  return useQuery({
    queryKey: ['workers'],
    queryFn: () => fetchJSON<any[]>('/workers'),
    refetchInterval: getRefreshInterval(),
  });
}

export function useWorkerDetail(workerId: string | undefined) {
  return useQuery({
    queryKey: ['worker-detail', workerId],
    queryFn: () => fetchJSON<any>(`/workers/${workerId}`),
    enabled: !!workerId,
    refetchInterval: getRefreshInterval(),
  });
}

export function useSendWorkerCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workerId, command }: { workerId: string; command: string }) =>
      mutateJSON(`/workers/${workerId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ command }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workers'] });
      qc.invalidateQueries({ queryKey: ['worker-detail'] });
    },
  });
}

// Worker Configs
export function useWorkerConfigs() {
  return useQuery({ queryKey: ['worker-configs'], queryFn: () => fetchJSON<any[]>('/worker-configs') });
}
export function useWorkerConfig(id: string | undefined) {
  return useQuery({ queryKey: ['worker-config', id], queryFn: () => fetchJSON<any>(`/worker-configs/${id}`), enabled: !!id });
}
export function useCreateWorkerConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; site_id: string; poll_interval: string }) => mutateJSON('/worker-configs', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-configs'] }),
  });
}
export function useUpdateWorkerConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; site_id: string; poll_interval: string }) => mutateJSON(`/worker-configs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['worker-configs'] }); qc.invalidateQueries({ queryKey: ['worker-config'] }); },
  });
}
export function useDeleteWorkerConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateJSON(`/worker-configs/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-configs'] }),
  });
}
export function useSetConfigMachines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ configId, machines }: { configId: string; machines: any[] }) => mutateJSON(`/worker-configs/${configId}/machines`, { method: 'PUT', body: JSON.stringify({ machines }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-config'] }),
  });
}
export function useMachineRegisters(machineId: string | undefined) {
  return useQuery({ queryKey: ['machine-registers', machineId], queryFn: () => fetchJSON<any>(`/machines/${machineId}/registers`), enabled: !!machineId });
}
export function useSetMachineRegisters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ machineId, registers }: { machineId: string; registers: any[] }) => mutateJSON(`/machines/${machineId}/registers`, { method: 'PUT', body: JSON.stringify({ registers }) }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['machine-registers', vars.machineId] }),
  });
}
export function useImportRegistersCSV() {
  return useMutation({
    mutationFn: ({ machineId, csv }: { machineId: string; csv: string }) =>
      apiFetch(`/machines/${machineId}/registers/import`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv })
        .then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
  });
}
export function useDownloadWorkerConfigYAML() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/worker-configs/${id}/yaml`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'config.yaml';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    },
  });
}
