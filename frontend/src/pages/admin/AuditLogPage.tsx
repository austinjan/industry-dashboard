import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useAuditLogs } from '@/lib/hooks';

export function AuditLogPage() {
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [page, setPage] = useState(0);
  const limit = 25;

  const params: Record<string, string> = { limit: String(limit), offset: String(page * limit) };
  if (action) params.action = action;
  if (resourceType) params.resource_type = resourceType;

  const { data: logs, isLoading } = useAuditLogs(params);

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Audit Log</h2>
      <div className="mb-4 flex items-center gap-3">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="assign">Assign</SelectItem>
            <SelectItem value="remove">Remove</SelectItem>
            <SelectItem value="acknowledge">Acknowledge</SelectItem>
          </SelectContent>
        </Select>
        <Select value={resourceType} onValueChange={setResourceType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All resources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="site">Site</SelectItem>
            <SelectItem value="role">Role</SelectItem>
            <SelectItem value="user_site_role">Role Assignment</SelectItem>
            <SelectItem value="alert">Alert</SelectItem>
            <SelectItem value="alert_event">Alert Event</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-400">Loading...</TableCell></TableRow>
            )}
            {logs && logs.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-400">No audit logs.</TableCell></TableRow>
            )}
            {logs?.map((log: any) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm text-slate-500">{new Date(log.timestamp).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{log.user_id?.slice(0, 8) ?? '—'}</TableCell>
                <TableCell className="font-medium">{log.action}</TableCell>
                <TableCell className="text-sm">
                  {log.resource_type}
                  {log.resource_id && <span className="text-slate-400"> #{log.resource_id.slice(0, 8)}</span>}
                </TableCell>
                <TableCell className="text-sm text-slate-400">{log.ip_address ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="mt-3 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>Previous</Button>
        <span className="text-sm text-slate-500">Page {page + 1}</span>
        <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={!logs || logs.length < limit}>Next</Button>
      </div>
    </div>
  );
}
