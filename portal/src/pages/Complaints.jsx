import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pager, Pill, StaffSelect, useAction, useLoad } from '../components/ui.jsx';
import PhoneActions from '../components/PhoneActions.jsx';

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const CATEGORIES = ['service', 'program', 'trainer', 'finance', 'certificate', 'technical', 'other'];
const TONE = { open: 'warn', in_progress: 'gold', resolved: 'ok', closed: 'muted' };

export function ComplaintForm({ customer, onClose, onSaved }) {
  const { t } = useI18n();
  const { me } = useAuth();
  const [f, setF] = useState({ customer: customer?.id || '', subject: '', description: '', category: 'service', priority: 'normal', channel: 'phone' });
  const [lookup, setLookup] = useState('');
  const { busy, error, setError, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isStaff = me.user.isStaff;
  const submit = async (e) => {
    e.preventDefault();
    let body = f;
    if (isStaff && !f.customer) {
      const r = await api(`/api/v2/customers/lookup?q=${encodeURIComponent(lookup.trim())}`).catch(() => null);
      if (!r || !r.items.length) return setError(t('noResults'));
      body = { ...f, customer: r.items[0].id };
    }
    run(() => api('/api/v2/complaints', { method: 'POST', body })).then(onSaved).catch(() => {});
  };
  return (
    <Modal title={t('newComplaint')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {isStaff && !customer && <Field label={t('customerNo')}><input dir="ltr" required value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="NB-000123" /></Field>}
        <Field label={t('subject')}><input required value={f.subject} onChange={set('subject')} /></Field>
        <Field label={t('description')}><textarea rows={4} value={f.description} onChange={set('description')} /></Field>
        <Field label={t('categoryName')}><select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`cc_${c}`)}</option>)}</select></Field>
        {isStaff && <Field label={t('priority')}><select value={f.priority} onChange={set('priority')}>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{t(p)}</option>)}</select></Field>}
        {isStaff && <Field label={t('channel')}><select value={f.channel} onChange={set('channel')}>{['phone', 'whatsapp', 'email', 'visit', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>}
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function ComplaintDialog({ c, onClose, onSaved }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const [f, setF] = useState({ status: c.status, resolution: c.resolution || '', note: '', internal: true, assignee: c.assignee?._id || '', priority: c.priority });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  const canEdit = can('complaints.update');
  return (
    <Modal title={`${c.complaintNo}: ${c.subject}`} onClose={onClose} wide>
      <div className="stack stack--full">
        <p>{c.description}</p>
        <p className="muted">{c.customer?.customerNo} {c.customer?.nameAr} · {t(`cc_${c.category}`)} · {fmtDate(c.createdAt)}</p>
        {c.customer?.contact && <PhoneActions phone={c.customer.contact.phone} whatsapp={c.customer.contact.whatsapp} />}
        <ul className="plain-list">{(c.updates || []).map((u, i) => <li key={i}><span>{u.note || t(`cs2_${u.status}`)}{u.internal && <Pill tone="muted">{t('internal')}</Pill>}</span><small className="muted">{u.byName} · {fmtDate(u.at)}</small></li>)}</ul>
        {canEdit && (
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/v2/complaints/${c._id}`, { method: 'PUT', body: { ...f, assignee: f.assignee || null, __v: c.__v } })).then(onSaved).catch(() => {}); }}>
            <Field label={t('status')}><select value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s} value={s}>{t(`cs2_${s}`)}</option>)}</select></Field>
            <Field label={t('priority')}><select value={f.priority} onChange={set('priority')}>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{t(p)}</option>)}</select></Field>
            <Field label={t('assignee')}><StaffSelect value={f.assignee} onChange={set('assignee')} allowEmpty /></Field>
            <Field label={t('resolution')} wide><textarea rows={2} value={f.resolution} onChange={set('resolution')} /></Field>
            <Field label={t('note')} wide><input value={f.note} onChange={set('note')} /></Field>
            <label className="check"><input type="checkbox" checked={f.internal} onChange={set('internal')} /> {t('internalNote')}</label>
            <div className="field--wide"><ErrorBox error={error} /></div>
            <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button></div>
          </form>
        )}
      </div>
    </Modal>
  );
}

export default function Complaints() {
  const { t, fmtDay } = useI18n();
  const { can } = useAuth();
  const [filter, setFilter] = useState({ status: '', page: 1 });
  const [dialog, setDialog] = useState(null);
  const q = new URLSearchParams({ page: String(filter.page), limit: '50' });
  if (filter.status) q.set('status', filter.status);
  const state = useLoad(`/api/v2/complaints?${q}`);
  const done = () => { setDialog(null); state.reload(); };
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('complaintsNav')}</h1>
        {can('complaints.create') && <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'new' })}>+ {t('newComplaint')}</button>}
      </div>
      <div className="tabs">{['', ...STATUSES].map((s) => <button key={s || 'all'} type="button" className={`tab${filter.status === s ? ' active' : ''}`} onClick={() => setFilter({ status: s, page: 1 })}>{s ? t(`cs2_${s}`) : t('all')}</button>)}</div>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <>
              <div className="table-wrap">
                <table className="table table--hover">
                  <thead><tr><th dir="ltr">#</th><th>{t('subject')}</th><th>{t('customer')}</th><th>{t('categoryName')}</th><th>{t('priority')}</th><th>{t('assignee')}</th><th>{t('date')}</th><th>{t('status')}</th></tr></thead>
                  <tbody>{d.items.map((c) => (
                    <tr key={c._id} onClick={() => setDialog({ kind: 'view', c })}>
                      <td dir="ltr">{c.complaintNo}</td><td><strong>{c.subject}</strong></td>
                      <td>{c.customer && <Link to={`/customers/${c.customer._id}`} onClick={(e) => e.stopPropagation()}>{c.customer.customerNo}</Link>} {c.customer?.nameAr}{c.customer?.contact?.phone && <><br /><PhoneActions phone={c.customer.contact.phone} whatsapp={c.customer.contact.whatsapp} /></>}</td>
                      <td>{t(`cc_${c.category}`)}</td><td>{t(c.priority)}</td><td>{c.assignee?.name || '—'}</td><td className="nowrap">{fmtDay(c.createdAt)}</td>
                      <td><Pill tone={TONE[c.status]}>{t(`cs2_${c.status}`)}</Pill></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <Pager page={filter.page} total={d.total} limit={d.limit} onPage={(p) => setFilter({ ...filter, page: p })} />
            </>
          ))}
        </Loading>
      </section>
      {dialog?.kind === 'new' && <ComplaintForm onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'view' && <ComplaintDialog c={dialog.c} onClose={() => setDialog(null)} onSaved={done} />}
    </>
  );
}

// ---- customer side ----

export function Stars({ value, onChange }) {
  return (
    <span className="stars" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}/5`} className={n <= (value || 0) ? 'on' : ''} onClick={() => onChange(n)}>★</button>
      ))}
    </span>
  );
}

export function RateDialog({ kind, enrollment, complaint, title, onClose, onDone }) {
  const { t } = useI18n();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal title={`${t('rateUs')}: ${title}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/v2/my/ratings', { method: 'POST', body: { kind, enrollment, complaint, score, comment } })).then(onDone).catch(() => {}); }}>
        <Stars value={score} onChange={setScore} />
        <Field label={`${t('comment')} (${t('optional')})`}><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy || !score}>{t('send')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

export function MyComplaints() {
  const { t, fmtDay } = useI18n();
  const state = useLoad('/api/v2/complaints');
  const ratings = useLoad('/api/v2/my/ratings');
  const [dialog, setDialog] = useState(null);
  const rated = new Set((ratings.data?.items || []).filter((r) => r.complaint).map((r) => String(r.complaint)));
  const done = () => { setDialog(null); state.reload(); ratings.reload(); };
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('myComplaints')}</h1>
        <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'new' })}>+ {t('newComplaint')}</button>
      </div>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <ul className="plain-list">{d.items.map((c) => (
              <li key={c._id}>
                <span><strong>{c.subject}</strong> <small className="muted" dir="ltr">{c.complaintNo}</small><br /><small className="muted">{fmtDay(c.createdAt)}{c.resolution ? ` · ${c.resolution}` : ''}</small></span>
                <span className="row">
                  <Pill tone={TONE[c.status]}>{t(`cs2_${c.status}`)}</Pill>
                  {['resolved', 'closed'].includes(c.status) && !rated.has(c._id) && <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'rate', c })}>{t('rateUs')}</button>}
                </span>
              </li>
            ))}</ul>
          ))}
        </Loading>
      </section>
      {dialog?.kind === 'new' && <ComplaintForm onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'rate' && <RateDialog kind="complaint" complaint={dialog.c._id} title={dialog.c.subject} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}
