import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useRoles, usePermissions, useRolePermissions, useCreateRole } from '@/lib/hooks';

function RoleDetail({ roleId }: { roleId: string }) {
  const { data: perms } = useRolePermissions(roleId);
  if (!perms) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {perms.map((p: any) => (
        <Badge key={p.id} variant="outline" className="text-xs">{p.code}</Badge>
      ))}
    </div>
  );
}

export function RolesPage() {
  const { data: roles } = useRoles();
  const { data: permissions } = usePermissions();
  const createRole = useCreateRole();
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const handleCreate = async () => {
    if (!newName) return;
    await createRole.mutateAsync({ name: newName, description: newDesc, permission_ids: selectedPerms });
    setNewName('');
    setNewDesc('');
    setSelectedPerms([]);
  };

  const togglePerm = (id: string) => {
    setSelectedPerms((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const permGroups = permissions?.reduce((acc: Record<string, any[]>, p: any) => {
    (acc[p.group_name] = acc[p.group_name] || []).push(p);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Role Management</h2>
        <Dialog>
          <DialogTrigger asChild><Button>Create Role</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create New Role</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Role name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input placeholder="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
              <div className="max-h-64 overflow-y-auto">
                {permGroups && Object.entries(permGroups).map(([group, perms]) => (
                  <div key={group} className="mb-3">
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-400">{group}</p>
                    {(perms as any[]).map((p: any) => (
                      <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm">
                        <Checkbox checked={selectedPerms.includes(p.id)} onCheckedChange={() => togglePerm(p.id)} />
                        <span>{p.code}</span>
                        <span className="text-xs text-slate-400">— {p.description}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <Button onClick={handleCreate} disabled={!newName || createRole.isPending}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-3">
        {roles?.map((r: any) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold">{r.name}</span>
                {r.is_system && <Badge variant="secondary" className="ml-2 text-xs">System</Badge>}
                <p className="text-sm text-slate-500">{r.description}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setExpandedRole(expandedRole === r.id ? null : r.id)}>
                {expandedRole === r.id ? 'Hide' : 'Show'} Permissions
              </Button>
            </div>
            {expandedRole === r.id && (
              <div className="mt-3 border-t pt-3"><RoleDetail roleId={r.id} /></div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
