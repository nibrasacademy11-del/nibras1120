import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useI18n } from './i18n.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Security from './pages/Security.jsx';
import Roles from './pages/Roles.jsx';
import Audit from './pages/Audit.jsx';

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

  // Until two-factor sign-in is on, a role that requires it only reaches the security page
  if (me.security.mustEnrollTwoFactor && location.pathname !== '/security') {
    return <Navigate to="/security" replace />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/security" element={<Security />} />
        <Route path="/roles" element={<Guard permission="roles.view" minScope="all"><Roles /></Guard>} />
        <Route path="/audit" element={<Guard permission="audit.view" minScope="all"><Audit /></Guard>} />
        <Route path="*" element={<div className="card empty">{t('notFound')}</div>} />
      </Routes>
    </Layout>
  );
}
