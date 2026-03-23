import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSite } from '@/lib/site-context';
import { useAlertEvents, useAcknowledgeAlert } from '@/lib/hooks';

export function AlertsPage() {
  const { currentSite } = useSite();
  const [severity, setSeverity] = useState('');
  const params: Record<string, string> = { limit: '50' };
  if (severity) params.severity = severity;

  const { data: events, isLoading } = useAlertEvents(currentSite?.id, params);
  const acknowledge = useAcknowledgeAlert();

  if (!currentSite) return <div className="text-slate-500">Select a site.</div>;

  const severityBadge = (s: string) => {
    switch (s) {
      case 'critical': return <Badge variant="destructive">{s}</Badge>;
      case 'warning': return <Badge className="bg-yellow-100 text-yellow-800">{s}</Badge>;
      default: return <Badge variant="secondary">{s}</Badge>;
    }
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Alerts — {currentSite.name}</h2>
      <div className="mb-4 flex items-center gap-3">
        <Select value={severity} onValueChange={(v) => setSeverity(v ?? '')}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All severities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Alert</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Triggered</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-slate-400">Loading...</TableCell></TableRow>
            )}
            {events && events.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-slate-400">No alerts.</TableCell></TableRow>
            )}
            {events?.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{severityBadge(e.severity)}</TableCell>
                <TableCell className="font-medium">{e.alert_name}</TableCell>
                <TableCell>{e.machine_name}</TableCell>
                <TableCell className="text-sm text-slate-500">{new Date(e.triggered_at).toLocaleString()}</TableCell>
                <TableCell>
                  {e.resolved_at ? (
                    <Badge variant="outline" className="text-green-600">Resolved</Badge>
                  ) : e.acknowledged_by ? (
                    <Badge variant="outline" className="text-blue-600">Acknowledged</Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-600">Open</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!e.resolved_at && !e.acknowledged_by && (
                    <Button size="sm" variant="outline" onClick={() => acknowledge.mutate(e.id)} disabled={acknowledge.isPending}>
                      Acknowledge
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
