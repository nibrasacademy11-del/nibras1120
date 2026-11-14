import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Loading, useLoad } from '../components/ui.jsx';
import { BrandBand } from '../components/Print.jsx';
import { CalendarHeat, Columns, Donut, Funnel, GroupedColumns, HBars, LineChart, ProgressBars, Sparkline, StackedRows, ValueTable } from '../components/Charts.jsx';

// The owner's home (PLAN-V2 §7): a sticky bar with the period and the filters (program, employee,
// currency), five tabs instead of one long page, wide cards with one big number each (other
// currencies in a small line under it), and every chart's numbers in a small table under it.

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
const TABS = ['overview', 'money', 'sales', 'learning', 'team'];
const num = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const money = (c) => (v) => `${num(v)} ${c}`;
const amountOf = (list, c) => (list || []).find((x) => x.currency === c)?.amount || 0;

function Delta({ now, before, invert }) {
  const { t } = useI18n();
  if (before === null || before === undefined || (!before && !now)) return null;
  if (!before) return <span className="delta delta--up">{t('in_new')}</span>;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (!pct) return <span className="delta">0%</span>;
  return <span className={`delta ${(invert ? pct < 0 : pct > 0) ? 'delta--up' : 'delta--down'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% <small className="muted">{t('oh_vsBefore')}</small></span>;
}

// One big number; money in other currencies goes in a small line under it, never on top of it
function Tile({ label, color, icon, value, others, delta, hint, spark }) {
  return (
    <div className="card oh-tile" style={{ '--tile': color }}>
      <div className="oh-tile__top"><small>{label}</small><span className="oh-tile__icon" aria-hidden="true">{icon}</span></div>
      <strong className="oh-tile__value" dir="ltr">{value}</strong>
      {others && <small className="oh-tile__others" dir="ltr">{others}</small>}
      <div className="oh-tile__foot">{delta}{hint && <small className="muted">{hint}</small>}</div>
      {spark && <Sparkline points={spark} color={color} />}
    </div>
  );
}
const moneyTile = (list, cur) => ({
  value: money(cur)(amountOf(list, cur)),
  others: (list || []).filter((x) => x.currency !== cur && x.amount).map((x) => money(x.currency)(x.amount)).join(' · ') || null
});

// A chart with its title saying what it shows, an optional hint, and its numbers under it
function ChartCard({ title, hint, children, table, wide }) {
  return (
    <section className={`card oh-chart${wide ? ' oh-chart--wide' : ''}`}>
      <h3>{title}</h3>
      {hint && <p className="muted oh-chart__hint">{hint}</p>}
      {children}
      {table}
    </section>
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
  return <div className="attention">{items.map(([to, key, n, tone]) => <Link key={key} to={to} className={n ? `is-${tone}` : ''}><b>{n}</b>{t(key)}</Link>)}</div>;
}

export default function OwnerHome() {
  const { t, en, label } = useI18n();
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const p = useMemo(presets, []);
  const preset = PRESET_KEYS.includes(params.get('p')) ? params.get('p') : (params.get('from') ? null : 'thisMonth');
  const from = params.get('from') || p[preset || 'thisMonth'][0];
  const to = params.get('to') || p[preset || 'thisMonth'][1];
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const program = params.get('program') || '';
  const employee = params.get('employee') || '';
  const [custom, setCustom] = useState({ from, to });
  const q = new URLSearchParams({ from, to });
  if (program) q.set('program', program);
  if (employee) q.set('employee', employee);
  const state = useLoad(`/api/v2/insights?${q}`, [from, to, program, employee]);
  // keeps every other choice when one changes
  const set = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next);
  };
  const vt = { item: '', value: t('oh_t_value'), share: '%' };

  return (
    <div className="oh">
      <div className="oh-head no-print">
        <div>
          <h1 className="page-title">{t('dbOwnerTitle')}</h1>
          <p className="muted" style={{ margin: 0 }}>{t('welcome')}، {me.user.name.split(' ')[0]}</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => window.print()}>{t('printPdf')}</button>
      </div>

      <Loading state={state}>
        {(d) => {
          const mm = d.money; const s = d.sales; const l = d.learning; const sv = d.service; const st = d.staff;
          const currencies = [...new Set([...mm.collected, ...mm.expenses, ...mm.owedNow].map((x) => x.currency))];
          const cur = currencies.includes(params.get('cur')) ? params.get('cur') : (currencies.includes('EGP') ? 'EGP' : currencies[0] || 'EGP');
          const fm = money(cur);
          const flow = mm.trend.filter((x) => x.currency === cur).map((x) => ({ d: x.d, v: x.amount }));
          const out = mm.expenseTrend.filter((x) => x.currency === cur).map((x) => ({ d: x.d, v: x.amount }));
          const inOut = [{ name: t('in_collected'), color: 'var(--s1)', points: flow }, { name: t('in_expenses'), color: 'var(--s2)', points: out }];
          const months = [...new Set([...flow, ...out].map((x) => x.d))].sort();
          const inOutChart = d.unit === 'month'
            ? <GroupedColumns keys={months} series={inOut} format={fm} empty={t('in_none')} />
            : <LineChart series={inOut} format={fm} empty={t('in_none')} />;
          const inOutTable = <ValueTable rows={[{ label: t('in_collected'), value: amountOf(mm.collected, cur), color: 'var(--s1)' }, { label: t('in_expenses'), value: amountOf(mm.expenses, cur), color: 'var(--s2)' }]} format={fm} labels={vt} share={false} />;
          const funnel = s.funnel || {};
          const registered = Object.values(funnel).reduce((a, b) => a + b, 0);
          const byMethod = mm.byMethod.filter((r) => r.currency === cur).map((r) => ({ label: en('payMethod', r.key), value: r.amount }));
          const byCategory = mm.byCategory.filter((r) => r.currency === cur).map((r) => ({ label: r.key, value: r.amount }));
          const byProgram = mm.byProgram.filter((r) => r.currency === cur).map((r) => ({ label: r.key, value: r.amount }));
          const byAccount = mm.byAccount.filter((r) => r.currency === cur).map((r) => ({ label: r.key, value: r.amount }));
          // a donut only for five parts or fewer; more become ranked bars (PLAN-V2 §7)
          const part = (rows, centerLabel, format) => (rows.length <= 5
            ? <Donut values={false} items={rows} format={format} centerLabel={centerLabel} empty={t('in_none')} />
            : <HBars rows={rows} format={format} values={false} empty={t('in_none')} />);
          const progressRows = (l.programProgress || []).map((r) => ({ label: r.key, value: r.avg, n: r.n }));
          const calendar = st.calendar || [];

          return (
            <>
              <div className="print-only"><BrandBand title={t('dbOwnerTitle')} subtitle={`${t('in_from')} ${d.from} ${t('in_to')} ${d.to}`} /></div>

              {/* the period and the filters stay on top while scrolling */}
              <section className="card oh-bar no-print">
                <div className="chips">
                  {PRESET_KEYS.map((k) => <button key={k} type="button" className={`chip${preset === k ? ' chip--on' : ''}`} onClick={() => { setCustom({ from: p[k][0], to: p[k][1] }); set({ p: k, from: '', to: '' }); }}>{t(`in_p_${k}`)}</button>)}
                </div>
                <form className="oh-bar__row" onSubmit={(e) => { e.preventDefault(); set({ p: '', from: custom.from, to: custom.to }); }}>
                  <label>{t('in_from')} <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
                  <label>{t('in_to')} <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
                  <button className="btn btn--primary btn--small">{t('in_show')}</button>
                  <span className="oh-bar__gap" />
                  <label>{t('oh_f_program')}
                    <select value={program} onChange={(e) => set({ program: e.target.value })}>
                      <option value="">{t('oh_f_all')}</option>
                      {(d.options?.programs || []).map((o) => <option key={o.id} value={o.id}>{label({ ar: o.nameAr, en: o.nameEn })}</option>)}
                    </select>
                  </label>
                  <label>{t('oh_f_employee')}
                    <select value={employee} onChange={(e) => set({ employee: e.target.value })}>
                      <option value="">{t('oh_f_all')}</option>
                      {(d.options?.employees || []).map((o) => <option key={o.id} value={o.id}>{o.nameAr}</option>)}
                    </select>
                  </label>
                  {currencies.length > 1 && (
                    <label>{t('oh_f_currency')}
                      <select value={cur} onChange={(e) => set({ cur: e.target.value })} dir="ltr">{currencies.map((c) => <option key={c}>{c}</option>)}</select>
                    </label>
                  )}
                  {(program || employee) && <button type="button" className="btn btn--ghost btn--small" onClick={() => set({ program: '', employee: '' })}>{t('oh_f_reset')}</button>}
                </form>
              </section>

              <nav className="tabs oh-tabs no-print" role="tablist">
                {TABS.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => set({ tab: k === 'overview' ? '' : k })}>{t(`oh_tab_${k}`)}</button>)}
              </nav>

              <p className="muted period-note">
                {t('in_from')} <bdi>{d.from}</bdi> {t('in_to')} <bdi>{d.to}</bdi> · {d.days} {t('in_days')} · {t('in_comparedWith')} <bdi>{d.prevFrom}</bdi> – <bdi>{d.prevTo}</bdi>
                {d.filters?.active && <><br /><span className="oh-filter-note">{t('oh_filtersOn')}</span></>}
              </p>

              {tab === 'overview' && (
                <>
                  <Attention a={d.attention} />
                  <div className="oh-tiles stagger">
                    <Tile label={t('in_collected')} color="var(--s1)" icon="↓" {...moneyTile(mm.collected, cur)} spark={flow} delta={<Delta now={amountOf(mm.collected, cur)} before={amountOf(mm.collectedPrev, cur)} />} />
                    <Tile label={t('in_net')} color="var(--s3)" icon="=" {...moneyTile(mm.net, cur)} delta={<Delta now={amountOf(mm.net, cur)} before={amountOf(mm.netPrev, cur)} />} />
                    <Tile label={t('in_owedNow')} color="var(--s8)" icon="!" {...moneyTile(mm.owedNow, cur)} hint={`${t('in_overdue')}: ${mm.lateCustomersNow}`} />
                    <Tile label={t('in_leads')} color="var(--s7)" icon="+" value={num(s.leads)} spark={s.trend} delta={<Delta now={s.leads} before={s.leadsPrev} />} />
                    <Tile label={t('in_conversion')} color="var(--s6)" icon="%" value={`${s.conversion}%`} delta={<Delta now={s.conversion} before={s.conversionPrev} />} />
                    <Tile label={t('in_enrolled')} color="var(--s4)" icon="✎" value={num(l.enrolled)} spark={l.trend} delta={<Delta now={l.enrolled} before={l.enrolledPrev} />} />
                    <Tile label={t('in_certificates')} color="var(--s5)" icon="✪" value={num(l.certificatesTotal)} delta={<Delta now={l.certificatesTotal} before={l.certificatesPrev} />} />
                    <Tile label={t('in_satisfaction')} color="var(--s1)" icon="★" value={sv.satisfaction ? `${sv.satisfaction.avg} / 5` : '—'} hint={sv.satisfaction ? `${sv.satisfaction.n} ${t('in_ratings')}` : ''} />
                  </div>
                  <div className="oh-grid">
                    <ChartCard wide title={`${t('oh_c_inOut')} (${cur})`} hint={d.unit === 'month' ? t('oh_c_perMonth') : t('oh_c_perDay')} table={inOutTable}>{inOutChart}</ChartCard>
                    <ChartCard title={t('oh_c_progress')} hint={t('oh_c_progressHint')}><ProgressBars rows={progressRows} unit={t('oh_learners')} empty={t('in_none')} /></ChartCard>
                  </div>
                </>
              )}

              {tab === 'money' && (
                <>
                  <div className="oh-tiles stagger">
                    <Tile label={t('in_collected')} color="var(--s1)" icon="↓" {...moneyTile(mm.collected, cur)} spark={flow} delta={<Delta now={amountOf(mm.collected, cur)} before={amountOf(mm.collectedPrev, cur)} />} />
                    <Tile label={t('in_expenses')} color="var(--s2)" icon="↑" {...moneyTile(mm.expenses, cur)} spark={out} delta={<Delta now={amountOf(mm.expenses, cur)} before={amountOf(mm.expensesPrev, cur)} invert />} />
                    <Tile label={t('in_net')} color="var(--s3)" icon="=" {...moneyTile(mm.net, cur)} delta={<Delta now={amountOf(mm.net, cur)} before={amountOf(mm.netPrev, cur)} />} />
                    <Tile label={t('in_owedNow')} color="var(--s8)" icon="!" {...moneyTile(mm.owedNow, cur)} hint={`${t('in_overdue')}: ${mm.lateCustomersNow}`} />
                  </div>
                  <div className="oh-grid">
                    <ChartCard wide title={`${t('oh_c_inOut')} (${cur})`} hint={d.unit === 'month' ? t('oh_c_perMonth') : t('oh_c_perDay')} table={inOutTable}>{inOutChart}</ChartCard>
                    <ChartCard title={t('oh_c_method')} table={<ValueTable rows={byMethod} format={fm} labels={vt} />}>{part(byMethod, cur, fm)}</ChartCard>
                    <ChartCard title={t('oh_c_program')} table={<ValueTable rows={byProgram} format={fm} labels={vt} />}><HBars rows={byProgram} format={fm} values={false} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={t('oh_c_account')} table={<ValueTable rows={byAccount} format={fm} labels={vt} />}><HBars rows={byAccount} format={fm} values={false} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={t('oh_c_expCat')} hint={d.filters?.active ? t('oh_allAcademy') : ''} table={<ValueTable rows={byCategory} format={fm} labels={vt} />}>{part(byCategory, t('in_expenses'), fm)}</ChartCard>
                    <ChartCard title={t('oh_moneyNow')}>
                      <table className="viz-table viz-table--plain"><tbody>
                        {[['oh_dueNext30', mm.dueNext30], ['in_overdueNow', mm.overdueNow], ['oh_pendingPayments', mm.pending], ['in_refunds', mm.refunds], ['in_commissions', mm.commissions], ['in_payroll', st.payroll]].map(([k, list]) => (
                          <tr key={k}><td>{t(k)}</td><td dir="ltr">{(list || []).length ? list.map((x) => money(x.currency)(x.amount)).join(' · ') : '0'}</td></tr>
                        ))}
                      </tbody></table>
                    </ChartCard>
                    <ChartCard title={t('oh_topCustomers')}>
                      {!mm.topCustomers.length ? <p className="muted">{t('in_none')}</p> : (
                        <ol className="top-list">{mm.topCustomers.map((c, i) => <li key={`${c.id}-${c.currency}`}><span className="rank">{i + 1}</span><span><Link to={`/customers/${c.id}`}>{c.name}</Link><br /><small className="muted">{c.customerNo} · {c.n} {t('oh_payments')}</small></span><b className="nowrap" dir="ltr">{money(c.currency)(c.amount)}</b></li>)}</ol>
                      )}
                    </ChartCard>
                  </div>
                </>
              )}

              {tab === 'sales' && (
                <>
                  <div className="oh-tiles stagger">
                    <Tile label={t('in_leads')} color="var(--s7)" icon="+" value={num(s.leads)} spark={s.trend} delta={<Delta now={s.leads} before={s.leadsPrev} />} />
                    <Tile label={t('oh_f_customers')} color="var(--s1)" icon="✓" value={num(s.converted)} delta={<Delta now={s.converted} before={s.convertedPrev} />} />
                    <Tile label={t('in_conversion')} color="var(--s6)" icon="%" value={`${s.conversion}%`} delta={<Delta now={s.conversion} before={s.conversionPrev} />} />
                    <Tile label={t('in_lost')} color="var(--s8)" icon="×" value={num(s.lost)} />
                  </div>
                  <div className="oh-grid">
                    <ChartCard title={t('oh_funnel')} hint={t('oh_c_funnelHint')}><Funnel steps={[{ label: t('oh_f_registered'), value: registered }, { label: t('oh_f_interested'), value: (funnel.interested || 0) + (funnel.customer || 0) }, { label: t('oh_f_customers'), value: funnel.customer || 0 }]} empty={t('in_none')} /></ChartCard>
                    <ChartCard wide title={t('oh_newCustomersTrend')} hint={d.unit === 'month' ? t('oh_c_perMonth') : t('oh_c_perDay')}><Columns points={s.trend} color="var(--s7)" name={t('in_leads')} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={t('oh_c_source')} table={<ValueTable rows={s.bySource.map((r) => ({ label: en('source', r.key), value: r.n, display: `${r.n} (${t('in_won')} ${r.won})` }))} labels={vt} />}><HBars rows={s.bySource.map((r) => ({ label: en('source', r.key), value: r.n }))} values={false} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={t('oh_c_status')} table={<ValueTable rows={['lead', 'interested', 'customer', 'lost', 'inactive'].map((k) => ({ label: en('status', k), value: s.statusNow?.[k] || 0 }))} labels={vt} />}><Donut values={false} items={['lead', 'interested', 'customer', 'lost', 'inactive'].map((k) => ({ label: en('status', k), value: s.statusNow?.[k] || 0 }))} centerLabel={t('oh_allCustomers')} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={t('oh_c_country')} table={<ValueTable rows={s.byCountry.map((r) => ({ label: r.key, value: r.n }))} labels={vt} />}><HBars rows={s.byCountry.map((r) => ({ label: r.key, value: r.n }))} color="var(--s3)" values={false} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={`${t('oh_c_lost')} (${s.lost})`} table={<ValueTable rows={s.lostReasons.map((r) => ({ label: r.key, value: r.n }))} labels={vt} />}><HBars rows={s.lostReasons.map((r) => ({ label: r.key, value: r.n }))} color="var(--s8)" values={false} empty={t('in_none')} /></ChartCard>
                    <ChartCard wide title={t('in_byEmployee')}>
                      {!s.byEmployee.length ? <p className="muted">{t('in_none')}</p> : (
                        <div className="table-wrap"><table className="table">
                          <thead><tr><th>{t('in_employee')}</th><th>{t('in_leads')}</th><th>{t('in_won')}</th><th>{t('in_conversion')}</th><th>{t('in_collected')}</th></tr></thead>
                          <tbody>{s.byEmployee.map((r, i) => <tr key={i}><td><strong>{r.name || t('unassigned')}</strong></td><td>{r.n}</td><td>{r.won}</td><td>{r.n ? Math.round((r.won / r.n) * 100) : 0}%</td><td dir="ltr">{r.collected.map((x) => money(x.currency)(x.amount)).join(' · ') || '0'}</td></tr>)}</tbody>
                        </table></div>
                      )}
                    </ChartCard>
                  </div>
                </>
              )}

              {tab === 'learning' && (
                <>
                  <div className="oh-tiles stagger">
                    <Tile label={t('in_enrolled')} color="var(--s4)" icon="✎" value={num(l.enrolled)} spark={l.trend} delta={<Delta now={l.enrolled} before={l.enrolledPrev} />} />
                    <Tile label={t('oh_completed')} color="var(--s6)" icon="✓" value={num(l.completed)} />
                    <Tile label={t('in_certificates')} color="var(--s5)" icon="✪" value={num(l.certificatesTotal)} delta={<Delta now={l.certificatesTotal} before={l.certificatesPrev} />} />
                    <Tile label={t('in_lectureAttendance')} color="var(--s3)" icon="▶" value={l.lectureAttendanceRate === null ? '—' : `${l.lectureAttendanceRate}%`} hint={`${l.lecturesHeld} ${t('oh_lecturesHeld')}`} />
                  </div>
                  <div className="oh-grid">
                    <ChartCard wide title={t('oh_c_progress')} hint={t('oh_c_progressHint')}><ProgressBars rows={progressRows} unit={t('oh_learners')} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={t('oh_enrollTrend')} hint={d.unit === 'month' ? t('oh_c_perMonth') : t('oh_c_perDay')}><Columns points={l.trend} color="var(--s4)" name={t('in_enrolled')} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={t('in_enrolledByProgram')} table={<ValueTable rows={l.byProgram.map((r) => ({ label: r.key, value: r.n }))} labels={vt} />}><HBars rows={l.byProgram.map((r) => ({ label: r.key, value: r.n }))} color="var(--s4)" values={false} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={t('oh_c_groups')} table={<ValueTable rows={(l.byGroup || []).map((r) => ({ label: r.key, value: r.rate, display: `${r.rate}%` }))} labels={vt} share={false} />}><HBars rows={(l.byGroup || []).map((r) => ({ label: r.key, value: r.rate, display: `${r.rate}%` }))} max={100} color="var(--s3)" values={false} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={t('oh_c_paper')} table={<ValueTable rows={['none', 'printed', 'ready', 'shipped', 'delivered'].map((k) => ({ label: t(`oh_paper_${k}`), value: l.paper?.[k] || 0 }))} labels={vt} />}><Donut values={false} items={['none', 'printed', 'ready', 'shipped', 'delivered'].map((k) => ({ label: t(`oh_paper_${k}`), value: l.paper?.[k] || 0 }))} centerLabel={t('in_certificates')} empty={t('in_none')} /></ChartCard>
                  </div>
                </>
              )}

              {tab === 'team' && (
                <>
                  <div className="oh-tiles stagger">
                    <Tile label={t('in_staffAttendance')} color="var(--s1)" icon="◷" value={st.attendanceRate === null ? '—' : `${st.attendanceRate}%`} hint={`${st.absentDays} ${t('oh_absentDays')}`} />
                    <Tile label={t('in_tasksOnTime')} color="var(--s7)" icon="✓" value={st.tasksOnTimeRate === null ? '—' : `${st.tasksOnTimeRate}%`} hint={`${st.tasksOverdueNow} ${t('oh_overdueTasks')}`} />
                    <Tile label={t('in_complaints')} color="var(--s8)" icon="✉" value={num(sv.opened)} delta={<Delta now={sv.opened} before={sv.openedPrev} invert />} hint={`${t('in_resolved')}: ${sv.resolved}`} />
                    <Tile label={t('in_resolveTime')} color="var(--s4)" icon="◷" value={sv.avgResolveHours === null ? '—' : `${sv.avgResolveHours} ${t('in_hours')}`} />
                  </div>
                  <div className="oh-grid">
                    <ChartCard wide title={t('oh_c_calendar')} hint={t('oh_c_calendarHint')}>
                      <CalendarHeat days={calendar} empty={t('in_none')} scale={[t('oh_cal_low'), t('oh_cal_high')]} label={(c) => `${c.date}: ${c.rate === null ? '—' : `${c.rate}%`} · ${t('in_present')} ${c.present + c.late} · ${t('in_absent')} ${c.absent} · ${t('in_leave')} ${c.leave}`} />
                    </ChartCard>
                    <ChartCard title={t('oh_complaintStatus')} table={<ValueTable rows={['open', 'in_progress', 'resolved', 'closed'].map((k) => ({ label: t(`cs2_${k}`), value: sv.byStatus?.[k] || 0 }))} labels={vt} />}><Donut values={false} items={['open', 'in_progress', 'resolved', 'closed'].map((k) => ({ label: t(`cs2_${k}`), value: sv.byStatus?.[k] || 0 }))} centerLabel={t('in_complaints')} empty={t('in_none')} /></ChartCard>
                    <ChartCard wide title={t('in_attendanceByPerson')}><StackedRows rows={st.people.map((r) => ({ label: r.name, parts: { present: Math.max(0, r.present - r.late), late: r.late, absent: r.absent, leave: r.leave } }))} keys={[{ key: 'present', label: t('in_present'), color: 'var(--st-good)' }, { key: 'late', label: t('oh_late'), color: 'var(--st-warn)' }, { key: 'absent', label: t('in_absent'), color: 'var(--st-bad)' }, { key: 'leave', label: t('in_leave'), color: 'var(--st-neutral)' }]} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={`${t('in_reviewsByPerson')}${st.reviewAverage !== null ? ` · ${t('in_reviewAvg')} ${st.reviewAverage}/5` : ''}`} table={<ValueTable rows={st.reviews.map((r) => ({ label: r.name, value: r.avg, display: `${r.avg} / 5` }))} labels={vt} share={false} />}><HBars rows={st.reviews.map((r) => ({ label: r.name, value: r.avg, display: `${r.avg} / 5` }))} max={5} color="var(--s7)" values={false} empty={t('in_none')} /></ChartCard>
                    <ChartCard title={t('in_complaintTypes')} table={<ValueTable rows={sv.byCategory.map((r) => ({ label: t(`cc_${r.key}`), value: r.n }))} labels={vt} />}><HBars rows={sv.byCategory.map((r) => ({ label: t(`cc_${r.key}`), value: r.n }))} color="var(--s8)" values={false} empty={t('in_none')} /></ChartCard>
                  </div>
                </>
              )}
              <p className="muted no-print"><small>{t('in_footnote')}</small></p>
            </>
          );
        }}
      </Loading>
    </div>
  );
}
