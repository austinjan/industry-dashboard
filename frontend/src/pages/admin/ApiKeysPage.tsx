import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/lib/hooks';

export function ApiKeysPage() {
  const { t } = useTranslation();
  const { data: keys, isLoading } = useApiKeys();
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  function handleCreate() {
    if (!keyName.trim()) return;
    createMutation.mutate(
      { name: keyName.trim() },
      {
        onSuccess: (data: any) => {
          setCreatedKey(data.api_key);
          setKeyName('');
        },
      }
    );
  }

  function handleCopy() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleCloseCreate() {
    setCreateOpen(false);
    setCreatedKey(null);
    setKeyName('');
    setCopied(false);
  }

  function handleRevoke() {
    if (!revokeTarget) return;
    revokeMutation.mutate(revokeTarget.id, {
      onSuccess: () => setRevokeTarget(null),
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('admin.apiKeys')}</h2>
        <Button onClick={() => setCreateOpen(true)}>{t('admin.createKey')}</Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.keyName')}</TableHead>
              <TableHead>{t('admin.keyPrefix')}</TableHead>
              <TableHead>{t('admin.status')}</TableHead>
              <TableHead>{t('admin.createdAt')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && keys && keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400">
                  —
                </TableCell>
              </TableRow>
            )}
            {keys?.map((key: any) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell className="font-mono text-sm text-slate-500">{key.key_prefix}...</TableCell>
                <TableCell>
                  {key.is_active ? (
                    <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                      {t('admin.active')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{t('admin.revoked')}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-slate-500">
                  {new Date(key.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  {key.is_active && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setRevokeTarget({ id: key.id, name: key.name })}
                    >
                      {t('admin.revokeKey')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create Key Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) handleCloseCreate(); else setCreateOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.createKey')}</DialogTitle>
          </DialogHeader>
          {!createdKey ? (
            <>
              <div className="py-2">
                <label className="mb-1 block text-sm font-medium">{t('admin.keyName')}</label>
                <Input
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. dashboard-cli"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseCreate}>{t('admin.cancel')}</Button>
                <Button onClick={handleCreate} disabled={!keyName.trim() || createMutation.isPending}>
                  {t('admin.create')}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="py-2">
                <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 border border-amber-200">
                  {t('admin.keyCreated')}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-slate-100 px-3 py-2 text-sm font-mono break-all">
                    {createdKey}
                  </code>
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? t('admin.copied') : t('admin.copyKey')}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseCreate}>{t('admin.cancel')}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.revokeKey')}</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-slate-600">{t('admin.confirmRevoke')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>{t('admin.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revokeMutation.isPending}
            >
              {t('admin.revokeKey')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
