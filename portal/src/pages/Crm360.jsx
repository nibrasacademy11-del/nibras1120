import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, pickMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, StaffSelect, useAction, useLoad } from '../components/ui.jsx';
import { Amounts } from './Finance.jsx';

// The customer at a glance, WhatsApp from templates, ready lists with bulk actions, the leads board

export function Summary360({ c }) {
  const { t, label, fmtDay, fmtDate } = useI18n();
  const state = useLoad(`/api/v2/customers/${c.id}/summary`, [c.id]);
  if (state.error) return null;
  return (
    <Loading state={state}>
      {(d) => (
        <section className="card summary360">
          <div className="s360-grid">
            <div className="s360-box">
              <small>{t('s360Programs')}</small>
              {!d.programs.length ? <span className="muted">—</span> : d.programs.map((p) => (
                <div key={p._id} className="s360-line">
                  <Link to={`/enrollments/${p._id}`}>{label({ ar: p.titleAr, en: p.titleEn })}</Link>
                  <span className="progress-mini"><span style={{ width: `${p.progress.percent}%` }} /></span>
                  <small className="muted">{p.progress.done}/{p.progress.target}</small>
                </div>
              ))}
            </div>
            <div className="s360-box">
              <small>{t('grpAttendanceRate')}</small>
              {!d.attendance.length ? <span className="muted">—</span> : d.attendance.map((a, i) => (
                <div key={i} className="s360-line"><span>{label({ ar: a.group, en: a.groupEn })}</span><strong className={a.rate !== null && a.rate < 50 ? 'late' : ''}>{a.rate === null ? '—' : `${a.rate}%`}</strong><small className="muted">({a.attended}/{a.held})</small></div>
              ))}
            </div>
            {d.money && (
              <div className="s360-box">
                <small>{t('s360Money')}</small>
                <div className="s360-line"><span>{t('paid')}</span><Amounts list={d.money.paid} empty="0" /></div>
                <div className="s360-line"><span>{t('fhOwed')}</span><Amounts list={d.money.owed} strong empty="0" /></div>
                {d.money.overdue.length > 0 && <div className="s360-line late"><span>{t('fhOverdue')} ({d.money.maxDaysLate} {t('fhDays')})</span><Amounts list={d.money.overdue} strong /></div>}
              </div>
            )}
            <div className="s360-box">
              <small>{t('certificatesNav')}</small>
              <div className="s360-line"><span>{t('s360Issued')}</span><strong>{d.certificates.issued}</strong></div>
              <div className="s360-line"><span>{t('paper_delivered')}</span><strong>{d.certificates.delivered}</strong>{d.certificates.paperPending > 0 && <Pill tone="gold">{t('s360PaperPending')}: {d.certificates.paperPending}</Pill>}</div>
            </div>
            <div className="s360-box">
              <small>{t('s360Follow')}</small>
              <div className="s360-line"><span>{t('owner')}</span><strong>{d.owner || t('unassigned')}</strong></div>
              <div className="s360-line"><span>{t('s360LastContact')}</span><span>{d.lastContactAt ? fmtDate(d.lastContactAt) : '—'}</span></div>
              <div className="s360-line"><span>{t('nextFollowUp')}</span><span>{d.nextFollowUpAt ? fmtDay(d.nextFollowUpAt) : '—'}</span></div>
              <div className="s360-line"><span>{t('s360OpenTasks')}</span><strong>{d.tasks}</strong>{d.complaints > 0 && <Pill tone="warn">{t('complaintsNav')}: {d.complaints}</Pill>}</div>
            </div>
          </div>
        </section>
      )}
    </Loading>
  );
}

export function WhatsAppButton({ c }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!c.permissions?.sections?.contact || !(c.contact?.phone || c.contact?.whatsapp)) return null;
  return (
    <>
      <button type="button" className="btn btn--wa" onClick={() => setOpen(true)}>{t('fhWhatsapp')}</button>
      {open && <WhatsAppDialog c={c} onClose={() => setOpen(false)} />}
    </>
  );
}

function WhatsAppDialog({ c, onClose }) {
  const { t, lang } = useI18n();
  const templates = useLoad('/api/v2/whatsapp-templates');
  const [key, setKey] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const pick = (k) => { setKey(k); setText((templates.data.items.find((x) => x.key === k) || {}).text || ''); };
  const send = async () => {
    setError('');
    const win = window.open('', '_blank');
    try {
      const r = await api(`/api/v2/customers/${c.id}/whatsapp`, { method: 'POST', body: { template: key || undefined, text } });
      if (win) { win.opener = null; win.location.href = r.link; } else window.location.assign(r.link);
      onClose();
    } catch (e) {
      if (win) win.close();
      setError(pickMessage(e.message, lang));
    }
  };
  return (
    <Modal title={`${t('fhWhatsapp')}: ${c.nameAr}`} onClose={onClose}>
      <Loading state={templates}>
        {(d) => (
          <div className="stack">
            <div className="tags">{d.items.map((x) => <button key={x.key} type="button" className={`btn btn--small ${key === x.key ? 'btn--primary' : 'btn--ghost'}`} onClick={() => pick(x.key)}>{x.titleAr}</button>)}</div>
            <Field label={t('waMessage')} hint={t('waPlaceholders')}><textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} /></Field>
            <ErrorBox error={error} />
            <div className="row"><button type="button" className="btn btn--wa" disabled={!text.trim()} onClick={send}>{t('waOpen')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
          </div>
        )}
      </Loading>
    </Modal>
  );
}

// ---- ready lists and bulk actions (customers page) ----

export const READY_LISTS = ['overdue', 'low_attendance', 'cert_unpaid', 'paper_pending', 'stale'];

export function ReadyLists({ value, onChange }) {
  const { t } = useI18n();
  return (
    <div className="ready-lists no-print">
      <span className="muted">{t('rlTitle')}:</span>
      {READY_LISTS.map((k) => <button key={k} type="button" className={`btn btn--small ${value === k ? 'btn--primary' : 'btn--ghost'}`} onClick={() => onChange(value === k ? '' : k)}>{t(`rl_${k}`)}</button>)}
    </div>
  );
}

export function BulkActions({ ids, onDone }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const [dialog, setDialog] = useState(null);
  return (
    <>
      {can('tasks.create') && <button type="button" className="btn btn--ghost" onClick={() => setDialog('task')}>+ {t('baTask')}</button>}
      {can('programs.update', 'all') && <button type="button" className="btn btn--ghost" onClick={() => setDialog('group')}>+ {t('baGroup')}</button>}
      {dialog === 'task' && <BulkTask ids={ids} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onDone(); }} />}
      {dialog === 'group' && <BulkGroup ids={ids} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onDone(); }} />}
    </>
  );
}

function BulkTask({ ids, onClose, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState({ title: '', dueAt: '', assignee: '', priority: 'normal' });
  const [result, setResult] = useState(null);
  const { busy, error, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    run(() => api('/api/v2/tasks/bulk', { method: 'POST', body: { customers: ids, title: f.title, dueAt: f.dueAt ? new Date(`${f.dueAt}T09:00:00`).toISOString() : null, assignee: f.assignee || null, priority: f.priority } })).then(setResult).catch(() => {});
  };
  return (
    <Modal title={`${t('baTask')} (${ids.length})`} onClose={result ? onDone : onClose}>
      {result ? (
        <div className="stack"><p>{t('baCreated')}: <strong>{result.created}</strong>{result.skipped > 0 && ` · ${t('baSkipped')}: ${result.skipped}`}</p><button type="button" className="btn btn--primary" onClick={onDone}>{t('close')}</button></div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Field label={`${t('title')} *`}><input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t('baTaskHint')} /></Field>
          <Field label={t('dueAt')}><input type="date" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></Field>
          <Field label={t('assignee')} hint={t('baOwnerHint')}><StaffSelect value={f.assignee} onChange={(v) => setF({ ...f, assignee: v })} allowEmpty /></Field>
          <ErrorBox error={error} />
          <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
        </form>
      )}
    </Modal>
  );
}

function BulkGroup({ ids, onClose, onDone }) {
  const { t, label } = useI18n();
  const { can } = useAuth();
  const groups = useLoad('/api/v2/groups');
  const [group, setGroup] = useState('');
  const [enroll, setEnroll] = useState(false);
  const [result, setResult] = useState(null);
  const { busy, error, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    run(() => api(`/api/v2/groups/${group}/members`, { method: 'POST', body: { customers: ids, enroll } })).then(setResult).catch(() => {});
  };
  return (
    <Modal title={`${t('baGroup')} (${ids.length})`} onClose={result ? onDone : onClose}>
      {result ? (
        <div className="stack"><p>{t('grpAdded')}: <strong>{result.added}</strong> · {t('grpAlready')}: {result.already}{result.notEnrolled > 0 && ` · ${t('grpNotEnrolled')}: ${result.notEnrolled}`}{result.full > 0 && ` · ${t('grpFull')}: ${result.full}`}</p><button type="button" className="btn btn--primary" onClick={onDone}>{t('close')}</button></div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Field label={t('groupsNav')}>
            <select required value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">—</option>
              {(groups.data?.items || []).map((g) => <option key={g._id} value={g._id}>{label({ ar: g.nameAr, en: g.nameEn })} · {g.program ? label({ ar: g.program.titleAr, en: g.program.titleEn }) : ''}</option>)}
            </select>
          </Field>
          {can('enrollments.create', 'all') && <label className="check"><input type="checkbox" checked={enroll} onChange={(e) => setEnroll(e.target.checked)} /> {t('grpEnrollMissing')}</label>}
          <ErrorBox error={error} />
          <div className="row"><button className="btn btn--primary" disabled={busy || !group}>{t('grpAddSelected')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
        </form>
      )}
    </Modal>
  );
}

// ---- the leads board ----

const NEXT = { lead: ['interested', 'lost'], interested: ['customer', 'lost', 'lead'], customer: [], lost: ['lead'] };

export default function Leads() {
  const { t, en, fmtDay } = useI18n();
  const navigate = useNavigate();
  const [owner, setOwner] = useState('');
  const state = useLoad(`/api/v2/customers/board${owner ? `?owner=${owner}` : ''}`, [owner]);
  const [lost, setLost] = useState(null);
  const [drag, setDrag] = useState(null);
  const [error, setError] = useState('');
  const { lang } = useI18n();
  const move = async (card, status, lostReason) => {
    setError('');
    if (status === 'lost' && !lostReason) { setLost({ card }); return; }
    try {
      await api(`/api/v2/customers/${card.id}`, { method: 'PUT', body: { __v: card.__v, status, ...(lostReason ? { lostReason } : {}) } });
      state.reload();
    } catch (e) {
      setError(pickMessage(e.message, lang));
    }
  };
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('leadsNav')}</h1>
        <div className="row"><span className="muted">{t('owner')}:</span><StaffSelect value={owner} onChange={setOwner} allowEmpty /></div>
      </div>
      <p className="muted"><small>{t('leadsHint')}</small></p>
      <ErrorBox error={error} />
      <Loading state={state}>
        {(d) => (
          <div className="board">
            {d.order.map((status) => (
              <section key={status} className={`board-col board-col--${status}`} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag && drag.status !== status && NEXT[drag.status].includes(status)) move(drag.card, status); setDrag(null); }}>
                <h2>{en('status', status)} <small className="muted">({d.columns[status].total})</small></h2>
                {d.columns[status].items.map((card) => (
                  <article key={card.id} className="board-card" draggable onDragStart={() => setDrag({ card, status })}>
                    <button type="button" className="link" onClick={() => navigate(`/customers/${card.id}`)}><strong>{card.name}</strong></button>
                    <small className="muted" dir="ltr">{card.customerNo}</small>
                    <small>{en('source', card.source)}{card.owner ? ` · ${card.owner}` : ''}</small>
                    <small className={!card.lastContactAt || Date.now() - new Date(card.lastContactAt) > 7 * 864e5 ? 'late' : 'muted'}>{t('s360LastContact')}: {card.lastContactAt ? fmtDay(card.lastContactAt) : '—'}</small>
                    {card.lostReason && status === 'lost' && <small className="muted">{card.lostReason}</small>}
                    {NEXT[status].length > 0 && <div className="row">{NEXT[status].map((n) => <button key={n} type="button" className="btn btn--small btn--ghost" onClick={() => move(card, n)}>{lang === 'en' ? '→' : '←'} {en('status', n)}</button>)}</div>}
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </Loading>
      {lost && <LostDialog onClose={() => setLost(null)} onSubmit={(reason) => { const c = lost.card; setLost(null); move(c, 'lost', reason); }} />}
    </>
  );
}

function LostDialog({ onClose, onSubmit }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  return (
    <Modal title={t('leadsLostTitle')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSubmit(reason); }}>
        <Field label={`${t('reason')} *`}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="row"><button className="btn btn--danger">{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}
