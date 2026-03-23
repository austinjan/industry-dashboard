import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
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
    refetchInterval: 30000,
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
    refetchInterval: 30000,
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
