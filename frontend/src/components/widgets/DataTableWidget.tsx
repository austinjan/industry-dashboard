import { useLineMachines } from '@/lib/hooks';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function DataTableWidget({ config }: { config: Record<string, unknown> }) {
  const lineId = config.line_id as string | undefined;
  const { data: machines } = useLineMachines(lineId);
  return (
    <div className="h-full overflow-auto">
      <p className="mb-1 text-xs text-slate-500">{(config.title as string) || 'Data Table'}</p>
      {machines && machines.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {machines.map((m: { id: string; name: string; model: string; status: string }) => (
              <TableRow key={m.id}>
                <TableCell>{m.name}</TableCell>
                <TableCell>{m.model}</TableCell>
                <TableCell>{m.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="py-4 text-center text-xs text-slate-400">No data</p>
      )}
    </div>
  );
}
