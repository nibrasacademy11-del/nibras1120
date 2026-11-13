import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, useAction, useLoad } from '../components/ui.jsx';

// The team leader's page: their team (work facts only), inviting new members, and the
// invitations they sent. The owner and HR also approve accepted invitations here.

const TONE = { pending: 'gold', accepted: 'info', active: 'ok', rejected: 'muted', expired: 'muted', cancelled: 'muted', declined: 'warn' };

export default function MyTeam() {
  const { t } = useI18n();
  const { can } = useAuth();
  const team = useLoad(can('teams.view', 'team') ? '/api/v2/my-team' : null);
  const invites = useLoad(can('teams.invite', 'team') ? '/api/v2/team-invitations' : null);
  const [inviting, setInviting] = useState(false);
  const [sent, setSent] = useState(null);
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('mt_title')}</h1>
        {can('teams.invite', 'team') && <button type="button" className="btn btn--primary" onClick={() => setInviting(true)}>+ {t('mt_invite')}</button>}
      </div>
      {can('teams.view', 'team') && (
        <Loading state={team}>
          {(d) => (
            <>
              {d.teams.length === 0 && (can('teams.view', 'all')
                ? <p className="card empty">{t('mt_allTeamsHint')} <Link to="/teams">{t('teams')}</Link></p>
                : <p className="card empty">{t('mt_noTeam')}</p>)}
              {d.teams.map((tm) => (
                <section key={tm._id} className="card">
                  <div className="card-head">
                    <h2>{tm.nameAr}</h2>
                    <span className="muted">{tm.department && `${tm.department} · `}{t('mt_leader')}: <strong>{tm.leader || '—'}</strong></span>
                  </div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>{t('name')}</th><th>{t('jobTitle')}</th><th>{t('mt_openTasks')}</th><th>{t('mt_overdue')}</th><th>{t('mt_doneMonth')}</th><th>{t('mt_attendance')}</th><th>{t('mt_review')}</th></tr></thead>
                      <tbody>{d.members.filter((m) => String(m.team) === String(tm._id)).map((m) => (
                        <tr key={m.user}>
                          <td><strong>{m.name}</strong>{m.isMe && <> <Pill tone="gold">{t('mt_you')}</Pill></>}<br /><small className="muted">{m.employeeNo}</small></td>
                          <td>{m.jobTitle || '—'}</td>
                          <td>{m.tasks.open}</td>
                          <td className={m.tasks.overdue ? 'late' : ''}>{m.tasks.overdue}</td>
                          <td>{m.tasks.doneMonth}</td>
                          <td>{m.attendanceRate === null || m.attendanceRate === undefined ? '—' : `${m.attendanceRate}%`}</td>
                          <td>{m.review ? (m.review.average ? `${m.review.average} / 5` : t(`rv_st_${m.review.status}`)) : '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <p className="muted" style={{ margin: '10px 0 0' }}><small>{t('mt_privacy')}</small></p>
                </section>
              ))}
            </>
          )}
        </Loading>
      )}
      {can('teams.invite', 'team') && (
        <section className="card">
          <h2>{t('mt_invitations')}</h2>
          <Loading state={invites}>
            {(d) => <Invitations items={d.items} policy={d.policy} onChange={invites.reload} />}
          </Loading>
        </section>
      )}
      {inviting && <InviteDialog onClose={() => setInviting(false)} onSent={(r) => { setInviting(false); setSent(r); invites.reload(); }} />}
      {sent && <SentDialog sent={sent} onClose={() => setSent(null)} />}
    </>
  );
}

function Invitations({ items, policy, onChange }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const { busy, error, run } = useAction();
  const [sent, setSent] = useState(null);
  const act = (inv, what, body) => run(async () => { const r = await api(`/api/v2/team-invitations/${inv._id}/${what}`, { method: 'POST', body }); if (what === 'resend') setSent(r); onChange(); });
  const approver = can('teams.assign', 'all');
  if (!items.length) return <p className="empty">{t('mt_noInvites')}</p>;
  return (
    <>
      {policy === 'approval' && <p className="muted"><small>{t('mt_policyApproval')}</small></p>}
      <ErrorBox error={error} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('name')}</th><th>{t('mt_team')}</th><th>{t('status')}</th><th>{t('mt_expires')}</th><th /></tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i._id}>
              <td><strong>{i.name}</strong><br /><small className="muted" dir="ltr">{i.phone}</small>{i.invitedBy?.name && <><br /><small className="muted">{t('mt_by')} {i.invitedBy.name}</small></>}</td>
              <td>{i.team?.nameAr}</td>
              <td><Pill tone={TONE[i.status]}>{t(`mt_st_${i.status}`)}</Pill>{i.decisionNote && <><br /><small className="muted">{i.decisionNote}</small></>}</td>
              <td className="nowrap">{i.status === 'pending' ? fmtDate(i.expiresAt) : '—'}</td>
              <td className="actions">
                {['pending', 'expired'].includes(i.status) && <button type="button" className="btn btn--small" disabled={busy} onClick={() => act(i, 'resend')}>{t('mt_resend')}</button>}
                {['pending', 'accepted'].includes(i.status) && <button type="button" className="btn btn--small btn--ghost" disabled={busy} onClick={() => window.confirm(t('mt_cancelConfirm')) && act(i, 'cancel', {})}>{t('cancel')}</button>}
                {i.status === 'accepted' && approver && <button type="button" className="btn btn--small btn--primary" disabled={busy} onClick={() => act(i, 'approve')}>{t('mt_approve')}</button>}
                {i.status === 'accepted' && approver && <button type="button" className="btn btn--small btn--danger" disabled={busy} onClick={() => { const reason = window.prompt(t('mt_declineReason')); if (reason) act(i, 'decline', { reason }); }}>{t('mt_decline')}</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {sent && <SentDialog sent={sent} onClose={() => setSent(null)} />}
    </>
  );
}

function InviteDialog({ onClose, onSent }) {
  const { t } = useI18n();
  const teams = useLoad('/api/v2/team-invitations/teams');
  const [f, setF] = useState({ name: '', phone: '', email: '', jobTitle: '', team: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = (e) => { e.preventDefault(); run(async () => onSent(await api('/api/v2/team-invitations', { method: 'POST', body: { ...f, team: f.team || undefined } }))); };
  return (
    <Modal title={t('mt_invite')} onClose={onClose}>
      <form className="stack" onSubmit={send}>
        <p className="muted" style={{ margin: 0 }}>{t('mt_inviteHint')}</p>
        <Loading state={teams}>
          {(d) => (d.items.length > 1 ? (
            <Field label={t('mt_team')}><select required value={f.team} onChange={set('team')}><option value="">—</option>{d.items.map((x) => <option key={x._id} value={x._id}>{x.nameAr}</option>)}</select></Field>
          ) : d.items.length === 1 ? <p><strong>{t('mt_team')}:</strong> {d.items[0].nameAr}</p> : <p className="alert alert--warn">{t('mt_noTeamToInvite')}</p>)}
        </Loading>
        <Field label={t('mt_fullName')}><input required minLength={3} value={f.name} onChange={set('name')} /></Field>
        <Field label={t('phone')}><input required dir="ltr" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label={t('mt_emailOptional')}><input type="email" dir="ltr" value={f.email} onChange={set('email')} /></Field>
        <Field label={t('jobTitle')}><input value={f.jobTitle} onChange={set('jobTitle')} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('mt_send')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// The link and the WhatsApp message, shown once after sending
function SentDialog({ sent, onClose }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(sent.message); setCopied(true); } catch { /* not allowed */ } };
  return (
    <Modal title={t('mt_sentTitle')} onClose={onClose}>
      <div className="stack">
        <div className="alert alert--ok" style={{ margin: 0 }}>{sent.emailed ? t('mt_emailed') : t('mt_notEmailed')}</div>
        <p className="muted" style={{ margin: 0 }}>{t('mt_sendHint')}</p>
        <textarea readOnly rows={4} value={sent.message} className="code-box" />
        <div className="row">
          <a className="btn btn--wa" href={sent.whatsapp} target="_blank" rel="noreferrer">{t('mt_whatsapp')}</a>
          <button type="button" className="btn btn--ghost" onClick={copy}>{copied ? `✓ ${t('mt_copied')}` : t('mt_copy')}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </Modal>
  );
}
