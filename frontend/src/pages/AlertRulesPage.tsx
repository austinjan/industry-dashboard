import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSite } from '@/lib/site-context';
import { useAlerts, useDeleteAlert, useBulkAlertAction, useSiteMachines } from '@/lib/hooks';
import AlertRuleDialog from '@/components/alerts/AlertRuleDialog';

interface AlertRule {
  id: string;
  name: string;
  machine_id: string;
  metric_name: string;
  condition: string;
  threshold: number;
  severity: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function AlertRulesPage() {
  const { t } = useTranslation();
  const { currentSite } = useSite();
  const { data: machines } = useSiteMachines(currentSite?.id);
  const { data: rules, isLoading } = useAlerts(currentSite?.id);
  const deleteAlert = useDeleteAlert();
  const bulkAction = useBulkAlertAction();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterMachine, setFilterMachine] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<AlertRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; bulk: boolean } | null>(null);

  const filtered = useMemo(() => {
    if (!rules) return [];
    return (rules as AlertRule[]).filter((r) => {
      if (filterMachine && r.machine_id !== filterMachine) return false;
      if (filterSeverity && r.severity !== filterSeverity) return false;
      if (filterActive === 'active' && !r.is_active) return false;
      if (filterActive === 'inactive' && r.is_active) return false;
      return true;
    });
  }, [rules, filterMachine, filterSeverity, filterActive]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  const handleBulk = async (action: 'enable' | 'disable' | 'delete') => {
    if (action === 'delete') {
      setDeleteTarget({ ids: Array.from(selectedIds), bulk: true });
      return;
    }
    await bulkAction.mutateAsync({
      siteId: currentSite!.id,
      ids: Array.from(selectedIds),
      action,
    });
    setSelectedIds(new Set());
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.bulk) {
      await bulkAction.mutateAsync({
        siteId: currentSite!.id,
        ids: deleteTarget.ids,
        action: 'delete',
      });
      setSelectedIds(new Set());
    } else {
      await deleteAlert.mutateAsync({
        id: deleteTarget.ids[0],
        siteId: currentSite!.id,
      });
    }
    setDeleteTarget(null);
  };

  const handleEdit = (rule: AlertRule) => {
    setEditRule(rule);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditRule(null);
    setDialogOpen(true);
  };

  const getMachineName = (machineId: string) =>
    machines?.find((m: any) => m.id === machineId)?.name ?? machineId;

  const renderCondition = (rule: AlertRule) => {
    if (rule.condition === '==' && (rule.threshold === 0 || rule.threshold === 1)) {
      return `${rule.metric_name} = ${rule.threshold === 1 ? 'ON' : 'OFF'}`;
    }
    return `${rule.metric_name} ${rule.condition} ${rule.threshold}`;
  };

  const severityVariant = (s: string): 'destructive' | 'outline' | 'secondary' => {
    if (s === 'critical') return 'destructive';
    if (s === 'warning') return 'outline';
    return 'secondary';
  };

  if (!currentSite) return <p className="p-6">{t('alertRules.selectSite')}</p>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('alertRules.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('alertRules.subtitle')}</p>
        </div>
        <Button onClick={handleCreate}>{t('alertRules.createButton')}</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={filterMachine} onValueChange={(v) => setFilterMachine(v ?? '')}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder={t('alertRules.allMachines')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alertRules.allMachines')}</SelectItem>
            {machines?.map((m: any) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={(v) => setFilterSeverity(v ?? '')}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('alertRules.allSeverities')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alertRules.allSeverities')}</SelectItem>
            <SelectItem value="critical">{t('alerts.critical')}</SelectItem>
            <SelectItem value="warning">{t('alerts.warning')}</SelectItem>
            <SelectItem value="info">{t('alerts.info')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterActive} onValueChange={(v) => setFilterActive(v ?? '')}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={t('alertRules.allStatus')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alertRules.allStatus')}</SelectItem>
            <SelectItem value="active">{t('alertRules.on')}</SelectItem>
            <SelectItem value="inactive">{t('alertRules.off')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {t('alertRules.bulkSelected', { count: selectedIds.size })}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleBulk('enable')}>{t('alertRules.bulkEnable')}</Button>
            <Button size="sm" variant="outline" onClick={() => handleBulk('disable')}>{t('alertRules.bulkDisable')}</Button>
            <Button size="sm" variant="destructive" onClick={() => handleBulk('delete')}>{t('alertRules.bulkDelete')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>{t('alertRules.clearSelection')}</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>{t('alertRules.name')}</TableHead>
                <TableHead>{t('alertRules.machine')}</TableHead>
                <TableHead>{t('alertRules.condition')}</TableHead>
                <TableHead>{t('alertRules.severity')}</TableHead>
                <TableHead>{t('alertRules.active')}</TableHead>
                <TableHead className="text-right">{t('alertRules.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">{t('alertRules.noRules')}</TableCell></TableRow>
              ) : (
                filtered.map((rule) => (
                  <TableRow key={rule.id} className={selectedIds.has(rule.id) ? 'bg-blue-50 dark:bg-blue-950' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(rule.id)}
                        onCheckedChange={() => toggleSelect(rule.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>{getMachineName(rule.machine_id)}</TableCell>
                    <TableCell>
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                        {renderCondition(rule)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={severityVariant(rule.severity)}>
                        {t(`alerts.${rule.severity}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={rule.is_active ? 'text-green-500' : 'text-red-500'}>●</span>
                      {' '}{rule.is_active ? t('alertRules.on') : t('alertRules.off')}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(rule)}>✏️</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget({ ids: [rule.id], bulk: false })}
                      >
                        🗑️
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <AlertRuleDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditRule(null); }}
        siteId={currentSite.id}
        editRule={editRule}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('alertRules.bulkDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.bulk
                ? t('alertRules.confirmBulkDelete', { count: deleteTarget.ids.length })
                : t('alertRules.confirmDelete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('alertRules.bulkDelete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
