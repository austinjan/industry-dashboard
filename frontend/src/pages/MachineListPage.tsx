import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSite } from '@/lib/site-context';
import { useSiteLines, useLineMachines } from '@/lib/hooks';

function MachinesForLine({ lineId }: { lineId: string }) {
  const { t } = useTranslation();
  const { data: machines, isLoading } = useLineMachines(lineId);
  if (isLoading) return <p className="p-2 text-sm text-slate-400">{t('common.loading')}</p>;
  if (!machines || machines.length === 0) return <p className="p-2 text-sm text-slate-400">{t('machines.noMachines')}</p>;

  const statusColor: Record<string, string> = {
    running: 'bg-green-500', offline: 'bg-slate-400', error: 'bg-red-500', maintenance: 'bg-yellow-500',
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('machines.machine')}</TableHead>
          <TableHead>{t('machines.model')}</TableHead>
          <TableHead>{t('machines.status')}</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {machines.map((m: any) => (
          <TableRow key={m.id}>
            <TableCell className="font-medium">{m.name}</TableCell>
            <TableCell className="text-slate-500">{m.model ?? '—'}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${statusColor[m.status] ?? 'bg-slate-300'}`} />
                <span className="text-sm capitalize">{m.status}</span>
              </div>
            </TableCell>
            <TableCell>
              <Link to={`/machines/${m.id}`} className="text-sm text-blue-500 hover:underline">{t('machines.details')}</Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function MachineListPage() {
  const { t } = useTranslation();
  const { currentSite } = useSite();
  const { data: lines } = useSiteLines(currentSite?.id);

  if (!currentSite) return <div className="text-slate-500">{t('machines.selectSite')}</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{t('machines.heading', { siteName: currentSite.name })}</h2>
      {lines && lines.length > 0 ? (
        <div className="space-y-4">
          {lines.map((line: any) => (
            <Card key={line.id} className="p-4">
              <h3 className="mb-2 font-semibold">{line.name}</h3>
              <MachinesForLine lineId={line.id} />
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-slate-400">{t('machines.noProductionLines')}</p>
      )}
    </div>
  );
}
