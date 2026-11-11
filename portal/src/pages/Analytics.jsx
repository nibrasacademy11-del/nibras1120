import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { Loading, useLoad } from '../components/ui.jsx';
import { PrintButton, PrintHeader } from '../components/Print.jsx';
import { Amounts } from './Finance.jsx';

const iso = (d) => d.toISOString().slice(0, 10);

function Kpi({ label, value, change, money, base, to }) {
  const body = (
    <>
      <small>{label}</small>
      <strong>{money ? <Amounts list={value} /> : (value ?? '—')}</strong>
      {change !== undefined && change !== null && <small className={change >= 0 ? 'ok' : 'warn'} dir="ltr">{change >= 0 ? '▲' : '▼'} {Math.abs(change)}%</small>}
    </>
  );
  return to ? <Link to={to} className="card stat stat--link">{body}</Link> : <div className="card stat">{body}</div>;
}

function Bars({ rows, labelOf, valueOf, money, base }) {
  const max = Math.max(1, ...rows.map(valueOf));
  if (!rows.length) return <p className="muted">—</p>;
  return (
    <ul className="hbars">
      {rows.map((r, i) => (
        <li key={i}>
          <span className="hbar-label">{labelOf(r) || '—'}</span>
          <span className="bar"><span className="bar-fill" style={{ width: `${(valueOf(r) / max) * 100}%` }} /></span>
          <strong>{valueOf(r)}</strong>
        </li>
      ))}
    </ul>
  );
}

export default function Analytics() {
  const { t, en } = useI18n();
  const [range, setRange] = useState({ from: iso(new Date(Date.now() - 30 * 864e5)), to: iso(new Date()) });
  const state = useLoad(`/api/v2/analytics?from=${range.from}&to=${range.to}`);
  return (
    <>
      <div className="page-head no-print">
        <h1 className="page-title">{t('analyticsNav')}</h1>
        <div className="row">
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          <PrintButton what="analytics" title={t('analyticsNav')} filters={range} />
        </div>
      </div>
      <PrintHeader title={t('analyticsNav')} subtitle={`${range.from} → ${range.to}`} />
      <Loading state={state}>
        {(d) => (
          <>
            <p className="muted no-print">{t('comparedWithPrevious')}</p>
            <div className="grid grid--4">
              <Kpi label={t('newCustomers')} value={d.kpis.newCustomers.value} change={d.kpis.newCustomers.change} to="/customers" />
              <Kpi label={t('enrollmentsNav')} value={d.kpis.enrollments.value} change={d.kpis.enrollments.change} to="/enrollments" />
              <Kpi label={t('collected')} value={d.kpis.collected.value} change={d.kpis.collected.change} money />
              <Kpi label={t('conversion')} value={`${d.kpis.conversionRate}%`} />
              <Kpi label={t('outstanding')} value={d.kpis.outstanding} money />
              <Kpi label={t('refunds')} value={d.kpis.refunds} money />
              <Kpi label={t('commissionsNav')} value={d.kpis.commissions} money />
              <Kpi label={t('staleLeads')} value={d.kpis.staleLeads} to="/customers?noFollowUpDays=7" />
              <Kpi label={t('complaintsOpen')} value={d.kpis.complaintsOpen} to="/complaints" />
              <Kpi label={t('satisfactionAvg')} value={d.kpis.satisfaction ? `${d.kpis.satisfaction.avg} / 5 (${d.kpis.satisfaction.count})` : '—'} />
            </div>
            <div className="grid grid--2">
              <section className="card"><h2>{t('bySource')}</h2><Bars rows={d.bySource} labelOf={(r) => `${en('source', r._id)} (${r.n ? Math.round((r.converted * 100) / r.n) : 0}% ${t('conversion')})`} valueOf={(r) => r.n} /></section>
              <section className="card"><h2>{t('byCountry')}</h2><Bars rows={d.byCountry} labelOf={(r) => r._id} valueOf={(r) => r.n} /></section>
              <section className="card"><h2>{t('topPrograms')}</h2><Bars rows={d.topPrograms} labelOf={(r) => r._id} valueOf={(r) => r.n} /></section>
              <section className="card"><h2>{t('byCurrencyTitle')}</h2><Bars rows={d.byCurrency} labelOf={(r) => `${Number(r.amount).toLocaleString('en-US')} ${r._id}`} valueOf={(r) => r.n} /></section>
              <section className="card">
                <h2>{t('modules')}</h2>
                <Bars rows={[['done', d.modules.done], ['review', d.modules.review], ['inProgress', d.modules.inProgress], ['notStarted', d.modules.notStarted], ['rejected', d.modules.rejected]]} labelOf={(r) => t(`ms_${r[0]}`)} valueOf={(r) => r[1]} />
              </section>
              <section className="card"><h2>{t('lostReasonsTitle')}</h2><Bars rows={d.lostReasons} labelOf={(r) => r._id} valueOf={(r) => r.n} /></section>
            </div>
            <section className="card">
              <h2>{t('newCustomersTrend')}</h2>
              <div className="trend">
                {d.trend.map((p) => {
                  const max = Math.max(1, ...d.trend.map((x) => x.n));
                  return <span key={p._id} title={`${p._id}: ${p.n}`} style={{ height: `${(p.n / max) * 100}%` }} />;
                })}
              </div>
            </section>
          </>
        )}
      </Loading>
    </>
  );
}
