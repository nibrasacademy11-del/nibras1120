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
  const dirty = Object.keys(changes).length > 0;
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('settings')}</h1>
          <p className="muted" style={{ margin: 0 }}>{t('set_intro')}</p>
        </div>
      </div>
      <Loading state={state}>
        {(d) => {
          const val = (k) => (changes[k] !== undefined ? changes[k] : d.settings[k]);
          const change = (k, v) => { setSaved(false); setChanges({ ...changes, [k]: v }); };
          const profile = val('academy.profile') || {};
          const setProfile = (k, v) => change('academy.profile', { ...profile, [k]: v });
          const rem = val('finance.reminders') || {};
          const setRem = (k, v) => change('finance.reminders', { ...rem, [k]: v });
          const tpls = val('crm.whatsappTemplates') || [];
          const setTpl = (i, k, v) => change('crm.whatsappTemplates', tpls.map((y, j) => (j === i ? { ...y, [k]: v } : y)));
          return (
            <form className="settings" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/v2/settings', { method: 'PUT', body: { reason, settings: changes } })).then(() => { setSaved(true); setReason(''); setChanges({}); refreshAcademy(); state.reload(); }).catch(() => {}); }}>
              <div className="settings__grid">
                <section className="card settings__card settings__card--wide">
                  <div className="settings__head"><span className="settings__icon" aria-hidden="true">🏛</span><div><h2>{t('academyProfile')}</h2><p className="muted">{t('apHint')}</p></div></div>
                  <div className="form-grid">
                    {[['nameAr', 'apNameAr'], ['nameEn', 'apNameEn', 'ltr'], ['address', 'apAddress'], ['phone', 'apPhone', 'ltr'], ['email', 'apEmail', 'ltr'], ['website', 'apWebsite', 'ltr'], ['taxNumber', 'taxNumber', 'ltr'], ['commercialRegister', 'crNumber', 'ltr']].map(([k, lab, dir]) => (
                      <Field key={k} label={t(lab)}><input dir={dir} value={profile[k] || ''} onChange={(e) => setProfile(k, e.target.value)} /></Field>
                    ))}
                    <Field label={t('apVatRate')}><input type="number" min={0} max={100} step="0.01" dir="ltr" value={profile.vatRate ?? 0} onChange={(e) => setProfile('vatRate', Number(e.target.value))} /></Field>
                    <label className="check settings__check"><input type="checkbox" checked={profile.pricesIncludeVat !== false} onChange={(e) => setProfile('pricesIncludeVat', e.target.checked)} /> {t('apVatIncluded')}</label>
                  </div>
                </section>

                <section className="card settings__card">
                  <div className="settings__head"><span className="settings__icon" aria-hidden="true">✪</span><div><h2>{t('set_learning')}</h2><p className="muted">{t('set_learningHint')}</p></div></div>
                  <div className="stack">
                    <Field label={t('setPaymentRule')}>
                      <select value={val('certificates.paymentRule')} onChange={(e) => change('certificates.paymentRule', e.target.value)}>
                        {['customer', 'enrollment', 'off'].map((x) => <option key={x} value={x}>{t(`pay_${x}`)}</option>)}
                      </select>
                    </Field>
                    <Field label={t('presentPercent')}><input type="number" min={1} max={100} dir="ltr" value={val('lectures.presentPercent')} onChange={(e) => change('lectures.presentPercent', Number(e.target.value))} /></Field>
                    <Field label={t('lookupNamePolicy')}>
                      <select value={val('customers.lookupNamePolicy')} onChange={(e) => change('customers.lookupNamePolicy', e.target.value)}>
                        <option value="partial">{t('namePartial')}</option>
                        <option value="full">{t('nameFull')}</option>
                      </select>
                    </Field>
                  </div>
                </section>

                <section className="card settings__card">
                  <div className="settings__head"><span className="settings__icon" aria-hidden="true">⏰</span><div><h2>{t('setReminders')}</h2><p className="muted">{t('set_remindersHint')}</p></div></div>
                  <div className="stack">
                    <label className="check settings__check"><input type="checkbox" checked={rem.enabled !== false} onChange={(e) => setRem('enabled', e.target.checked)} /> {t('remEnabled')}</label>
                    <div className="form-grid">
                      <Field label={t('remDaysBefore')}><input type="number" min={0} max={30} dir="ltr" value={rem.daysBefore ?? 3} onChange={(e) => setRem('daysBefore', Number(e.target.value))} /></Field>
                      <Field label={t('remOverdue')}><input dir="ltr" value={(rem.overdueDays || []).join(', ')} onChange={(e) => setRem('overdueDays', e.target.value.split(/[,، ]+/).map(Number).filter(Boolean))} /></Field>
                    </div>
                    <label className="check settings__check"><input type="checkbox" checked={rem.email !== false} onChange={(e) => setRem('email', e.target.checked)} /> {t('remEmail')}</label>
                    <label className="check settings__check"><input type="checkbox" checked={rem.notifyOwner !== false} onChange={(e) => setRem('notifyOwner', e.target.checked)} /> {t('remOwner')}</label>
                  </div>
                </section>

                <section className="card settings__card settings__card--wide">
                  <div className="settings__head"><span className="settings__icon" aria-hidden="true">✆</span><div><h2>{t('waTemplates')}</h2><p className="muted">{t('waPlaceholders')}</p></div></div>
                  <div className="tpl-list">
                    {tpls.map((x, i) => (
                      <div key={x.key || i} className="tpl-item">
                        <div className="tpl-item__top">
                          <input aria-label={t('title')} placeholder={t('title')} value={x.titleAr} onChange={(e) => setTpl(i, 'titleAr', e.target.value)} />
                          <button type="button" className="btn btn--small btn--ghost" onClick={() => change('crm.whatsappTemplates', tpls.filter((_, j) => j !== i))}>{t('set_remove')}</button>
                        </div>
                        <textarea rows={3} aria-label={t('waMessage')} value={x.text} onChange={(e) => setTpl(i, 'text', e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div><button type="button" className="btn btn--small btn--ghost" onClick={() => change('crm.whatsappTemplates', [...tpls, { key: `t${Date.now()}`, titleAr: '', text: '' }])}>+ {t('set_addTemplate')}</button></div>
                </section>
              </div>

              {/* saving: shown once something changed, the reason goes to the audit log */}
              <div className={`settings__save card${dirty ? ' is-dirty' : ''}`}>
                <Field label={t('reason')}><input required value={reason} placeholder={t('set_reasonHint')} onChange={(e) => setReason(e.target.value)} /></Field>
                <button className="btn btn--primary" disabled={busy || !dirty}>{t('save')}</button>
                {dirty && <button type="button" className="btn btn--ghost" onClick={() => setChanges({})}>{t('set_undo')}</button>}
              </div>
              <ErrorBox error={error} />
              {saved && <div className="alert alert--ok">{t('saved')}</div>}
            </form>
          );
        }}
      </Loading>
    </>
  );
}
