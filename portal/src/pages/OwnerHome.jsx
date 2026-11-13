import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Loading, useLoad } from '../components/ui.jsx';
import { BrandBand } from '../components/Print.jsx';
import { Columns, Donut, Funnel, HBars, LineChart, Ring, SLOTS, Sparkline, StackedRows } from '../components/Charts.jsx';
import { Amounts } from './Finance.jsx';

// The owner's home page: what waits for a decision, then every number of the academy for the
// period picked at the top, each next to the period of the same length before it.

const day = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function presets() {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
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
const money = (c) => (v) => `${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${c}`;
const amountOf = (list, c) => (list || []).find((x) => x.currency === c)?.amount || 0;

function Delta({ now, before, invert }) {
  const { t } = useI18n();
  if (before === null || before === undefined || (!before && !now)) return null;
  if (!before) return <span className="delta delta--up">{t('in_new')}</span>;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (!pct) return <span className="delta">0%</span>;
  return <span className={`delta ${(invert ? pct < 0 : pct > 0) ? 'delta--up' : 'delta--down'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}

function Tile({ label, color, icon, children, delta, hint, spark }) {
  return (
    <div className="card stat kpi kpi-tile" style={{ '--tile': color }}>
      <span className="kpi-icon" aria-hidden="true">{icon}</span>
      <small>{label}</small>
      <strong>{children}</strong>
      <div className="kpi-foot">{delta}{hint && <small className="muted">{hint}</small>}</div>
      {spark && <Sparkline points={spark} color={color} />}
    </div>
  );
}

function Attention({ a }) {
  const { t } = useI18n();
  const items = [
    ['/approvals', 'oh_att_payments', a.payments + a.approvals + a.refunds, 'hot'],
    ['/tasks', 'oh_att_tasks', a.tasksOverdue, 'warm'],
    ['/complaints', 'oh_att_complaints', a.complaintsOpen, 'warm'],
    ['/leaves', 'oh_att_leaves', a.leaves, 'warm'],
    ['/performance', 'oh_att_reviews', a.reviewsDraft, '']
  ];
  return (
    <div className="attention">
      {items.map(([to, key, n, tone]) => <Link key={key} to={to} className={n ? `is-${tone}` : ''}><b>{n}</b>{t(key)}</Link>)}
    </div>
  );
}

export default function OwnerHome() {
  const { t, en } = useI18n();
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const p = useMemo(presets, []);
  const preset = PRESET_KEYS.includes(params.get('p')) ? params.get('p') : (params.get('from') ? null : 'thisMonth');
  const from = params.get('from') || p[preset || 'thisMonth'][0];
  const to = params.get('to') || p[preset || 'thisMonth'][1];
  const [custom, setCustom] = useState({ from, to });
  const state = useLoad(`/api/v2/insights?from=${from}&to=${to}`, [from, to]);

  return (
    <>
      <div className="oh-head no-print">
        <div>
          <h1 className="page-title">{t('dbOwnerTitle')}</h1>
          <p className="muted" style={{ margin: 0 }}>{t('welcome')}، {me.user.name.split(' ')[0]}</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => window.print()}>{t('printPdf')}</button>
      </div>
      <section className="card period-bar no-print">
        <div className="chips">
          {PRESET_KEYS.map((k) => <button key={k} type="button" className={`chip${preset === k ? ' chip--on' : ''}`} onClick={() => { setCustom({ from: p[k][0], to: p[k][1] }); setParams({ p: k }); }}>{t(`in_p_${k}`)}</button>)}
        </div>
        <form className="oh-period" onSubmit={(e) => { e.preventDefault(); setParams({ from: custom.from, to: custom.to }); }}>
          <label className="row">{t('in_from')} <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
          <label className="row">{t('in_to')} <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          <button className="btn btn--primary btn--small">{t('in_show')}</button>
        </form>
      </section>
      <Loading state={state}>
        {(d) => {
          const mm = d.money; const s = d.sales; const l = d.learning; const sv = d.service; const st = d.staff;
          const main = [...mm.collected, ...mm.expenses].some((x) => x.currency === 'EGP') ? 'EGP' : (mm.collected[0]?.currency || 'EGP');
          const fm = money(main);
          const flow = mm.trend.filter((x) => x.currency === main).map((x) => ({ d: x.d, v: x.amount }));
          const out = mm.expenseTrend.filter((x) => x.currency === main).map((x) => ({ d: x.d, v: x.amount }));
          const funnel = s.funnel || {};
          const registered = Object.values(funnel).reduce((a, b) => a + b, 0);
          return (
            <>
              <div className="print-only"><BrandBand title={t('dbOwnerTitle')} subtitle={`${t('in_from')} ${d.from} ${t('in_to')} ${d.to}`} /></div>
              <Attention a={d.attention} />
              <p className="muted period-note">{t('in_from')} <bdi>{d.from}</bdi> {t('in_to')} <bdi>{d.to}</bdi> · {d.days} {t('in_days')} · {t('in_comparedWith')} {t('in_from')} <bdi>{d.prevFrom}</bdi> {t('in_to')} <bdi>{d.prevTo}</bdi></p>

              <div className="grid grid--4 stagger">
                <Tile label={t('in_collected')} color="var(--s1)" icon="↓" spark={flow} delta={<Delta now={amountOf(mm.collected, main)} before={amountOf(mm.collectedPrev, main)} />}><Amounts list={mm.collected} /></Tile>
                <Tile label={t('in_expenses')} color="var(--s2)" icon="↑" spark={out} delta={<Delta now={amountOf(mm.expenses, main)} before={amountOf(mm.expensesPrev, main)} invert />}><Amounts list={mm.expenses} /></Tile>
                <Tile label={t('in_net')} color="var(--s3)" icon="=" delta={<Delta now={amountOf(mm.net, main)} before={amountOf(mm.netPrev, main)} />}><Amounts list={mm.net} /></Tile>
                <Tile label={t('in_owedNow')} color="var(--s8)" icon="!" hint={`${t('in_overdue')}: ${mm.lateCustomersNow}`}><Amounts list={mm.owedNow} /></Tile>
                <Tile label={t('in_leads')} color="var(--s7)" icon="+" spark={s.trend} delta={<Delta now={s.leads} before={s.leadsPrev} />}>{s.leads}</Tile>
                <Tile label={t('in_conversion')} color="var(--s6)" icon="%" delta={<Delta now={s.conversion} before={s.conversionPrev} />}>{s.conversion}%</Tile>
                <Tile label={t('in_enrolled')} color="var(--s4)" icon="✎" spark={l.trend} delta={<Delta now={l.enrolled} before={l.enrolledPrev} />}>{l.enrolled}</Tile>
                <Tile label={t('in_certificates')} color="var(--s5)" icon="✪" delta={<Delta now={l.certificatesTotal} before={l.certificatesPrev} />}>{l.certificatesTotal}</Tile>
              </div>

              <h2 className="section-title">{t('in_sec_money')}</h2>
              <div className="grid grid--3c">
                <section className="card chart-card span-2"><h2>{t('oh_inOut')} <small className="muted">({main})</small></h2><LineChart series={[{ name: t('in_collected'), color: 'var(--s1)', points: flow }, { name: t('in_expenses'), color: 'var(--s2)', points: out }]} format={fm} empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('in_byMethod')}</h2><Donut items={mm.byMethod.filter((r) => r.currency === main).map((r) => ({ label: en('payMethod', r.key), value: r.amount }))} format={fm} centerLabel={main} empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('in_byProgram')}</h2><HBars rows={mm.byProgram.filter((r) => r.currency === main).map((r) => ({ label: r.key, value: r.amount }))} format={fm} empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('in_byCategory')}</h2><Donut items={mm.byCategory.filter((r) => r.currency === main).map((r) => ({ label: r.key, value: r.amount }))} format={fm} centerLabel={t('in_expenses')} empty={t('in_none')} /></section>
                <section className="card chart-card">
                  <h2>{t('oh_moneyNow')}</h2>
                  <ul className="plain-list">
                    <li><span>{t('oh_dueNext30')}</span><Amounts list={mm.dueNext30} /></li>
                    <li><span>{t('in_overdueNow')}</span><Amounts list={mm.overdueNow} /></li>
                    <li><span>{t('oh_pendingPayments')}</span><Amounts list={mm.pending} /></li>
                    <li><span>{t('in_refunds')}</span><Amounts list={mm.refunds} /></li>
                    <li><span>{t('in_commissions')}</span><Amounts list={mm.commissions} /></li>
                    <li><span>{t('in_payroll')}</span><Amounts list={st.payroll} /></li>
                  </ul>
                </section>
                <section className="card chart-card"><h2>{t('in_byAccount')}</h2><HBars rows={mm.byAccount.map((r, i) => ({ label: r.key, value: r.amount, display: money(r.currency)(r.amount), color: SLOTS[i % 8] }))} empty={t('in_none')} /></section>
                <section className="card chart-card">
                  <h2>{t('oh_topCustomers')}</h2>
                  {!mm.topCustomers.length ? <p className="muted">{t('in_none')}</p> : (
                    <ol className="top-list">{mm.topCustomers.map((c, i) => <li key={`${c.id}-${c.currency}`}><span className="rank">{i + 1}</span><span><Link to={`/customers/${c.id}`}>{c.name}</Link><br /><small className="muted">{c.customerNo} · {c.n} {t('oh_payments')}</small></span><b className="nowrap">{money(c.currency)(c.amount)}</b></li>)}</ol>
                  )}
                </section>
              </div>

              <h2 className="section-title">{t('in_sec_sales')}</h2>
              <div className="grid grid--3c">
                <section className="card chart-card"><h2>{t('oh_funnel')}</h2><Funnel steps={[{ label: t('oh_f_registered'), value: registered }, { label: t('oh_f_interested'), value: (funnel.interested || 0) + (funnel.customer || 0) }, { label: t('oh_f_customers'), value: funnel.customer || 0 }]} empty={t('in_none')} /></section>
                <section className="card chart-card span-2"><h2>{t('oh_newCustomersTrend')}</h2><Columns points={s.trend} color="var(--s7)" name={t('in_leads')} empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('in_bySource')}</h2><HBars rows={s.bySource.map((r, i) => ({ label: en('source', r.key), value: r.n, display: `${r.n} · ${t('in_won')} ${r.won}`, color: SLOTS[i % 8] }))} empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('oh_statusNow')}</h2><Donut items={['lead', 'interested', 'customer', 'lost', 'inactive'].map((k) => ({ label: en('status', k), value: s.statusNow?.[k] || 0 }))} centerLabel={t('oh_allCustomers')} empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('in_byCountry')}</h2><HBars rows={s.byCountry.map((r) => ({ label: r.key, value: r.n }))} color="var(--s3)" empty={t('in_none')} /></section>
                <section className="card chart-card span-2">
                  <h2>{t('in_byEmployee')}</h2>
                  {!s.byEmployee.length ? <p className="muted">{t('in_none')}</p> : (
                    <div className="table-wrap"><table className="table">
                      <thead><tr><th>{t('in_employee')}</th><th>{t('in_leads')}</th><th>{t('in_won')}</th><th>{t('in_conversion')}</th><th>{t('in_collected')}</th></tr></thead>
                      <tbody>{s.byEmployee.map((r, i) => <tr key={i}><td><strong>{r.name || t('unassigned')}</strong></td><td>{r.n}</td><td>{r.won}</td><td>{r.n ? Math.round((r.won / r.n) * 100) : 0}%</td><td><Amounts list={r.collected} /></td></tr>)}</tbody>
                    </table></div>
                  )}
                </section>
                <section className="card chart-card"><h2>{t('in_lost')} <small className="muted">({s.lost})</small></h2><HBars rows={s.lostReasons.map((r) => ({ label: r.key, value: r.n }))} color="var(--s8)" empty={t('in_none')} /></section>
              </div>

              <h2 className="section-title">{t('in_sec_learning')}</h2>
              <div className="grid grid--3c">
                <section className="card chart-card"><h2>{t('oh_rates')}</h2><div className="rings"><Ring value={l.lectureAttendanceRate} label={t('in_lectureAttendance')} color="var(--s3)" /><Ring value={st.attendanceRate} label={t('in_staffAttendance')} color="var(--s1)" /><Ring value={st.tasksOnTimeRate} label={t('in_tasksOnTime')} color="var(--s7)" /></div></section>
                <section className="card chart-card span-2"><h2>{t('oh_enrollTrend')}</h2><Columns points={l.trend} color="var(--s4)" name={t('in_enrolled')} empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('in_enrolledByProgram')}</h2><HBars rows={l.byProgram.map((r) => ({ label: r.key, value: r.n }))} color="var(--s4)" empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('oh_groupAttendance')}</h2><HBars rows={(l.byGroup || []).map((r) => ({ label: r.key, value: r.rate, display: `${r.rate}%` }))} max={100} color="var(--s3)" empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('oh_paper')}</h2><Donut items={['none', 'printed', 'ready', 'shipped', 'delivered'].map((k) => ({ label: t(`oh_paper_${k}`), value: l.paper?.[k] || 0 }))} centerLabel={t('in_certificates')} empty={t('in_none')} /></section>
              </div>

              <h2 className="section-title">{t('in_sec_service')}</h2>
              <div className="grid grid--4 stagger">
                <Tile label={t('in_complaints')} color="var(--s8)" icon="✉" delta={<Delta now={sv.opened} before={sv.openedPrev} invert />}>{sv.opened}</Tile>
                <Tile label={t('in_resolved')} color="var(--s6)" icon="✓">{sv.resolved}</Tile>
                <Tile label={t('in_resolveTime')} color="var(--s4)" icon="◷">{sv.avgResolveHours === null ? '—' : `${sv.avgResolveHours} ${t('in_hours')}`}</Tile>
                <Tile label={t('in_satisfaction')} color="var(--s5)" icon="★" hint={sv.satisfaction ? `${sv.satisfaction.n} ${t('in_ratings')}` : ''}>{sv.satisfaction ? `${sv.satisfaction.avg} / 5` : '—'}</Tile>
              </div>
              <div className="grid grid--2">
                <section className="card chart-card"><h2>{t('in_complaintTypes')}</h2><HBars rows={sv.byCategory.map((r, i) => ({ label: t(`cc_${r.key}`), value: r.n, color: SLOTS[i % 8] }))} empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('oh_complaintStatus')}</h2><Donut items={['open', 'in_progress', 'resolved', 'closed'].map((k) => ({ label: t(`cs2_${k}`), value: sv.byStatus?.[k] || 0 }))} centerLabel={t('in_complaints')} empty={t('in_none')} /></section>
              </div>

              <h2 className="section-title">{t('in_sec_staff')}</h2>
              <div className="grid grid--2">
                <section className="card chart-card"><h2>{t('in_attendanceByPerson')}</h2><StackedRows rows={st.people.map((r) => ({ label: r.name, parts: { present: Math.max(0, r.present - r.late), late: r.late, absent: r.absent, leave: r.leave } }))} keys={[{ key: 'present', label: t('in_present'), color: 'var(--st-good)' }, { key: 'late', label: t('oh_late'), color: 'var(--st-warn)' }, { key: 'absent', label: t('in_absent'), color: 'var(--st-bad)' }, { key: 'leave', label: t('in_leave'), color: 'var(--st-neutral)' }]} empty={t('in_none')} /></section>
                <section className="card chart-card"><h2>{t('in_reviewsByPerson')} {st.reviewAverage !== null && <small className="muted">· {t('in_reviewAvg')} {st.reviewAverage}/5</small>}</h2><HBars rows={st.reviews.map((r) => ({ label: r.name, value: r.avg, display: `${r.avg} / 5` }))} max={5} color="var(--s7)" empty={t('in_none')} /></section>
              </div>
              <p className="muted no-print"><small>{t('in_footnote')}</small></p>
            </>
          );
        }}
      </Loading>
    </>
  );
}
