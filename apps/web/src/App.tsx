import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { TossCasesListPage } from './pages/toss-cases/TossCasesListPage';
import { TossEntryPage } from './pages/toss-cases/TossEntryPage';
import { AppointmentsListPage } from './pages/appointments/AppointmentsListPage';
import { CLCalendarPage } from './pages/CLCalendarPage';
import { ContractsListPage } from './pages/contracts/ContractsListPage';
import { DealsListPage } from './pages/deals/DealsListPage';
import { UsersAdminPage } from './pages/admin/UsersAdminPage';
import { OrganizationsAdminPage } from './pages/admin/OrganizationsAdminPage';
import { MastersAdminPage } from './pages/admin/MastersAdminPage';
import { SummarySheetsPage } from './pages/SummarySheetsPage';
import { ShiftPage } from './pages/ShiftPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { IntegrationsPage } from './pages/admin/IntegrationsPage';
import { TossFormAdminPage } from './pages/admin/TossFormAdminPage';
import { FinalReportPage } from './pages/FinalReportPage';
import { ChatPage } from './pages/chat/ChatPage';
import { ApplicationSheetsPage } from './pages/application/ApplicationSheetsPage';
import { TasksPage } from './pages/tasks/TasksPage';
import { FinalReportFieldsAdminPage } from './pages/admin/FinalReportFieldsAdminPage';
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
        <Route path="/toss/new" element={protect(<TossEntryPage />)} />
        <Route path="/toss-cases" element={protect(<TossCasesListPage />)} />
        <Route path="/appointments" element={protect(<AppointmentsListPage />)} />
        <Route path="/cl-calendar" element={protect(<CLCalendarPage />)} />
        <Route path="/contracts" element={protect(<ContractsListPage />)} />
        <Route path="/deals" element={protect(<DealsListPage />)} />
        <Route path="/summary" element={protect(<SummarySheetsPage />)} />
        <Route path="/shift" element={protect(<ShiftPage />)} />
        <Route path="/final-report" element={protect(<FinalReportPage />)} />
        <Route path="/chat" element={protect(<ChatPage />)} />
        <Route path="/application-sheets" element={protect(<ApplicationSheetsPage />)} />
        <Route path="/tasks" element={protect(<TasksPage />)} />
        <Route path="/chat/:roomId" element={protect(<ChatPage />)} />
        <Route path="/admin/users" element={protectAdmin(<UsersAdminPage />)} />
        <Route path="/admin/organizations" element={protectAdmin(<OrganizationsAdminPage />)} />
        <Route path="/admin/masters" element={protectAdmin(<MastersAdminPage />)} />
        <Route path="/admin/toss-form" element={protectAdmin(<TossFormAdminPage />)} />
        <Route path="/admin/final-report-fields" element={protectAdmin(<FinalReportFieldsAdminPage />)} />
        <Route path="/admin/audit-logs" element={protectAdmin(<AuditLogsPage />)} />
        <Route path="/admin/integrations" element={protectAdmin(<IntegrationsPage />)} />
        <Route path="/" element={<Navigate to="/toss-cases" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
