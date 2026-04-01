# Alert List Widget Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the AlertListWidget with severity-tinted rows, relative timestamps, most-recent-first sorting, and a clickable title linking to the alerts page.

**Architecture:** Single-file refactor of `AlertListWidget.tsx`. Add an inline `relativeTime` helper, update the `useAlertEvents` call with sort params, restyle rows with Tailwind severity colors, and wrap the title in a `Link`.

**Tech Stack:** React, TypeScript, Tailwind CSS, react-router-dom `Link`, existing `useAlertEvents` hook

---

### Task 1: Add sort params and relative time helper

**Files:**
- Modify: `frontend/src/components/widgets/AlertListWidget.tsx`

- [ ] **Step 1: Add the relative time helper function**

Add this above the component in `AlertListWidget.tsx`:

```typescript
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
```

- [ ] **Step 2: Update useAlertEvents call to sort by triggered_at desc**

Change the hook call from:

```typescript
const { data } = useAlertEvents(currentSite?.id, { limit: String(limit || 5) });
```

To:

```typescript
const { data } = useAlertEvents(currentSite?.id, {
  limit: String(limit || 5),
  sort_by: 'triggered_at',
  sort_order: 'desc',
});
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/widgets/AlertListWidget.tsx
git commit -m "feat(alert-widget): add relative time helper and sort by most recent"
```

---

### Task 2: Restyle rows with severity-tinted backgrounds

**Files:**
- Modify: `frontend/src/components/widgets/AlertListWidget.tsx`

- [ ] **Step 1: Add severity style mapping**

Add this below the `relativeTime` function:

```typescript
const severityStyles: Record<string, { row: string; badge: string; text: string; label: string }> = {
  critical: {
    row: 'bg-red-500/15 rounded-md px-3 py-2 mb-1.5',
    badge: 'bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0',
    text: 'text-red-300 text-xs truncate flex-1',
    label: 'CRIT',
  },
  warning: {
    row: 'bg-amber-500/12 rounded-md px-3 py-2 mb-1.5',
    badge: 'bg-amber-500 text-slate-900 text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0',
    text: 'text-amber-300 text-xs truncate flex-1',
    label: 'WARN',
  },
  info: {
    row: 'bg-blue-500/10 rounded-md px-3 py-2 mb-1.5',
    badge: 'bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0',
    text: 'text-blue-300 text-xs truncate flex-1',
    label: 'INFO',
  },
};
```

- [ ] **Step 2: Replace the event list rendering**

Replace the existing `events?.map(...)` block and empty state with:

```tsx
{events?.map((e: { id: string; severity: string; machine_name: string; alert_name: string; triggered_at: string }) => {
  const style = severityStyles[e.severity] || severityStyles.info;
  return (
    <div key={e.id} className={`flex items-center gap-2 ${style.row}`}>
      <span className={style.badge}>{style.label}</span>
      <span className={style.text}>{e.machine_name} — {e.alert_name}</span>
      <span className="text-slate-500 text-[10px] shrink-0">{relativeTime(e.triggered_at)}</span>
    </div>
  );
})}
{(!events || events.length === 0) && (
  <p className="py-2 text-xs text-slate-500 text-center">No active alerts</p>
)}
```

- [ ] **Step 3: Remove the Badge import**

The `Badge` component from `@/components/ui/badge` is no longer used. Remove the import:

```typescript
// Remove this line:
import { Badge } from '@/components/ui/badge';
```

- [ ] **Step 4: Verify the app compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/widgets/AlertListWidget.tsx
git commit -m "feat(alert-widget): severity-tinted rows with timestamps"
```

---

### Task 3: Clickable title linking to alerts page

**Files:**
- Modify: `frontend/src/components/widgets/AlertListWidget.tsx`

- [ ] **Step 1: Add Link import**

Add to the imports at the top of the file:

```typescript
import { Link } from 'react-router-dom';
```

- [ ] **Step 2: Replace the title element**

Replace:

```tsx
<p className="mb-1 text-xs text-slate-500">{(config.title as string) || 'Alerts'}</p>
```

With:

```tsx
<Link
  to="/alerts"
  className="mb-2 block text-xs font-semibold text-slate-200 hover:underline underline-offset-2 decoration-slate-600"
>
  {(config.title as string) || 'Alerts'} ↗
</Link>
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify visually**

Run: `cd frontend && npm run dev`
Open a dashboard with an AlertListWidget configured. Verify:
1. Title shows "Alerts ↗" and is clickable — navigates to `/alerts`
2. Rows have severity-tinted backgrounds (red, amber, blue)
3. Badges show CRIT / WARN / INFO
4. Relative timestamps appear on the right ("3 sec ago", etc.)
5. Most recent alert is at the top
6. Empty state shows centered "No active alerts"

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/widgets/AlertListWidget.tsx
git commit -m "feat(alert-widget): clickable title linking to alerts page"
```
