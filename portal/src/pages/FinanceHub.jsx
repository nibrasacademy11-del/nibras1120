import { Fragment, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, pickMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, useAction, useLoad } from '../components/ui.jsx';
import Payments, { Accounts, Amounts, Approvals, Currencies, Expenses, FinanceSummary, Money } from './Finance.jsx';
import { PrintButton, PrintHeader } from '../components/Print.jsx';

// One place for the academy's money, for an owner without an accountant:
// today's numbers, who owes what (with reminders), payments, approvals, expenses, cash and banks,
// reports, and closing the month.

const thisMonth = () => new Date().toISOString().slice(0, 7);

function Today({ go }) {
  const { t } = useI18n();
  const state = useLoad('/api/v2/finance/today');
  return (
    <Loading state={state}>
      {(d) => (
        <>
          <div className="grid grid--4">
            <div className="card stat"><small>{t('fhToday')}</small><Amounts list={d.today} strong empty="0" /></div>
            <div className="card stat"><small>{t('fhMonth')}</small><Amounts list={d.month} strong empty="0" /></div>
            <div className="card stat"><small>{t('fhExpensesMonth')}</small><Amounts list={d.expensesMonth} empty="0" /></div>
            <button type="button" className="card stat stat--link" onClick={() => go('receivables', 'overdue')}>
              <small>{t('fhOverdue')} · {d.overdue.customers} {t('fhCustomers')}</small><Amounts list={d.overdue.amounts} strong empty="0" />
            </button>
          </div>
          <div className="grid grid--4">
            <button type="button" className="card stat stat--link" onClick={() => go('receivables', 'week')}>
              <small>{t('fhDueWeek')} · {d.dueWeek.customers} {t('fhCustomers')}</small><Amounts list={d.dueWeek.amounts} empty="0" />
            </button>
            <button type="button" className="card stat stat--link" onClick={() => go('payments')}><small>{t('fhPendingPayments')}</small><strong>{d.pending.payments}</strong></button>
            <button type="button" className="card stat stat--link" onClick={() => go('approvals')}><small>{t('fhPendingApprovals')}</small><strong>{d.pending.approvals}</strong>{d.pending.refunds > 0 && <small className="muted">{t('refunds')}: {d.pending.refunds}</small>}</button>
            <button type="button" className="card stat stat--link" onClick={() => go('close')}><small>{t('fhClose')}</small><strong dir="ltr">{thisMonth()}</strong></button>
          </div>
        </>
      )}
    </Loading>
  );
}

function RemindButtons({ row, onDone }) {
  const { t, lang } = useI18n();
  const [msg, setMsg] = useState('');
  const send = async (channel) => {
    setMsg('');
    const win = channel === 'whatsapp' ? window.open('', '_blank') : null;
    try {
      const r = await api(`/api/v2/finance/receivables/${row.customer._id}/remind`, { method: 'POST', body: { channel } });
      if (channel === 'whatsapp') {
        if (win) { win.opener = null; win.location.href = r.link; } else window.location.assign(r.link);
      }
      setMsg(channel === 'email' ? `✓ ${r.to}` : '✓');
      onDone();
    } catch (e) {
      if (win) win.close();
      setMsg(pickMessage(e.message, lang));
    }
  };
  return (
    <div className="row">
      {row.phone && <button type="button" className="btn btn--small btn--wa" onClick={() => send('whatsapp')}>{t('fhWhatsapp')}</button>}
      {row.hasEmail && <button type="button" className="btn btn--small btn--ghost" onClick={() => send('email')}>{t('fhEmail')}</button>}
      {row.hasPortal && <button type="button" className="btn btn--small btn--ghost" onClick={() => send('portal')}>{t('fhPortal')}</button>}
      {msg && <small className={msg.startsWith('✓') ? 'ok' : 'late'}>{msg}</small>}
    </div>
  );
}

export function Receivables({ initial = 'overdue' }) {
  const { t, fmtDay, fmtDate } = useI18n();
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(null);
  const data = useLoad(`/api/v2/finance/receivables?state=${state}`, [state]);
  return (
    <>
      <div className="page-head">
        <div className="row no-print">
          {['overdue', 'week', 'all'].map((s) => <button key={s} type="button" className={`btn btn--small ${state === s ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setState(s)}>{t(`fhState_${s}`)}</button>)}
        </div>
        <PrintButton what="receivables" title={t('fhReceivables')} filters={{ state }} />
      </div>
      <PrintHeader title={t('fhReceivables')} subtitle={t(`fhState_${state}`)} />
      <Loading state={data}>
        {(d) => (
          <>
            <div className="grid grid--4">
              <div className="card stat"><small>{t('fhOwed')} · {d.totals.customers} {t('fhCustomers')}</small><Amounts list={d.totals.owed} strong empty="0" /></div>
              <div className="card stat"><small>{t('fhOverdue')}</small><Amounts list={d.totals.overdue} strong empty="0" /></div>
            </div>
            <section className="card">
              {!d.items.length ? <p className="muted">{t('noData')}</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('customer')}</th><th>{t('fhOwed')}</th><th>{t('fhOverdue')}</th><th>{t('fhLate')}</th><th>{t('fhNextDue')}</th><th>{t('owner')}</th><th className="no-print">{t('fhRemind')}</th></tr></thead>
                    <tbody>
                      {d.items.map((r) => (
                        <Fragment key={r.customer._id}>
                          <tr className={r.maxDaysLate > 0 ? 'row-late' : ''}>
                            <td>
                              {r.customer.canOpen ? <Link to={`/customers/${r.customer._id}`}>{r.customer.customerNo}</Link> : r.customer.customerNo} {r.customer.nameAr}
                              <br /><button type="button" className="link no-print" onClick={() => setOpen(open === r.customer._id ? null : r.customer._id)}><small>{r.installments.length} {t('fhInstallments')}</small></button>
                            </td>
                            <td><Amounts list={r.owed} strong /></td>
                            <td><Amounts list={r.overdue} /></td>
                            <td>{r.maxDaysLate > 0 ? <Pill tone={r.maxDaysLate > 30 ? 'warn' : 'gold'}>{r.maxDaysLate} {t('fhDays')}</Pill> : '—'}</td>
                            <td>{r.nextDue ? fmtDay(r.nextDue) : '—'}</td>
                            <td>{r.customer.owner || '—'}</td>
                            <td className="no-print"><RemindButtons row={r} onDone={data.reload} />{r.lastReminderAt && <small className="muted">{t('fhLastReminder')}: {fmtDate(r.lastReminderAt)}</small>}</td>
                          </tr>
                          {open === r.customer._id && (
                            <tr>
                              <td colSpan={7}>
                                <ul className="plain-list">{r.installments.map((i, k) => <li key={k}><span>{i.chargeNo}{i.no ? ` · ${t('fhInstallment')} ${i.no}` : ''} — {i.description}</span><span>{i.dueDate ? fmtDay(i.dueDate) : '—'} {i.late && <Pill tone="warn">{i.daysLate} {t('fhDays')}</Pill>}</span><Money amount={i.remaining} currency={i.currency} strong /></li>)}</ul>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </Loading>
    </>
  );
}

function MonthClose() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [key, setKey] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const state = useLoad(`/api/v2/finance/periods/${key}/check`, [key]);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const close = (e) => {
    e.preventDefault();
    run(() => api(`/api/v2/finance/periods/${key}`, { method: 'POST', body: { status: 'closed', reason } })).then(() => { setConfirm(false); state.reload(); }).catch(() => {});
  };
  return (
    <Loading state={state}>
      {(d) => {
        const blocked = d.checks.some((c) => c.blocking && c.count > 0);
        return (
          <>
            <div className="page-head">
              <input type="month" value={key} onChange={(e) => setKey(e.target.value)} />
              <div className="row">
                <Pill tone={d.status === 'closed' ? 'muted' : 'ok'}>{d.status === 'closed' ? t('closed') : t('open')}</Pill>
                <PrintButton what="month_close" title={`${t('fhClose')} ${key}`} filters={{ key }} />
              </div>
            </div>
            <PrintHeader title={`${t('fhClose')} ${key}`} />
            <section className="card">
              <h2>{t('fhChecklist')}</h2>
              <ul className="plain-list checklist">
                {d.checks.map((c) => (
                  <li key={c.id}>
                    <span>{c.count === 0 ? '✓' : c.blocking ? '✗' : '!'} {t(`fhCheck_${c.id}`)}</span>
                    {c.count === 0 ? <Pill tone="ok">{t('fhCheckOk')}</Pill> : <Link to={c.link}><Pill tone={c.blocking ? 'warn' : 'gold'}>{c.count}</Pill></Link>}
                  </li>
                ))}
              </ul>
              {d.status !== 'closed' && can('accounts.approve', 'all') && (
                <div className="row">
                  <button type="button" className="btn btn--primary" disabled={blocked} onClick={() => setConfirm(true)}>{t('closePeriod')} {key}</button>
                  {blocked && <small className="late">{t('fhCloseBlocked')}</small>}
                </div>
              )}
            </section>
            <section className="card">
              <h2>{t('perCurrencyTitle')}</h2>
              {!d.totals.length ? <p className="muted">{t('noData')}</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('currency')}</th><th>{t('collected')}</th><th>{t('refunds')}</th><th>{t('expensesTotal')}</th><th>{t('commissionsNav')}</th><th>{t('netTotal')}</th></tr></thead>
                    <tbody>{d.totals.map((x) => <tr key={x.currency}><td dir="ltr"><strong>{x.currency}</strong></td><td><Money amount={x.collected} currency={x.currency} /></td><td><Money amount={x.refunded} currency={x.currency} /></td><td><Money amount={x.expenses} currency={x.currency} /></td><td><Money amount={x.commissions} currency={x.currency} /></td><td><Money amount={x.net} currency={x.currency} strong /></td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="card">
              <h2>{t('fhBalances')}</h2>
              <ul className="plain-list">{d.accounts.map((a) => <li key={a._id}><span>{a.nameAr} <small className="muted" dir="ltr">{a.code}</small></span><Money amount={a.balance} currency={a.currency} strong /></li>)}</ul>
            </section>
            {confirm && (
              <Modal title={`${t('closePeriod')} ${key}`} onClose={() => setConfirm(false)}>
                <form className="stack" onSubmit={close}>
                  <p className="muted">{t('fhCloseHint')}</p>
                  <Field label={t('reason')}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                  <ErrorBox error={error} />
                  <div className="row"><button className="btn btn--primary" disabled={busy}>{t('closePeriod')}</button><button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>{t('cancel')}</button></div>
                </form>
              </Modal>
            )}
          </>
        );
      }}
    </Loading>
  );
}

const TABS = [
  { key: 'today', label: 'fhTodayTab' },
  { key: 'receivables', label: 'fhReceivables' },
  { key: 'payments', label: 'paymentsNav' },
  { key: 'approvals', label: 'approvalsNav' },
  { key: 'expenses', label: 'expensesNav' },
  { key: 'accounts', label: 'accountsNav' },
  { key: 'summary', label: 'financeSummary' },
  { key: 'close', label: 'fhClose' },
  { key: 'currencies', label: 'currenciesNav' }
];

export default function FinanceHub() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((x) => x.key === params.get('tab')) ? params.get('tab') : 'today';
  const go = (key, state) => setParams(state ? { tab: key, state } : { tab: key });
  return (
    <>
      <h1 className="page-title no-print">{t('fhTitle')}</h1>
      <div className="tabs" role="tablist">
        {TABS.map((x) => <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={`tab${tab === x.key ? ' active' : ''}`} onClick={() => go(x.key)}>{t(x.label)}</button>)}
      </div>
      <div className="hub-body">
        {tab === 'today' && <Today go={go} />}
        {tab === 'receivables' && <Receivables key={params.get('state') || 'overdue'} initial={params.get('state') || 'overdue'} />}
        {tab === 'payments' && <Payments />}
        {tab === 'approvals' && <Approvals />}
        {tab === 'expenses' && <Expenses />}
        {tab === 'accounts' && <Accounts />}
        {tab === 'summary' && <FinanceSummary />}
        {tab === 'close' && <MonthClose />}
        {tab === 'currencies' && <Currencies />}
      </div>
    </>
  );
}
