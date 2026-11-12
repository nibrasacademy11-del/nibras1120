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
import Programs, { ProgramDetail } from './pages/Programs.jsx';
import Enrollments, { EnrollmentDetail, MyPrograms, Reviews } from './pages/Enrollments.jsx';
import Commissions from './pages/Commissions.jsx';
import Reports, { ReportView } from './pages/Reports.jsx';
import Analytics from './pages/Analytics.jsx';
import Complaints, { MyComplaints } from './pages/Complaints.jsx';
import Attendance, { Attend, Kiosk, Leaves, PairDevice } from './pages/Attendance.jsx';
import SystemHealth from './pages/SystemHealth.jsx';
import Groups, { GroupDetail } from './pages/Groups.jsx';
import FinanceHub from './pages/FinanceHub.jsx';
import Website, { Accounts as UserAccounts } from './pages/Website.jsx';
import Payroll, { MyPayslips } from './pages/Payroll.jsx';
import MyAccess from './pages/MyAccess.jsx';
import PrintSamples from './pages/PrintSamples.jsx';
import Leads from './pages/Crm360.jsx';
import MyLectures from './pages/MyLectures.jsx';
import Certificates, { CertificateDetail, MyCertificates } from './pages/Certificates.jsx';
import Payments, { AccountStatement, Accounts, Approvals, Currencies, Expenses, MyPayments, PaymentDetail, Periods } from './pages/Finance.jsx';

function Guard({ permission, minScope = 'own', children }) {
  const { can } = useAuth();
  const { t } = useI18n();
  if (permission && !can(permission, minScope)) return <div className="card empty">{t('forbidden')}</div>;
  return children;
}

export default function App() {
  const { loading, me, zone, urls, can } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  // The reception screen runs without a sign-in, on its station key
  if (location.pathname.startsWith('/kiosk/')) return <Routes><Route path="/kiosk/:id" element={<Kiosk />} /></Routes>;
  if (loading) return <div className="splash">{t('loading')}</div>;
  if (!me) return <Login />;

  // A temporary password is changed first, then two-factor is turned on if the role requires it
  if (me.security.mustChangePassword) {
    return <Layout><ChangePassword forced /></Layout>;
  }
  if (me.security.mustEnrollTwoFactor && location.pathname !== '/security') {
    return <Navigate to="/security" replace />;
  }

  // cms.*: the website editor and the account's own security, nothing else
  if (zone === 'cms') {
    return (
      <Layout>
        <Routes>
          <Route path="/website" element={can('website.manage', 'all') ? <Website /> : <ElsewhereCard text={t('noCmsAccess')} href={`${urls.staff || ''}/portal/`} label={t('openStaff')} />} />
          <Route path="/security" element={<Security />} />
          <Route path="*" element={<Navigate to="/website" replace />} />
        </Routes>
      </Layout>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={me.user.isStaff ? <Dashboard /> : <MyPrograms />} />
        <Route path="/my-programs" element={<MyPrograms />} />
        <Route path="/my-lectures" element={<MyLectures />} />
        <Route path="/my-payments" element={<MyPayments />} />
        <Route path="/my-certificates" element={<MyCertificates />} />
        <Route path="/my-complaints" element={<MyComplaints />} />
        <Route path="/system" element={me.user.role === 'super_admin' ? <SystemHealth /> : <div className="card empty">{t('forbidden')}</div>} />
        <Route path="/attend" element={<Attend />} />
        <Route path="/attend/pair" element={<PairDevice />} />
        <Route path="/attendance" element={<Guard permission="attendance.view"><Attendance /></Guard>} />
        <Route path="/leaves" element={<Guard permission="leaves.view"><Leaves /></Guard>} />
        <Route path="/payroll" element={<Guard permission="payroll.view" minScope="all"><Payroll /></Guard>} />
        <Route path="/my-payslips" element={<Guard permission="payroll.view"><MyPayslips /></Guard>} />
        <Route path="/my-payslips/:month" element={<Guard permission="payroll.view"><MyPayslips /></Guard>} />
        <Route path="/complaints" element={<Guard permission="complaints.view"><Complaints /></Guard>} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:id" element={<ReportView />} />
        <Route path="/analytics" element={<Guard permission="reports.view" minScope="team"><Analytics /></Guard>} />
        <Route path="/certificates" element={<Guard permission="certificates.view"><Certificates /></Guard>} />
        <Route path="/certificates/:id" element={<CertificateDetail />} />
        <Route path="/commissions" element={<Guard permission="commissions.view"><Commissions /></Guard>} />
        <Route path="/finance" element={<Guard permission="payments.view" minScope="all"><FinanceHub /></Guard>} />
        <Route path="/payments" element={<Guard permission="payments.view"><Payments /></Guard>} />
        <Route path="/payments/:id" element={<PaymentDetail />} />
        <Route path="/approvals" element={<Guard permission="payments.view"><Approvals /></Guard>} />
        <Route path="/accounts" element={<Guard permission="accounts.view" minScope="all"><Accounts /></Guard>} />
        <Route path="/accounts/:id" element={<Guard permission="accounts.view" minScope="all"><AccountStatement /></Guard>} />
        <Route path="/expenses" element={<Guard permission="expenses.view" minScope="all"><Expenses /></Guard>} />
        <Route path="/currencies" element={<Guard permission="currencies.view" minScope="all"><Currencies /></Guard>} />
        <Route path="/periods" element={<Guard permission="accounts.view" minScope="all"><Periods /></Guard>} />
        <Route path="/groups" element={<Guard permission="programs.view"><Groups /></Guard>} />
        <Route path="/groups/:id" element={<Guard permission="programs.view"><GroupDetail /></Guard>} />
        <Route path="/programs" element={<Guard permission="programs.view"><Programs /></Guard>} />
        <Route path="/programs/:id" element={<Guard permission="programs.view"><ProgramDetail /></Guard>} />
        <Route path="/enrollments" element={<Guard permission="enrollments.view"><Enrollments /></Guard>} />
        <Route path="/enrollments/:id" element={<Guard permission="enrollments.view"><EnrollmentDetail /></Guard>} />
        <Route path="/reviews" element={<Guard permission="enrollments.approve" minScope="team"><Reviews /></Guard>} />
        <Route path="/customers" element={<Guard permission="customers.view"><Customers /></Guard>} />
        <Route path="/my-access" element={<MyAccess />} />
        <Route path="/print-samples" element={['super_admin', 'admin'].includes(me.user.role) ? <PrintSamples /> : <div className="card empty">{t('forbidden')}</div>} />
        <Route path="/leads" element={<Guard permission="customers.view"><Leads /></Guard>} />
        <Route path="/website" element={zone === 'staff'
          ? <ElsewhereCard text={t('cmsMoved')} href={`${urls.cms || ''}/portal/website`} label={t('openCms')} />
          : can('website.manage', 'all') ? <Website /> : <div className="card empty">{t('forbidden')}</div>} />
        <Route path="/user-accounts" element={['super_admin', 'admin'].includes(me.user.role) ? <><h1 className="page-title">{t('userAccountsNav')}</h1><UserAccounts /></> : <div className="card empty">{t('forbidden')}</div>} />
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

// A page that lives on another address (staff / cms): says so and links there
function ElsewhereCard({ text, href, label }) {
  return (
    <div className="card empty">
      <p>{text}</p>
      <a className="btn btn--primary" href={href}>{label}</a>
    </div>
  );
}
