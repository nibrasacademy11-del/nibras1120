import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { EnumSelect, ErrorBox, Field, Loading, Modal, Pill, StaffSelect, fromLocalInput, useAction, useLoad } from '../components/ui.jsx';
import { DuplicateList } from './Customers.jsx';
import { TaskTable, TaskForm } from './Tasks.jsx';
import { CustomerPrograms, ModuleStatus } from './Enrollments.jsx';
import { CustomerFinance } from './Finance.jsx';
import { CustomerGroups } from './Groups.jsx';
import { Summary360, WhatsAppButton } from './Crm360.jsx';
import { PrintButton, PrintHeader } from '../components/Print.jsx';
import { AccountCard } from './CustomerAccounts.jsx';

// Programs on the card: each enrollment with its status and the status of each module
export function ProgramSummary({ programs }) {
  const { label, en } = useI18n();
  if (!programs || !programs.length) return '—';
  return (
    <ul className="plain-list">
      {programs.map((p, i) => (
        <li key={i} style={{ display: 'block' }}>
          <strong>{label({ ar: p.title, en: p.titleEn })}</strong> {p.status && <small className="muted">· {en('enrollmentStatus', p.status)}</small>}
          {p.modules && p.modules.length > 0 && <div className="mini-modules">{p.modules.map((m, k) => <span key={k}><ModuleStatus status={m.status} /> {label({ ar: m.title, en: m.titleEn })}</span>)}</div>}
        </li>
      ))}
    </ul>
  );
}

const STATUSES = ['lead', 'interested', 'customer', 'lost', 'inactive'];
const SOURCES = ['website', 'facebook', 'instagram', 'tiktok', 'whatsapp', 'phone', 'referral', 'walk_in', 'corporate', 'event', 'other'];
const SECTIONS = ['contact', 'identity', 'financial', 'documents', 'notes'];
const CHANNELS = ['call', 'whatsapp', 'email', 'sms', 'meeting', 'social', 'other'];
const OUTCOMES = ['', 'reached', 'no_answer', 'busy', 'wrong_number', 'interested', 'not_interested', 'callback', 'enrolled'];
const DOC_CATEGORIES = ['identity', 'contract', 'certificate', 'receipt', 'academic', 'other'];

const Info = ({ label, children, ltr }) => (
  <div className="info"><small>{label}</small><div dir={ltr ? 'ltr' : undefined}>{children || '—'}</div></div>
);

// ---- the basic card for users who are not responsible for this customer ----

function RequestAccess({ customer, onSent }) {
  const { t, en } = useI18n();
  const [sections, setSections] = useState(['contact']);
  const [purpose, setPurpose] = useState('');
  const [hours, setHours] = useState(24);
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    run(() => api(`/api/v2/customers/${customer.id}/access-requests`, { method: 'POST', body: { sections, purpose, durationHours: hours } }))
      .then(() => { setSent(true); onSent && onSent(); })
      .catch(() => {});
  };
  if (sent) return <div className="alert alert--ok">{t('requestSent')}</div>;
  return (
    <form className="stack" onSubmit={submit}>
      <h3>{t('requestAccess')}</h3>
      <fieldset className="checks">
        <legend>{t('sections')}</legend>
        {SECTIONS.map((s) => (
          <label key={s}><input type="checkbox" checked={sections.includes(s)} onChange={() => setSections((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))} /> {en('section', s)}</label>
        ))}
      </fieldset>
      <Field label={t('purpose')}><textarea rows={3} required minLength={5} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>
      <Field label={t('duration')}>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          {[2, 8, 24, 72, 168].map((h) => <option key={h} value={h}>{h < 24 ? `${h} ${t('hours')}` : `${h / 24} ${t('days')}`}</option>)}
        </select>
      </Field>
      <ErrorBox error={error} />
      <div><button className="btn btn--primary" disabled={busy || !sections.length}>{t('requestAccess')}</button></div>
    </form>
  );
}

function BasicCard({ c }) {
  const { t, en } = useI18n();
  return (
    <>
      <h1 className="page-title">{c.name} <small className="muted" dir="ltr">{c.customerNo}</small></h1>
      <section className="card">
        {c.access === 'basic' && <div className="alert alert--info">{t('basicOnly')}</div>}
        <div className="info-grid">
          <Info label={t('customerNo')} ltr>{c.customerNo}</Info>
          <Info label={t('owner')}>{c.owner ? c.owner.name : t('unassigned')}</Info>
          <Info label={t('status')}><Pill value={c.status}>{en('status', c.status)}</Pill></Info>
          <Info label={t('programs')}><ProgramSummary programs={c.programs} /></Info>
        </div>
      </section>
      {c.canRequestAccess && <section className="card"><RequestAccess customer={c} /></section>}
    </>
  );
}

// ---- edit / transfer / merge dialogs ----

function EditCustomer({ c, onClose, onSaved }) {
  const { t } = useI18n();
  const p = c.permissions;
  const [f, setF] = useState({
    nameAr: c.nameAr, nameEn: c.nameEn || '', country: c.country || '', source: c.source, sourceDetail: c.sourceDetail || '', status: c.status,
    lostReason: c.lostReason || '', segment: c.segment || '', tags: (c.tags || []).join('، '),
    phone: c.contact?.phone || '', phone2: c.contact?.phone2 || '', whatsapp: c.contact?.whatsapp || '', email: c.contact?.email || '', address: c.contact?.address || '', city: c.contact?.city || '',
    nationality: c.identity?.nationality || '', nationalId: '', passport: '', birthDate: c.identity?.birthDate ? c.identity.birthDate.slice(0, 10) : '', gender: c.identity?.gender || ''
  });
  const [dups, setDups] = useState(null);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });

  const submit = (e) => {
    e.preventDefault();
    const body = { __v: c.__v };
    if (p.canEdit) Object.assign(body, { nameAr: f.nameAr, nameEn: f.nameEn, country: f.country, source: f.source, sourceDetail: f.sourceDetail, status: f.status, lostReason: f.lostReason, segment: f.segment, tags: f.tags.split(/[,،]/).map((x) => x.trim()).filter(Boolean) });
    if (p.canEditSection.contact) body.contact = { phone: f.phone, phone2: f.phone2, whatsapp: f.whatsapp, email: f.email, address: f.address, city: f.city };
    if (p.canEditSection.identity) {
      body.identity = { nationality: f.nationality, birthDate: f.birthDate || null, gender: f.gender };
      if (f.nationalId) body.identity.nationalId = f.nationalId;
      if (f.passport) body.identity.passport = f.passport;
    }
    run(() => api(`/api/v2/customers/${c.id}`, { method: 'PUT', body }))
      .then((d) => onSaved(d.item))
      .catch((err) => { if (err.code === 'DUPLICATE') setDups(err.body.matches); });
  };

  return (
    <Modal title={t('edit')} onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        {p.canEdit && (
          <>
            <h3 className="field--wide">{t('generalData')}</h3>
            <Field label={t('nameAr')}><input required value={f.nameAr} onChange={set('nameAr')} /></Field>
            <Field label={t('nameEn')}><input dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
            <Field label={t('status')}><EnumSelect group="status" options={STATUSES} value={f.status} onChange={set('status')} /></Field>
            {f.status === 'lost' && <Field label={t('lostReason')}><input required value={f.lostReason} onChange={set('lostReason')} /></Field>}
            <Field label={t('source')}><EnumSelect group="source" options={SOURCES} value={f.source} onChange={set('source')} /></Field>
            <Field label={t('sourceDetail')}><input value={f.sourceDetail} onChange={set('sourceDetail')} /></Field>
            <Field label={t('country')}><input value={f.country} onChange={set('country')} /></Field>
            <Field label={t('segment')}><input value={f.segment} onChange={set('segment')} /></Field>
            <Field label={t('tags')} wide><input value={f.tags} onChange={set('tags')} placeholder="VIP، شركات" /></Field>
          </>
        )}
        {p.canEditSection.contact && (
          <>
            <h3 className="field--wide">{t('contactData')}</h3>
            <Field label={t('phone')}><input dir="ltr" value={f.phone} onChange={set('phone')} /></Field>
            <Field label={t('phone2')}><input dir="ltr" value={f.phone2} onChange={set('phone2')} /></Field>
            <Field label={t('whatsapp')}><input dir="ltr" value={f.whatsapp} onChange={set('whatsapp')} /></Field>
            <Field label={t('email')}><input dir="ltr" type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label={t('city')}><input value={f.city} onChange={set('city')} /></Field>
            <Field label={t('address')}><input value={f.address} onChange={set('address')} /></Field>
          </>
        )}
        {p.canEditSection.identity && (
          <>
            <h3 className="field--wide">{t('identityData')}</h3>
            <Field label={t('nationality')}><input value={f.nationality} onChange={set('nationality')} /></Field>
            <Field label={t('nationalId')} hint={c.identity?.nationalId || ''}><input dir="ltr" autoComplete="off" value={f.nationalId} onChange={set('nationalId')} placeholder="••••" /></Field>
            <Field label={t('passport')} hint={c.identity?.passport || ''}><input dir="ltr" autoComplete="off" value={f.passport} onChange={set('passport')} placeholder="••••" /></Field>
            <Field label={t('birthDate')}><input type="date" value={f.birthDate} onChange={set('birthDate')} /></Field>
            <Field label={t('gender')}>
              <select value={f.gender} onChange={set('gender')}><option value="">—</option><option value="male">{t('male')}</option><option value="female">{t('female')}</option></select>
            </Field>
          </>
        )}
        {dups && <div className="field--wide"><div className="alert alert--error">{t('strongDuplicate')}</div><DuplicateList matches={dups} /></div>}
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide">
          <button className="btn btn--primary" disabled={busy}>{busy ? t('saving') : t('save')}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReasonDialog({ title, hint, children, onClose, onSubmit, danger }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal title={title} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => onSubmit(reason)).then(onClose).catch(() => {}); }}>
        {hint && <p className="muted">{hint}</p>}
        {children}
        <Field label={t('reason')}><input required value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
        <ErrorBox error={error} />
        <div className="row">
          <button className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} disabled={busy}>{t('confirm')}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---- tabs ----

function Overview({ c, onReload }) {
  const { t, en, fmtDate, fmtDay } = useI18n();
  const [revealed, setRevealed] = useState(null);
  const { error, run } = useAction();
  const s = c.permissions.sections;
  const reveal = () => run(() => api(`/api/v2/customers/${c.id}/reveal-identity`, { method: 'POST', body: {} })).then(setRevealed).catch(() => {});
  return (
    <>
      <section className="card">
        <h2>{t('generalData')}</h2>
        <div className="info-grid">
          <Info label={t('nameAr')}>{c.nameAr}</Info>
          <Info label={t('nameEn')} ltr>{c.nameEn}</Info>
          <Info label={t('status')}><Pill value={c.status}>{en('status', c.status)}</Pill>{c.status === 'lost' && c.lostReason && <div className="muted">{c.lostReason}</div>}</Info>
          <Info label={t('owner')}>{c.owner ? c.owner.name : t('unassigned')}</Info>
          <Info label={t('team')}>{c.team ? c.team.name : '—'}</Info>
          <Info label={t('source')}>{en('source', c.source)}{c.sourceDetail ? ` · ${c.sourceDetail}` : ''}</Info>
          <Info label={t('registeredAt')}>{fmtDay(c.registeredAt)}</Info>
          <Info label={t('createdBy')}>{c.createdBy ? c.createdBy.name : '—'}</Info>
          <Info label={t('lastContact')}>{c.lastContactAt ? fmtDate(c.lastContactAt) : '—'}</Info>
          <Info label={t('nextFollowUp')}>{c.nextFollowUpAt ? fmtDate(c.nextFollowUpAt) : '—'}</Info>
          <Info label={t('segment')}>{c.segment}</Info>
          <Info label={t('tags')}>{(c.tags || []).length ? <div className="tags">{c.tags.map((x) => <span key={x} className="tag">{x}</span>)}</div> : '—'}</Info>

        </div>
      </section>
      {s.contact && c.contact && (
        <section className="card">
          <h2>{t('contactData')}</h2>
          <div className="info-grid">
            <Info label={t('phone')} ltr>{c.contact.phone && <a href={`tel:${c.contact.phone}`}>{c.contact.phone}</a>}</Info>
            <Info label={t('phone2')} ltr>{c.contact.phone2}</Info>
            <Info label={t('whatsapp')} ltr>{c.contact.whatsapp && <a href={`https://wa.me/${c.contact.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{c.contact.whatsapp}</a>}</Info>
            <Info label={t('email')} ltr>{c.contact.email && <a href={`mailto:${c.contact.email}`}>{c.contact.email}</a>}</Info>
            <Info label={t('country')}>{c.country}</Info>
            <Info label={t('city')}>{c.contact.city}</Info>
            <Info label={t('address')}>{c.contact.address}</Info>
          </div>
        </section>
      )}
      {s.identity && c.identity && (
        <section className="card">
          <div className="card-head">
            <h2>{t('identityData')}</h2>
            {c.permissions.canRevealIdentity && !revealed && (c.identity.nationalId || c.identity.passport) && <button type="button" className="btn btn--small" onClick={reveal}>{t('reveal')}</button>}
          </div>
          <div className="info-grid">
            <Info label={t('nationality')}>{c.identity.nationality}</Info>
            <Info label={t('nationalId')} ltr>{revealed ? revealed.nationalId : c.identity.nationalId}</Info>
            <Info label={t('passport')} ltr>{revealed ? revealed.passport : c.identity.passport}</Info>
            <Info label={t('birthDate')}>{c.identity.birthDate ? fmtDay(c.identity.birthDate) : '—'}</Info>
            <Info label={t('gender')}>{c.identity.gender ? t(c.identity.gender) : '—'}</Info>
          </div>
          <ErrorBox error={error} />
        </section>
      )}
    </>
  );
}

function Timeline({ id }) {
  const { fmtDate, en } = useI18n();
  const state = useLoad(`/api/v2/customers/${id}/timeline`);
  return (
    <section className="card">
      <Loading state={state}>
        {(d) => (
          <ol className="timeline">
            {d.items.map((e) => (
              <li key={e._id}>
                <span className="tl-time">{fmtDate(e.at)}</span>
                <span className="tl-type">{en('eventType', e.type)}</span>
                <div>{e.summary}</div>
                <small className="muted">{e.actorName}</small>
              </li>
            ))}
          </ol>
        )}
      </Loading>
    </section>
  );
}

function Notes({ c }) {
  const { t, fmtDate } = useI18n();
  const state = useLoad(`/api/v2/customers/${c.id}/notes`);
  const [body, setBody] = useState('');
  const { busy, error, run } = useAction();
  const add = (e) => {
    e.preventDefault();
    run(() => api(`/api/v2/customers/${c.id}/notes`, { method: 'POST', body: { body } })).then(() => { setBody(''); state.reload(); }).catch(() => {});
  };
  const pin = (n) => api(`/api/v2/notes/${n._id}`, { method: 'PUT', body: { __v: n.__v, pinned: !n.pinned } }).then(state.reload);
  return (
    <section className="card">
      {c.permissions.canAddNote && (
        <form className="stack stack--full" onSubmit={add}>
          <Field label={t('addNote')}><textarea rows={3} required value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <ErrorBox error={error} />
          <div><button className="btn btn--primary" disabled={busy}>{t('add')}</button></div>
        </form>
      )}
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
          <ul className="notes">
            {d.items.map((n) => (
              <li key={n._id} className={n.pinned ? 'pinned' : ''}>
                <div className="note-head">
                  <strong>{n.author ? n.author.name : ''}</strong>
                  <small className="muted">{fmtDate(n.createdAt)}{n.edits && n.edits.length ? ' ✎' : ''}</small>
                  <button type="button" className={`icon-btn btn--small ${n.pinned ? 'btn--accent' : 'btn--ghost'}`} title={n.pinned ? t('pinned') : t('pin')} onClick={() => pin(n)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={n.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
                    {n.pinned && <span>{t('pinned')}</span>}
                  </button>
                </div>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        ))}
      </Loading>
    </section>
  );
}

function Communications({ c }) {
  const { t, en, fmtDate } = useI18n();
  const state = useLoad(`/api/v2/customers/${c.id}/communications`);
  const [f, setF] = useState({ channel: 'call', direction: 'outbound', outcome: '', summary: '', followUpAt: '', followUpTitle: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const add = (e) => {
    e.preventDefault();
    run(() => api(`/api/v2/customers/${c.id}/communications`, { method: 'POST', body: { ...f, followUpAt: fromLocalInput(f.followUpAt) } }))
      .then(() => { setF({ ...f, summary: '', outcome: '', followUpAt: '', followUpTitle: '' }); state.reload(); })
      .catch(() => {});
  };
  return (
    <section className="card">
      {c.permissions.canEdit && (
        <form className="form-grid" onSubmit={add}>
          <h3 className="field--wide">{t('logContact')}</h3>
          <Field label={t('channel')}><EnumSelect group="channel" options={CHANNELS} value={f.channel} onChange={set('channel')} /></Field>
          <Field label={t('direction')}><select value={f.direction} onChange={set('direction')}><option value="outbound">{t('outbound')}</option><option value="inbound">{t('inbound')}</option></select></Field>
          <Field label={t('outcome')}><EnumSelect group="outcome" options={OUTCOMES} value={f.outcome} onChange={set('outcome')} /></Field>
          <Field label={t('summary')} wide><textarea rows={2} value={f.summary} onChange={set('summary')} /></Field>
          <Field label={`${t('scheduleFollowUp')} (${t('optional')})`}><input type="datetime-local" value={f.followUpAt} onChange={set('followUpAt')} /></Field>
          {f.followUpAt && <Field label={t('title')}><input value={f.followUpTitle} onChange={set('followUpTitle')} /></Field>}
          <div className="field--wide"><ErrorBox error={error} /></div>
          <div className="field--wide"><button className="btn btn--primary" disabled={busy}>{t('add')}</button></div>
        </form>
      )}
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('when')}</th><th>{t('channel')}</th><th>{t('outcome')}</th><th>{t('summary')}</th><th>{t('who')}</th></tr></thead>
              <tbody>
                {d.items.map((x) => (
                  <tr key={x._id}>
                    <td className="nowrap">{fmtDate(x.at)}</td>
                    <td>{en('channel', x.channel)} <small className="muted">{t(x.direction)}</small></td>
                    <td>{en('outcome', x.outcome)}</td>
                    <td>{x.summary}</td>
                    <td>{x.by ? x.by.name : t('website')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Loading>
    </section>
  );
}

function CustomerTasks({ c }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const state = useLoad(`/api/v2/tasks?customer=${c.id}&status=open&limit=100`);
  const [adding, setAdding] = useState(false);
  return (
    <section className="card">
      {can('tasks.create') && <div className="card-head"><span /><button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>+ {t('newTask')}</button></div>}
      <Loading state={state}>{(d) => <TaskTable items={d.items} onChanged={state.reload} hideCustomer />}</Loading>
      {adding && <TaskForm customer={c} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); state.reload(); }} />}
    </section>
  );
}

function Documents({ c }) {
  const { t, en, fmtDate } = useI18n();
  const state = useLoad(`/api/v2/customers/${c.id}/documents`);
  const [uploading, setUploading] = useState(null); // 'new' or a document
  const canEdit = c.permissions.canEditSection.documents;
  return (
    <section className="card">
      {canEdit && <div className="card-head"><span className="muted">{t('fileHint')}</span><button type="button" className="btn btn--primary" onClick={() => setUploading('new')}>+ {t('upload')}</button></div>}
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('title')}</th><th>{t('category')}</th><th>{t('version')}</th><th>{t('when')}</th><th /></tr></thead>
              <tbody>
                {d.items.map((doc) => (
                  <tr key={doc._id}>
                    <td><strong>{doc.title}</strong>{doc.visibleToCustomer && <Pill tone="info">{t('visibleToCustomer')}</Pill>}<br /><small className="muted" dir="ltr">{doc.current.filename}</small></td>
                    <td>{en('docCategory', doc.category)}</td>
                    <td>
                      {doc.versions.slice().reverse().map((v) => (
                        <div key={v.version}><a href={`/api/v2/documents/${doc._id}/versions/${v.version}`} target="_blank" rel="noreferrer">v{v.version}</a> <small className="muted">{v.uploadedBy?.name}</small></div>
                      ))}
                    </td>
                    <td className="nowrap">{fmtDate(doc.current.uploadedAt)}</td>
                    <td>{canEdit && <button type="button" className="btn btn--small" onClick={() => setUploading(doc)}>{t('newVersion')}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Loading>
      {uploading && <UploadDialog c={c} doc={uploading === 'new' ? null : uploading} onClose={() => setUploading(null)} onDone={() => { setUploading(null); state.reload(); }} />}
    </section>
  );
}

function UploadDialog({ c, doc, onClose, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState({ title: '', category: 'other', note: '', visibleToCustomer: false, file: null });
  const { busy, error, setError, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    if (!f.file) return;
    if (f.file.size > 4 * 1024 * 1024) return setError(t('fileHint'));
    const fd = new FormData();
    fd.append('file', f.file);
    fd.append('note', f.note);
    if (doc) fd.append('__v', String(doc.__v));
    else {
      fd.append('title', f.title);
      fd.append('category', f.category);
      fd.append('visibleToCustomer', String(f.visibleToCustomer));
    }
    const url = doc ? `/api/v2/documents/${doc._id}/versions` : `/api/v2/customers/${c.id}/documents`;
    run(async () => {
      const res = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Upload failed');
    }).then(onDone).catch(() => {});
  };
  return (
    <Modal title={doc ? `${t('newVersion')}: ${doc.title}` : t('upload')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {!doc && <Field label={t('title')}><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>}
        {!doc && <Field label={t('category')}><EnumSelect group="docCategory" options={DOC_CATEGORIES} value={f.category} onChange={(v) => setF({ ...f, category: v })} /></Field>}
        <Field label={t('file')} hint={t('fileHint')}><input type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" onChange={(e) => setF({ ...f, file: e.target.files[0] || null })} /></Field>
        <Field label={t('note')}><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        {!doc && <label className="check"><input type="checkbox" checked={f.visibleToCustomer} onChange={(e) => setF({ ...f, visibleToCustomer: e.target.checked })} /> {t('visibleToCustomer')}</label>}
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{busy ? t('saving') : t('upload')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// ---- page ----

export default function CustomerDetail() {
  const { id } = useParams();
  const { t, en } = useI18n();
  const { can } = useAuth();
  const state = useLoad(`/api/v2/customers/${id}`, [id]);
  const [tab, setTab] = useState('overview');
  const [dialog, setDialog] = useState(null);
  const [transferTo, setTransferTo] = useState('');
  const [mergeNo, setMergeNo] = useState('');

  return (
    <Loading state={state}>
      {({ item: c }) => {
        if (c.access === 'basic') return <BasicCard c={c} />;
        const s = c.permissions.sections;
        const tabs = [
          ['overview', true], ['programs', c.access === 'full' && can('enrollments.view')], ['financial', s.financial], ['timeline', true], ['notes', s.notes], ['communications', s.contact], ['tasks', c.access === 'full' && can('tasks.view')], ['documents', s.documents]
        ].filter(([, show]) => show).map(([k]) => k);
        const reload = state.reload;
        return (
          <>
            <div className="page-head">
              <div>
                <Link to="/customers" className="muted">← {t('customers')}</Link>
                <h1 className="page-title">{c.nameAr} <small className="muted" dir="ltr">{c.customerNo}</small></h1>
                <div className="row">
                  <Pill value={c.status}>{en('status', c.status)}</Pill>
                  {c.archived && <Pill tone="muted">{t('archive')}</Pill>}
                  {c.access === 'granted' && <Pill tone="gold">{t('access')}</Pill>}
                </div>
              </div>
              {c.access === 'full' && c.status !== 'merged' && (
                <div className="row no-print">
                  <WhatsAppButton c={c} />
                  <PrintButton what={`customer:${c.customerNo}`} title={c.customerNo} />
                  {(c.permissions.canEdit || c.permissions.canEditSection.contact || c.permissions.canEditSection.identity) && <button type="button" className="btn btn--primary" onClick={() => setDialog('edit')}>{t('edit')}</button>}
                  {c.permissions.canManage && <button type="button" className="btn btn--ghost" onClick={() => setDialog('transfer')}>{t('transfer')}</button>}
                  {can('customers.manage', 'all') && <button type="button" className="btn btn--ghost" onClick={() => setDialog('merge')}>{t('merge')}</button>}
                  {c.permissions.canArchive && <button type="button" className="btn btn--ghost" onClick={() => setDialog('archive')}>{c.archived ? t('restore') : t('archive')}</button>}
                </div>
              )}
            </div>

            <PrintHeader title={`${c.customerNo} — ${c.nameAr}`} subtitle={t(tab)} />
            <div className="tabs" role="tablist">
              {tabs.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{t(k)}</button>)}
            </div>

            {tab === 'overview' && c.access === 'full' && <Summary360 c={c} />}
            {tab === 'overview' && <Overview c={c} onReload={reload} />}
            {tab === 'overview' && c.access === 'full' && can('customer_accounts.view', 'all') && <AccountCard customerId={c.id} />}
            {tab === 'programs' && <><CustomerPrograms c={c} /><CustomerGroups c={c} /></>}
            {tab === 'financial' && <CustomerFinance c={c} />}
            {tab === 'timeline' && <Timeline id={c.id} />}
            {tab === 'notes' && <Notes c={c} />}
            {tab === 'communications' && <Communications c={c} />}
            {tab === 'tasks' && <CustomerTasks c={c} />}
            {tab === 'documents' && <Documents c={c} />}

            {dialog === 'edit' && <EditCustomer c={c} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); }} />}
            {dialog === 'transfer' && (
              <ReasonDialog title={t('transfer')} onClose={() => setDialog(null)} onSubmit={(reason) => api(`/api/v2/customers/${c.id}/transfer`, { method: 'POST', body: { to: transferTo, reason } }).then(reload)}>
                <Field label={t('transferTo')}><StaffSelect value={transferTo} onChange={setTransferTo} exclude={c.owner ? [c.owner.id] : []} required /></Field>
              </ReasonDialog>
            )}
            {dialog === 'archive' && (
              <ReasonDialog title={c.archived ? t('restore') : t('archive')} danger={!c.archived} onClose={() => setDialog(null)} onSubmit={(reason) => api(`/api/v2/customers/${c.id}/archive`, { method: 'POST', body: { archived: !c.archived, reason } }).then(reload)} />
            )}
            {dialog === 'merge' && (
              <ReasonDialog title={t('merge')} hint={t('mergeHint')} onClose={() => setDialog(null)} onSubmit={async (reason) => {
                const found = await api(`/api/v2/customers/lookup?q=${encodeURIComponent(mergeNo.trim())}`);
                const src = found.items.find((x) => x.customerNo === mergeNo.trim().toUpperCase()) || found.items[0];
                if (!src) throw new Error(t('noResults'));
                await api(`/api/v2/customers/${c.id}/merge`, { method: 'POST', body: { sourceId: src.id, reason, __v: c.__v } });
                reload();
              }}>
                <Field label={t('mergeSource')}><input dir="ltr" required value={mergeNo} onChange={(e) => setMergeNo(e.target.value)} placeholder="NB-000123" /></Field>
              </ReasonDialog>
            )}
          </>
        );
      }}
    </Loading>
  );
}
