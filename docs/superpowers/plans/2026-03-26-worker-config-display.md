# Worker Running Config Structured Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw JSON config dump in the worker detail panel with a structured, user-friendly card layout that serves both factory managers and IT/OT operations staff.

**Architecture:** The `{/* Running Config */}` section of `WorkerDetail.tsx` is replaced with: (1) a config summary bar showing poll interval, site, timezone; (2) production line sections with machine cards showing register badges; (3) per-machine expandable technical details. No new component files — all changes in `WorkerDetail.tsx`.

**Tech Stack:** React, TypeScript, Tailwind CSS, existing shadcn/ui `Badge` component, react-i18next.

**Spec:** `docs/superpowers/specs/2026-03-26-worker-config-display-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/components/admin/WorkerDetail.tsx` | Modify | Replace JSON config section with structured cards |
| `frontend/src/locales/en.json` | Modify | Add new i18n keys |
| `frontend/src/locales/zh-TW.json` | Modify | Add new i18n keys |
| `frontend/src/locales/th.json` | Modify | Add new i18n keys |
| `frontend/src/locales/vi.json` | Modify | Add new i18n keys |

---

### Task 1: Add i18n Keys

Only a few new keys are needed — most already exist in the locale files. Existing keys to reuse: `admin.pollInterval`, `admin.timezone`, `admin.runningConfig`, `admin.hostAddress`, `admin.portLabel`, `admin.slaveIdLabel`, `admin.registerName`, `admin.registerType`, `admin.registerAddress`, `admin.registerDataType`, `admin.registerByteOrder`, `admin.registerScale`, `admin.noMachines`.

**Files:**
- Modify: `frontend/src/locales/en.json`
- Modify: `frontend/src/locales/zh-TW.json`
- Modify: `frontend/src/locales/th.json`
- Modify: `frontend/src/locales/vi.json`

- [ ] **Step 1: Add new keys to en.json**

Add these keys inside the `"admin"` object (after `"copied": "已複製！"` equivalent in en.json, around line 203):

```json
"simulated": "Simulated",
"siteLabel": "Site",
"noLinesConfigured": "No production lines configured.",
"noRegisters": "No registers configured.",
"registers": "Registers",
"connection": "Connection",
"timeout": "Timeout"
```

- [ ] **Step 2: Add new keys to zh-TW.json**

```json
"simulated": "模擬中",
"siteLabel": "站點",
"noLinesConfigured": "尚未配置產線。",
"noRegisters": "尚未配置暫存器。",
"registers": "暫存器",
"connection": "連線資訊",
"timeout": "逾時"
```

- [ ] **Step 3: Add new keys to th.json**

```json
"simulated": "จำลอง",
"siteLabel": "ไซต์",
"noLinesConfigured": "ยังไม่ได้กำหนดค่าสายการผลิต",
"noRegisters": "ยังไม่ได้กำหนดค่ารีจิสเตอร์",
"registers": "รีจิสเตอร์",
"connection": "การเชื่อมต่อ",
"timeout": "หมดเวลา"
```

- [ ] **Step 4: Add new keys to vi.json**

```json
"simulated": "Mô phỏng",
"siteLabel": "Nhà máy",
"noLinesConfigured": "Chưa cấu hình dây chuyền sản xuất.",
"noRegisters": "Chưa cấu hình thanh ghi.",
"registers": "Thanh ghi",
"connection": "Kết nối",
"timeout": "Thời gian chờ"
```

- [ ] **Step 5: Verify frontend compiles**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/locales/en.json frontend/src/locales/zh-TW.json frontend/src/locales/th.json frontend/src/locales/vi.json
git commit -m "feat(i18n): add keys for structured worker config display"
```

---

### Task 2: Implement Structured Config Display in WorkerDetail

**Files:**
- Modify: `frontend/src/components/admin/WorkerDetail.tsx`

**Context:** The current `{/* Running Config */}` section (the block starting with `{configData && (` and ending with its closing `)}`) shows a show/hide button and raw JSON. Replace it with the structured card layout.

- [ ] **Step 1: Add nanosecond-to-human-readable helper**

Add this helper function at the top of `WorkerDetail.tsx`, after the existing `timeAgo` function (around line 27):

```tsx
function formatNanoseconds(ns: number | null | undefined): string {
  if (!ns) return '—';
  const ms = ns / 1_000_000;
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (Number.isInteger(s)) return `${s}s`;
  return `${parseFloat(s.toFixed(1))}s`;
}
```

- [ ] **Step 2: Replace state and imports**

Remove the `Button` import (line 4) since the show/hide toggle is being removed. Then in the `WorkerDetail` component, remove the `showConfig` state:

```tsx
// REMOVE this line:
const [showConfig, setShowConfig] = useState(false);

// ADD this line:
const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());
```

Add a toggle helper inside the component:

```tsx
const toggleMachine = (key: string) => {
  setExpandedMachines((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
};
```

- [ ] **Step 3: Replace the Running Config section**

Replace the entire `{/* Running Config */}` block (`{configData && ( ... )}`) with the following:

```tsx
{/* Running Config */}
{configData && (
  <div className="space-y-4">
    <p className="text-xs text-muted-foreground">{t('admin.runningConfig')}</p>

    {/* Config Summary Bar */}
    <div className="grid grid-cols-3 gap-4">
      {[
        { label: t('admin.pollInterval'), value: formatNanoseconds(configData.poll_interval) },
        { label: t('admin.siteLabel'), value: configData.site_name ?? '—' },
        { label: t('admin.timezone'), value: configData.timezone ?? '—' },
      ].map(({ label, value }) => (
        <div key={label}>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium mt-0.5">{value}</p>
        </div>
      ))}
    </div>

    {/* Production Lines */}
    {(!configData.lines || configData.lines.length === 0) ? (
      <p className="text-xs text-muted-foreground">{t('admin.noLinesConfigured')}</p>
    ) : (
      [...configData.lines]
        .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((line: any) => (
          <div key={line.name}>
            <p className="text-sm font-semibold mb-2">{line.name}</p>
            {(!line.machines || line.machines.length === 0) ? (
              <p className="text-xs text-muted-foreground">{t('admin.noMachines')}</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {line.machines.map((machine: any) => {
                  const machineKey = `${line.name}::${machine.name}`;
                  const isExpanded = expandedMachines.has(machineKey);
                  return (
                    <div
                      key={machineKey}
                      className="bg-slate-800 rounded-lg p-3 min-w-[220px] max-w-[320px]"
                    >
                      {/* Machine header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold">{machine.name}</p>
                          {machine.model && (
                            <p className="text-xs text-muted-foreground">{machine.model}</p>
                          )}
                        </div>
                        <button
                          onClick={() => toggleMachine(machineKey)}
                          aria-expanded={isExpanded}
                          className="text-muted-foreground hover:text-slate-200 transition-transform p-1"
                        >
                          <svg
                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>

                      {/* Register badges */}
                      {(!machine.registers || machine.registers.length === 0) ? (
                        <p className="text-xs text-muted-foreground mt-2">{t('admin.noRegisters')}</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {machine.registers.map((reg: any) => (
                            <span key={reg.name} className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-xs">
                                {reg.name}
                              </Badge>
                              {reg.fake && (
                                <Badge className="text-[10px] bg-amber-500/20 text-amber-500 hover:bg-amber-500/20">
                                  {t('admin.simulated')}
                                </Badge>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Expanded technical details */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-3">
                          {/* Connection */}
                          {machine.connection && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">{t('admin.connection')}</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-muted-foreground">{t('admin.hostAddress')}</span>
                                <span>{machine.connection.host}</span>
                                <span className="text-muted-foreground">{t('admin.portLabel')}</span>
                                <span>{machine.connection.port}</span>
                                <span className="text-muted-foreground">{t('admin.slaveIdLabel')}</span>
                                <span>{machine.connection.slave_id}</span>
                                <span className="text-muted-foreground">{t('admin.timeout')}</span>
                                <span>{formatNanoseconds(machine.connection.timeout)}</span>
                              </div>
                            </div>
                          )}

                          {/* Registers table */}
                          {machine.registers && machine.registers.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">{t('admin.registers')}</p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground">
                                    <th className="text-left font-normal pr-2">{t('admin.registerName')}</th>
                                    <th className="text-left font-normal pr-2">{t('admin.registerType')}</th>
                                    <th className="text-left font-normal pr-2">{t('admin.registerAddress')}</th>
                                    <th className="text-left font-normal pr-2">{t('admin.registerDataType')}</th>
                                    <th className="text-left font-normal pr-2">{t('admin.registerByteOrder')}</th>
                                    <th className="text-left font-normal">{t('admin.registerScale')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {machine.registers.map((reg: any) => (
                                    <tr key={reg.name}>
                                      <td className="pr-2">{reg.name}</td>
                                      <td className="pr-2">{reg.type}</td>
                                      <td className="pr-2">{reg.address}</td>
                                      <td className="pr-2">{reg.data_type}</td>
                                      <td className="pr-2">{reg.byte_order}</td>
                                      <td>{reg.scale}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))
    )}
  </div>
)}
```

- [ ] **Step 4: Remove unused i18n keys from imports (cleanup)**

The `admin.showConfig` and `admin.hideConfig` i18n keys are no longer used by any component. Check with grep that no other file references them. If unused, remove them from all 4 locale files.

Run: `cd frontend && grep -r "showConfig\|hideConfig" src/ --include="*.tsx" --include="*.ts"`

If no results (or only the locale files themselves), remove the keys from all 4 locale JSON files.

- [ ] **Step 5: Verify frontend compiles**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Manual verification**

Run: `cd frontend && npm run dev`

Open the Workers page at `/admin/workers`. Expand a worker row and verify:
1. Config summary bar shows poll interval, site name, timezone
2. Production line section shows with line name header
3. Machine cards show with name, model, register badges
4. Registers with `fake` settings show amber "Simulated" badge
5. Clicking the chevron expands to show connection details and registers table
6. Clicking again collapses

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/admin/WorkerDetail.tsx
git commit -m "feat: replace raw JSON config with structured card display for workers"
```

If unused i18n keys were removed in Step 4:

```bash
git add frontend/src/locales/en.json frontend/src/locales/zh-TW.json frontend/src/locales/th.json frontend/src/locales/vi.json
git commit -m "chore: remove unused showConfig/hideConfig i18n keys"
```
