import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRoles, useDashboardAccess, useSetDashboardAccess } from '@/lib/hooks';

interface Props {
  dashboardId: string;
  open: boolean;
  onClose: () => void;
}

type AccessLevel = 'none' | 'view' | 'edit';

export function ShareDialog({ dashboardId, open, onClose }: Props) {
  const { data: roles } = useRoles();
  const { data: currentAccess } = useDashboardAccess(open ? dashboardId : undefined);
  const setAccess = useSetDashboardAccess();

  const [accessMap, setAccessMap] = useState<Record<string, AccessLevel>>({});

  useEffect(() => {
    if (currentAccess) {
      const map: Record<string, AccessLevel> = {};
      currentAccess.forEach((a: any) => {
        map[a.role_id] = a.access_level as AccessLevel;
      });
      setAccessMap(map);
    }
  }, [currentAccess]);

  const handleSave = async () => {
    const access = Object.entries(accessMap)
      .filter(([, level]) => level !== 'none')
      .map(([roleId, level]) => ({ role_id: roleId, access_level: level }));
    await setAccess.mutateAsync({ dashboardId, access });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Share Dashboard</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {roles?.map((role: any) => (
            <div key={role.id} className="flex items-center justify-between">
              <span className="text-sm font-medium">{role.name}</span>
              <Select
                value={accessMap[role.id] || 'none'}
                onValueChange={(v) =>
                  setAccessMap((prev) => ({ ...prev, [role.id]: (v ?? 'none') as AccessLevel }))
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No access</SelectItem>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          <Button onClick={handleSave} disabled={setAccess.isPending} className="w-full">
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
