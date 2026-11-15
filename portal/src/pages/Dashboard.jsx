import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Loading, Pill, useLoad } from '../components/ui.jsx';
import { Amounts } from './Finance.jsx';
import OwnerHome from './OwnerHome.jsx';

const ORDER = ['lead', 'interested', 'customer', 'lost', 'inactive'];

function Stat({ label, value, to, tone }) {
  const body = (<><small>{label}</small><strong className={tone || ''}>{value ?? 0}</strong></>);
  return to ? <Link to={to} className="card stat stat--link">{body}</Link> : <div className="card stat">{body}</div>;
}

function StatusBars({ counts, base }) {
  const { en } = useI18n();
  const total = ORDER.reduce((a, s) => a + (counts[s] || 0), 0) || 1;
  return (
    <ul className="bars">
      {ORDER.map((s) => (
        <li key={s}>
          <Link to={`${base}status=${s}`}>{en('status', s)}</Link>
          <span className="bar"><span className={`bar-fill bar--${s}`} style={{ width: `${((counts[s] || 0) / total) * 100}%` }} /></span>
          <strong>{counts[s] || 0}</strong>
        </li>
      ))}
    </ul>
  );
}

function CountList({ rows, group }) {
  const { en } = useI18n();
  if (!rows.length) return <p className="muted">—</p>;
  return <ul className="plain-list">{rows.map((r) => <li key={r._id || 'none'}>{group ? en(group, r._id) : r._id} <strong>{r.n}</strong></li>)}</ul>;
}

// ---- blocks shown by permission: the same page serves the owner, admins, managers and employees ----

function FinanceToday() {
  const { t } = useI18n();
  const state = useLoad('/api/v2/finance/today');
  return (
    <Loading state={state}>
      {(d) => (
        <section className="card">
          <div className="card-head"><h2>{t('dbFinance')}</h2><Link className="btn btn--small" to="/finance">{t('fhTitle')}</Link></div>
          <div className="grid grid--4">
            <div className="stat"><small>{t('dbCollectedMonth')}</small><strong><Amounts list={d.month} /></strong></div>
            <div className="stat"><small>{t('dbExpensesMonth')}</small><strong><Amounts list={d.expensesMonth} /></strong></div>
            <Link className="stat stat--link" to="/finance?tab=receivables"><small>{t('dbOverdue')} · {d.overdue.customers}</small><strong className={d.overdue.customers ? 'warn' : ''}><Amounts list={d.overdue.amounts} /></strong></Link>
            <Link className="stat stat--link" to="/approvals"><small>{t('dbPendingMoney')}</small><strong className={d.pending.payments + d.pending.approvals ? 'warn' : ''}>{d.pending.payments + d.pending.approvals + d.pending.refunds}</strong></Link>
          </div>
        </section>
      )}
    </Loading>
  );
}

function AttendanceToday() {
  const { t } = useI18n();
  const state = useLoad('/api/v2/attendance/today');
  return (
    <Loading state={state}>
      {(d) => (
        <section className="card">
          <div className="card-head"><h2>{t('dbAttendance')}</h2><Link className="btn btn--small" to="/attendance">{t('attendanceNav')}</Link></div>
          <div className="grid grid--4">
            <div className="stat"><small>{t('dbIn')}</small><strong>{d.counts.in}</strong></div>
            <div className="stat"><small>{t('dbNotIn')}</small><strong className={d.counts.not_in ? 'warn' : ''}>{d.counts.not_in}</strong></div>
            <div className="stat"><small>{t('dbLate')}</small><strong className={d.counts.late ? 'warn' : ''}>{d.counts.late}</strong></div>
            <div className="stat"><small>{t('dbOnLeave')}</small><strong>{d.counts.leave}</strong></div>
          </div>
        </section>
      )}
    </Loading>
  );
}

function MyAttendance() {
  const { t } = useI18n();
  const state = useLoad('/api/v2/attendance/me');
  return (
    <Loading state={state}>
      {(d) => (
        <section className="card">
          <div className="card-head"><h2>{t('dbMyMonth')}</h2><Link className="btn btn--small" to="/attendance">{t('attendanceNav')}</Link></div>
          <div className="grid grid--4">
            <div className="stat"><small>{t('dbPresentDays')}</small><strong>{d.summary.present} / {d.summary.workingDays}</strong></div>
            <div className="stat"><small>{t('dbAbsentDays')}</small><strong className={d.summary.absent ? 'warn' : ''}>{d.summary.absent}</strong></div>
            <div className="stat"><small>{t('dbLateMinutes')}</small><strong className={d.summary.lateMinutes ? 'warn' : ''}>{d.summary.lateMinutes}</strong></div>
            <div className="stat"><small>{t('dbLeaveDays')}</small><strong>{d.summary.leave}</strong></div>
          </div>
        </section>
      )}
    </Loading>
  );
}

const TITLES = { owner: 'dbOwnerTitle', admin: 'dbAdminTitle', manager: 'dbManagerTitle', employee: 'dbEmployeeTitle' };

export default function Dashboard() {
  const { me, can } = useAuth();
  const { t, label, lang } = useI18n();
  const state = useLoad('/api/v2/dashboard');
  const { user, security } = me;
  const level = user.level || 'employee';
  // The owner's home is the full analytics of the academy
  if (level === 'owner') return <OwnerHome />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t(TITLES[level] || 'dbEmployeeTitle')}</h1>
          <p className="muted" style={{ margin: 0 }}>{t('welcome')}{lang === 'ar' ? '، ' : ', '}{user.name.split(' ')[0]} · {label(user.roleLabel)}{user.isPrimaryOwner ? <> · <Pill tone="gold">{t('dbPrimaryOwner')}</Pill></> : null}</p>
        </div>
      </div>
      {!security.twoFactorEnabled && user.isStaff && (
        <div className="alert alert--warn">{t('twoFactor')}: {t('twoFactorOff')} — <Link to="/security">{t('enable')}</Link></div>
      )}
      {can('payments.view', 'all') && <FinanceToday />}
      {can('attendance.view', 'team') && <AttendanceToday />}
      {level === 'employee' && can('attendance.view') && <MyAttendance />}
      <Loading state={state}>
        {(d) => (
          <>
            {d.mine && (
              <>
                <div className="grid grid--4">
                  <Stat label={t('tasksOverdue')} value={d.mine.tasksOverdue} to="/tasks" tone={d.mine.tasksOverdue ? 'warn' : ''} />
                  <Stat label={t('tasksToday')} value={d.mine.tasksToday} to="/tasks" />
                  <Stat label={t('accessPending')} value={d.mine.accessPending} to="/access-requests" tone={d.mine.accessPending ? 'warn' : ''} />
                  <Stat label={t('noContact7')} value={d.mine.noContact7Days} to="/customers?mine=1&noFollowUpDays=7" />
                </div>
                <section className="card">
                  <h2>{t('myCustomers')}</h2>
                  <StatusBars counts={d.mine.customers} base="/customers?mine=1&" />
                </section>
              </>
            )}
            {d.team && (
              <section className="card">
                <h2>{t('teamCustomers')} <small className="muted">· {d.team.members} {t('members')}</small></h2>
                <StatusBars counts={d.team.customers} base="/customers?" />
                <h3>{t('byOwner')}</h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('owner')}</th><th>{t('total')}</th><th>{t('customer')}</th><th>{t('newThisMonth')}</th></tr></thead>
                    <tbody>{d.team.byOwner.map((r) => <tr key={r._id || 'none'}><td>{r.name || t('unassigned')}</td><td>{r.total}</td><td>{r.customers}</td><td>{r.newThisMonth}</td></tr>)}</tbody>
                  </table>
                </div>
              </section>
            )}
            {d.academy && (
              <>
                <div className="grid grid--4">
                  <Stat label={t('total')} value={d.academy.total} to="/customers" />
                  <Stat label={t('newThisMonth')} value={d.academy.newThisMonth} />
                  <Stat label={t('unassigned')} value={d.academy.unassigned} to="/customers?unassigned=1" tone={d.academy.unassigned ? 'warn' : ''} />
                  <Stat label={t('conversion')} value={`${d.academy.conversionRate}%`} />
                </div>
                <div className="grid grid--2">
                  <section className="card"><h2>{t('academyCustomers')}</h2><StatusBars counts={d.academy.customers} base="/customers?" /></section>
                  <section className="card"><h2>{t('bySource')}</h2><CountList rows={d.academy.bySource} group="source" /><h2>{t('byCountry')}</h2><CountList rows={d.academy.byCountry} /></section>
                </div>
              </>
            )}
          </>
        )}
      </Loading>
    </>
  );
}
