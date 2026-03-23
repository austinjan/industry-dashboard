import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useUsers, useRoles, useAssignRole, useRemoveRoleAssignment } from '@/lib/hooks';
import { useSite } from '@/lib/site-context';

export function UsersPage() {
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
      <h2 className="mb-4 text-xl font-bold">User Management</h2>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-400">Loading...</TableCell></TableRow>
            )}
            {users?.map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-slate-500">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.is_active ? 'default' : 'secondary'}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles?.map((r: any) => (
                      <Badge key={r.id} variant="outline" className="gap-1">
                        {r.role_name}{r.site_name ? ` @ ${r.site_name}` : ' (global)'}
                        <button onClick={() => removeRole.mutate(r.id)} className="ml-1 text-red-400 hover:text-red-600">×</button>
                      </Badge>
                    ))}
                    {(!u.roles || u.roles.length === 0) && (
                      <span className="text-xs text-slate-400">No roles</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Dialog>
                    <DialogTrigger>
                      <Button size="sm" variant="outline" onClick={() => setSelectedUser(u.id)}>Assign Role</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Assign Role to {u.name}</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v ?? '')}>
                          <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                          <SelectContent>
                            {roles?.map((r: any) => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectedSite} onValueChange={(v) => setSelectedSite(v ?? '')}>
                          <SelectTrigger><SelectValue placeholder="Global (all sites)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Global</SelectItem>
                            {sites.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button onClick={handleAssign} disabled={!selectedRole}>Assign</Button>
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
