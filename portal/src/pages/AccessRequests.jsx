import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, useAction, useLoad } from '../components/ui.jsx';

function Decide({ r, onClose, onDone }) {
  const { t, en } = useI18n();
  const [sections, setSections] = useState(r.sections);
  const [hours, setHours] = useState(r.durationHours);
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const send = (decision) => run(() => api(`/api/v2/access-requests/${r._id}/decide`, { method: 'POST', body: { __v: r.__v, decision, note, sections, durationHours: hours } })).then(onDone).catch(() => {});
  return (
    <Modal title={`${t('decision')}: ${r.customer?.customerNo}`} onClose={onClose}>
      <div className="stack">
        <p><strong>{r.requester?.name}</strong>: {r.purpose}</p>
        <fieldset className="checks">
          <legend>{t('sections')}</legend>
          {r.sections.map((s) => (
            <label key={s}><input type="checkbox" checked={sections.includes(s)} onChange={() => setSections((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))} /> {en('section', s)}</label>
          ))}
        </fieldset>
        <Field label={`${t('duration')} (${t('hours')})`}><input type="number" min={1} max={r.durationHours} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
        <Field label={t('note')}><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={busy || !sections.length} onClick={() => send('approve')}>{t('approve')}</button>
          <button type="button" className="btn btn--danger" disabled={busy} onClick={() => send('reject')}>{t('reject')}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function AccessRequests() {
  const { t, en, fmtDate } = useI18n();
  const { me, can } = useAuth();
  const [box, setBox] = useState('incoming');
  const [deciding, setDeciding] = useState(null);
  const state = useLoad(`/api/v2/access-requests?box=${box}`);
  const revoke = (r) => api(`/api/v2/access-requests/${r._id}/revoke`, { method: 'POST', body: {} }).then(state.reload);
  const boxes = ['incoming', 'outgoing', ...(can('access_requests.approve', 'all') ? ['all'] : [])];

  return (
    <>
      <h1 className="page-title">{t('accessRequests')}</h1>
      <div className="tabs">
        {boxes.map((b) => <button key={b} type="button" className={`tab${box === b ? ' active' : ''}`} onClick={() => setBox(b)}>{t(b)}</button>)}
      </div>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('customer')}</th><th>{t('requester')}</th><th>{t('sections')}</th><th>{t('purpose')}</th><th>{t('status')}</th><th>{t('expires')}</th><th /></tr></thead>
                <tbody>
                  {d.items.map((r) => {
                    const mineRequest = r.requester && r.requester._id === me.user.id;
                    return (
                      <tr key={r._id}>
                        <td><Link to={`/customers/${r.customer?._id}`}>{r.customer?.customerNo}</Link></td>
                        <td>{r.requester?.name}<br /><small className="muted">{fmtDate(r.createdAt)}</small></td>
                        <td>{r.sections.map((s) => en('section', s)).join('، ')}</td>
                        <td>{r.purpose}{r.decisionNote && <div className="muted">{t('note')}: {r.decisionNote}</div>}</td>
                        <td><Pill value={r.effectiveStatus}>{t(r.effectiveStatus)}</Pill></td>
                        <td className="nowrap">{r.expiresAt ? fmtDate(r.expiresAt) : `${r.durationHours} ${t('hours')}`}</td>
                        <td className="nowrap">
                          {r.status === 'pending' && !mineRequest && <button type="button" className="btn btn--small" onClick={() => setDeciding(r)}>{t('decision')}</button>}
                          {r.status === 'pending' && mineRequest && <button type="button" className="btn btn--small" onClick={() => revoke(r)}>{t('cancelRequest')}</button>}
                          {r.active && <button type="button" className="btn btn--small" onClick={() => revoke(r)}>{t('revoke')}</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
      {deciding && <Decide r={deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); state.reload(); }} />}
    </>
  );
}
