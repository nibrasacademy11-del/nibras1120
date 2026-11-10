import { useCallback, useEffect, useState } from 'react';
import { api, pickMessage } from '../api.js';
import { useI18n } from '../i18n.jsx';

function Changes({ changes }) {
  if (!changes) return null;
  return (
    <ul className="changes" dir="ltr">
      {Object.entries(changes).map(([k, v]) => (
        <li key={k}><code>{k}</code>: {JSON.stringify(v.from)} → {JSON.stringify(v.to)}</li>
      ))}
    </ul>
  );
}

export default function Audit() {
  const { t, fmtDate, lang } = useI18n();
  const [filters, setFilters] = useState({ resource: '', action: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), limit: '50' });
    for (const [k, v] of Object.entries(applied)) if (v) q.set(k, v);
    setError('');
    api(`/api/v2/audit?${q}`).then(setData).catch((e) => setError(pickMessage(e.message, lang)));
  }, [applied, page, lang]);
  useEffect(load, [load]);

  const pages = data ? Math.max(Math.ceil(data.total / data.limit), 1) : 1;

  return (
    <>
      <h1 className="page-title">{t('audit')}</h1>
      <form
        className="card filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied(filters);
        }}
      >
        <label className="field">{t('filterResource')}<input dir="ltr" value={filters.resource} onChange={(e) => setFilters({ ...filters, resource: e.target.value })} placeholder="users" /></label>
        <label className="field">{t('filterAction')}<input dir="ltr" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} placeholder="auth.login" /></label>
        <label className="field">{t('from')}<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label className="field">{t('to')}<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <button className="btn btn--primary">{t('apply')}</button>
      </form>

      {error && <div className="alert alert--error">{error}</div>}
      <section className="card">
        {!data ? <p className="muted">{t('loading')}</p> : !data.items.length ? <p className="muted">{t('noData')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('when')}</th><th>{t('who')}</th><th>{t('action')}</th><th>{t('details')}</th></tr></thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e._id}>
                    <td className="nowrap">{fmtDate(e.at)}</td>
                    <td>{e.actor ? e.actor.name : '—'}<br /><small className="muted">{e.actor && e.actor.role}</small></td>
                    <td dir="ltr"><code>{e.action}</code><br /><small className="muted">{e.resource}{e.resourceId ? ` · ${e.resourceId}` : ''}</small></td>
                    <td>
                      {e.summary}
                      {e.reason && <div className="muted">{t('reason')}: {e.reason}</div>}
                      <Changes changes={e.changes} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && pages > 1 && (
          <div className="row pager">
            <button type="button" className="btn btn--ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('prev')}</button>
            <span>{page} / {pages}</span>
            <button type="button" className="btn btn--ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('next')}</button>
          </div>
        )}
      </section>
    </>
  );
}
