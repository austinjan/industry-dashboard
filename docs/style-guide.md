# Frontend Style Guide

Styling conventions for the Industry Dashboard frontend. Follow these patterns to keep the UI consistent.

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Font | Geist Variable | All text |
| Base radius | `0.625rem` | Cards, inputs, buttons |
| Card padding | `p-4` | Default; `p-3` for small |
| Border color | `border-border` | All borders |

## Typography

| Context | Classes | Example |
|---------|---------|---------|
| Page header | `text-xl font-bold` | Page titles |
| Section header | `text-lg font-semibold` | Card section titles |
| Card title | `text-base font-medium` | Card headers |
| Large value / KPI | `text-2xl font-bold` | Status cards, gauges |
| Body text | `text-sm` | Table cells, descriptions |
| Form label | `text-xs uppercase text-slate-500` | All form labels |
| Helper text | `text-xs text-slate-400` | Hints, descriptions below inputs |
| Widget title | `text-xs text-slate-500` | Above widget content, `mb-1` |

## Colors

### Text
```
text-foreground          → Primary body text
text-slate-500           → Labels, widget titles, secondary info
text-slate-400           → Hints, empty states, disabled
text-slate-600           → Table cells (secondary importance)
text-blue-500            → Links
text-muted-foreground    → Muted/secondary text
```

### Status
```
bg-green-100 text-green-800    → running / online
bg-red-100 text-red-800        → error / critical
bg-yellow-100 text-yellow-800  → warning
bg-slate-100 text-slate-600    → offline / unknown
```

### KPI Cards
```
text-green-600    → Positive (e.g., online machines)
text-blue-600     → Info (e.g., production lines)
text-red-600      → Alert (e.g., error count)
```

### Chart Colors
```typescript
const DEFAULT_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
];
```

## Spacing

### Padding
| Context | Pattern |
|---------|---------|
| Card | `p-4` (default), `p-3` (small) |
| Table cell | `p-2` |
| Button / Input | `px-3 py-2` |

### Gaps
| Pattern | Usage |
|---------|-------|
| `gap-1` | Tight (buttons, chips, color pickers) |
| `gap-2` | Normal (grid items, widget content) |
| `gap-4` | Section spacing (major layouts) |

### Vertical stacking
| Pattern | Usage |
|---------|-------|
| `space-y-1` | Within a form group (label + input + hint) |
| `space-y-2` | List items, picker fields |
| `space-y-4` | Between form sections |
| `mb-6` | Between major page sections |

## Common Patterns

### Loading State
```tsx
<p className="py-4 text-center text-xs text-slate-400">Loading...</p>
```

### Empty State
```tsx
<p className="py-4 text-center text-xs text-slate-400">No data for this time range.</p>
```

### Form Field
```tsx
<div className="space-y-1">
  <Label className="text-xs uppercase text-slate-500">Field Name</Label>
  <Input value={value} onChange={...} placeholder="..." />
  <p className="text-xs text-slate-400">Helper text</p>
</div>
```

### Button Pair (Form Actions)
```tsx
<div className="flex gap-2 pt-2">
  <Button onClick={onSave} className="flex-1">Apply</Button>
  <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
</div>
```

### Status Badge
```tsx
<Badge variant={severity === 'critical' ? 'destructive' : 'secondary'}>
  {severity}
</Badge>
```

### Status Dot
```tsx
<span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[status]}`} />
```

### Time Range Buttons
```tsx
<button className={`rounded px-3 py-1 text-xs ${
  active ? 'bg-blue-500 text-white' : 'border bg-white text-slate-600'
}`}>
```

### KPI Card
```tsx
<Card className="p-4">
  <p className="text-sm text-slate-500">Label</p>
  <p className="text-2xl font-bold text-green-600">Value</p>
</Card>
```

## Page Layouts

### Header + Content
```tsx
<div>
  <h2 className="mb-4 text-xl font-bold">Page Title</h2>
  {/* content */}
</div>
```

### KPI Grid
```tsx
<div className="mb-6 grid grid-cols-4 gap-4">
  {/* KPI cards */}
</div>
```

## Chart Styling

### Recharts Defaults
```tsx
<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
<XAxis fontSize={10} stroke="#94a3b8" />
<YAxis fontSize={10} stroke="#94a3b8" />
<Tooltip contentStyle={{ fontSize: 11 }} />
```

### Chart Container
```tsx
<ResponsiveContainer width="100%" height="85%">
```

## Key Rules

1. **Form labels** — always `text-xs uppercase text-slate-500`
2. **Helper text** — always `text-xs text-slate-400`
3. **Empty / loading** — always `text-xs text-slate-400`, centered
4. **Widget titles** — always `text-xs text-slate-500` with `mb-1`
5. **Card containers** — always `Card` component with `p-4`
6. **Overflow** — always `overflow-auto` on scrollable widget containers
7. **Polling** — dashboard queries use `refetchInterval: 30000`
8. **Status colors** — green=running, red=error, yellow=warning, slate=offline
9. **Chart colors** — use `DEFAULT_COLORS` array for consistency
10. **Buttons** — primary action = `default`, cancel = `outline`
