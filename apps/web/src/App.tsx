import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { TossCasesListPage } from './pages/toss-cases/TossCasesListPage';
import { AppointmentsListPage } from './pages/appointments/AppointmentsListPage';
import { CLCalendarPage } from './pages/CLCalendarPage';
import { ContractsListPage } from './pages/contracts/ContractsListPage';
import { UsersAdminPage } from './pages/admin/UsersAdminPage';
import { OrganizationsAdminPage } from './pages/admin/OrganizationsAdminPage';
import { MastersAdminPage } from './pages/admin/MastersAdminPage';
import { CustomFieldsAdminPage } from './pages/admin/CustomFieldsAdminPage';
import { MobileHomePage } from './pages/mobile/MobileHomePage';
import { MobileVisitDetailPage } from './pages/mobile/MobileVisitDetailPage';
import { SummarySheetsPage } from './pages/SummarySheetsPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { SystemSettingsPage } from './pages/admin/SystemSettingsPage';
import { IntegrationsPage } from './pages/admin/IntegrationsPage';
import { RequireAuth } from './components/RequireAuth';
import { RequireAdmin } from './components/RequireAdmin';

function protect(element: JSX.Element) {
  return <RequireAuth>{element}</RequireAuth>;
}

function protectAdmin(element: JSX.Element) {
  return (
    <RequireAuth>
      <RequireAdmin>{element}</RequireAdmin>
    </RequireAuth>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/toss-cases" element={protect(<TossCasesListPage />)} />
        <Route path="/appointments" element={protect(<AppointmentsListPage />)} />
        <Route path="/cl-calendar" element={protect(<CLCalendarPage />)} />
        <Route path="/contracts" element={protect(<ContractsListPage />)} />
        <Route path="/summary" element={protect(<SummarySheetsPage />)} />
        <Route path="/admin/users" element={protectAdmin(<UsersAdminPage />)} />
        <Route path="/admin/organizations" element={protectAdmin(<OrganizationsAdminPage />)} />
        <Route path="/admin/masters" element={protectAdmin(<MastersAdminPage />)} />
        <Route path="/admin/custom-fields" element={protectAdmin(<CustomFieldsAdminPage />)} />
        <Route path="/m" element={protect(<MobileHomePage />)} />
        <Route path="/m/visits/:id" element={protect(<MobileVisitDetailPage />)} />
        <Route path="/admin/audit-logs" element={protectAdmin(<AuditLogsPage />)} />
        <Route path="/admin/system-settings" element={protectAdmin(<SystemSettingsPage />)} />
        <Route path="/admin/integrations" element={protectAdmin(<IntegrationsPage />)} />
        <Route path="/" element={<Navigate to="/toss-cases" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
