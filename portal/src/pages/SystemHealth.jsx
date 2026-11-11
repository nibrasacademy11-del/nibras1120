import { useI18n } from '../i18n.jsx';
import { Loading, Pill, useLoad } from '../components/ui.jsx';

// For the super admin: is everything configured and healthy before and after go-live
export default function SystemHealth() {
  const { t, fmtDate } = useI18n();
  const state = useLoad('/api/v2/system/health');
  return (
    <>
      <div className="page-head"><h1 className="page-title">{t('systemNav')}</h1><button type="button" className="btn btn--ghost" onClick={state.reload}>{t('refresh')}</button></div>
      <Loading state={state}>
        {(d) => (
          <>
            <div className="grid grid--4">
              <div className="card stat"><small>{t('database')}</small><strong className={d.database.ok ? 'ok' : 'warn'}>{d.database.ok ? `✓ ${d.database.latencyMs} ms` : '✗'}</strong><small className="muted">{d.database.name}</small></div>
              <div className="card stat"><small>{t('appVersion')}</small><strong dir="ltr">{d.version.commit}</strong><small className="muted" dir="ltr">{d.version.node} {d.version.region}</small></div>
              <div className="card stat"><small>{t('adminsWithout2fa')}</small><strong className={d.security.adminsWithout2fa ? 'warn' : 'ok'}>{d.security.adminsWithout2fa}</strong><small className="muted">{t('superAdmins')}: {d.security.superAdmins}</small></div>
              <div className="card stat"><small>{t('waitingWork')}</small><strong>{d.waiting.pendingPayments + d.waiting.pendingApprovals}</strong><small className="muted">{t('pendingConfirm')}: {d.waiting.pendingPayments} · {t('approvalsNav')}: {d.waiting.pendingApprovals} · {t('commissionsNav')}: {d.waiting.dueCommissions}</small></div>
            </div>
            <section className="card">
              <h2>{t('configuration')}</h2>
              <ul className="plain-list">
                {d.config.map((c) => (
                  <li key={c.key}>
                    <span><code dir="ltr">{c.key}</code> {c.note && <small className="muted">{c.note}</small>}</span>
                    <Pill tone={c.ok ? 'ok' : c.required ? 'warn' : 'muted'}>{c.ok ? '✓' : c.required ? t('missingRequired') : t('notSet')}</Pill>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h2>{t('recentErrors')}</h2>
              {!d.errors.length ? <p className="ok">{t('noErrors')}</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('when')}</th><th>{t('errorSource')}</th><th>{t('route')}</th><th>{t('summary')}</th><th>{t('count')}</th></tr></thead>
                    <tbody>{d.errors.map((e) => (
                      <tr key={e._id}><td className="nowrap">{fmtDate(e.lastAt)}</td><td>{e.source}</td><td dir="ltr"><code>{e.route}</code></td><td dir="ltr">{e.message}</td><td>{e.count}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </Loading>
    </>
  );
}
