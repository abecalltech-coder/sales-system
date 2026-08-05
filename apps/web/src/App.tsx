import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { TossCasesListPage } from './pages/toss-cases/TossCasesListPage';
import { TossCaseDetailPage } from './pages/toss-cases/TossCaseDetailPage';
import { AppointmentsListPage } from './pages/appointments/AppointmentsListPage';
import { AppointmentDetailPage } from './pages/appointments/AppointmentDetailPage';
import { VisitsListPage } from './pages/visits/VisitsListPage';
import { VisitDetailPage } from './pages/visits/VisitDetailPage';
import { ContractsListPage } from './pages/contracts/ContractsListPage';
import { ContractDetailPage } from './pages/contracts/ContractDetailPage';
import { EntriesListPage } from './pages/entries/EntriesListPage';
import { EntryDetailPage } from './pages/entries/EntryDetailPage';
import { UsersAdminPage } from './pages/admin/UsersAdminPage';
import { OrganizationsAdminPage } from './pages/admin/OrganizationsAdminPage';
import { MastersAdminPage } from './pages/admin/MastersAdminPage';
import { CustomFieldsAdminPage } from './pages/admin/CustomFieldsAdminPage';
import { MobileHomePage } from './pages/mobile/MobileHomePage';
import { MobileVisitDetailPage } from './pages/mobile/MobileVisitDetailPage';
import { CustomersListPage } from './pages/customers/CustomersListPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { RequireAuth } from './components/RequireAuth';

function protect(element: JSX.Element) {
  return <RequireAuth>{element}</RequireAuth>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/dashboard" element={protect(<DashboardPage />)} />
        <Route path="/toss-cases" element={protect(<TossCasesListPage />)} />
        <Route path="/toss-cases/:id" element={protect(<TossCaseDetailPage />)} />
        <Route path="/appointments" element={protect(<AppointmentsListPage />)} />
        <Route path="/appointments/:id" element={protect(<AppointmentDetailPage />)} />
        <Route path="/visits" element={protect(<VisitsListPage />)} />
        <Route path="/visits/:id" element={protect(<VisitDetailPage />)} />
        <Route path="/contracts" element={protect(<ContractsListPage />)} />
        <Route path="/contracts/:id" element={protect(<ContractDetailPage />)} />
        <Route path="/entries" element={protect(<EntriesListPage />)} />
        <Route path="/entries/:id" element={protect(<EntryDetailPage />)} />
        <Route path="/admin/users" element={protect(<UsersAdminPage />)} />
        <Route path="/admin/organizations" element={protect(<OrganizationsAdminPage />)} />
        <Route path="/admin/masters" element={protect(<MastersAdminPage />)} />
        <Route path="/admin/custom-fields" element={protect(<CustomFieldsAdminPage />)} />
        <Route path="/m" element={protect(<MobileHomePage />)} />
        <Route path="/m/visits/:id" element={protect(<MobileVisitDetailPage />)} />
        <Route path="/customers" element={protect(<CustomersListPage />)} />
        <Route path="/customers/:id" element={protect(<CustomerDetailPage />)} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
