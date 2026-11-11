import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, StaffSelect, useAction, useLoad } from '../components/ui.jsx';
import { Amounts, Money } from './Finance.jsx';

const thisMonth = () => new Date().toISOString().slice(0, 7);
const TONE = { due: 'gold', approved: 'info', paid: 'ok', cancelled: 'muted' };

function Statement({ userId }) {
  const { t, fmtDay } = useI18n();
  const [period, setPeriod] = useState(thisMonth());
  const state = useLoad(`/api/v2/commissions/statement?period=${period}${userId ? `&user=${userId}` : ''}`, [userId, period]);
  return (
    <Loading state={state}>
      {(d) => (
        <>
          <div className="page-head">
            <h2>{t('statement')}: {d.user.name} <small className="muted" dir="ltr">{d.period}</small></h2>
            <div className="row no-print">
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
              <button type="button" className="btn btn--ghost" onClick={() => window.print()}>{t('print')}</button>
            </div>
          </div>
          {d.totals.map((x) => (
            <div className="grid grid--4" key={x.currency}>
              <div className="card stat"><small>{t('earned')} · {x.currency}</small><Money amount={x.earned} currency={x.currency} strong /></div>
              <div className="card stat"><small>{t('reversed')}</small><Money amount={x.reversed} currency={x.currency} strong /></div>
              <div className="card stat"><small>{t('netTotal')}</small><Money amount={x.net} currency={x.currency} strong /></div>
              <div className="card stat"><small>{t('paid')}</small><Money amount={x.paid} currency={x.currency} strong /><small className="muted">{t('due_c')}: <Money amount={x.due} currency="" /> · {t('approved')}: <Money amount={x.approved} currency="" /></small></div>
            </div>
          ))}
          {d.unpaidFromEarlier.length > 0 && <p className="muted">{t('unpaidEarlier')}: <Amounts list={d.unpaidFromEarlier} /></p>}
          <section className="card">
            {!d.lines.length ? <p className="muted">{t('noData')}</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('date')}</th><th>{t('kindLabel')}</th><th>{t('receiptNo')}</th><th>{t('customer')}</th><th>{t('collected')}</th><th>{t('share')}</th><th>{t('rateLabel')}</th><th>{t('commission')}</th><th>{t('status')}</th></tr></thead>
                  <tbody>
                    {d.lines.map((l) => (
                      <tr key={l._id} className={l.amount < 0 ? 'negative' : ''}>
                        <td className="nowrap">{fmtDay(l.date)}</td>
                        <td>{t(`ck_${l.kind}`)}{l.role === 'team_leader' && <Pill tone="info">{t('leader')}</Pill>}{l.note && <div className="muted">{l.note}</div>}</td>
                        <td dir="ltr">{l.receiptNo || '—'}</td>
                        <td>{l.customer ? `${l.customer.customerNo} ${l.customer.nameAr}` : '—'}{l.enrollment && <div className="muted">{l.enrollment.programTitleAr}</div>}</td>
                        <td><Money amount={l.commissionable} currency={l.currency} /></td>
                        <td>{l.role === 'adjustment' ? '—' : `${l.share}%`}</td>
                        <td>{l.role === 'adjustment' ? '—' : `${l.rate}%`}</td>
                        <td><Money amount={l.amount} currency={l.currency} strong /></td>
                        <td><Pill tone={TONE[l.status]}>{t(l.status === 'due' ? 'due_c' : l.status)}</Pill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {d.payouts.length > 0 && (
            <section className="card">
              <h2>{t('payouts')}</h2>
              <ul className="plain-list">{d.payouts.map((p) => <li key={p._id}><span dir="ltr">{p.payoutNo}</span><span>{fmtDay(p.paidAt)} · {p.account?.nameAr}</span><Money amount={p.amount} currency={p.currency} strong /></li>)}</ul>
            </section>
          )}
        </>
      )}
    </Loading>
  );
}

function Overview({ onOpen }) {
  const { t } = useI18n();
  const { can, me } = useAuth();
  const [period, setPeriod] = useState(thisMonth());
  const state = useLoad(`/api/v2/commissions/overview?period=${period}`, [period]);
  const [dialog, setDialog] = useState(null);
  const { error, run } = useAction();
  const approveAll = () => run(() => api('/api/v2/commissions/approve', { method: 'POST', body: { period } })).then(state.reload).catch(() => {});
  const done = () => { setDialog(null); state.reload(); };
  return (
    <>
      <div className="page-head">
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <div className="row">
          {can('commissions.manage', 'all') && <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: 'adjust' })}>+ {t('adjustment')}</button>}
          {can('commissions.manage', 'all') && <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: 'generate' })}>{t('generateMissing')}</button>}
          {can('commissions.approve', 'all') && <button type="button" className="btn btn--primary" onClick={approveAll}>{t('approveMonth')}</button>}
        </div>
      </div>
      <ErrorBox error={error} />
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('name')}</th><th>{t('currency')}</th><th>{t('collected')}</th><th>{t('earned')}</th><th>{t('reversed')}</th><th>{t('due_c')}</th><th>{t('approved')}</th><th>{t('paid')}</th><th>{t('payable')}</th><th /></tr></thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={`${r._id}-${r.currency}`}>
                      <td><button type="button" className="link" onClick={() => onOpen(r._id)}>{r.name}</button></td>
                      <td dir="ltr">{r.currency}</td>
                      <td><Money amount={r.collected} currency="" /></td>
                      <td><Money amount={r.earned} currency="" /></td>
                      <td><Money amount={r.reversed} currency="" /></td>
                      <td><Money amount={r.due} currency="" /></td>
                      <td><Money amount={r.approved} currency="" /></td>
                      <td><Money amount={r.paid} currency="" /></td>
                      <td><Money amount={r.payable} currency={r.currency} strong /></td>
                      <td className="nowrap">
                        {can('commissions.manage', 'all') && r.payable > 0 && String(r._id) !== me.user.id && <button type="button" className="btn btn--small btn--primary" onClick={() => setDialog({ kind: 'payout', row: r })}>{t('payout')}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
      {dialog?.kind === 'payout' && <PayoutForm row={dialog.row} base={dialog.row.currency} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'adjust' && <AdjustmentForm onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'generate' && <GenerateForm onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

function PayoutForm({ row, base, onClose, onDone }) {
  const { t, label } = useI18n();
  const accounts = useLoad('/api/v2/finance/accounts');
  const [f, setF] = useState({ account: '', note: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal title={`${t('payout')}: ${row.name}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/v2/commissions/payouts', { method: 'POST', body: { beneficiary: row._id, account: f.account, note: f.note } })).then(onDone).catch(() => {}); }}>
        <p>{t('payable')}: <Money amount={row.payable} currency={base} strong /></p>
        <Field label={t('account')}><select required value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}><option value="">—</option>{(accounts.data?.items || []).filter((a) => a.active && a.currency === base).map((a) => <option key={a._id} value={a._id}>{label({ ar: a.nameAr, en: a.nameEn })} · {a.currency}</option>)}</select></Field>
        <Field label={t('note')}><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('confirm')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function AdjustmentForm({ onClose, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState({ beneficiary: '', amount: '', currency: 'EGP', reason: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal title={t('adjustment')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/v2/commissions/adjustments', { method: 'POST', body: { ...f, amount: Number(f.amount) } })).then(onDone).catch(() => {}); }}>
        <Field label={t('name')}><StaffSelect value={f.beneficiary} onChange={(v) => setF({ ...f, beneficiary: v })} required /></Field>
        <Field label={t('currency')}><input dir="ltr" required maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
        <Field label={t('amount')} hint={t('adjustmentHint')}><input type="number" step="0.01" required dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label={t('reason')}><input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function GenerateForm({ onClose, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState({ from: '', to: '' });
  const [result, setResult] = useState(null);
  const { busy, error, run } = useAction();
  return (
    <Modal title={t('generateMissing')} onClose={result ? onDone : onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/v2/commissions/generate', { method: 'POST', body: f })).then(setResult).catch(() => {}); }}>
        <p className="muted">{t('generateHint')}</p>
        <Field label={t('from')}><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label={t('to')}><input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <ErrorBox error={error} />
        {result && <div className="alert alert--ok">{result.payments} → {result.lines}</div>}
        <div className="row"><button className="btn btn--primary" disabled={busy || !!result}>{t('confirm')}</button></div>
      </form>
    </Modal>
  );
}

function Rates() {
  const { t, en, fmtDay } = useI18n();
  const { can } = useAuth();
  const state = useLoad('/api/v2/commissions/rates');
  const [f, setF] = useState({ user: '', kind: 'employee', rate: '', effectiveFrom: new Date().toISOString().slice(0, 10), reason: '' });
  const { busy, error, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    run(() => api('/api/v2/commissions/rates', { method: 'POST', body: { ...f, rate: Number(f.rate), effectiveFrom: new Date(f.effectiveFrom + 'T00:00:00').toISOString() } }))
      .then(() => { setF({ ...f, rate: '', reason: '' }); state.reload(); }).catch(() => {});
  };
  return (
    <>
      {can('commissions.manage', 'all') && (
        <form className="card form-grid" onSubmit={submit}>
          <h2 className="field--wide">{t('setRate')}</h2>
          <Field label={t('name')}><StaffSelect value={f.user} onChange={(v) => setF({ ...f, user: v })} required /></Field>
          <Field label={t('kindLabel')}><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="employee">{t('employeeRate')}</option><option value="team_leader">{t('leaderRate')}</option></select></Field>
          <Field label={`${t('rateLabel')} %`}><input type="number" step="0.01" min="0" max="100" required dir="ltr" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
          <Field label={t('effectiveAt')}><input type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} /></Field>
          <Field label={t('reason')} wide><input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <p className="muted field--wide">{t('rateFrozenHint')}</p>
          <div className="field--wide"><ErrorBox error={error} /></div>
          <div className="field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button></div>
        </form>
      )}
      <section className="card">
        <h2>{t('rateHistory')}</h2>
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('name')}</th><th>{t('kindLabel')}</th><th>{t('rateLabel')}</th><th>{t('effectiveAt')}</th><th>{t('reason')}</th><th>{t('who')}</th></tr></thead>
                <tbody>{d.items.map((r) => <tr key={r._id}><td>{r.user?.name} <small className="muted">{en('role', r.user?.role)}</small></td><td>{r.kind === 'team_leader' ? t('leaderRate') : t('employeeRate')}</td><td dir="ltr">{r.rate}%</td><td>{fmtDay(r.effectiveFrom)}</td><td>{r.reason}</td><td>{r.setBy?.name}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
    </>
  );
}

export default function Commissions() {
  const { t } = useI18n();
  const { can, me } = useAuth();
  const wide = can('commissions.view', 'team');
  const [tab, setTab] = useState(wide ? 'overview' : 'mine');
  const [person, setPerson] = useState(null);
  const tabs = [...(wide ? ['overview'] : []), 'mine', ...(can('commissions.view', 'all') ? ['rates'] : [])];
  return (
    <>
      <h1 className="page-title">{t('commissionsNav')}</h1>
      <div className="tabs no-print">
        {tabs.map((k) => <button key={k} type="button" className={`tab${tab === k && !person ? ' active' : ''}`} onClick={() => { setTab(k); setPerson(null); }}>{t(k === 'mine' ? 'myCommissions' : k === 'overview' ? 'commissionOverview' : 'ratesTab')}</button>)}
      </div>
      {person ? (
        <>
          <button type="button" className="link no-print" onClick={() => setPerson(null)}>← {t('back')}</button>
          <Statement userId={person} />
        </>
      ) : tab === 'overview' ? <Overview onOpen={setPerson} /> : tab === 'rates' ? <Rates /> : <Statement userId={me.user.id} />}
    </>
  );
}

// Commission split of one enrollment, shown on the enrollment page to those who manage commissions
export function SplitEditor({ enrollmentId }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const state = useLoad(`/api/v2/enrollments/${enrollmentId}/commission-split`);
  const [rows, setRows] = useState(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  if (!can('commissions.view', 'all')) return null;
  const editable = can('commissions.manage', 'all');
  return (
    <section className="card">
      <h2>{t('commissionSplit')}</h2>
      <Loading state={state}>
        {(d) => {
          const current = rows || (d.item ? d.item.beneficiaries.map((b) => ({ user: b.user._id, share: b.share, name: b.user.name })) : d.default.map((b) => ({ user: b.user._id, share: 100, name: b.user.name })));
          const total = current.reduce((a, b) => a + Number(b.share || 0), 0);
          const set = (i, k, v) => setRows(current.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
          return (
            <form className="stack stack--full" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/v2/enrollments/${enrollmentId}/commission-split`, { method: 'PUT', body: { beneficiaries: current.map((r) => ({ user: r.user, share: Number(r.share) })), reason, __v: d.item?.__v } })).then(() => { setRows(null); setReason(''); state.reload(); }).catch(() => {}); }}>
              {!d.item && <p className="muted">{t('splitDefault')}</p>}
              {current.map((r, i) => (
                <div className="row" key={i}>
                  {editable ? <StaffSelect value={r.user} onChange={(v) => set(i, 'user', v)} required /> : <span>{r.name}</span>}
                  <input type="number" min="1" max="100" style={{ width: 90 }} disabled={!editable} value={r.share} onChange={(e) => set(i, 'share', e.target.value)} /> %
                  {editable && current.length > 1 && <button type="button" className="link" onClick={() => setRows(current.filter((_, j) => j !== i))}>×</button>}
                </div>
              ))}
              {editable && (
                <>
                  <div className="row"><button type="button" className="btn btn--small" onClick={() => setRows([...current, { user: '', share: 0 }])}>+ {t('add')}</button><span className={total === 100 ? 'ok' : 'warn'}>{t('total')}: {total}%</span></div>
                  {rows && <Field label={t('reason')}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
                  <ErrorBox error={error} />
                  {rows && <div><button className="btn btn--primary" disabled={busy || total !== 100}>{t('save')}</button></div>}
                </>
              )}
              <p className="muted">{t('splitHint')}</p>
            </form>
          );
        }}
      </Loading>
      <p><Link to="/commissions">{t('commissionsNav')}</Link></p>
    </section>
  );
}
