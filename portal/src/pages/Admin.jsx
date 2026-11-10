import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, useAction, useLoad } from '../components/ui.jsx';

// Duplicate files report and system settings

export function Duplicates() {
  const { t, en, fmtDay } = useI18n();
  const state = useLoad('/api/v2/customers/duplicates');
  const [merging, setMerging] = useState(null);
  return (
    <>
      <h1 className="page-title">{t('duplicates')}</h1>
      <Loading state={state}>
        {(d) => (!d.groups.length ? <section className="card"><p className="muted">{t('noData')}</p></section> : d.groups.map((g, i) => (
          <section className="card" key={i}>
            <h2>{t('matchedBy')}: {t(g.kind === 'national_id' ? 'nationalId' : g.kind)}</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('customerNo')}</th><th>{t('name')}</th><th>{t('phone')}</th><th>{t('email')}</th><th>{t('owner')}</th><th>{t('status')}</th><th>{t('registeredAt')}</th><th /></tr></thead>
                <tbody>
                  {g.customers.map((c) => (
                    <tr key={c.id}>
                      <td dir="ltr"><Link to={`/customers/${c.id}`}>{c.customerNo}</Link></td>
                      <td>{c.nameAr}</td>
                      <td dir="ltr">{c.phone}</td>
                      <td dir="ltr">{c.email}</td>
                      <td>{c.owner ? c.owner.name : t('unassigned')}</td>
                      <td><Pill value={c.status}>{en('status', c.status)}</Pill></td>
                      <td>{fmtDay(c.registeredAt)}</td>
                      <td><button type="button" className="btn btn--small" onClick={() => setMerging({ group: g, keep: c })}>{t('merge')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )))}
      </Loading>
      {merging && <MergeDialog keep={merging.keep} others={merging.group.customers.filter((c) => c.id !== merging.keep.id)} onClose={() => setMerging(null)} onDone={() => { setMerging(null); state.reload(); }} />}
    </>
  );
}

function MergeDialog({ keep, others, onClose, onDone }) {
  const { t } = useI18n();
  const [source, setSource] = useState(others[0]?.id || '');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const submit = async (e) => {
    e.preventDefault();
    await run(async () => {
      const target = await api(`/api/v2/customers/${keep.id}`);
      await api(`/api/v2/customers/${keep.id}/merge`, { method: 'POST', body: { sourceId: source, reason, __v: target.item.__v } });
    }).then(onDone).catch(() => {});
  };
  return (
    <Modal title={`${t('merge')} → ${keep.customerNo}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">{t('mergeHint')}</p>
        <Field label={t('mergeSource')}>
          <select value={source} onChange={(e) => setSource(e.target.value)}>{others.map((c) => <option key={c.id} value={c.id}>{c.customerNo} — {c.nameAr}</option>)}</select>
        </Field>
        <Field label={t('reason')}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy || !source}>{t('confirm')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

export function Settings() {
  const { t } = useI18n();
  const state = useLoad('/api/v2/settings');
  const [policy, setPolicy] = useState(null);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <>
      <h1 className="page-title">{t('settings')}</h1>
      <Loading state={state}>
        {(d) => {
          const current = policy || d.settings['customers.lookupNamePolicy'];
          return (
            <form className="card stack" onSubmit={(e) => { e.preventDefault(); setSaved(false); run(() => api('/api/v2/settings', { method: 'PUT', body: { reason, settings: { 'customers.lookupNamePolicy': current } } })).then(() => { setSaved(true); setReason(''); state.reload(); }).catch(() => {}); }}>
              <Field label={t('lookupNamePolicy')}>
                <select value={current} onChange={(e) => setPolicy(e.target.value)}>
                  <option value="partial">{t('namePartial')}</option>
                  <option value="full">{t('nameFull')}</option>
                </select>
              </Field>
              <Field label={t('reason')}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <ErrorBox error={error} />
              {saved && <div className="alert alert--ok">{t('saved')}</div>}
              <div><button className="btn btn--primary" disabled={busy}>{t('save')}</button></div>
            </form>
          );
        }}
      </Loading>
    </>
  );
}
