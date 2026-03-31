import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SiteProvider } from '@/lib/site-context';
import { RefreshIntervalProvider } from '@/lib/refresh-interval';
import { AppShell } from '@/components/layout/AppShell';

// Eager: login + main dashboard (first paint)
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';

// Lazy: everything else
const MachineListPage = lazy(() => import('@/pages/MachineListPage').then(m => ({ default: m.MachineListPage })));
const MachineDetailPage = lazy(() => import('@/pages/MachineDetailPage').then(m => ({ default: m.MachineDetailPage })));
const AlertsPage = lazy(() => import('@/pages/AlertsPage').then(m => ({ default: m.AlertsPage })));
const AlertRulesPage = lazy(() => import('@/pages/AlertRulesPage'));
const DashboardListPage = lazy(() => import('@/pages/dashboards/DashboardListPage').then(m => ({ default: m.DashboardListPage })));
const DashboardViewPage = lazy(() => import('@/pages/dashboards/DashboardViewPage').then(m => ({ default: m.DashboardViewPage })));
const DashboardEditorPage = lazy(() => import('@/pages/dashboards/DashboardEditorPage').then(m => ({ default: m.DashboardEditorPage })));

// Lazy: admin pages
const UsersPage = lazy(() => import('@/pages/admin/UsersPage').then(m => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import('@/pages/admin/RolesPage').then(m => ({ default: m.RolesPage })));
const AuditLogPage = lazy(() => import('@/pages/admin/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const SitesPage = lazy(() => import('@/pages/admin/SitesPage').then(m => ({ default: m.SitesPage })));
const WorkersPage = lazy(() => import('@/pages/admin/WorkersPage').then(m => ({ default: m.WorkersPage })));
const WorkerConfigsPage = lazy(() => import('@/pages/admin/WorkerConfigsPage').then(m => ({ default: m.WorkerConfigsPage })));
const WorkerConfigEditPage = lazy(() => import('@/pages/admin/WorkerConfigEditPage').then(m => ({ default: m.WorkerConfigEditPage })));
const ApiKeysPage = lazy(() => import('@/pages/admin/ApiKeysPage').then(m => ({ default: m.ApiKeysPage })));

const queryClient = new QueryClient();

function Loading() {
  return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RefreshIntervalProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* All protected routes share one SiteProvider */}
            <Route
              element={
                <ProtectedRoute>
                  <SiteProvider>
                    <Outlet />
                  </SiteProvider>
                </ProtectedRoute>
              }
            >
              {/* Full-screen editor routes — no AppShell chrome */}
              <Route path="/dashboards/new" element={<DashboardEditorPage />} />
              <Route path="/dashboards/:id/edit" element={<DashboardEditorPage />} />

              {/* Normal routes inside AppShell */}
              <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/machines" element={<MachineListPage />} />
              <Route path="/machines/:machineId" element={<MachineDetailPage />} />
              <Route path="/alerts/rules" element={<AlertRulesPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/reports" element={<div>Reports (coming soon)</div>} />
              <Route path="/dashboards" element={<DashboardListPage />} />
              <Route path="/dashboards/:id" element={<DashboardViewPage />} />
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/roles" element={<RolesPage />} />
              <Route path="/admin/audit" element={<AuditLogPage />} />
              <Route path="/admin/sites" element={<SitesPage />} />
              <Route path="/admin/workers" element={<WorkersPage />} />
              <Route path="/admin/worker-configs" element={<WorkerConfigsPage />} />
              <Route path="/admin/worker-configs/new" element={<WorkerConfigEditPage />} />
              <Route path="/admin/worker-configs/:id" element={<WorkerConfigEditPage />} />
              <Route path="/admin/api-keys" element={<ApiKeysPage />} />
              </Route>
            </Route>
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      </RefreshIntervalProvider>
    </QueryClientProvider>
  );
}
