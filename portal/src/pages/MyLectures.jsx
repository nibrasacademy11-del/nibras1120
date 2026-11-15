import { useEffect, useState } from 'react';
import { api, pickMessage } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Loading, Pill, useLoad } from '../components/ui.jsx';
import { CopyButton } from './Groups.jsx';

// The customer's lectures: the next one with a countdown and a join button, then the rest.
// The join button asks the server for the link, so the Zoom link is never in the page itself.

const SHOW_BEFORE = 15 * 60e3;
const SHOW_AFTER = 30 * 60e3;

function stateAt(l, now) {
  if (l.state === 'cancelled') return 'cancelled';
  const start = new Date(l.startsAt).getTime();
  const end = new Date(l.endsAt).getTime();
  if (now < start - SHOW_BEFORE) return 'upcoming';
  if (now <= end + SHOW_AFTER) return 'open';
  return 'ended';
}

function Countdown({ to, now }) {
  const { t } = useI18n();
  let s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.ceil(s / 60);
  return <span className="countdown">{t('lecStartsIn')} {d > 0 && <><b>{d}</b> {t('cd_d')} </>}{(d > 0 || h > 0) && <><b>{h}</b> {t('cd_h')} </>}<b>{m}</b> {t('cd_m')}</span>;
}

function JoinButton({ lecture }) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const join = async () => {
    setBusy(true);
    setError('');
    // Opened now, while the click still counts, so the browser does not block it
    const win = window.open('', '_blank');
    try {
      const r = await api(`/api/v2/my/lectures/${lecture._id}/join`, { method: 'POST' });
      if (win) { win.opener = null; win.location.href = r.url; } else window.location.assign(r.url);
    } catch (e) {
      if (win) win.close();
      setError(pickMessage(e.message, lang));
    } finally {
      setBusy(false);
    }
  };
  if (!lecture.hasLink) return <small className="muted">{t('lecNoLink')}</small>;
  return (
    <div className="stack">
      <button type="button" className="btn btn--primary btn--join" disabled={busy} onClick={join}>▶ {t('lecJoin')}</button>
      {error && <small className="late">{error}</small>}
    </div>
  );
}

function Passcode({ value }) {
  const { t } = useI18n();
  if (!value) return null;
  return <div className="row passcode">{t('lecPasscode')}: <code dir="ltr">{value}</code><CopyButton text={value} /></div>;
}

function LectureRow({ l, now, featured }) {
  const { t, label, fmtDate } = useI18n();
  const st = stateAt(l, now);
  return (
    <li className={`lec-item${featured ? ' lec-item--next' : ''}${st === 'cancelled' ? ' lec-item--cancelled' : ''}`}>
      <div className="lec-main">
        <div className="lec-when">{fmtDate(l.startsAt)} · {l.durationMin} {t('lecMinutes')}</div>
        <strong className="lec-title">{label({ ar: l.titleAr, en: l.titleEn })}</strong>
        {l.module && <div className="module-meta">{label({ ar: l.module.titleAr, en: l.module.titleEn })}</div>}
        {st === 'cancelled' && l.cancelReason && <small className="late">{l.cancelReason}</small>}
        {l.materials?.length > 0 && <div className="tags">{l.materials.map((m) => <a className="tag" key={m._id} href={m.url} target="_blank" rel="noreferrer">⎘ {m.title}</a>)}</div>}
        {st === 'ended' && l.recordings?.map((r) => (
          <div className="row" key={r._id}><a className="btn btn--small" href={r.url} target="_blank" rel="noreferrer">▶ {t('lecWatch')}{r.title && r.title !== 'Zoom' ? `: ${r.title}` : ''}</a><Passcode value={r.passcode} /></div>
        ))}
      </div>
      <div className="lec-side">
        <Pill tone={{ upcoming: 'info', open: 'ok', ended: 'muted', cancelled: 'warn' }[st]}>{t(`lecState_${st}`)}</Pill>
        {st === 'upcoming' && featured && <Countdown to={l.startsAt} now={now} />}
        {st === 'upcoming' && featured && <small className="muted">{t('lecJoinOpens')}</small>}
        {st === 'open' && <JoinButton lecture={l} />}
        {(st === 'open' || (st === 'upcoming' && featured)) && <Passcode value={l.passcode} />}
        {st === 'ended' && l.attended && <small>{t('lecYouAttended')}: {l.attended.present ? t('lecPresent') : t('lecAbsent')}{l.attended.minutes ? ` (${l.attended.minutes} ${t('lecMinutes')})` : ''}</small>}
      </div>
    </li>
  );
}

export default function MyLectures() {
  const { t, label, fmtDay } = useI18n();
  const state = useLoad('/api/v2/my/lectures');
  const [now, setNow] = useState(Date.now());
  const [skew, setSkew] = useState(0);
  useEffect(() => {
    if (state.data) setSkew(new Date(state.data.now).getTime() - Date.now());
  }, [state.data]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(timer);
  }, []);
  const at = now + skew;   // the server's clock, so a wrong phone clock does not hide the button
  return (
    <>
      <h1 className="page-title">{t('myLectures')}</h1>
      <Loading state={state}>
        {(d) => (!d.groups.length ? <section className="card"><p className="muted">{t('lecNoGroups')}</p></section> : d.groups.map((g) => {
          const live = g.lectures.filter((l) => stateAt(l, at) !== 'ended');
          const next = live.find((l) => stateAt(l, at) !== 'cancelled');
          const later = live.filter((l) => l !== next);
          const past = g.lectures.filter((l) => stateAt(l, at) === 'ended').reverse();
          return (
            <section className="card" key={g._id}>
              <div className="card-head">
                <div>
                  <h2>{label({ ar: g.nameAr, en: g.nameEn })}</h2>
                  <div className="module-meta">
                    {g.program ? label({ ar: g.program.titleAr, en: g.program.titleEn }) : ''}
                    {g.instructor ? ` · ${g.instructor}` : ''}
                    {g.schedule ? ` · ${g.schedule}` : ''}
                    {g.startDate ? ` · ${fmtDay(g.startDate)}` : ''}
                  </div>
                  {g.modules?.length > 0 && <div className="tags">{g.modules.map((m) => <span className="tag" key={m._id}>{label({ ar: m.titleAr, en: m.titleEn })}</span>)}</div>}
                </div>
              </div>
              {!g.lectures.length && <p className="muted">{t('noData')}</p>}
              {next && <ol className="lec-list"><LectureRow l={next} now={at} featured /></ol>}
              {later.length > 0 && <><h3>{t('lecUpcomingList')}</h3><ol className="lec-list">{later.map((l) => <LectureRow key={l._id} l={l} now={at} />)}</ol></>}
              {past.length > 0 && <><h3>{t('lecPastList')}</h3><ol className="lec-list">{past.map((l) => <LectureRow key={l._id} l={l} now={at} />)}</ol></>}
            </section>
          );
        }))}
      </Loading>
    </>
  );
}
