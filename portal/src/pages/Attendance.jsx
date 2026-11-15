import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, pickMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, useAction, useLoad } from '../components/ui.jsx';
import { PrintButton, PrintHeader } from '../components/Print.jsx';

const TONE = { present: 'ok', late: 'gold', absent: 'warn', leave: 'info', holiday: 'muted', weekend: 'muted', pending: 'muted', extra: 'info', in: 'ok', left: 'muted', not_in: 'warn', off: 'muted' };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const hm = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// ---- kiosk screen (no sign-in; opened with the station key) ----

export function Kiosk() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState({ svg: '', name: '', error: '' });
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    let timer;
    const tick = async () => {
      try {
        const res = await fetch(`/api/v2/attendance/kiosk/${id}?key=${encodeURIComponent(params.get('key') || '')}`, { cache: 'no-store' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.message);
        const svg = await QRCode.toString(d.url, { type: 'svg', margin: 1, color: { dark: '#5a020e' } });
        setState({ svg, name: d.name, location: d.location, error: '' });
        timer = setTimeout(tick, d.refreshInMs + 200);
      } catch (e) {
        setState((s) => ({ ...s, error: e.message || 'Error' }));
        timer = setTimeout(tick, 5000);
      }
    };
    tick();
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearTimeout(timer); clearInterval(clock); };
  }, [id, params]);
  return (
    <div className="kiosk">
      <img src="/logo.png" alt="" className="kiosk-logo" />
      <h1>{state.name || 'الحضور والانصراف'}</h1>
      <p>امسح الرمز بكاميرا هاتفك · Scan with your phone camera</p>
      {state.svg ? <div className="kiosk-qr" dangerouslySetInnerHTML={{ __html: state.svg }} /> : <div className="kiosk-qr" />}
      <div className="kiosk-clock" dir="ltr">{now.toLocaleTimeString('en-GB')}</div>
      {state.error && <p className="kiosk-error">{state.error}</p>}
    </div>
  );
}

// ---- the page the QR opens on the employee's phone ----

export function Attend() {
  const [params] = useSearchParams();
  const { t, lang, fmtDate } = useI18n();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api('/api/v2/attendance/scan', { method: 'POST', body: { station: params.get('s'), token: params.get('t'), step: Number(params.get('w')) } })
      .then(setResult).catch((e) => setError(pickMessage(e.message, lang)));
  }, [params, lang]);
  return (
    <section className="card attend-card">
      {!result && !error && <p className="big-text">{t('recording')}</p>}
      {error && <div className="alert alert--error big-text">{error}</div>}
      {result && (
        <>
          <div className={`attend-badge attend-badge--${result.action}`}>{t(`act2_${result.action}`)}</div>
          <p className="big-text">{fmtDate(result.action === 'check_out' ? result.checkOut : result.checkIn || result.checkOut)}</p>
        </>
      )}
    </section>
  );
}

// Pairs this phone with the academy's local server: only addresses on a private network are accepted
const PRIVATE = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?\//;
export function PairDevice() {
  const [params] = useSearchParams();
  const { t, lang } = useI18n();
  const [error, setError] = useState('');
  const back = params.get('return') || '';
  useEffect(() => {
    if (!PRIVATE.test(back)) { setError(t('pairBadAddress')); return; }
    api('/api/v2/attendance/device', { method: 'POST', body: {} })
      .then((d) => { window.location.href = `${back}#token=${encodeURIComponent(d.token)}`; })
      .catch((e) => setError(pickMessage(e.message, lang)));
  }, [back]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="card attend-card">{error ? <div className="alert alert--error">{error}</div> : <p className="big-text">{t('pairing')}</p>}</section>;
}

// ---- attendance pages ----

function DaysTable({ days }) {
  const { t, fmtDate } = useI18n();
  const time = (v) => (v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>{t('date')}</th><th>{t('status')}</th><th>{t('checkIn')}</th><th>{t('checkOut')}</th><th>{t('lateMin')}</th><th>{t('earlyMin')}</th><th>{t('worked')}</th></tr></thead>
        <tbody>{days.map((d) => (
          <tr key={d.date} className={['weekend', 'holiday'].includes(d.status) ? 'muted' : ''}>
            <td className="nowrap" dir="ltr">{d.date} <small>{t(`d_${DAYS[new Date(`${d.date}T12:00:00Z`).getUTCDay()]}`)}</small></td>
            <td><Pill tone={TONE[d.status]}>{t(`as_${d.status}`)}</Pill>{d.leaveType && <small className="muted"> {t(`lt_${d.leaveType}`)}</small>}{d.holiday && <small className="muted"> {d.holiday}</small>}{d.corrected && <small className="muted"> ✎</small>}</td>
            <td dir="ltr">{time(d.checkIn)}</td><td dir="ltr">{time(d.checkOut)}</td>
            <td>{d.lateMinutes || ''}</td><td>{d.earlyLeaveMinutes || ''}</td><td dir="ltr">{d.workedMinutes ? hm(d.workedMinutes) : ''}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Summary({ s }) {
  const { t } = useI18n();
  return (
    <div className="grid grid--4">
      <div className="card stat"><small>{t('as_present')}</small><strong>{s.present} / {s.workingDays}</strong></div>
      <div className="card stat"><small>{t('as_late')}</small><strong className={s.late ? 'warn' : ''}>{s.late} <small>({s.lateMinutes} {t('minutes')})</small></strong></div>
      <div className="card stat"><small>{t('as_absent')}</small><strong className={s.absent ? 'warn' : ''}>{s.absent}</strong></div>
      <div className="card stat"><small>{t('worked')}</small><strong dir="ltr">{hm(s.workedMinutes)}</strong><small className="muted">{t('as_leave')}: {s.leave}</small></div>
    </div>
  );
}

function MyAttendance() {
  const { t } = useI18n();
  const [month, setMonth] = useState(thisMonth());
  const state = useLoad(`/api/v2/attendance/me?month=${month}`, [month]);
  return (
    <>
      <div className="page-head no-print"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /><PrintButton what="attendance:me" title={t('myAttendance')} /></div>
      <Loading state={state}>{(d) => (<><PrintHeader title={`${t('myAttendance')} — ${d.name}`} subtitle={month} /><p className="muted">{t('shift')}: {d.shift.start}–{d.shift.end}</p><Summary s={d.summary} /><section className="card"><DaysTable days={d.days} /></section></>)}</Loading>
    </>
  );
}

function Today() {
  const { t } = useI18n();
  const state = useLoad('/api/v2/attendance/today');
  useEffect(() => { const i = setInterval(state.reload, 60000); return () => clearInterval(i); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const time = (v) => (v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
  return (
    <Loading state={state}>
      {(d) => (
        <>
          <div className="grid grid--4">
            <div className="card stat"><small>{t('st_in')}</small><strong className="ok">{d.counts.in}</strong></div>
            <div className="card stat"><small>{t('st_not_in')}</small><strong className={d.counts.not_in ? 'warn' : ''}>{d.counts.not_in}</strong></div>
            <div className="card stat"><small>{t('as_late')}</small><strong>{d.counts.late}</strong></div>
            <div className="card stat"><small>{t('st_left')} · {t('as_leave')}</small><strong>{d.counts.left} · {d.counts.leave}</strong></div>
          </div>
          <section className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('name')}</th><th>{t('team')}</th><th>{t('status')}</th><th>{t('checkIn')}</th><th>{t('checkOut')}</th><th>{t('lateMin')}</th></tr></thead>
                <tbody>{d.items.sort((a, b) => a.state.localeCompare(b.state)).map((i) => (
                  <tr key={i.user}><td>{i.name}</td><td>{i.team}</td><td><Pill tone={TONE[i.state]}>{t(`st_${i.state}`)}</Pill>{i.method === 'local' && <small className="muted"> LAN</small>}</td><td dir="ltr">{time(i.checkIn)}</td><td dir="ltr">{time(i.checkOut)}</td><td>{i.lateMinutes || ''}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Loading>
  );
}

function MonthSheet() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [person, setPerson] = useState(null);
  const [fixing, setFixing] = useState(null);
  const state = useLoad(`/api/v2/attendance/month?month=${month}`, [month]);
  const one = useLoad(person ? `/api/v2/attendance/month?month=${month}&user=${person}` : null, [person, month]);
  return (
    <>
      <div className="page-head no-print"><input type="month" value={month} onChange={(e) => { setMonth(e.target.value); }} /><PrintButton what="attendance:month" title={t('monthSheet')} filters={{ month }} landscape /></div>
      <PrintHeader title={t('monthSheet')} subtitle={month} />
      {person ? (
        <Loading state={one}>
          {(d) => {
            const p = d.items[0];
            if (!p) return null;
            return (
              <>
                <div className="row no-print"><button type="button" className="link" onClick={() => setPerson(null)}>← {t('back')}</button>{can('attendance.update', 'all') && <button type="button" className="btn btn--small" onClick={() => setFixing({ user: p.user, name: p.name })}>{t('correct')}</button>}</div>
                <h2>{p.name} <small className="muted">{p.shift.start}–{p.shift.end}</small></h2>
                <Summary s={p.summary} />
                <section className="card"><DaysTable days={p.days} /></section>
              </>
            );
          }}
        </Loading>
      ) : (
        <section className="card">
          <Loading state={state}>
            {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
              <div className="table-wrap">
                <table className="table table--hover">
                  <thead><tr><th>{t('name')}</th><th>{t('team')}</th><th>{t('workingDaysLabel')}</th><th>{t('as_present')}</th><th>{t('as_late')}</th><th>{t('lateMin')}</th><th>{t('as_absent')}</th><th>{t('as_leave')}</th><th>{t('earlyMin')}</th><th>{t('worked')}</th></tr></thead>
                  <tbody>{d.items.map((r) => (
                    <tr key={r.user} onClick={() => setPerson(r.user)}>
                      <td>{r.name}</td><td>{r.team}</td><td>{r.summary.workingDays}</td><td>{r.summary.present}</td><td>{r.summary.late}</td><td>{r.summary.lateMinutes}</td>
                      <td className={r.summary.absent ? 'late' : ''}>{r.summary.absent}</td><td>{r.summary.leave}</td><td>{r.summary.earlyLeaveMinutes}</td><td dir="ltr">{hm(r.summary.workedMinutes)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
          </Loading>
        </section>
      )}
      {fixing && <CorrectionForm who={fixing} onClose={() => setFixing(null)} onDone={() => { setFixing(null); one.reload(); state.reload(); }} />}
    </>
  );
}

function CorrectionForm({ who, onClose, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), field: 'checkIn', time: '09:00', reason: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal title={`${t('correct')}: ${who.name}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/v2/attendance/corrections', { method: 'POST', body: { ...f, user: who.user } })).then(onDone).catch(() => {}); }}>
        <Field label={t('date')}><input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label={t('kind')}><select value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })}><option value="checkIn">{t('checkIn')}</option><option value="checkOut">{t('checkOut')}</option></select></Field>
        <Field label={t('time')}><input type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
        <Field label={t('reason')}><input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function Setup() {
  const { t } = useI18n();
  const shifts = useLoad('/api/v2/attendance/shifts');
  const holidays = useLoad('/api/v2/attendance/holidays');
  const stations = useLoad('/api/v2/attendance/stations');
  const [dialog, setDialog] = useState(null);
  const [kiosk, setKiosk] = useState(null);
  const [h, setH] = useState({ date: '', nameAr: '' });
  const done = () => { setDialog(null); shifts.reload(); stations.reload(); };
  const newKey = (s) => api(`/api/v2/attendance/stations/${s._id}`, { method: 'PUT', body: { ...s, newKey: true } }).then((d) => setKiosk(d.kioskUrl));
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>{t('shifts')}</h2><button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'shift' })}>+ {t('add')}</button></div>
        <Loading state={shifts}>
          {(d) => (
            <>
              {!d.items.length && <p className="muted">{t('defaultShiftHint')}</p>}
              <ul className="plain-list">{d.items.map((s) => <li key={s._id}><span><strong>{s.name}</strong> {s.isDefault && <Pill tone="ok">{t('defaultTemplate')}</Pill>} <span dir="ltr">{s.start}–{s.end}</span> · {s.days.map((x) => t(`d_${DAYS[x]}`)).join('، ')} · {t('grace')}: {s.graceMinutes}</span><button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'shift', item: s })}>{t('edit')}</button></li>)}</ul>
              <p className="muted">{t('timeZone')}: {d.timeZone}</p>
            </>
          )}
        </Loading>
      </section>
      <section className="card">
        <div className="card-head"><h2>{t('stations')}</h2><button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'station' })}>+ {t('add')}</button></div>
        {kiosk && <div className="alert alert--ok"><p>{t('kioskLinkHint')}</p><code dir="ltr" className="break">{kiosk}</code></div>}
        <Loading state={stations}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <ul className="plain-list">{d.items.map((s) => <li key={s._id}><span><strong>{s.name}</strong> {s.location} {!s.active && <Pill tone="muted">{t('inactive')}</Pill>} {s.allowedIps?.length > 0 && <small className="muted" dir="ltr">{s.allowedIps.join(', ')}</small>}<br /><small className="muted">{t('stationLastSeen')}: {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : '—'}</small></span><span className="row"><button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'station', item: s })}>{t('edit')}</button><button type="button" className="btn btn--small" onClick={() => newKey(s)}>{t('newKioskLink')}</button></span></li>)}</ul>
          ))}
        </Loading>
        <p className="muted">{t('localServerHint')}</p>
      </section>
      <section className="card">
        <h2>{t('holidays')}</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); api('/api/v2/attendance/holidays', { method: 'POST', body: h }).then(() => { setH({ date: '', nameAr: '' }); holidays.reload(); }); }}>
          <input type="date" required value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} />
          <input required placeholder={t('name')} value={h.nameAr} onChange={(e) => setH({ ...h, nameAr: e.target.value })} />
          <button className="btn btn--primary">{t('add')}</button>
        </form>
        <Loading state={holidays}>{(d) => <ul className="plain-list">{d.items.map((x) => <li key={x.date}><span dir="ltr">{x.date}</span><span>{x.nameAr}</span><button type="button" className="icon-btn btn--small btn--danger" aria-label={t('delete')} onClick={() => api(`/api/v2/attendance/holidays/${x.date}`, { method: 'DELETE' }).then(holidays.reload)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></li>)}</ul>}</Loading>
      </section>
      {dialog?.kind === 'shift' && <ShiftForm item={dialog.item} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'station' && <StationForm item={dialog.item} onClose={() => setDialog(null)} onDone={(url) => { if (url) setKiosk(url); done(); }} />}
    </>
  );
}

function ShiftForm({ item, onClose, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState(item || { name: '', days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00', graceMinutes: 15, earlyLeaveGraceMinutes: 5, isDefault: true, active: true });
  const { busy, error, run } = useAction();
  const toggle = (d) => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() });
  return (
    <Modal title={item ? t('edit') : t('shifts')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api(item ? `/api/v2/attendance/shifts/${item._id}` : '/api/v2/attendance/shifts', { method: item ? 'PUT' : 'POST', body: { ...f, graceMinutes: Number(f.graceMinutes), earlyLeaveGraceMinutes: Number(f.earlyLeaveGraceMinutes) } })).then(onDone).catch(() => {}); }}>
        <Field label={t('name')}><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <fieldset className="checks"><legend>{t('workDays')}</legend>{DAYS.map((d, i) => <label key={d}><input type="checkbox" checked={f.days.includes(i)} onChange={() => toggle(i)} /> {t(`d_${d}`)}</label>)}</fieldset>
        <div className="row">
          <Field label={t('startTime')}><input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label={t('endTime')}><input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        </div>
        <div className="row">
          <Field label={`${t('grace')} (${t('minutes')})`}><input type="number" min="0" value={f.graceMinutes} onChange={(e) => setF({ ...f, graceMinutes: e.target.value })} /></Field>
          <Field label={`${t('earlyGrace')} (${t('minutes')})`}><input type="number" min="0" value={f.earlyLeaveGraceMinutes} onChange={(e) => setF({ ...f, earlyLeaveGraceMinutes: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.isDefault} onChange={(e) => setF({ ...f, isDefault: e.target.checked })} /> {t('defaultTemplate')}</label>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function StationForm({ item, onClose, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState({ name: item?.name || '', location: item?.location || '', allowedIps: (item?.allowedIps || []).join(', '), active: item ? item.active : true });
  const { busy, error, run } = useAction();
  return (
    <Modal title={item ? t('edit') : t('stations')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api(item ? `/api/v2/attendance/stations/${item._id}` : '/api/v2/attendance/stations', { method: item ? 'PUT' : 'POST', body: f })).then((d) => onDone(d.kioskUrl)).catch(() => {}); }}>
        <Field label={t('name')}><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('location')}><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        <Field label={t('allowedIps')} hint={t('allowedIpsHint')}><input dir="ltr" value={f.allowedIps} onChange={(e) => setF({ ...f, allowedIps: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> {t('active')}</label>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

export default function Attendance() {
  const { t } = useI18n();
  const { can } = useAuth();
  const tabs = ['mine', ...(can('attendance.view', 'team') ? ['today', 'month'] : []), ...(can('attendance.manage', 'all') ? ['setup'] : [])];
  const [tab, setTab] = useState(tabs.includes('today') ? 'today' : 'mine');
  return (
    <>
      <h1 className="page-title">{t('attendanceNav')}</h1>
      <div className="tabs no-print">{tabs.map((k) => <button key={k} type="button" className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{t(`at_${k}`)}</button>)}</div>
      {tab === 'mine' && <MyAttendance />}
      {tab === 'today' && <Today />}
      {tab === 'month' && <MonthSheet />}
      {tab === 'setup' && <Setup />}
    </>
  );
}

// ---- leaves ----

export function Leaves() {
  const { t } = useI18n();
  const { can } = useAuth();
  const approver = can('leaves.approve', 'team');
  const [box, setBox] = useState('mine');
  const state = useLoad(`/api/v2/leaves?box=${box}`, [box]);
  const [dialog, setDialog] = useState(null);
  const done = () => { setDialog(null); state.reload(); };
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('leavesNav')}</h1>
        <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'new' })}>+ {t('newLeave')}</button>
      </div>
      {approver && <div className="tabs">{['mine', 'approvals'].map((b) => <button key={b} type="button" className={`tab${box === b ? ' active' : ''}`} onClick={() => setBox(b)}>{t(b === 'mine' ? 'myRequests' : 'toApprove')}</button>)}</div>}
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr>{box !== 'mine' && <th>{t('name')}</th>}<th>{t('kind')}</th><th>{t('from')}</th><th>{t('to')}</th><th>{t('reason')}</th><th>{t('status')}</th><th /></tr></thead>
                <tbody>{d.items.map((l) => (
                  <tr key={l._id}>
                    {box !== 'mine' && <td>{l.user?.name}</td>}
                    <td>{t(`lt_${l.type}`)}{l.type === 'permission' && ` (${l.hours} ${t('hours')})`}</td>
                    <td dir="ltr">{l.from}</td><td dir="ltr">{l.to}</td><td>{l.reason}{l.decisionNote && <div className="muted">{l.decisionNote}</div>}</td>
                    <td><Pill tone={{ pending: 'gold', approved: 'ok', rejected: 'warn', cancelled: 'muted' }[l.status]}>{t(l.status)}</Pill></td>
                    <td className="nowrap">
                      {box !== 'mine' && l.status === 'pending' && <button type="button" className="btn btn--small btn--primary" onClick={() => setDialog({ kind: 'decide', l })}>{t('decision')}</button>}
                      {box === 'mine' && ['pending', 'approved'].includes(l.status) && <button type="button" className="btn btn--small" onClick={() => api(`/api/v2/leaves/${l._id}/cancel`, { method: 'POST', body: {} }).then(state.reload).catch(() => {})}>{t('cancelRequest')}</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
      {dialog?.kind === 'new' && <LeaveForm onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'decide' && <DecideLeave l={dialog.l} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

function LeaveForm({ onClose, onDone }) {
  const { t } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ type: 'annual', from: today, to: today, hours: 1, reason: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal title={t('newLeave')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/v2/leaves', { method: 'POST', body: { ...f, hours: Number(f.hours) } })).then(onDone).catch(() => {}); }}>
        <Field label={t('kind')}><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['annual', 'sick', 'unpaid', 'permission', 'other'].map((x) => <option key={x} value={x}>{t(`lt_${x}`)}</option>)}</select></Field>
        <Field label={f.type === 'permission' ? t('date') : t('from')}><input type="date" required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: e.target.value > f.to ? e.target.value : f.to })} /></Field>
        {f.type !== 'permission' && <Field label={t('to')}><input type="date" required min={f.from} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>}
        {f.type === 'permission' && <Field label={t('hours')}><input type="number" min="0.5" max="8" step="0.5" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>}
        <Field label={t('reason')}><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('send')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function DecideLeave({ l, onClose, onDone }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const send = (decision) => run(() => api(`/api/v2/leaves/${l._id}/decide`, { method: 'POST', body: { decision, note, __v: l.__v } })).then(onDone).catch(() => {});
  return (
    <Modal title={`${l.user?.name}: ${t(`lt_${l.type}`)} ${l.from}${l.to !== l.from ? ` → ${l.to}` : ''}`} onClose={onClose}>
      <div className="stack">
        <p>{l.reason}</p>
        <Field label={t('note')}><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button type="button" className="btn btn--primary" disabled={busy} onClick={() => send('approve')}>{t('approve')}</button><button type="button" className="btn btn--danger" disabled={busy} onClick={() => send('reject')}>{t('reject')}</button></div>
      </div>
    </Modal>
  );
}
