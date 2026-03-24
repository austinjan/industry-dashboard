import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useUsers, useRoles, useAssignRole, useRemoveRoleAssignment } from '@/lib/hooks';
import { useSite } from '@/lib/site-context';

export function UsersPage() {
  const { t } = useTranslation();
  const { data: users, isLoading } = useUsers();
  const { data: roles } = useRoles();
  const { sites } = useSite();
  const assignRole = useAssignRole();
  const removeRole = useRemoveRoleAssignment();

  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedSite, setSelectedSite] = useState('');

  const handleAssign = () => {
    if (!selectedUser || !selectedRole) return;
    assignRole.mutate({
      user_id: selectedUser,
      role_id: selectedRole,
      site_id: selectedSite || undefined,
    });
    setSelectedRole('');
    setSelectedSite('');
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{t('admin.userManagement')}</h2>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.name')}</TableHead>
              <TableHead>{t('admin.email')}</TableHead>
              <TableHead>{t('admin.status')}</TableHead>
              <TableHead>{t('admin.roles')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-400">{t('common.loading')}</TableCell></TableRow>
            )}
            {users?.map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-slate-500">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.is_active ? 'default' : 'secondary'}>
                    {u.is_active ? t('admin.active') : t('admin.inactive')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles?.map((r: any) => (
                      <Badge key={r.id} variant="outline" className="gap-1">
                        {r.role_name}{r.site_name ? ` @ ${r.site_name}` : ` ${t('admin.global')}`}
                        <button onClick={() => removeRole.mutate(r.id)} className="ml-1 text-red-400 hover:text-red-600">×</button>
                      </Badge>
                    ))}
                    {(!u.roles || u.roles.length === 0) && (
                      <span className="text-xs text-slate-400">{t('admin.noRoles')}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Dialog>
                    <DialogTrigger>
                      <Button size="sm" variant="outline" onClick={() => setSelectedUser(u.id)}>{t('admin.assignRole')}</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{t('admin.assignRoleTo', { name: u.name })}</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v ?? '')}>
                          <SelectTrigger><SelectValue placeholder={t('admin.selectRole')} /></SelectTrigger>
                          <SelectContent>
                            {roles?.map((r: any) => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectedSite} onValueChange={(v) => setSelectedSite(v ?? '')}>
                          <SelectTrigger><SelectValue placeholder={t('admin.globalScope')} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Global</SelectItem>
                            {sites.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button onClick={handleAssign} disabled={!selectedRole}>{t('admin.assign')}</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
