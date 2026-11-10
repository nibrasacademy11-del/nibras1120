import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useI18n } from './i18n.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Security from './pages/Security.jsx';
import Roles from './pages/Roles.jsx';
import Audit from './pages/Audit.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Lookup from './pages/Lookup.jsx';
import Tasks from './pages/Tasks.jsx';
import AccessRequests from './pages/AccessRequests.jsx';
import Employees, { Teams } from './pages/Employees.jsx';
import { Duplicates, Settings } from './pages/Admin.jsx';
import ChangePassword from './pages/ChangePassword.jsx';

function Guard({ permission, minScope = 'own', children }) {
  const { can } = useAuth();
  const { t } = useI18n();
  if (permission && !can(permission, minScope)) return <div className="card empty">{t('forbidden')}</div>;
  return children;
}

export default function App() {
  const { loading, me } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) return <div className="splash">{t('loading')}</div>;
  if (!me) return <Login />;

  // A temporary password is changed first, then two-factor is turned on if the role requires it
  if (me.security.mustChangePassword) {
    return <Layout><ChangePassword forced /></Layout>;
  }
  if (me.security.mustEnrollTwoFactor && location.pathname !== '/security') {
    return <Navigate to="/security" replace />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Guard permission="customers.view"><Customers /></Guard>} />
        <Route path="/customers/:id" element={<Guard permission="customer_lookup.view"><CustomerDetail /></Guard>} />
        <Route path="/lookup" element={<Guard permission="customer_lookup.view"><Lookup /></Guard>} />
        <Route path="/tasks" element={<Guard permission="tasks.view"><Tasks /></Guard>} />
        <Route path="/access-requests" element={<Guard permission="access_requests.view"><AccessRequests /></Guard>} />
        <Route path="/employees" element={<Guard permission="employees.view"><Employees /></Guard>} />
        <Route path="/teams" element={<Guard permission="teams.view"><Teams /></Guard>} />
        <Route path="/duplicates" element={<Guard permission="customers.manage" minScope="all"><Duplicates /></Guard>} />
        <Route path="/settings" element={<Guard permission="settings.manage" minScope="all"><Settings /></Guard>} />
        <Route path="/security" element={<Security />} />
        <Route path="/roles" element={<Guard permission="roles.view" minScope="all"><Roles /></Guard>} />
        <Route path="/audit" element={<Guard permission="audit.view" minScope="all"><Audit /></Guard>} />
        <Route path="*" element={<div className="card empty">{t('notFound')}</div>} />
      </Routes>
    </Layout>
  );
}
