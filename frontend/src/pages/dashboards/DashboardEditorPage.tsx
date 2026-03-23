import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy';
import type { Layout } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { WidgetConfigSheet } from '@/components/widget-config/WidgetConfigSheet';
import { ShareDialog } from './ShareDialog';
import { useDashboard, useWidgetTypes, useSaveWidgets } from '@/lib/hooks';

const GridLayout = WidthProvider(ReactGridLayout);

interface WidgetItem {
  id: string;
  widget_type: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  config: Record<string, unknown>;
}

const widgetIcons: Record<string, string> = {
  status_card: '📊',
  gauge: '🎯',
  line_chart: '📈',
  bar_chart: '📊',
  pie_chart: '🥧',
  data_table: '📋',
  alert_list: '🔔',
  machine_status: '⚙️',
  text_markdown: '📝',
};

export function DashboardEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: dashboard } = useDashboard(id);
  const { data: widgetTypes } = useWidgetTypes();
  const saveWidgets = useSaveWidgets();

  const [widgets, setWidgets] = useState<WidgetItem[]>([]);
  const [configWidget, setConfigWidget] = useState<WidgetItem | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (dashboard?.widgets) {
      setWidgets(dashboard.widgets as WidgetItem[]);
    }
  }, [dashboard]);

  const addWidget = (type: string) => {
    const wt = widgetTypes?.find((t: any) => t.name === type);
    const defaults = (wt?.default_config as Record<string, unknown>) || {};
    const newWidget: WidgetItem = {
      id: `new-${Date.now()}`,
      widget_type: type,
      position_x: 0,
      position_y: Infinity,
      width: (defaults.width as number) || 4,
      height: (defaults.height as number) || 3,
      config: {},
    };
    setWidgets((prev) => [...prev, newWidget]);
    setConfigWidget(newWidget);
  };

  const removeWidget = (widgetId: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
  };

  const onLayoutChange = useCallback((layout: Layout) => {
    setWidgets((prev) =>
      prev.map((w) => {
        const l = (layout as unknown as Array<{ i: string; x: number; y: number; w: number; h: number }>)
          .find((item) => item.i === w.id);
        if (!l) return w;
        return { ...w, position_x: l.x, position_y: l.y, width: l.w, height: l.h };
      })
    );
  }, []);

  const handleSave = async () => {
    if (!id) return;
    await saveWidgets.mutateAsync({ dashboardId: id, widgets });
    navigate(`/dashboards/${id}`);
  };

  const handleConfigSave = (config: Record<string, unknown>) => {
    if (!configWidget) return;
    setWidgets((prev) =>
      prev.map((w) => (w.id === configWidget.id ? { ...w, config } : w))
    );
    setConfigWidget(null);
  };

  const layout = widgets.map((w) => ({
    i: w.id,
    x: w.position_x,
    y: w.position_y,
    w: w.width,
    h: w.height,
    minW: 2,
    minH: 2,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Floating toolbar */}
      <div className="fixed left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-white px-4 py-2 shadow-lg">
        <span className="font-semibold">{dashboard?.title || 'New Dashboard'}</span>
        <div className="h-5 w-px bg-slate-200" />
        <Popover>
          <PopoverTrigger>
            <Button size="sm" variant="outline">+ Add Widget</Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <p className="mb-2 text-sm font-semibold">Add Widget</p>
            <div className="grid grid-cols-3 gap-2">
              {widgetTypes?.map((wt: any) => (
                <button
                  key={wt.name}
                  onClick={() => addWidget(wt.name)}
                  className="rounded-lg border p-2 text-center hover:border-blue-400 hover:bg-blue-50"
                >
                  <div className="text-lg">{widgetIcons[wt.name] || '📦'}</div>
                  <div className="text-xs">{wt.name.replace(/_/g, ' ')}</div>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className="h-5 w-px bg-slate-200" />
        <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>Share</Button>
        <Button size="sm" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saveWidgets.isPending}>
          {saveWidgets.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Grid */}
      <div className="px-6 pt-16">
        {widgets.length > 0 ? (
          <GridLayout
            className="layout"
            layout={layout as unknown as Layout}
            cols={12}
            rowHeight={80}
            onLayoutChange={onLayoutChange}
            draggableHandle=".widget-drag"
            isResizable
            isDraggable
          >
            {widgets.map((w) => (
              <div key={w.id} className="group relative rounded-lg border bg-white shadow-sm">
                {/* Drag handle covers the whole cell */}
                <div className="widget-drag absolute inset-0 z-0 cursor-grab" />
                {/* Widget content — pointer-events off so drag handle works */}
                <div className="pointer-events-none relative z-10 h-full overflow-hidden p-3">
                  <WidgetRenderer widgetType={w.widget_type} config={w.config} />
                </div>
                {/* Action buttons — pointer-events back on */}
                <div className="absolute right-2 top-2 z-20 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setConfigWidget(w)}
                    className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-lg leading-none text-slate-600 shadow-sm hover:bg-slate-200"
                  >
                    ⚙
                  </button>
                  <button
                    onClick={() => removeWidget(w.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-md bg-red-50 text-lg leading-none text-red-500 shadow-sm hover:bg-red-100"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </GridLayout>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed text-slate-400">
            Click "+ Add Widget" to get started
          </div>
        )}
      </div>

      {/* Config sheet */}
      <WidgetConfigSheet
        open={!!configWidget}
        onClose={() => setConfigWidget(null)}
        widgetType={configWidget?.widget_type || ''}
        config={configWidget?.config || {}}
        onSave={handleConfigSave}
      />

      {/* Share dialog */}
      {id && (
        <ShareDialog
          dashboardId={id}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
