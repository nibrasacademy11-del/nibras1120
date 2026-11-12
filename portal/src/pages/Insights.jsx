import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { Loading, useLoad } from '../components/ui.jsx';
import { BrandBand } from '../components/Print.jsx';
import { Amounts, Money } from './Finance.jsx';

// The owner's analytics: everything the system records, for a period the owner picks,
// compared with the period of the same length just before it.

const day = (d) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
};
function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    last7: [day(new Date(now.getTime() - 6 * 864e5)), day(now)],
    thisMonth: [day(new Date(y, m, 1)), day(now)],
    lastMonth: [day(new Date(y, m - 1, 1)), day(new Date(y, m, 0))],
    last3: [day(new Date(y, m - 2, 1)), day(now)],
    thisYear: [day(new Date(y, 0, 1)), day(now)],
    lastYear: [day(new Date(y - 1, 0, 1)), day(new Date(y - 1, 11, 31))]
  };
}
const PRESET_KEYS = ['last7', 'thisMonth', 'lastMonth', 'last3', 'thisYear', 'lastYear'];

// Change against the previous period, as a small coloured tag
function Delta({ now, before, invert }) {
  const { t } = useI18n();
  if (before === null || before === undefined || now === null || now === undefined) return null;
  if (!before && !now) return null;
  if (!before) return <span className="delta delta--up">{t('in_new')}</span>;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (pct === 0) return <span className="delta">0%</span>;
  const good = invert ? pct < 0 : pct > 0;
  return <span className={`delta ${good ? 'delta--up' : 'delta--down'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}
const amountOf = (list, c) => (list || []).find((x) => x.currency === c)?.amount || 0;
const mainOf = (...lists) => {
  const all = lists.flat().filter(Boolean);
  if (all.some((x) => x.currency === 'EGP')) return 'EGP';
  return all[0]?.currency || 'EGP';
};

function Kpi({ label, children, delta, hint }) {
  return (
    <div className="card stat kpi">
      <small>{label}</small>
      <strong>{children}</strong>
      <div className="kpi-foot">{delta}{hint && <small className="muted">{hint}</small>}</div>
    </div>
  );
}

// Horizontal bars: rows [{ label, value, extra }]
function Bars({ rows, format = (v) => v, empty }) {
  const { t } = useI18n();
  if (!rows.length) return <p className="muted">{empty || t('in_none')}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="hbars">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`}>
          <span className="hbar-label" title={r.label}>{r.label}</span>
          <span className="bar"><span className="bar-fill grow-x" style={{ width: `${(r.value / max) * 100}%`, animationDelay: `${i * 40}ms` }} /></span>
          <span className="nowrap">{format(r.value, r)}{r.extra ? <small className="muted"> {r.extra}</small> : null}</span>
        </li>
      ))}
    </ul>
  );
}

function Trend({ rows, currency, unit }) {
  const { t } = useI18n();
  const pts = rows.filter((r) => r.currency === currency);
  if (!pts.length) return <p className="muted">{t('in_none')}</p>;
  const max = Math.max(...pts.map((r) => r.amount), 1);
  return (
    <>
      <div className="trend trend--tall" role="img" aria-label={t('in_trend')}>
        {pts.map((r, i) => <span key={r.d} className="grow-y" style={{ height: `${Math.max(2, (r.amount / max) * 100)}%`, animationDelay: `${i * 15}ms` }} title={`${r.d}: ${r.amount.toLocaleString('en-US')} ${currency}`} />)}
      </div>
      <div className="trend-axis"><small dir="ltr">{pts[0].d}</small><small className="muted">{t(unit === 'month' ? 'in_byMonth' : 'in_byDay')}</small><small dir="ltr">{pts[pts.length - 1].d}</small></div>
    </>
  );
}

export default function Insights() {
  const { t, en } = useI18n();
  const [params, setParams] = useSearchParams();
  const p = useMemo(presets, []);
  const preset = PRESET_KEYS.includes(params.get('p')) ? params.get('p') : (params.get('from') ? null : 'thisMonth');
  const from = params.get('from') || (preset ? p[preset][0] : p.thisMonth[0]);
  const to = params.get('to') || (preset ? p[preset][1] : p.thisMonth[1]);
  const [custom, setCustom] = useState({ from, to });
  const state = useLoad(`/api/v2/insights?from=${from}&to=${to}`, [from, to]);

  return (
    <>
      <div className="page-head no-print">
        <div>
          <h1 className="page-title">{t('insightsNav')}</h1>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => window.print()}>{t('printPdf')}</button>
      </div>
      <section className="card period-bar no-print">
        <div className="chips">
          {PRESET_KEYS.map((k) => <button key={k} type="button" className={`chip${preset === k ? ' chip--on' : ''}`} onClick={() => { setCustom({ from: p[k][0], to: p[k][1] }); setParams({ p: k }); }}>{t(`in_p_${k}`)}</button>)}
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); setParams({ from: custom.from, to: custom.to }); }}>
          <label className="row">{t('in_from')} <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
          <label className="row">{t('in_to')} <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          <button className="btn btn--primary btn--small">{t('in_show')}</button>
        </form>
      </section>
      <Loading state={state}>
        {(d) => {
          const mm = d.money;
          const main = mainOf(mm.collected, mm.expenses);
          return (
            <div className="fade-in">
              <div className="print-only"><BrandBand title={t('insightsNav')} subtitle={`${t('in_from')} ${d.from} ${t('in_to')} ${d.to}`} /></div>
              <p className="muted period-note">{t('in_from')} <bdi>{d.from}</bdi> {t('in_to')} <bdi>{d.to}</bdi> · {d.days} {t('in_days')} · {t('in_comparedWith')} {t('in_from')} <bdi>{d.prevFrom}</bdi> {t('in_to')} <bdi>{d.prevTo}</bdi></p>

              <div className="grid grid--4 stagger">
                <Kpi label={t('in_collected')} delta={<Delta now={amountOf(mm.collected, main)} before={amountOf(mm.collectedPrev, main)} />}><Amounts list={mm.collected} /></Kpi>
                <Kpi label={t('in_expenses')} delta={<Delta now={amountOf(mm.expenses, main)} before={amountOf(mm.expensesPrev, main)} invert />}><Amounts list={mm.expenses} /></Kpi>
                <Kpi label={t('in_net')} delta={<Delta now={amountOf(mm.net, main)} before={amountOf(mm.netPrev, main)} />}><Amounts list={mm.net} /></Kpi>
                <Kpi label={t('in_owedNow')} hint={`${t('in_overdue')}: ${mm.lateCustomersNow}`}><Amounts list={mm.owedNow} /></Kpi>
                <Kpi label={t('in_leads')} delta={<Delta now={d.sales.leads} before={d.sales.leadsPrev} />}>{d.sales.leads}</Kpi>
                <Kpi label={t('in_conversion')} delta={<Delta now={d.sales.conversion} before={d.sales.conversionPrev} />}>{d.sales.conversion}%</Kpi>
                <Kpi label={t('in_enrolled')} delta={<Delta now={d.learning.enrolled} before={d.learning.enrolledPrev} />}>{d.learning.enrolled}</Kpi>
                <Kpi label={t('in_certificates')} delta={<Delta now={d.learning.certificatesTotal} before={d.learning.certificatesPrev} />}>{d.learning.certificatesTotal}</Kpi>
              </div>

              <h2 className="section-title">{t('in_sec_money')}</h2>
              <div className="grid grid--2">
                <section className="card"><h2>{t('in_trend')} <small className="muted">({main})</small></h2><Trend rows={mm.trend} currency={main} unit={mm.trendUnit} /></section>
                <section className="card"><h2>{t('in_byProgram')}</h2><Bars rows={mm.byProgram.filter((r) => r.currency === main).map((r) => ({ label: r.key, value: r.amount }))} format={(v) => <Money amount={v} currency={main} />} /></section>
                <section className="card"><h2>{t('in_byMethod')}</h2><Bars rows={mm.byMethod.filter((r) => r.currency === main).map((r) => ({ label: en('payMethod', r.key), value: r.amount, extra: `(${r.n})` }))} format={(v) => <Money amount={v} currency={main} />} /></section>
                <section className="card"><h2>{t('in_byAccount')}</h2><Bars rows={mm.byAccount.map((r) => ({ label: r.key, value: r.amount, c: r.currency }))} format={(v, r) => <Money amount={v} currency={r.c} />} /></section>
                <section className="card"><h2>{t('in_byCategory')}</h2><Bars rows={mm.byCategory.map((r) => ({ label: r.key, value: r.amount, c: r.currency }))} format={(v, r) => <Money amount={v} currency={r.c} />} /></section>
                <section className="card">
                  <h2>{t('in_moreMoney')}</h2>
                  <ul className="plain-list">
                    <li><span>{t('in_refunds')}</span><Amounts list={mm.refunds} /></li>
                    <li><span>{t('in_commissions')}</span><Amounts list={mm.commissions} /></li>
                    <li><span>{t('in_overdueNow')}</span><Amounts list={mm.overdueNow} /></li>
                    <li><span>{t('in_payroll')}</span><Amounts list={d.staff.payroll} /></li>
                  </ul>
                </section>
              </div>

              <h2 className="section-title">{t('in_sec_sales')}</h2>
              <div className="grid grid--2">
                <section className="card"><h2>{t('in_bySource')}</h2><Bars rows={d.sales.bySource.map((r) => ({ label: en('source', r.key), value: r.n, extra: `· ${t('in_won')} ${r.won}` }))} /></section>
                <section className="card">
                  <h2>{t('in_byEmployee')}</h2>
                  {!d.sales.byEmployee.length ? <p className="muted">{t('in_none')}</p> : (
                    <div className="table-wrap"><table className="table">
                      <thead><tr><th>{t('in_employee')}</th><th>{t('in_leads')}</th><th>{t('in_won')}</th><th>{t('in_collected')}</th></tr></thead>
                      <tbody>{d.sales.byEmployee.map((r, i) => <tr key={i}><td>{r.name || t('unassigned')}</td><td>{r.n}</td><td>{r.won}</td><td><Amounts list={r.collected} /></td></tr>)}</tbody>
                    </table></div>
                  )}
                </section>
                <section className="card"><h2>{t('in_byCountry')}</h2><Bars rows={d.sales.byCountry.map((r) => ({ label: r.key, value: r.n }))} /></section>
                <section className="card"><h2>{t('in_lost')} <small className="muted">({d.sales.lost})</small></h2><Bars rows={d.sales.lostReasons.map((r) => ({ label: r.key, value: r.n }))} /></section>
              </div>

              <h2 className="section-title">{t('in_sec_learning')}</h2>
              <div className="grid grid--4 stagger">
                <Kpi label={t('in_lectures')}>{d.learning.lecturesHeld}</Kpi>
                <Kpi label={t('in_lectureAttendance')}>{d.learning.lectureAttendanceRate === null ? '—' : `${d.learning.lectureAttendanceRate}%`}</Kpi>
                <Kpi label={t('in_completed')}>{d.learning.completed}</Kpi>
                <Kpi label={t('in_paperDelivered')} hint={`${t('in_activeGroups')}: ${d.learning.activeGroups}`}>{d.learning.paperDelivered}</Kpi>
              </div>
              <section className="card"><h2>{t('in_enrolledByProgram')}</h2><Bars rows={d.learning.byProgram.map((r) => ({ label: r.key, value: r.n }))} /></section>

              <h2 className="section-title">{t('in_sec_service')}</h2>
              <div className="grid grid--4 stagger">
                <Kpi label={t('in_complaints')} delta={<Delta now={d.service.opened} before={d.service.openedPrev} invert />}>{d.service.opened}</Kpi>
                <Kpi label={t('in_resolved')}>{d.service.resolved}</Kpi>
                <Kpi label={t('in_resolveTime')}>{d.service.avgResolveHours === null ? '—' : `${d.service.avgResolveHours} ${t('in_hours')}`}</Kpi>
                <Kpi label={t('in_satisfaction')} hint={d.service.satisfaction ? `${d.service.satisfaction.n} ${t('in_ratings')}` : ''}>{d.service.satisfaction ? `${d.service.satisfaction.avg} / 5` : '—'}</Kpi>
              </div>
              <section className="card"><h2>{t('in_complaintTypes')} <small className="muted">· {t('in_openNow')} {d.service.openNow}</small></h2><Bars rows={d.service.byCategory.map((r) => ({ label: t(`cc_${r.key}`), value: r.n }))} /></section>

              <h2 className="section-title">{t('in_sec_staff')}</h2>
              <div className="grid grid--4 stagger">
                <Kpi label={t('in_staffAttendance')} hint={`${t('in_headcount')}: ${d.staff.headcount}`}>{d.staff.attendanceRate === null ? '—' : `${d.staff.attendanceRate}%`}</Kpi>
                <Kpi label={t('in_absentLate')} hint={`${t('in_lateMin')}: ${d.staff.lateMinutes}`}>{d.staff.absentDays}</Kpi>
                <Kpi label={t('in_tasksOnTime')} hint={`${t('in_tasksDone')}: ${d.staff.tasksDone} · ${t('in_overdueNowTasks')}: ${d.staff.tasksOverdueNow}`}>{d.staff.tasksOnTimeRate === null ? '—' : `${d.staff.tasksOnTimeRate}%`}</Kpi>
                <Kpi label={t('in_reviewAvg')}>{d.staff.reviewAverage === null ? '—' : `${d.staff.reviewAverage} / 5`}</Kpi>
              </div>
              <div className="grid grid--2">
                <section className="card">
                  <h2>{t('in_attendanceByPerson')}</h2>
                  {!d.staff.people.length ? <p className="muted">{t('in_none')}</p> : (
                    <div className="table-wrap"><table className="table">
                      <thead><tr><th>{t('in_employee')}</th><th>{t('in_present')}</th><th>{t('in_absent')}</th><th>{t('in_lateMin')}</th><th>{t('in_leave')}</th></tr></thead>
                      <tbody>{d.staff.people.map((r) => <tr key={r.user}><td>{r.name}</td><td>{r.present}/{r.workingDays}</td><td className={r.absent ? 'late' : ''}>{r.absent}</td><td className={r.lateMinutes ? 'late' : ''}>{r.lateMinutes}</td><td>{r.leave}</td></tr>)}</tbody>
                    </table></div>
                  )}
                </section>
                <section className="card"><h2>{t('in_reviewsByPerson')}</h2><Bars rows={d.staff.reviews.map((r) => ({ label: r.name, value: r.avg, extra: `(${r.n})` }))} format={(v) => `${v} / 5`} /></section>
              </div>
              <p className="muted no-print"><small>{t('in_footnote')}</small></p>
            </div>
          );
        }}
      </Loading>
    </>
  );
}
