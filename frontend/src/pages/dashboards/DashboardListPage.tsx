import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Plus, Share2, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useSite } from '@/lib/site-context';
import { useAuth } from '@/lib/auth';
import { useDashboards, useCreateDashboard, useDeleteDashboard, useUpdateDashboard } from '@/lib/hooks';
import { ShareDialog } from './ShareDialog';

function relativeTime(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day ago`;
}

export function DashboardListPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentSite } = useSite();
  const { data: dashboards, isLoading } = useDashboards(currentSite?.id);
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();
  const updateDashboard = useUpdateDashboard();
  const navigate = useNavigate();
  const [newTitle, setNewTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [shareTargetId, setShareTargetId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreate = async () => {
    if (!newTitle || !currentSite) return;
    const dashboard = await createDashboard.mutateAsync({ title: newTitle, site_id: currentSite.id });
    setNewTitle('');
    navigate(`/dashboards/${dashboard.id}/edit`);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteDashboard.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleRename = () => {
    if (!renameTarget || !renameValue.trim()) return;
    updateDashboard.mutate({ id: renameTarget.id, title: renameValue.trim() });
    setRenameTarget(null);
    setRenameValue('');
  };

  if (!currentSite) return <div className="text-muted-foreground">{t('dashboardList.selectSite')}</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('dashboardList.title')}</h2>
        <Dialog>
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4 mr-1" /> {t('dashboardList.newDashboard')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('dashboardList.createTitle')}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder={t('dashboardList.titlePlaceholder')}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              />
              <Button
                onClick={handleCreate}
                disabled={!newTitle || createDashboard.isPending}
                className="w-full"
              >
                {t('dashboardList.create')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-muted-foreground">{t('common.loading')}</p>}

      <div className="grid grid-cols-3 gap-4">
        {dashboards?.map((d: any) => (
          <Card key={d.id} className="group p-4 transition-colors hover:bg-slate-50">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{d.title}</span>
              </div>
              {d.owner_id === user?.id ? (
                <Badge variant="default" className="text-[10px]">{t('dashboardList.owner')}</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">{t('dashboardList.shared')}</Badge>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {d.is_shared ? (
                <span className="flex items-center gap-1"><Share2 className="h-3 w-3" /> {t('dashboardList.shared')}</span>
              ) : (
                <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> {t('dashboardList.private')}</span>
              )}
              <span>·</span>
              <span>{t('dashboardList.updated', { time: relativeTime(d.updated_at) })}</span>
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              <Link to={`/dashboards/${d.id}`} className="text-blue-600 hover:underline">{t('dashboardList.view')}</Link>
              {d.access_level === 'edit' && (
                <>
                  <Link to={`/dashboards/${d.id}/edit`} className="text-blue-600 hover:underline">{t('dashboardList.edit')}</Link>
                  <button
                    onClick={() => { setRenameTarget({ id: d.id, title: d.title }); setRenameValue(d.title); }}
                    className="text-blue-600 hover:underline"
                  >
                    {t('dashboardList.rename')}
                  </button>
                  {d.owner_id === user?.id && (
                    <button
                      onClick={() => setShareTargetId(d.id)}
                      className="text-blue-600 hover:underline"
                    >
                      {t('dashboardList.share')}
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteTarget({ id: d.id, title: d.title })}
                    className="text-red-500 hover:underline"
                  >
                    {t('dashboardList.delete')}
                  </button>
                </>
              )}
            </div>
          </Card>
        ))}
        {dashboards && dashboards.length === 0 && (
          <div className="col-span-3 flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center">
            <LayoutDashboard className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium text-muted-foreground">{t('dashboardList.emptyTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('dashboardList.emptyDescription')}</p>
          </div>
        )}
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) { setRenameTarget(null); setRenameValue(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboardList.rename')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setRenameTarget(null); setRenameValue(''); }}>
                {t('dashboardList.cancel')}
              </Button>
              <Button onClick={handleRename} disabled={!renameValue.trim()}>
                {t('dashboardList.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      {shareTargetId && (
        <ShareDialog
          dashboardId={shareTargetId}
          open={!!shareTargetId}
          onClose={() => setShareTargetId(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboardList.delete')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('dashboardList.confirmDelete', { name: deleteTarget?.title })}
          </p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('dashboardList.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t('dashboardList.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
