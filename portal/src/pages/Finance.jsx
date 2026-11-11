import QRCode from 'qrcode';
import { BrandBand, PrintFooter } from '../components/Print.jsx';
import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, pickMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pager, Pill, useAction, useLoad } from '../components/ui.jsx';

const METHODS = ['cash', 'bank_transfer', 'card', 'wallet', 'gateway', 'cheque', 'other'];
const TONE = { confirmed: 'ok', paid: 'ok', approved: 'ok', pending: 'gold', voided: 'muted', rejected: 'warn', cancelled: 'muted', active: 'info', overdue: 'warn', partial: 'gold', due: 'info' };

export function Money({ amount, currency, strong }) {
  // Amounts always use Latin digits, so figures read the same in both languages and on receipts
  const v = Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
  const body = <span dir="ltr" className="money">{v} <small>{currency}</small></span>;
  return strong ? <strong>{body}</strong> : body;
}

// Amounts in several currencies, each on its own: 2,500 EGP · 300 SAR
export function Amounts({ list, strong, empty = '—' }) {
  const items = (list || []).filter((x) => Number(x.amount) !== 0);
  if (!items.length) return <span className="muted">{empty}</span>;
  return <span className="amounts">{items.map((x, i) => <span key={x.currency}>{i > 0 && <span className="muted"> · </span>}<Money amount={x.amount} currency={x.currency} strong={strong} /></span>)}</span>;
}

const today = () => new Date().toISOString().slice(0, 10);

function QrImg({ text }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(text, { margin: 1, width: 180, color: { dark: '#2f0108', light: '#ffffff' } }).then(setSrc).catch(() => {}); }, [text]);
  return src ? <img src={src} alt="QR" /> : null;
}

function ReasonPrompt({ title, onClose, onSubmit, children, label }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal title={title} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => onSubmit(reason)).then(onClose).catch(() => {}); }}>
        {children}
        <Field label={label || t('reason')}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('confirm')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// ---- dialogs used from the customer file ----

export function ChargeForm({ customer, onClose, onSaved }) {
  const { t, label } = useI18n();
  const enrollments = useLoad(`/api/v2/customers/${customer.id}/enrollments`);
  const currencies = useLoad('/api/v2/finance/currencies');
  const [f, setF] = useState({ enrollment: '', description: '', currency: 'SAR', listAmount: '', discount: '', discountReason: '', count: 1, firstDue: today(), every: 1 });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(() => api('/api/v2/charges', { method: 'POST', body: {
      customer: customer.id, enrollment: f.enrollment || undefined, description: f.description, currency: f.currency, listAmount: Number(f.listAmount),
      discount: Number(f.discount) || 0, discountReason: f.discountReason, installments: { count: Number(f.count), firstDue: f.firstDue, everyMonths: Number(f.every) }
    } })).then(onSaved).catch(() => {});
  };
  return (
    <Modal title={t('newCharge')} onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        <Field label={t('enrollment')}>
          <select value={f.enrollment} onChange={set('enrollment')}>
            <option value="">—</option>
            {(enrollments.data?.items || []).map((x) => <option key={x._id} value={x._id}>{x.enrollmentNo} · {label({ ar: x.programTitleAr, en: x.programTitleEn })}</option>)}
          </select>
        </Field>
        <Field label={t('description')}><input value={f.description} onChange={set('description')} required={!f.enrollment} /></Field>
        <Field label={t('currency')}>
          <select value={f.currency} onChange={set('currency')}>{(currencies.data?.items || []).filter((c) => c.active !== false).map((c) => <option key={c.code} value={c.code}>{c.code} · {label({ ar: c.nameAr, en: c.nameEn })}</option>)}</select>
        </Field>
        <Field label={t('amount')}><input type="number" step="0.001" min="0" required value={f.listAmount} onChange={set('listAmount')} dir="ltr" /></Field>
        <Field label={`${t('discount')} (${t('optional')})`} hint={t('requestDiscount')}><input type="number" step="0.001" min="0" value={f.discount} onChange={set('discount')} dir="ltr" /></Field>
        {Number(f.discount) > 0 && <Field label={t('reason')}><input required value={f.discountReason} onChange={set('discountReason')} /></Field>}
        <Field label={t('installmentsCount')}><input type="number" min="1" max="60" value={f.count} onChange={set('count')} /></Field>
        <Field label={t('firstDue')}><input type="date" value={f.firstDue} onChange={set('firstDue')} /></Field>
        <Field label={t('everyMonths')}><input type="number" min="1" max="12" value={f.every} onChange={set('every')} /></Field>
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

export function PaymentForm({ customer, charges = [], onClose, onSaved }) {
  const { t, en, label } = useI18n();
  const accounts = useLoad('/api/v2/finance/accounts');
  const [f, setF] = useState({ account: '', charge: charges.find((c) => c.balance?.remaining > 0)?._id || '', method: 'cash', amount: '', chargeAmount: '', paidAt: today(), reference: '', note: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const acc = (accounts.data?.items || []).find((a) => a._id === f.account);
  const ch = charges.find((c) => c._id === f.charge);
  const otherCurrency = acc && ch && acc.currency !== ch.currency;
  const submit = (e) => {
    e.preventDefault();
    run(() => api('/api/v2/payments', { method: 'POST', body: { ...f, customer: customer.id, charge: f.charge || undefined, amount: Number(f.amount), chargeAmount: otherCurrency && f.chargeAmount !== '' ? Number(f.chargeAmount) : undefined, paidAt: new Date(f.paidAt + 'T12:00:00').toISOString() } }))
      .then((d) => onSaved(d.item)).catch(() => {});
  };
  return (
    <Modal title={`${t('recordPayment')}: ${customer.nameAr || customer.name}`} onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        <Field label={t('account')}>
          <select required value={f.account} onChange={set('account')}>
            <option value="">—</option>
            {(accounts.data?.items || []).filter((a) => a.active !== false).map((a) => <option key={a._id} value={a._id}>{label({ ar: a.nameAr, en: a.nameEn })} · {a.currency}</option>)}
          </select>
        </Field>
        <Field label={`${t('amount')}${acc ? ` (${acc.currency})` : ''}`}><input type="number" step="0.001" min="0" required dir="ltr" value={f.amount} onChange={set('amount')} /></Field>
        <Field label={t('method')}><select value={f.method} onChange={set('method')}>{METHODS.map((m) => <option key={m} value={m}>{en('payMethod', m)}</option>)}</select></Field>
        <Field label={t('paidAt')}><input type="date" required max={today()} value={f.paidAt} onChange={set('paidAt')} /></Field>
        <Field label={t('charge')}>
          <select value={f.charge} onChange={set('charge')}>
            <option value="">{t('advance')}</option>
            {charges.filter((c) => c.status === 'active').map((c) => <option key={c._id} value={c._id}>{c.chargeNo} · {c.description} ({c.balance?.remaining} {c.currency})</option>)}
          </select>
        </Field>
        {otherCurrency && <Field label={`${t('coversCharge')} (${ch.currency})`} hint={t('coversChargeHint')}><input type="number" step="0.001" min="0" dir="ltr" value={f.chargeAmount} onChange={set('chargeAmount')} /></Field>}
        <Field label={t('reference')}><input dir="ltr" value={f.reference} onChange={set('reference')} /></Field>
        <Field label={t('note')} wide><input value={f.note} onChange={set('note')} /></Field>
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// ---- the Finance tab of a customer file ----

export function CustomerFinance({ c }) {
  const { t, en, fmtDay } = useI18n();
  const { can } = useAuth();
  const navigate = useNavigate();
  const state = useLoad(`/api/v2/customers/${c.id}/finance`);
  const [dialog, setDialog] = useState(null);
  const canEdit = c.permissions?.canEditSection?.financial || can('payments.update', 'all');
  const done = () => { setDialog(null); state.reload(); };
  return (
    <Loading state={state}>
      {(d) => (
        <>
          <section className="card">
            <div className="card-head">
              <h2>{t('byCurrencyTitle')}</h2>
              <div className="row">
                {canEdit && <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: 'charge' })}>+ {t('newCharge')}</button>}
                {can('payments.create') && <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'payment' })}>+ {t('recordPayment')}</button>}
              </div>
            </div>
            {!d.byCurrency.length ? <p className="muted">{t('noData')}</p> : (
              <div className="grid grid--4">
                {d.byCurrency.map((x) => (
                  <div className="card stat" key={x.currency}>
                    <small>{x.currency}</small>
                    <div>{t('charged')}: <Money amount={x.charged} currency={x.currency} /></div>
                    <div>{t('paid')}: <Money amount={x.paid} currency={x.currency} /></div>
                    <div>{t('remaining')}: <Money amount={x.remaining} currency={x.currency} strong /></div>
                  </div>
                ))}
              </div>
            )}
            {Object.keys(d.unallocated).length > 0 && <p className="muted">{t('unallocated')}: {Object.entries(d.unallocated).map(([cur, v]) => <Money key={cur} amount={v} currency={cur} />)}</p>}
          </section>

          <section className="card">
            <h2>{t('charges')}</h2>
            {!d.charges.length ? <p className="muted">{t('noData')}</p> : d.charges.map((ch) => (
              <div className="program-card" key={ch._id}>
                <div className="card-head">
                  <div>
                    <strong>{ch.description}</strong> <small className="muted" dir="ltr">{ch.chargeNo}</small>
                    <div className="module-meta">
                      {t('listAmount')}: <Money amount={ch.listAmount} currency={ch.currency} />
                      {ch.discount?.status !== 'none' && <> · {t('discount')}: <Money amount={ch.discount.amount} currency={ch.currency} /> <Pill tone={TONE[ch.discount.status]}>{t(ch.discount.status)}</Pill></>}
                      {' · '}{t('net')}: <Money amount={ch.netAmount} currency={ch.currency} strong />
                    </div>
                  </div>
                  <div className="row">
                    <Pill tone={TONE[ch.status]}>{t(ch.status)}</Pill>
                    <span>{t('remaining')}: <Money amount={ch.balance.remaining} currency={ch.currency} strong /></span>
                    {canEdit && ch.status === 'active' && ch.discount?.status !== 'pending' && <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'discount', charge: ch })}>{t('requestDiscount')}</button>}
                  </div>
                </div>
                {ch.installmentStatus.length > 1 && (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>#</th><th>{t('dueAt')}</th><th>{t('amount')}</th><th>{t('paid')}</th><th>{t('remaining')}</th><th>{t('status')}</th></tr></thead>
                      <tbody>{ch.installmentStatus.map((i) => (
                        <tr key={i.no}><td>{i.no}</td><td>{fmtDay(i.dueDate)}</td><td><Money amount={i.amount} currency={ch.currency} /></td><td><Money amount={i.paid} currency={ch.currency} /></td><td><Money amount={i.remaining} currency={ch.currency} /></td><td><Pill tone={TONE[i.status]}>{en('installment', i.status)}</Pill></td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="card">
            <h2>{t('paymentsNav')}</h2>
            <PaymentTable items={d.payments} onOpen={(p) => navigate(`/payments/${p._id}`)} />
          </section>

          {dialog?.kind === 'charge' && <ChargeForm customer={c} onClose={() => setDialog(null)} onSaved={done} />}
          {dialog?.kind === 'payment' && <PaymentForm customer={c} charges={d.charges} onClose={() => setDialog(null)} onSaved={done} />}
          {dialog?.kind === 'discount' && (
            <DiscountDialog charge={dialog.charge} onClose={() => setDialog(null)} onDone={done} />
          )}
        </>
      )}
    </Loading>
  );
}

function DiscountDialog({ charge, onClose, onDone }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState('');
  return (
    <ReasonPrompt title={`${t('requestDiscount')}: ${charge.chargeNo}`} onClose={onClose} onSubmit={(reason) => api(`/api/v2/charges/${charge._id}/discount`, { method: 'POST', body: { amount: Number(amount), reason } }).then(onDone)}>
      <Field label={`${t('discount')} (${charge.currency})`}><input type="number" step="0.001" min="0" required dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
    </ReasonPrompt>
  );
}

function PaymentTable({ items, onOpen }) {
  const { t, en, fmtDay } = useI18n();
  if (!items.length) return <p className="muted">{t('noData')}</p>;
  return (
    <div className="table-wrap">
      <table className="table table--hover">
        <thead><tr><th>{t('receiptNo')}</th><th>{t('paidAt')}</th><th>{t('customer')}</th><th>{t('amount')}</th><th>{t('method')}</th><th>{t('account')}</th><th>{t('collectedBy')}</th><th>{t('status')}</th></tr></thead>
        <tbody>
          {items.map((p) => (
            <tr key={p._id} onClick={() => onOpen(p)}>
              <td dir="ltr" className="nowrap">{p.receiptNo}</td>
              <td className="nowrap">{fmtDay(p.paidAt)}</td>
              <td>{p.customer?.customerNo} {p.customer?.nameAr}</td>
              <td><Money amount={p.amount} currency={p.currency} strong />{p.refundedAmount > 0 && <div className="muted">−<Money amount={p.refundedAmount} currency={p.currency} /></div>}</td>
              <td>{en('payMethod', p.method)}</td>
              <td>{p.account?.nameAr}</td>
              <td>{p.collectedBy?.name || '—'}</td>
              <td><Pill tone={TONE[p.status]}>{en('payStatus', p.status)}</Pill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- payments ----

export default function Payments() {
  const { t, en } = useI18n();
  const navigate = useNavigate();
  const [filter, setFilter] = useState({ status: '', from: '', to: '', q: '', page: 1 });
  const q = new URLSearchParams({ page: String(filter.page), limit: '50' });
  for (const k of ['status', 'from', 'to', 'q']) if (filter[k]) q.set(k, filter[k]);
  const state = useLoad(`/api/v2/payments?${q}`);
  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value, page: 1 });
  return (
    <>
      <h1 className="page-title">{t('paymentsNav')}</h1>
      <div className="card filters">
        <Field label={t('receiptNo')}><input dir="ltr" value={filter.q} onChange={set('q')} placeholder="RC-0000001" /></Field>
        <Field label={t('status')}><select value={filter.status} onChange={set('status')}><option value="">{t('all')}</option>{['pending', 'confirmed', 'voided', 'rejected'].map((s) => <option key={s} value={s}>{en('payStatus', s)}</option>)}</select></Field>
        <Field label={t('from')}><input type="date" value={filter.from} onChange={set('from')} /></Field>
        <Field label={t('to')}><input type="date" value={filter.to} onChange={set('to')} /></Field>
      </div>
      <Loading state={state}>
        {(d) => (
          <>
            {d.totals.length > 0 && (
              <div className="grid grid--4">
                {d.totals.map((x) => <div className="card stat" key={x._id}><small>{x._id} · {x.n}</small><Money amount={x.amount} currency={x._id} strong /></div>)}
              </div>
            )}
            <section className="card">
              <PaymentTable items={d.items} onOpen={(p) => navigate(`/payments/${p._id}`)} />
              <Pager page={filter.page} total={d.total} limit={d.limit} onPage={(p) => setFilter({ ...filter, page: p })} />
            </section>
          </>
        )}
      </Loading>
    </>
  );
}

// The receipt page doubles as the printable A4 receipt
// The printed receipt (a tax invoice when the academy is tax registered). Also used for the print samples.
export function ReceiptSheet({ p, vat, verifyUrl }) {
  const { t, en, label, fmtDay, fmtDate } = useI18n();
  return (
    <section className="card receipt">
      <BrandBand title={vat ? `${t('taxInvoiceTitle')} / ${t('receiptTitle')}` : t('receiptTitle')}>
        <div className="receipt-no">
          <span dir="ltr">{p.receiptNo}</span>
          <Pill tone={TONE[p.status]}>{en('payStatus', p.status)}</Pill>
        </div>
      </BrandBand>
      <div className="receipt-body">
        <p className="receipt-line">{t('receiptFor')}: <strong>{p.customer.nameAr}</strong> <small className="muted">({p.customer.customerNo})</small></p>
        <p className="receipt-line">{t('theSumOf')}: <Money amount={p.amount} currency={p.currency} strong /></p>
        <p className="receipt-line">{t('forWhat')}: {p.charge ? p.charge.description : p.enrollment ? p.enrollment.programTitleAr : t('advance')}</p>
        <table className="table receipt-table">
          <tbody>
            <tr><th>{t('paidAt')}</th><td>{fmtDay(p.paidAt)}</td><th>{t('method')}</th><td>{en('payMethod', p.method)}{p.reference ? ` · ${p.reference}` : ''}</td></tr>
            <tr><th>{t('account')}</th><td>{label({ ar: p.account.nameAr, en: p.account.nameEn })}</td><th>{t('collectedBy')}</th><td>{p.collectedBy?.name || '—'}</td></tr>
            {(p.charge || p.enrollment) && <tr><th>{t('charge')}</th><td>{p.charge ? p.charge.chargeNo : '—'}</td><th>{t('enrollment')}</th><td>{p.enrollment ? p.enrollment.enrollmentNo : '—'}</td></tr>}
            {vat && (
              <>
                <tr><th>{t('netBeforeVat')}</th><td><Money amount={vat.net} currency={p.currency} /></td><th>{t('vatLabel')} ({vat.rate}%)</th><td><Money amount={vat.vat} currency={p.currency} /></td></tr>
                <tr className="receipt-total"><th>{t('totalLabel')}</th><td colSpan={3}><Money amount={vat.total} currency={p.currency} strong /></td></tr>
              </>
            )}
            {!vat && <tr className="receipt-total"><th>{t('totalLabel')}</th><td colSpan={3}><Money amount={p.amount} currency={p.currency} strong /></td></tr>}
          </tbody>
        </table>
        {p.refundedAmount > 0 && <p className="late">{t('refunds')}: <Money amount={p.refundedAmount} currency={p.currency} /></p>}
        {p.note && <p>{p.note}</p>}
        {(p.status === 'voided' || p.status === 'rejected') && <div className="alert alert--error">{p.voidReason}</div>}
        <div className="receipt-bottom">
          <div className="receipt-sign"><span>{t('signCollector')}</span><span>{t('signStamp')}</span></div>
          {verifyUrl && <div className="receipt-qr"><QrImg text={verifyUrl} /><small>{t('scanToVerify')}</small></div>}
        </div>
        <p className="muted receipt-foot">{t('recordedBy')}: {p.recordedBy?.name}{p.confirmedBy ? ` · ${t('confirmed')}: ${p.confirmedBy.name}` : ''} · {fmtDate(new Date())}</p>
      </div>
      <PrintFooter />
    </section>
  );
}

export function PaymentDetail() {
  const { id } = useParams();
  const { t, en, label, fmtDate, fmtDay } = useI18n();
  const { can, me } = useAuth();
  const state = useLoad(`/api/v2/payments/${id}`, [id]);
  const [dialog, setDialog] = useState(null);
  const done = () => { setDialog(null); state.reload(); };
  return (
    <Loading state={state}>
      {({ item: p, refunds, vat, verifyUrl }) => (
        <>
          <div className="page-head no-print">
            <Link to={me.user.isStaff ? '/payments' : '/my-payments'} className="muted">← {t('paymentsNav')}</Link>
            <div className="row">
              <button type="button" className="btn btn--ghost" onClick={() => window.print()}>{t('printReceipt')}</button>
              {p.status === 'pending' && can('payments.update', 'all') && (
                <>
                  <button type="button" className="btn btn--primary" onClick={() => api(`/api/v2/payments/${p._id}/confirm`, { method: 'POST', body: { __v: p.__v } }).then(state.reload)}>{t('confirmPayment')}</button>
                  <button type="button" className="btn btn--danger" onClick={() => setDialog('reject')}>{t('rejectPayment')}</button>
                </>
              )}
              {p.status === 'confirmed' && me.user.isStaff && <button type="button" className="btn btn--ghost" onClick={() => setDialog('refund')}>{t('requestRefund')}</button>}
              {p.status === 'confirmed' && me.user.isStaff && !p.refundedAmount && <button type="button" className="btn btn--ghost" onClick={() => setDialog('void')}>{t('requestVoid')}</button>}
            </div>
          </div>
          <ReceiptSheet p={p} vat={vat} verifyUrl={verifyUrl} />
          {refunds.length > 0 && (
            <section className="card no-print">
              <h2>{t('refunds')}</h2>
              <ul className="plain-list">{refunds.map((r) => <li key={r._id}><span dir="ltr">{r.refundNo}</span> · <Money amount={r.amount} currency={r.currency} /> · {r.reason} <Pill tone={TONE[r.status]}>{en('payStatus', r.status)}</Pill></li>)}</ul>
            </section>
          )}
          {dialog === 'reject' && <ReasonPrompt title={t('rejectPayment')} onClose={() => setDialog(null)} onSubmit={(reason) => api(`/api/v2/payments/${p._id}/confirm`, { method: 'POST', body: { __v: p.__v, decision: 'reject', reason } }).then(done)} />}
          {dialog === 'void' && <ReasonPrompt title={t('requestVoid')} onClose={() => setDialog(null)} onSubmit={(reason) => api(`/api/v2/payments/${p._id}/void`, { method: 'POST', body: { reason } }).then(done)} />}
          {dialog === 'refund' && <RefundDialog p={p} onClose={() => setDialog(null)} onDone={done} />}
        </>
      )}
    </Loading>
  );
}

function RefundDialog({ p, onClose, onDone }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(String(p.amount - p.refundedAmount));
  return (
    <ReasonPrompt title={`${t('requestRefund')}: ${p.receiptNo}`} onClose={onClose} onSubmit={(reason) => api(`/api/v2/payments/${p._id}/refunds`, { method: 'POST', body: { amount: Number(amount), reason } }).then(onDone)}>
      <Field label={`${t('amount')} (${p.currency})`}><input type="number" step="0.001" min="0" max={p.amount - p.refundedAmount} required dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
    </ReasonPrompt>
  );
}

// ---- approvals ----

export function Approvals() {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const [status, setStatus] = useState('pending');
  const state = useLoad(`/api/v2/approvals?status=${status}`);
  const [deciding, setDeciding] = useState(null);
  const approver = can('payments.approve', 'all');
  return (
    <>
      <h1 className="page-title">{t('approvalsNav')}</h1>
      <div className="tabs">{['pending', 'approved', 'rejected'].map((s) => <button key={s} type="button" className={`tab${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>{t(s)}</button>)}</div>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('approvalType')}</th><th>{t('summary')}</th><th>{t('customer')}</th><th>{t('reason')}</th><th>{t('requestedBy')}</th><th>{t('decision')}</th><th /></tr></thead>
                <tbody>
                  {d.items.map((a) => (
                    <tr key={a._id}>
                      <td><Pill tone="gold">{t(`${a.type}_t`)}</Pill></td>
                      <td dir="auto">{a.summary}</td>
                      <td>{a.customer ? <Link to={`/customers/${a.customer._id}`}>{a.customer.customerNo}</Link> : '—'}</td>
                      <td>{a.reason}</td>
                      <td>{a.requestedBy?.name}<br /><small className="muted">{fmtDate(a.createdAt)}</small></td>
                      <td>{a.decidedBy ? `${a.decidedBy.name}: ${a.decisionNote || t(a.status)}` : '—'}</td>
                      <td>{approver && a.status === 'pending' && <button type="button" className="btn btn--small btn--primary" onClick={() => setDeciding(a)}>{t('decision')}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
      {deciding && <DecideApproval a={deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); state.reload(); }} />}
    </>
  );
}

function DecideApproval({ a, onClose, onDone }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const send = (decision) => run(() => api(`/api/v2/approvals/${a._id}/decide`, { method: 'POST', body: { decision, note, __v: a.__v } })).then(onDone).catch(() => {});
  return (
    <Modal title={`${t(`${a.type}_t`)}: ${a.summary}`} onClose={onClose}>
      <div className="stack">
        <p>{a.reason}</p>
        <Field label={t('note')}><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => send('approve')}>{t('approve')}</button>
          <button type="button" className="btn btn--danger" disabled={busy} onClick={() => send('reject')}>{t('reject')}</button>
        </div>
      </div>
    </Modal>
  );
}

// ---- accounts, transfers, expenses ----

export function Accounts() {
  const { t, label } = useI18n();
  const { can } = useAuth();
  const state = useLoad('/api/v2/finance/accounts');
  const currencies = useLoad('/api/v2/finance/currencies');
  const [dialog, setDialog] = useState(null);
  const done = () => { setDialog(null); state.reload(); };
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('accountsNav')}</h1>
        <div className="row">
          {can('accounts.update', 'all') && <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: 'transfer' })}>{t('transfer_t')}</button>}
          {can('accounts.create', 'all') && <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'account' })}>+ {t('newAccount')}</button>}
        </div>
      </div>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('codeLabel')}</th><th>{t('name')}</th><th>{t('accountType')}</th><th>{t('currency')}</th><th>{t('in')}</th><th>{t('out')}</th><th>{t('balance')}</th><th /></tr></thead>
                <tbody>
                  {d.items.map((a) => (
                    <tr key={a._id} className={a.active ? '' : 'muted'}>
                      <td dir="ltr">{a.code}</td>
                      <td><strong>{label({ ar: a.nameAr, en: a.nameEn })}</strong>{a.details && <div className="muted">{a.details}</div>}{a.allowEmployees && <Pill tone="info">{t('allowEmployees')}</Pill>}</td>
                      <td>{t(a.type)}</td>
                      <td>{a.currency}</td>
                      <td><Money amount={a.in} currency="" /></td>
                      <td><Money amount={a.out} currency="" /></td>
                      <td><Money amount={a.balance} currency={a.currency} strong /></td>
                      <td className="nowrap">
                        <Link className="btn btn--small" to={`/accounts/${a._id}`}>{t('statement')}</Link>{' '}
                        {can('accounts.update', 'all') && <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'account', item: a })}>{t('edit')}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
      {dialog?.kind === 'account' && <AccountForm item={dialog.item} currencies={currencies.data?.items || []} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'transfer' && <TransferForm accounts={state.data?.items || []} onClose={() => setDialog(null)} onSaved={done} />}
    </>
  );
}

function AccountForm({ item, currencies, onClose, onSaved }) {
  const { t, label } = useI18n();
  const [f, setF] = useState({ code: item?.code || '', nameAr: item?.nameAr || '', nameEn: item?.nameEn || '', type: item?.type || 'cash', currency: item?.currency || 'SAR', details: item?.details || '', allowEmployees: !!item?.allowEmployees, active: item ? item.active : true });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const req = item ? api(`/api/v2/finance/accounts/${item._id}`, { method: 'PUT', body: { ...f, __v: item.__v } }) : api('/api/v2/finance/accounts', { method: 'POST', body: f });
    run(() => req).then(onSaved).catch(() => {});
  };
  return (
    <Modal title={item ? t('edit') : t('newAccount')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label={t('codeLabel')}><input dir="ltr" required value={f.code} onChange={set('codeLabel')} placeholder="CASH-SAR" /></Field>
        <Field label={t('nameAr')}><input required value={f.nameAr} onChange={set('nameAr')} /></Field>
        <Field label={t('nameEn')}><input dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
        <Field label={t('accountType')}><select value={f.type} onChange={set('type')}>{['cash', 'bank', 'wallet', 'gateway'].map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
        <Field label={t('currency')}>
          <select value={f.currency} onChange={set('currency')} disabled={!!item}>{currencies.filter((c) => c.active !== false).map((c) => <option key={c.code} value={c.code}>{c.code} · {label({ ar: c.nameAr, en: c.nameEn })}</option>)}</select>
        </Field>
        <Field label={t('details')}><input value={f.details} onChange={set('details')} /></Field>
        <label className="check"><input type="checkbox" checked={f.allowEmployees} onChange={set('allowEmployees')} /> {t('allowEmployees')}</label>
        {item && <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> {t('active')}</label>}
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function TransferForm({ accounts, onClose, onSaved }) {
  const { t, label } = useI18n();
  const [f, setF] = useState({ from: '', to: '', amountOut: '', amountIn: '', date: today(), note: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const a = accounts.find((x) => x._id === f.from);
  const b = accounts.find((x) => x._id === f.to);
  const submit = (e) => {
    e.preventDefault();
    run(() => api('/api/v2/transfers', { method: 'POST', body: { ...f, amountOut: Number(f.amountOut), amountIn: Number(f.amountIn || f.amountOut), date: new Date(f.date + 'T12:00:00').toISOString() } })).then(onSaved).catch(() => {});
  };
  const opts = accounts.filter((x) => x.active).map((x) => <option key={x._id} value={x._id}>{label({ ar: x.nameAr, en: x.nameEn })} · {x.currency}</option>);
  return (
    <Modal title={t('transfer_t')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label={t('fromAccount')}><select required value={f.from} onChange={set('from')}><option value="">—</option>{opts}</select></Field>
        <Field label={t('toAccount')}><select required value={f.to} onChange={set('to')}><option value="">—</option>{opts}</select></Field>
        <Field label={`${t('amountOut')}${a ? ` (${a.currency})` : ''}`}><input type="number" step="0.001" min="0" required dir="ltr" value={f.amountOut} onChange={set('amountOut')} /></Field>
        {a && b && a.currency !== b.currency && <Field label={`${t('amountIn')} (${b.currency})`}><input type="number" step="0.001" min="0" required dir="ltr" value={f.amountIn} onChange={set('amountIn')} /></Field>}
        <Field label={t('date')}><input type="date" max={today()} value={f.date} onChange={set('date')} /></Field>
        <Field label={t('note')}><input value={f.note} onChange={set('note')} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

export function AccountStatement() {
  const { id } = useParams();
  const { t, label, fmtDate } = useI18n();
  const [range, setRange] = useState({ from: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), to: today() });
  const state = useLoad(`/api/v2/finance/accounts/${id}/statement?from=${range.from}&to=${range.to}`, [id]);
  return (
    <Loading state={state}>
      {(d) => (
        <>
          <Link to="/accounts" className="muted no-print">← {t('accountsNav')}</Link>
          <div className="page-head">
            <h1 className="page-title">{t('statement')}: {label({ ar: d.account.nameAr, en: d.account.nameEn })} <small className="muted">{d.account.currency}</small></h1>
            <button type="button" className="btn btn--ghost no-print" onClick={() => window.print()}>{t('print')}</button>
          </div>
          <div className="card filters no-print">
            <Field label={t('from')}><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
            <Field label={t('to')}><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
          </div>
          <section className="card">
            <p>{t('opening')}: <Money amount={d.openingBalance} currency={d.account.currency} strong /></p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('date')}</th><th>{t('description')}</th><th>{t('in')}</th><th>{t('out')}</th><th>{t('balance')}</th><th>{t('who')}</th></tr></thead>
                <tbody>
                  {d.items.map((m) => (
                    <tr key={m._id}>
                      <td className="nowrap">{fmtDate(m.date)}</td>
                      <td>{m.description} <small className="muted" dir="ltr">{m.source.no}</small></td>
                      <td>{m.direction === 'in' ? <Money amount={m.amount} currency="" /> : ''}</td>
                      <td>{m.direction === 'out' ? <Money amount={m.amount} currency="" /> : ''}</td>
                      <td><Money amount={m.balance} currency="" /></td>
                      <td>{m.by?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>{t('closing')}: <Money amount={d.closingBalance} currency={d.account.currency} strong /></p>
          </section>
        </>
      )}
    </Loading>
  );
}

export function Expenses() {
  const { t, fmtDay } = useI18n();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [missing, setMissing] = useState(false);
  const state = useLoad(`/api/v2/expenses?page=${page}&limit=50${missing ? '&receipt=missing' : ''}`, [missing]);
  const accounts = useLoad('/api/v2/finance/accounts');
  const [dialog, setDialog] = useState(null);
  const done = () => { setDialog(null); state.reload(); };
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('expensesNav')}</h1>
        <div className="row">
          <label className="check"><input type="checkbox" checked={missing} onChange={(e) => { setPage(1); setMissing(e.target.checked); }} /> {t('fhNoReceipt')}</label>
          {can('expenses.create', 'all') && <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'new' })}>+ {t('newExpense')}</button>}
        </div>
      </div>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th dir="ltr">#</th><th>{t('date')}</th><th>{t('categoryName')}</th><th>{t('payee')}</th><th>{t('amount')}</th><th>{t('account')}</th><th>{t('fhReceipt')}</th><th>{t('status')}</th><th /></tr></thead>
                  <tbody>
                    {d.items.map((x) => (
                      <tr key={x._id} className={x.status === 'voided' ? 'muted' : ''}>
                        <td dir="ltr">{x.expenseNo}</td><td>{fmtDay(x.date)}</td><td>{x.category}{x.program && <div className="muted">{x.program.titleAr}</div>}</td><td>{x.payee}<div className="muted">{x.description}</div></td>
                        <td><Money amount={x.amount} currency={x.currency} strong /></td><td>{x.account?.nameAr}</td>
                        <td>{x.attachment?.filename ? <a href={`/api/v2/expenses/${x._id}/receipt`} target="_blank" rel="noreferrer">{t('fhView')}</a> : can('expenses.create', 'all') ? <ReceiptUpload id={x._id} onDone={state.reload} /> : <span className="late">—</span>}</td>
                        <td><Pill tone={x.status === 'posted' ? 'ok' : 'muted'}>{x.status === 'posted' ? t('confirmed') : t('voided')}</Pill></td>
                        <td>{x.status === 'posted' && <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'void', item: x })}>{t('requestVoid')}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={page} total={d.total} limit={d.limit} onPage={setPage} />
            </>
          ))}
        </Loading>
      </section>
      {dialog?.kind === 'new' && <ExpenseForm accounts={accounts.data?.items || []} categories={state.data?.categories || []} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'void' && <ReasonPrompt title={`${t('requestVoid')}: ${dialog.item.expenseNo}`} onClose={() => setDialog(null)} onSubmit={(reason) => api(`/api/v2/expenses/${dialog.item._id}/void`, { method: 'POST', body: { reason } }).then(done)} />}
    </>
  );
}

// Sends a photo or PDF of an expense's receipt
async function uploadReceipt(id, file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`/api/v2/expenses/${id}/receipt`, { method: 'POST', body: fd, credentials: 'same-origin' });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || 'Upload failed');
  return d;
}

function ReceiptUpload({ id, onDone }) {
  const { t, lang } = useI18n();
  const [error, setError] = useState('');
  return (
    <label className="btn btn--small btn--ghost upload-btn">
      {t('fhAddReceipt')}
      <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files[0] && uploadReceipt(id, e.target.files[0]).then(onDone).catch((err) => setError(pickMessage(err.message, lang)))} />
      {error && <small className="late">{error}</small>}
    </label>
  );
}

function ExpenseForm({ accounts, categories, onClose, onSaved }) {
  const { t, label } = useI18n();
  const programs = useLoad('/api/v2/programs?limit=500');
  const [file, setFile] = useState(null);
  const [f, setF] = useState({ account: '', category: '', amount: '', date: today(), payee: '', description: '', program: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={t('newExpense')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { const d = await api('/api/v2/expenses', { method: 'POST', body: { ...f, program: f.program || null, amount: Number(f.amount), date: new Date(f.date + 'T12:00:00').toISOString() } }); if (file) await uploadReceipt(d.item._id, file); return d; }).then(onSaved).catch(() => {}); }}>
        <Field label={t('account')}><select required value={f.account} onChange={set('account')}><option value="">—</option>{accounts.filter((a) => a.active).map((a) => <option key={a._id} value={a._id}>{label({ ar: a.nameAr, en: a.nameEn })} · {a.currency}</option>)}</select></Field>
        <Field label={t('categoryName')}><input required list="expense-categories" value={f.category} onChange={set('category')} /><datalist id="expense-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label={t('amount')}><input type="number" step="0.001" min="0" required dir="ltr" value={f.amount} onChange={set('amount')} /></Field>
        <Field label={t('date')}><input type="date" max={today()} value={f.date} onChange={set('date')} /></Field>
        <Field label={t('payee')}><input value={f.payee} onChange={set('payee')} /></Field>
        <Field label={t('description')}><input value={f.description} onChange={set('description')} /></Field>
        <Field label={t('fhProgramCost')} hint={t('fhProgramCostHint')}><select value={f.program} onChange={set('program')}><option value="">{t('none')}</option>{(programs.data?.items || []).map((p) => <option key={p._id} value={p._id}>{label({ ar: p.titleAr, en: p.titleEn })}</option>)}</select></Field>
        <Field label={t('fhReceipt')}><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// ---- currencies, rates, periods ----

export function Currencies() {
  const { t, label, fmtDate } = useI18n();
  const { can } = useAuth();
  const state = useLoad('/api/v2/finance/currencies');
  const rates = useLoad('/api/v2/finance/rates?limit=50');
  const [rate, setRate] = useState({ currency: '', rate: '', effectiveAt: '', note: '' });
  const { busy, error, run } = useAction();
  const canRate = can('currencies.update', 'all');
  const canManage = can('currencies.manage', 'all');
  const toggle = (c) => api('/api/v2/finance/currencies', { method: 'POST', body: { ...c, active: c.active === false } }).then(state.reload);
  const addRate = (e) => {
    e.preventDefault();
    run(() => api('/api/v2/finance/rates', { method: 'POST', body: { ...rate, rate: Number(rate.rate), effectiveAt: rate.effectiveAt ? new Date(rate.effectiveAt).toISOString() : undefined } }))
      .then(() => { setRate({ currency: '', rate: '', effectiveAt: '', note: '' }); state.reload(); rates.reload(); }).catch(() => {});
  };
  return (
    <>
      <h1 className="page-title">{t('currenciesNav')}</h1>
      <Loading state={state}>
        {(d) => (
          <>
            <section className="card">
              <p>{t('baseCurrency')}: <strong>{d.base}</strong> <small className="muted">{t('ratesOptionalNote')}</small></p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('codeLabel')}</th><th>{t('name')}</th><th>{t('symbol')}</th><th>{t('decimals')}</th><th>{t('rate')}</th><th>{t('effectiveAt')}</th><th>{t('status')}</th></tr></thead>
                  <tbody>
                    {d.items.map((c) => (
                      <tr key={c.code}>
                        <td dir="ltr"><strong>{c.code}</strong>{c.isBase && <Pill tone="ok">{t('base')}</Pill>}</td>
                        <td>{label({ ar: c.nameAr, en: c.nameEn })}</td><td>{c.symbol}</td><td>{c.decimals}</td>
                        <td dir="ltr">{c.rate ?? <span className="warn">{t('noRate')}</span>}</td>
                        <td>{c.rateAt ? fmtDate(c.rateAt) : '—'}</td>
                        <td>{canManage && !c.isBase ? <button type="button" className="btn btn--small" onClick={() => toggle(c)}>{c.active === false ? t('inactive') : t('active')}</button> : (c.active === false ? t('inactive') : t('active'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            {canRate && (
              <form className="card form-grid" onSubmit={addRate}>
                <h2 className="field--wide">{t('addRate')}</h2>
                <Field label={t('currency')}><select required value={rate.currency} onChange={(e) => setRate({ ...rate, currency: e.target.value })}><option value="">—</option>{d.items.filter((c) => !c.isBase && c.active !== false).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></Field>
                <Field label={`${t('rate')} (${d.base})`} hint={t('rateHint')}><input type="number" step="0.000001" min="0" required dir="ltr" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} /></Field>
                <Field label={t('effectiveAt')}><input type="datetime-local" value={rate.effectiveAt} onChange={(e) => setRate({ ...rate, effectiveAt: e.target.value })} /></Field>
                <Field label={t('note')}><input value={rate.note} onChange={(e) => setRate({ ...rate, note: e.target.value })} /></Field>
                <div className="field--wide"><ErrorBox error={error} /></div>
                <div className="field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button></div>
              </form>
            )}
          </>
        )}
      </Loading>
      <section className="card">
        <h2>{t('rateHistory')}</h2>
        <Loading state={rates}>
          {(d) => (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('currency')}</th><th>{t('rate')}</th><th>{t('effectiveAt')}</th><th>{t('who')}</th><th>{t('note')}</th></tr></thead>
                <tbody>{d.items.map((r) => <tr key={r._id}><td>{r.currency}</td><td dir="ltr">{r.rate}</td><td>{fmtDate(r.effectiveAt)}</td><td>{r.setBy?.name}</td><td>{r.note}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Loading>
      </section>
    </>
  );
}

export function Periods() {
  const { t, fmtDate } = useI18n();
  const { can, me } = useAuth();
  const state = useLoad('/api/v2/finance/periods');
  const [dialog, setDialog] = useState(null);
  return (
    <>
      <h1 className="page-title">{t('periodsNav')}</h1>
      <section className="card">
        <Loading state={state}>
          {(d) => (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('period')}</th><th>{t('status')}</th><th>{t('history')}</th><th /></tr></thead>
                <tbody>
                  {d.items.map((p) => (
                    <tr key={p.key}>
                      <td dir="ltr"><strong>{p.key}</strong></td>
                      <td><Pill tone={p.status === 'closed' ? 'muted' : 'ok'}>{p.status === 'closed' ? t('closed') : t('open')}</Pill></td>
                      <td>{(p.history || []).slice(-1).map((h, i) => <small key={i} className="muted">{h.byName} · {fmtDate(h.at)} · {h.reason}</small>)}</td>
                      <td>
                        {p.status !== 'closed' && can('accounts.approve', 'all') && <button type="button" className="btn btn--small" onClick={() => setDialog({ key: p.key, status: 'closed' })}>{t('closePeriod')}</button>}
                        {p.status === 'closed' && me.user.role === 'super_admin' && <button type="button" className="btn btn--small" onClick={() => setDialog({ key: p.key, status: 'open' })}>{t('reopenPeriod')}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Loading>
      </section>
      {dialog && <ReasonPrompt title={`${dialog.status === 'closed' ? t('closePeriod') : t('reopenPeriod')}: ${dialog.key}`} onClose={() => setDialog(null)} onSubmit={(reason) => api(`/api/v2/finance/periods/${dialog.key}`, { method: 'POST', body: { status: dialog.status, reason } }).then(() => { setDialog(null); state.reload(); })} />}
    </>
  );
}

// ---- summary (finance dashboard) ----

export function FinanceSummary() {
  const { t, en } = useI18n();
  const [range, setRange] = useState({ from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), to: today() });
  const state = useLoad(`/api/v2/finance/summary?from=${range.from}&to=${range.to}`);
  const Rows = ({ rows, group, name }) => (!rows.length ? <p className="muted">—</p> : (
    <ul className="plain-list">{rows.map((r, i) => <li key={i}><span>{name ? r.name || '—' : group ? en(group, r._id) : r._id || '—'} <small className="muted">({r.n})</small></span><Amounts list={r.amounts} strong /></li>)}</ul>
  ));
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('financeSummary')}</h1>
        <div className="row">
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </div>
      </div>
      <Loading state={state}>
        {(d) => (
          <>
            {!d.totals.length && <section className="card"><p className="muted">{t('noData')}</p></section>}
            {d.totals.length > 0 && (
              <section className="card">
                <h2>{t('perCurrencyTitle')}</h2>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('currency')}</th><th>{t('collected')}</th><th>{t('refunds')}</th><th>{t('expensesTotal')}</th><th>{t('commissionsNav')}</th><th>{t('netTotal')}</th></tr></thead>
                    <tbody>{d.totals.map((x) => (
                      <tr key={x.currency}><td dir="ltr"><strong>{x.currency}</strong></td><td><Money amount={x.collected} currency={x.currency} /></td><td><Money amount={x.refunded} currency={x.currency} /></td><td><Money amount={x.expenses} currency={x.currency} /></td><td><Money amount={x.commissions} currency={x.currency} /></td><td><Money amount={x.net} currency={x.currency} strong /></td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="muted"><small>{t('noConversionNote')}</small></p>
              </section>
            )}
            {d.pendingPayments > 0 && <div className="alert alert--warn"><Link to="/payments">{t('pendingConfirm')}: {d.pendingPayments}</Link></div>}
            <div className="grid grid--2">
              <section className="card"><h2>{t('byMethod')}</h2><Rows rows={d.byMethod} group="payMethod" /></section>
              <section className="card"><h2>{t('byAccountTitle')}</h2><Rows rows={d.byAccount} name /></section>
              <section className="card"><h2>{t('byCollector')}</h2><Rows rows={d.byCollector} name /></section>
              <section className="card"><h2>{t('byProgram')}</h2><Rows rows={d.byProgram} /></section>
              <section className="card"><h2>{t('byCountry')}</h2><Rows rows={d.byCountry} /></section>
              <section className="card"><h2>{t('expensesNav')}</h2><Rows rows={d.expenses} /></section>
            </div>
          </>
        )}
      </Loading>
    </>
  );
}

// ---- the customer's own payments ----

export function MyPayments() {
  const { t, en, fmtDay } = useI18n();
  const navigate = useNavigate();
  const state = useLoad('/api/v2/my/finance');
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('myPayments')}</h1>
        <button type="button" className="btn btn--ghost no-print" onClick={() => window.print()}>{t('printPdf')}</button>
      </div>
      <Loading state={state}>
        {(d) => <StatementView d={d} onOpen={(p) => navigate(`/payments/${p._id}`)} />}
      </Loading>
    </>
  );
}

// The customer's statement: balances per currency, installments and payments. Printed with the academy band.
export function StatementView({ d, onOpen, customerName }) {
  const { t, en, fmtDay } = useI18n();
  return (
          <>
            <div className="print-only"><BrandBand title={t('stmtTitle')} subtitle={customerName} /></div>
            {d.byCurrency.length > 0 && <div className="grid grid--4">{d.byCurrency.map((x) => <div className="card stat" key={x.currency}><small>{t('remaining')}</small><Money amount={x.remaining} currency={x.currency} strong /><small className="muted">{t('paid')}: <Money amount={x.paid} currency={x.currency} /></small></div>)}</div>}
            <section className="card">
              <h2>{t('installments')}</h2>
              {!d.charges.length ? <p className="muted">{t('noData')}</p> : d.charges.map((c) => (
                <div className="program-card" key={c._id}>
                  <strong>{c.description}</strong>
                  <ul className="plain-list">{c.installmentStatus.map((i) => <li key={i.no}><span>{fmtDay(i.dueDate)}</span><span><Money amount={i.remaining || i.amount} currency={c.currency} /> <Pill tone={TONE[i.status]}>{en('installment', i.status)}</Pill></span></li>)}</ul>
                </div>
              ))}
            </section>
            <section className="card">
              <h2>{t('paymentsNav')}</h2>
              {!d.payments.length ? <p className="muted">{t('noData')}</p> : (
                <ul className="plain-list">{d.payments.map((p) => <li key={p._id}><button type="button" className="link" onClick={() => onOpen && onOpen(p)}>{p.receiptNo}</button><span>{fmtDay(p.paidAt)} · {en('payMethod', p.method)}</span><Money amount={p.amount} currency={p.currency} strong /></li>)}</ul>
              )}
            </section>
            <PrintFooter />
          </>
  );
}
