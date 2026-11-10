import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Loading, useLoad } from '../components/ui.jsx';

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

export default function Dashboard() {
  const { me } = useAuth();
  const { t, label, lang } = useI18n();
  const state = useLoad('/api/v2/dashboard');
  const { user, security } = me;

  return (
    <>
      <h1 className="page-title">{t('welcome')}{lang === 'ar' ? '، ' : ', '}{user.name.split(' ')[0]} <small className="muted">{label(user.roleLabel)}</small></h1>
      {!security.twoFactorEnabled && user.isStaff && (
        <div className="alert alert--warn">{t('twoFactor')}: {t('twoFactorOff')} — <Link to="/security">{t('enable')}</Link></div>
      )}
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
