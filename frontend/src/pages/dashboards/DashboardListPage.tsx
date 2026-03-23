import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useSite } from '@/lib/site-context';
import { useDashboards, useCreateDashboard, useDeleteDashboard } from '@/lib/hooks';

export function DashboardListPage() {
  const { currentSite } = useSite();
  const { data: dashboards, isLoading } = useDashboards(currentSite?.id);
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();
  const navigate = useNavigate();
  const [newTitle, setNewTitle] = useState('');

  const handleCreate = async () => {
    if (!newTitle || !currentSite) return;
    const dashboard = await createDashboard.mutateAsync({ title: newTitle, site_id: currentSite.id });
    setNewTitle('');
    navigate(`/dashboards/${dashboard.id}/edit`);
  };

  if (!currentSite) return <div className="text-slate-500">Select a site.</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">My Dashboards</h2>
        <Dialog>
          <DialogTrigger>
            <Button>+ New Dashboard</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Dashboard</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Dashboard title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              />
              <Button
                onClick={handleCreate}
                disabled={!newTitle || createDashboard.isPending}
                className="w-full"
              >
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-slate-400">Loading...</p>}

      <div className="grid grid-cols-3 gap-4">
        {dashboards?.map((d: any) => (
          <Card key={d.id} className="p-4">
            <div className="font-semibold">{d.title}</div>
            <div className="mt-1 text-xs text-slate-500">
              {d.layout_type} · {d.is_shared ? 'Shared' : 'Private'}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <Badge variant={d.access_level === 'edit' ? 'default' : 'secondary'} className="text-xs">
                {d.access_level}
              </Badge>
            </div>
            <div className="mt-3 flex gap-2">
              <Link to={`/dashboards/${d.id}`} className="text-xs text-blue-500 hover:underline">View</Link>
              {d.access_level === 'edit' && (
                <>
                  <Link to={`/dashboards/${d.id}/edit`} className="text-xs text-blue-500 hover:underline">Edit</Link>
                  <button
                    onClick={() => deleteDashboard.mutate(d.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </Card>
        ))}
        {dashboards && dashboards.length === 0 && (
          <p className="col-span-3 text-sm text-slate-400">No dashboards yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
