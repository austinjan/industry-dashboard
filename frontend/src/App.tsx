import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SiteProvider } from '@/lib/site-context';
import { RefreshIntervalProvider } from '@/lib/refresh-interval';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { MachineListPage } from '@/pages/MachineListPage';
import { MachineDetailPage } from '@/pages/MachineDetailPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { RolesPage } from '@/pages/admin/RolesPage';
import { AuditLogPage } from '@/pages/admin/AuditLogPage';
import { SitesPage } from '@/pages/admin/SitesPage';
import { WorkersPage } from '@/pages/admin/WorkersPage';
import { WorkerConfigsPage } from '@/pages/admin/WorkerConfigsPage';
import { WorkerConfigEditPage } from '@/pages/admin/WorkerConfigEditPage';
import { ApiKeysPage } from '@/pages/admin/ApiKeysPage';
import { DashboardListPage } from '@/pages/dashboards/DashboardListPage';
import { DashboardViewPage } from '@/pages/dashboards/DashboardViewPage';
import { DashboardEditorPage } from '@/pages/dashboards/DashboardEditorPage';
import AlertRulesPage from '@/pages/AlertRulesPage';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RefreshIntervalProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

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
        </BrowserRouter>
      </AuthProvider>
      </RefreshIntervalProvider>
    </QueryClientProvider>
  );
}
