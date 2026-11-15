import { refreshAcademy } from '../components/Print.jsx';
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
  const [changes, setChanges] = useState({});
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <>
      <h1 className="page-title">{t('settings')}</h1>
      <Loading state={state}>
        {(d) => {
          const val = (k) => (changes[k] !== undefined ? changes[k] : d.settings[k]);
          const change = (k, v) => setChanges({ ...changes, [k]: v });
          return (
            <form className="card stack" onSubmit={(e) => { e.preventDefault(); setSaved(false); run(() => api('/api/v2/settings', { method: 'PUT', body: { reason, settings: changes } })).then(() => { setSaved(true); setReason(''); setChanges({}); refreshAcademy(); state.reload(); }).catch(() => {}); }}>
              <Field label={t('setPaymentRule')}>
                <select value={val('certificates.paymentRule')} onChange={(e) => change('certificates.paymentRule', e.target.value)}>
                  {['customer', 'enrollment', 'off'].map((x) => <option key={x} value={x}>{t(`pay_${x}`)}</option>)}
                </select>
              </Field>
              <Field label={t('presentPercent')}><input type="number" min={1} max={100} value={val('lectures.presentPercent')} onChange={(e) => change('lectures.presentPercent', Number(e.target.value))} /></Field>
              <Field label={t('lookupNamePolicy')}>
                <select value={val('customers.lookupNamePolicy')} onChange={(e) => change('customers.lookupNamePolicy', e.target.value)}>
                  <option value="partial">{t('namePartial')}</option>
                  <option value="full">{t('nameFull')}</option>
                </select>
              </Field>
              <fieldset className="checks stack stack--full">
                <legend>{t('waTemplates')}</legend>
                <p className="muted"><small>{t('waPlaceholders')}</small></p>
                {(val('crm.whatsappTemplates') || []).map((x, i) => (
                  <div key={i} className="row tpl-row">
                    <input aria-label={t('title')} value={x.titleAr} onChange={(e) => change('crm.whatsappTemplates', val('crm.whatsappTemplates').map((y, j) => (j === i ? { ...y, titleAr: e.target.value } : y)))} />
                    <textarea rows={2} aria-label={t('waMessage')} value={x.text} onChange={(e) => change('crm.whatsappTemplates', val('crm.whatsappTemplates').map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} />
                    <button type="button" className="icon-btn" aria-label="Remove" title="حذف" onClick={() => change('crm.whatsappTemplates', val('crm.whatsappTemplates').filter((_, j) => j !== i))}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  </div>
                ))}
                <div><button type="button" className="btn btn--small btn--ghost" onClick={() => change('crm.whatsappTemplates', [...(val('crm.whatsappTemplates') || []), { key: `t${Date.now()}`, titleAr: '', text: '' }])}>{t('lecAddRow')}</button></div>
              </fieldset>
              <fieldset className="checks form-grid">
                <legend>{t('setReminders')}</legend>
                <label className="check field--wide"><input type="checkbox" checked={val('finance.reminders')?.enabled !== false} onChange={(e) => change('finance.reminders', { ...val('finance.reminders'), enabled: e.target.checked })} /> {t('remEnabled')}</label>
                <Field label={t('remDaysBefore')}><input type="number" min={0} max={30} dir="ltr" value={val('finance.reminders')?.daysBefore ?? 3} onChange={(e) => change('finance.reminders', { ...val('finance.reminders'), daysBefore: Number(e.target.value) })} /></Field>
                <Field label={t('remOverdue')}><input dir="ltr" value={(val('finance.reminders')?.overdueDays || []).join(', ')} onChange={(e) => change('finance.reminders', { ...val('finance.reminders'), overdueDays: e.target.value.split(/[,، ]+/).map(Number).filter(Boolean) })} /></Field>
                <label className="check"><input type="checkbox" checked={val('finance.reminders')?.email !== false} onChange={(e) => change('finance.reminders', { ...val('finance.reminders'), email: e.target.checked })} /> {t('remEmail')}</label>
                <label className="check"><input type="checkbox" checked={val('finance.reminders')?.notifyOwner !== false} onChange={(e) => change('finance.reminders', { ...val('finance.reminders'), notifyOwner: e.target.checked })} /> {t('remOwner')}</label>
              </fieldset>
              <fieldset className="checks form-grid">
                <legend>{t('academyProfile')}</legend>
                <p className="muted field--wide"><small>{t('apHint')}</small></p>
                {[['nameAr', 'apNameAr'], ['nameEn', 'apNameEn', 'ltr'], ['address', 'apAddress'], ['phone', 'apPhone', 'ltr'], ['email', 'apEmail', 'ltr'], ['website', 'apWebsite', 'ltr'], ['taxNumber', 'taxNumber', 'ltr'], ['commercialRegister', 'crNumber', 'ltr']].map(([k, lab, dir]) => (
                  <Field key={k} label={t(lab)}><input dir={dir} value={val('academy.profile')?.[k] || ''} onChange={(e) => change('academy.profile', { ...val('academy.profile'), [k]: e.target.value })} /></Field>
                ))}
                <Field label={t('apVatRate')}><input type="number" min={0} max={100} step="0.01" dir="ltr" value={val('academy.profile')?.vatRate ?? 0} onChange={(e) => change('academy.profile', { ...val('academy.profile'), vatRate: Number(e.target.value) })} /></Field>
                <label className="check"><input type="checkbox" checked={val('academy.profile')?.pricesIncludeVat !== false} onChange={(e) => change('academy.profile', { ...val('academy.profile'), pricesIncludeVat: e.target.checked })} /> {t('apVatIncluded')}</label>
              </fieldset>
              <Field label={t('reason')}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <ErrorBox error={error} />
              {saved && <div className="alert alert--ok">{t('saved')}</div>}
              <div><button className="btn btn--primary" disabled={busy || !Object.keys(changes).length}>{t('save')}</button></div>
            </form>
          );
        }}
      </Loading>
    </>
  );
}
