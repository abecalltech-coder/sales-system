import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { TossCasesListPage } from './pages/toss-cases/TossCasesListPage';
import { AppointmentsListPage } from './pages/appointments/AppointmentsListPage';
import { VisitsListPage } from './pages/visits/VisitsListPage';
import { ContractsListPage } from './pages/contracts/ContractsListPage';
import { EntriesListPage } from './pages/entries/EntriesListPage';
import { UsersAdminPage } from './pages/admin/UsersAdminPage';
import { OrganizationsAdminPage } from './pages/admin/OrganizationsAdminPage';
import { MastersAdminPage } from './pages/admin/MastersAdminPage';
import { CustomFieldsAdminPage } from './pages/admin/CustomFieldsAdminPage';
import { MobileHomePage } from './pages/mobile/MobileHomePage';
import { MobileVisitDetailPage } from './pages/mobile/MobileVisitDetailPage';
import { CustomersListPage } from './pages/customers/CustomersListPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { CalendarPage } from './pages/CalendarPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { SystemSettingsPage } from './pages/admin/SystemSettingsPage';
import { IntegrationsPage } from './pages/admin/IntegrationsPage';
import { RequireAuth } from './components/RequireAuth';

function protect(element: JSX.Element) {
  return <RequireAuth>{element}</RequireAuth>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/dashboard" element={protect(<DashboardPage />)} />
        <Route path="/toss-cases" element={protect(<TossCasesListPage />)} />
        <Route path="/appointments" element={protect(<AppointmentsListPage />)} />
        <Route path="/visits" element={protect(<VisitsListPage />)} />
        <Route path="/contracts" element={protect(<ContractsListPage />)} />
        <Route path="/entries" element={protect(<EntriesListPage />)} />
        <Route path="/admin/users" element={protect(<UsersAdminPage />)} />
        <Route path="/admin/organizations" element={protect(<OrganizationsAdminPage />)} />
        <Route path="/admin/masters" element={protect(<MastersAdminPage />)} />
        <Route path="/admin/custom-fields" element={protect(<CustomFieldsAdminPage />)} />
        <Route path="/m" element={protect(<MobileHomePage />)} />
        <Route path="/m/visits/:id" element={protect(<MobileVisitDetailPage />)} />
        <Route path="/customers" element={protect(<CustomersListPage />)} />
        <Route path="/customers/:id" element={protect(<CustomerDetailPage />)} />
        <Route path="/calendar" element={protect(<CalendarPage />)} />
        <Route path="/admin/audit-logs" element={protect(<AuditLogsPage />)} />
        <Route path="/admin/system-settings" element={protect(<SystemSettingsPage />)} />
        <Route path="/admin/integrations" element={protect(<IntegrationsPage />)} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
