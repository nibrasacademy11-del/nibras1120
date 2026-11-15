import { useMemo, useRef, useState } from 'react';

// Small SVG charts for the owner's home page. Colours come from CSS variables (charts.css):
// --s1..--s8 are the validated categorical slots, used in fixed order and never cycled.
// Every mark shows its value in a tooltip on hover, and legends always carry the numbers,
// so no reading depends on colour alone.

export const SLOTS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const fmtNum = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.title && <div className="viz-tip__title">{tip.title}</div>}
      {tip.rows.map((r) => (
        <div key={r.label} className="viz-tip__row"><i style={{ background: r.color }} />{r.label}<b dir="ltr">{r.value}</b></div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <ul className="viz-legend">
      {items.map((it) => <li key={it.label}><i style={{ background: it.color }} />{it.label}{it.value !== undefined && <b dir="ltr">{it.value}</b>}</li>)}
    </ul>
  );
}

// ---- lines over time (one y axis; every series in the same unit) ----
export function LineChart({ series, format = fmtNum, height = 220, empty = '—' }) {
  const wrap = useRef(null);
  const [hover, setHover] = useState(null);
  const keys = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.d)))].sort(), [series]);
  if (!keys.length) return <p className="muted viz-empty">{empty}</p>;
  const W = 640; const H = height; const L = 48; const R = 12; const T = 12; const B = 26;
  const max = niceMax(Math.max(...series.flatMap((s) => s.points.map((p) => p.v)), 0));
  const x = (i) => L + (keys.length === 1 ? (W - L - R) / 2 : (i / (keys.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const valueAt = (s, k) => (s.points.find((p) => p.d === k) || {}).v || 0;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(keys.length - 1, Math.round(((px - L) / (W - L - R)) * (keys.length - 1))));
    const wb = wrap.current.getBoundingClientRect();
    setHover({ i, left: e.clientX - wb.left, top: e.clientY - wb.top });
  };
  return (
    <div className="viz" ref={wrap} dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
        <defs>{series.map((s, si) => <linearGradient key={si} id={`lg${si}-${s.name.length}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".18" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>)}</defs>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="viz-grid" /><text x={L - 6} y={y(v) + 4} className="viz-axis" textAnchor="end">{fmtNum(v)}</text></g>)}
        {[0, Math.floor((keys.length - 1) / 2), keys.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => <text key={i} x={x(i)} y={H - 6} className="viz-axis" textAnchor={i === 0 ? 'start' : i === keys.length - 1 ? 'end' : 'middle'}>{keys[i]}</text>)}
        {series.map((s, si) => {
          const pts = keys.map((k, i) => [x(i), y(valueAt(s, k))]);
          const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
          return (
            <g key={s.name}>
              <path d={`${line} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z`} fill={`url(#lg${si}-${s.name.length})`} className="viz-area" />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="viz-line" />
              {keys.length <= 31 && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={hover && hover.i === i ? 5 : 2.5} fill={s.color} stroke="var(--surface)" strokeWidth="2" />)}
            </g>
          );
        })}
        {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={T} y2={H - B} className="viz-cross" />}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" />
      </svg>
      <Tip tip={hover && { x: hover.left, y: hover.top, title: keys[hover.i], rows: series.map((s) => ({ label: s.name, color: s.color, value: format(valueAt(s, keys[hover.i])) })) }} />
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.name, color: s.color, value: format(s.points.reduce((a, p) => a + p.v, 0)) }))} />}
    </div>
  );
}

// ---- columns over time (one series) ----
export function Columns({ points, color = 'var(--s1)', format = fmtNum, height = 180, empty = '—', name = '' }) {
  const wrap = useRef(null);
  const [tip, setTip] = useState(null);
  if (!points.length) return <p className="muted viz-empty">{empty}</p>;
  const W = 640; const H = height; const L = 34; const R = 6; const T = 10; const B = 24;
  const max = niceMax(Math.max(...points.map((p) => p.v), 0));
  const band = (W - L - R) / points.length;
  const bw = Math.max(3, Math.min(36, band - 2));
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const show = (e, p) => { const wb = wrap.current.getBoundingClientRect(); setTip({ x: e.clientX - wb.left, y: e.clientY - wb.top, title: p.d, rows: [{ label: name, color, value: format(p.v) }] }); };
  return (
    <div className="viz" ref={wrap} dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" onMouseLeave={() => setTip(null)}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(f * max)} y2={y(f * max)} className="viz-grid" /><text x={L - 5} y={y(f * max) + 4} className="viz-axis" textAnchor="end">{fmtNum(f * max)}</text></g>)}
        {points.map((p, i) => {
          const h = Math.max(p.v ? 2 : 0, y(0) - y(p.v));
          const cx = L + band * i + (band - bw) / 2;
          return (
            <g key={p.d} onMouseMove={(e) => show(e, p)}>
              <rect x={L + band * i} y={T} width={band} height={H - T - B} fill="transparent" />
              <path className="viz-col" style={{ animationDelay: `${Math.min(i * 18, 400)}ms` }} fill={color} d={`M${cx},${y(0)} V${y(0) - h + Math.min(4, h)} Q${cx},${y(0) - h} ${cx + Math.min(4, bw / 2)},${y(0) - h} H${cx + bw - Math.min(4, bw / 2)} Q${cx + bw},${y(0) - h} ${cx + bw},${y(0) - h + Math.min(4, h)} V${y(0)} Z`} />
            </g>
          );
        })}
        <text x={L} y={H - 6} className="viz-axis">{points[0].d}</text>
        {points.length > 1 && <text x={W - R} y={H - 6} className="viz-axis" textAnchor="end">{points[points.length - 1].d}</text>}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

// ---- part of a whole: a donut with a legend that carries the numbers ----
// values={false}: the legend names the parts only; their numbers are in the table under the chart
export function Donut({ items, format = fmtNum, centerLabel, size = 170, empty = '—', values = true }) {
  const [active, setActive] = useState(null);
  const list = items.filter((i) => i.value > 0);
  const total = list.reduce((s, i) => s + i.value, 0);
  if (!total) return <p className="muted viz-empty">{empty}</p>;
  const R = 70; const r = 46; const C = 80;
  let a0 = -Math.PI / 2;
  const arcs = list.map((it, i) => {
    const a1 = a0 + (it.value / total) * Math.PI * 2;
    const gap = list.length > 1 ? 0.012 : 0;
    const s = a0 + gap; const e = a1 - gap;
    const large = e - s > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${C + rad * Math.cos(ang)},${C + rad * Math.sin(ang)}`;
    const d = list.length === 1
      ? `M${C},${C - R} A${R},${R} 0 1 1 ${C - 0.01},${C - R} L${C - 0.01},${C - r} A${r},${r} 0 1 0 ${C},${C - r} Z`
      : `M${p(R, s)} A${R},${R} 0 ${large} 1 ${p(R, e)} L${p(r, e)} A${r},${r} 0 ${large} 0 ${p(r, s)} Z`;
    a0 = a1;
    return { ...it, d, color: it.color || SLOTS[i % SLOTS.length] };
  });
  const shown = active !== null ? arcs[active] : null;
  return (
    <div className="viz viz-donut">
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" onMouseLeave={() => setActive(null)}>
        {arcs.map((a, i) => <path key={a.label} d={a.d} fill={a.color} className={`viz-arc${active === i ? ' is-on' : ''}${active !== null && active !== i ? ' is-dim' : ''}`} onMouseEnter={() => setActive(i)} />)}
        <text x="80" y="76" textAnchor="middle" className="viz-donut__big">{shown ? `${Math.round((shown.value / total) * 100)}%` : format(total)}</text>
        <text x="80" y="96" textAnchor="middle" className="viz-donut__small">{shown ? shown.label.slice(0, 16) : centerLabel}</text>
      </svg>
      <Legend items={arcs.map((a) => ({ label: a.label, color: a.color, value: values ? `${format(a.value)} · ${Math.round((a.value / total) * 100)}%` : undefined }))} />
    </div>
  );
}

// ---- ranked horizontal bars; one series, one colour. values={false} leaves the numbers to the
// table under the chart (the owner's pages), each value still shown on hover ----
export function HBars({ rows, color = 'var(--s1)', format = fmtNum, empty = '—', max: forcedMax, values = true }) {
  if (!rows.length) return <p className="muted viz-empty">{empty}</p>;
  const max = forcedMax || Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="viz-hbars">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} title={`${r.label}: ${r.display !== undefined ? r.display : format(r.value)}`} className={values ? '' : 'viz-hbars--bare'}>
          <span className="viz-hbars__label">{r.label}</span>
          <span className="viz-hbars__track"><span className="viz-hbars__fill" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: r.color || color, animationDelay: `${i * 50}ms` }} /></span>
          {values && <span className="viz-hbars__value" dir="ltr">{r.display !== undefined ? r.display : format(r.value)}</span>}
        </li>
      ))}
    </ul>
  );
}

// ---- one row per person, split into parts (e.g. present / late / absent / leave) ----
export function StackedRows({ rows, keys, empty = '—' }) {
  const wrap = useRef(null);
  const [tip, setTip] = useState(null);
  if (!rows.length) return <p className="muted viz-empty">{empty}</p>;
  return (
    <div className="viz" ref={wrap} onMouseLeave={() => setTip(null)}>
      <ul className="viz-stack">
        {rows.map((r) => {
          const total = keys.reduce((s, k) => s + (r.parts[k.key] || 0), 0) || 1;
          return (
            <li key={r.label}>
              <span className="viz-hbars__label" title={r.label}>{r.label}</span>
              <span className="viz-stack__bar">
                {keys.map((k) => (r.parts[k.key] ? (
                  <span key={k.key} style={{ width: `${(r.parts[k.key] / total) * 100}%`, background: k.color }}
                    onMouseMove={(e) => { const wb = wrap.current.getBoundingClientRect(); setTip({ x: e.clientX - wb.left, y: e.clientY - wb.top, title: r.label, rows: keys.map((kk) => ({ label: kk.label, color: kk.color, value: fmtNum(r.parts[kk.key] || 0) })) }); }} />
                ) : null))}
              </span>
            </li>
          );
        })}
      </ul>
      <Legend items={keys.map((k) => ({ label: k.label, color: k.color, value: fmtNum(rows.reduce((s, r) => s + (r.parts[k.key] || 0), 0)) }))} />
      <Tip tip={tip} />
    </div>
  );
}

// ---- stages that narrow down (one hue, darker for later stages) ----
export function Funnel({ steps, empty = '—' }) {
  const max = Math.max(...steps.map((s) => s.value), 0);
  if (!max) return <p className="muted viz-empty">{empty}</p>;
  const shades = ['var(--seq-250)', 'var(--seq-400)', 'var(--seq-550)', 'var(--seq-700)'];
  return (
    <ol className="viz-funnel">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="viz-funnel__bar" style={{ width: `${Math.max(8, (s.value / max) * 100)}%`, background: shades[Math.min(i, shades.length - 1)], animationDelay: `${i * 80}ms` }}>
            <span>{s.label}</span><b>{fmtNum(s.value)}</b>
          </div>
          {i > 0 && steps[i - 1].value > 0 && <small className="viz-funnel__rate">{Math.round((s.value / steps[i - 1].value) * 100)}%</small>}
        </li>
      ))}
    </ol>
  );
}

// ---- a percentage as a ring ----
export function Ring({ value, label, color = 'var(--s3)', size = 120 }) {
  const v = value === null || value === undefined ? null : Math.max(0, Math.min(100, value));
  const r = 44; const c = 2 * Math.PI * r;
  return (
    <div className="viz-ring" style={{ width: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label}: ${v === null ? '—' : `${v}%`}`}>
        <circle cx="50" cy="50" r={r} className="viz-ring__track" />
        {v !== null && <circle cx="50" cy="50" r={r} className="viz-ring__fill" stroke={color} strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 50 50)" />}
        <text x="50" y="55" textAnchor="middle" className="viz-ring__text">{v === null ? '—' : `${v}%`}</text>
      </svg>
      <small>{label}</small>
    </div>
  );
}

// ---- a tiny trend line inside a tile ----
export function Sparkline({ points, color = 'var(--s1)' }) {
  if (!points || points.length < 2) return null;
  const W = 160; const H = 40;
  const vals = points.map((p) => p.v || 0);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const x = (i) => (i / (points.length - 1)) * W;
  const y = (v) => H - 4 - ((v - min) / range) * (H - 8);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.v || 0)}`).join(' ');
  const gradId = `spk-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <svg className="viz-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" dir="ltr">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---- the numbers of a chart, under it: each row's value and its share of the total ----
export function ValueTable({ rows, format = fmtNum, labels = { item: '', value: '', share: '%' }, share = true, limit = 8 }) {
  const list = rows.filter((r) => r.value !== null && r.value !== undefined);
  if (!list.length) return null;
  const total = list.reduce((a, r) => a + (Number(r.value) || 0), 0);
  return (
    <table className="viz-table">
      <thead><tr><th>{labels.item}</th><th>{labels.value}</th>{share && <th>{labels.share}</th>}</tr></thead>
      <tbody>{list.slice(0, limit).map((r, i) => (
        <tr key={`${r.label}-${i}`}>
          <td>{r.color && <i className="viz-key" style={{ background: r.color }} />}{r.label}</td>
          <td dir="ltr">{r.display !== undefined ? r.display : format(r.value)}</td>
          {share && <td dir="ltr">{total ? `${Math.round((r.value / total) * 100)}%` : '—'}</td>}
        </tr>
      ))}</tbody>
    </table>
  );
}

// ---- months side by side: one group per period, one column per series (one axis, one unit) ----
export function GroupedColumns({ keys, series, format = fmtNum, height = 220, empty = '—' }) {
  const wrap = useRef(null);
  const [tip, setTip] = useState(null);
  if (!keys.length) return <p className="muted viz-empty">{empty}</p>;
  const W = 640; const H = height; const L = 48; const R = 8; const T = 10; const B = 24;
  const valueAt = (sr, k) => (sr.points.find((p) => p.d === k) || {}).v || 0;
  const max = niceMax(Math.max(...series.flatMap((sr) => keys.map((k) => valueAt(sr, k))), 0));
  const band = (W - L - R) / keys.length;
  const inner = Math.min(band - 6, 18 * series.length + 2 * (series.length - 1));
  const bw = Math.max(3, (inner - 2 * (series.length - 1)) / series.length);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const show = (e, k) => { const wb = wrap.current.getBoundingClientRect(); setTip({ x: e.clientX - wb.left, y: e.clientY - wb.top, title: k, rows: series.map((sr) => ({ label: sr.name, color: sr.color, value: format(valueAt(sr, k)) })) }); };
  const every = Math.ceil(keys.length / 12);
  return (
    <div className="viz" ref={wrap} dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" onMouseLeave={() => setTip(null)}>
        {[0, 0.5, 1].map((fr) => <g key={fr}><line x1={L} x2={W - R} y1={y(fr * max)} y2={y(fr * max)} className="viz-grid" /><text x={L - 6} y={y(fr * max) + 4} className="viz-axis" textAnchor="end">{fmtNum(fr * max)}</text></g>)}
        {keys.map((k, i) => {
          const x0 = L + band * i + (band - inner) / 2;
          return (
            <g key={k} onMouseMove={(e) => show(e, k)}>
              <rect x={L + band * i} y={T} width={band} height={H - T - B} fill="transparent" />
              {series.map((sr, si) => {
                const v = valueAt(sr, k);
                const h = Math.max(v ? 2 : 0, y(0) - y(v));
                const cx = x0 + si * (bw + 2);
                const rr = Math.min(4, h, bw / 2);
                return <path key={sr.name} className="viz-col" fill={sr.color} d={`M${cx},${y(0)} V${y(0) - h + rr} Q${cx},${y(0) - h} ${cx + rr},${y(0) - h} H${cx + bw - rr} Q${cx + bw},${y(0) - h} ${cx + bw},${y(0) - h + rr} V${y(0)} Z`} />;
              })}
              {i % every === 0 && <text x={L + band * i + band / 2} y={H - 6} className="viz-axis" textAnchor="middle">{k}</text>}
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
      <Legend items={series.map((sr) => ({ label: sr.name, color: sr.color }))} />
    </div>
  );
}

// ---- attendance by day: a coloured calendar, one square per working day (one hue, darker = more came) ----
export function CalendarHeat({ days, empty = '—', label = (d) => d.date, scale = ['', ''] }) {
  if (!days.length) return <p className="muted viz-empty">{empty}</p>;
  const shade = (r) => (r === null ? 'var(--viz-none)' : r >= 95 ? 'var(--seq-700)' : r >= 85 ? 'var(--seq-550)' : r >= 70 ? 'var(--seq-400)' : 'var(--seq-250)');
  // weeks as columns, Saturday to Friday as rows
  const first = new Date(`${days[0].date}T00:00:00Z`);
  const offset = (first.getUTCDay() + 1) % 7;
  const cells = days.map((d) => {
    const idx = Math.round((new Date(`${d.date}T00:00:00Z`) - first) / 864e5) + offset;
    return { ...d, col: Math.floor(idx / 7), row: idx % 7 };
  });
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  return (
    <div className="viz viz-cal">
      <div className="viz-cal__grid" style={{ gridTemplateColumns: `repeat(${cols}, 16px)` }} dir="ltr">
        {cells.map((c) => <span key={c.date} className="viz-cal__day" style={{ gridColumn: c.col + 1, gridRow: c.row + 1, background: shade(c.rate) }} title={label(c)} />)}
      </div>
      <div className="viz-cal__scale"><small>{scale[0]}</small>{['var(--seq-250)', 'var(--seq-400)', 'var(--seq-550)', 'var(--seq-700)'].map((x) => <i key={x} style={{ background: x }} />)}<small>{scale[1]}</small></div>
    </div>
  );
}

// ---- progress of each program: a bar per program, its percent and how many learners ----
export function ProgressBars({ rows, empty = '—', unit = '' }) {
  if (!rows.length) return <p className="muted viz-empty">{empty}</p>;
  return (
    <ul className="viz-progress">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.value}%`}>
          <div className="viz-progress__head"><span>{r.label}</span><b dir="ltr">{r.value}%</b></div>
          <span className="viz-progress__track"><span style={{ width: `${Math.max(1.5, r.value)}%` }} /></span>
          {r.n !== undefined && <small className="muted">{r.n} {unit}</small>}
        </li>
      ))}
    </ul>
  );
}
