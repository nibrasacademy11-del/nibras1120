import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Loading, Pill, useLoad } from '../components/ui.jsx';

// The employee's own file: who they are in the academy, their team and leader, and the way
// to everything personal (tasks, attendance, leave, money, reviews, account security).
export default function MyProfile() {
  const { t, label, fmtDay } = useI18n();
  const { me, can } = useAuth();
  const state = useLoad('/api/v2/me/employee');
  const links = [
    ['/tasks', 'tasks', can('tasks.view')],
    ['/customers', 'customers', can('customers.view')],
    ['/attendance', 'attendanceNav', can('attendance.view')],
    ['/leaves', 'leavesNav', can('leaves.view')],
    ['/my-payslips', 'myPayslipsNav', can('payroll.view')],
    ['/my-performance', 'myReviewsNav', can('reviews.view')],
    ['/commissions', 'commissionsNav', can('commissions.view')],
    ['/security', 'security', true]
  ].filter((x) => x[2]);
  return (
    <>
      <h1 className="page-title">{t('mp_title')}</h1>
      <Loading state={state}>
        {(d) => (
          <div className="grid grid--2">
            <section className="card">
              <h2>{me.user.name}</h2>
              <div className="info-grid">
                <div className="info"><small>{t('email')}</small><div dir="ltr">{me.user.email}</div></div>
                <div className="info"><small>{t('mp_role')}</small><div>{label(me.user.roleLabel)}</div></div>
                {d.item ? (
                  <>
                    <div className="info"><small>{t('employeeNo')}</small><div>{d.item.employeeNo}</div></div>
                    <div className="info"><small>{t('jobTitle')}</small><div>{d.item.jobTitle || '—'}</div></div>
                    <div className="info"><small>{t('department')}</small><div>{d.item.department?.nameAr || '—'}</div></div>
                    <div className="info"><small>{t('mt_team')}</small><div>{d.item.team?.nameAr || '—'}{d.item.iAmLeader && <> <Pill tone="gold">{t('mp_youLead')}</Pill></>}</div></div>
                    <div className="info"><small>{t('mt_leader')}</small><div>{d.item.leader || '—'}</div></div>
                    <div className="info"><small>{t('hireDate')}</small><div>{d.item.hireDate ? fmtDay(d.item.hireDate) : '—'}</div></div>
                  </>
                ) : <p className="muted">{t('mp_noFile')}</p>}
              </div>
            </section>
            <section className="card">
              <h2>{t('mp_myWork')}</h2>
              <div className="quick-links">{links.map(([to, key]) => <Link key={to} to={to} className="btn btn--ghost">{t(key)}</Link>)}</div>
              <p className="muted" style={{ marginBottom: 0 }}><small>{t('mp_privacy')}</small></p>
            </section>
          </div>
        )}
      </Loading>
    </>
  );
}
