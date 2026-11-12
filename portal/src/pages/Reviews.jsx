import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Loading, Pill, useAction, useLoad } from '../components/ui.jsx';
import { Amounts } from './Finance.jsx';

// Monthly performance reviews: reviewers (team leaders for their team, HR and admins for everyone)
// open the month's board, start a review, score the criteria and send it to the employee.

const thisMonth = () => new Date().toISOString().slice(0, 7);
const STATUS_TONE = { draft: 'gold', submitted: 'info', acknowledged: 'ok' };

export default function Reviews() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') || thisMonth();
  const open = params.get('review');
  const tab = params.get('tab') === 'criteria' ? 'criteria' : 'board';
  return (
    <>
      <h1 className="page-title">{t('reviewsNav')}</h1>
      {can('reviews.manage', 'all') && (
        <div className="tabs" role="tablist">
          {['board', 'criteria'].map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setParams({ tab: k })}>{t(`rv_tab_${k}`)}</button>)}
        </div>
      )}
      {tab === 'criteria' ? <Criteria /> : open ? <ReviewEditor id={open} onBack={() => setParams({ month })} /> : <Board month={month} onMonth={(m) => setParams({ month: m })} onOpen={(id) => setParams({ month, review: id })} />}
    </>
  );
}

function Board({ month, onMonth, onOpen }) {
  const { t } = useI18n();
  const state = useLoad(`/api/v2/performance/board?month=${month}`, [month]);
  const { busy, error, run } = useAction();
  const start = (u) => run(async () => { const r = await api('/api/v2/performance', { method: 'POST', body: { user: u, month } }); onOpen(r.item._id); });
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('rv_board')}</h2>
        <label className="row">{t('pr_month')} <input type="month" value={month} onChange={(e) => onMonth(e.target.value)} /></label>
      </div>
      <p className="muted">{t('rv_boardHint')}</p>
      <ErrorBox error={error} />
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="empty">{t('rv_nobody')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('name')}</th><th>{t('jobTitle')}</th><th>{t('status')}</th><th>{t('rv_average')}</th><th /></tr></thead>
              <tbody>{d.items.map((p) => (
                <tr key={p.user}>
                  <td><strong>{p.name}</strong><br /><small className="muted">{p.employeeNo}{p.team ? ` · ${p.team}` : ''}</small></td>
                  <td>{p.jobTitle || '—'}</td>
                  <td>{p.review ? <Pill tone={STATUS_TONE[p.review.status]}>{t(`rv_st_${p.review.status}`)}</Pill> : <span className="muted">{t('rv_notStarted')}</span>}</td>
                  <td>{p.review?.average ? <><strong>{p.review.average}</strong> / 5 <small className="muted">{p.review.rating?.ar && ` · ${t(`rv_rate_${p.review.rating.key}`)}`}</small></> : '—'}</td>
                  <td className="actions">{p.review
                    ? <button type="button" className="btn btn--small" onClick={() => onOpen(p.review._id)}>{t('rv_open')}</button>
                    : <button type="button" className="btn btn--small btn--primary" disabled={busy} onClick={() => start(p.user)}>{t('rv_start')}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </Loading>
    </section>
  );
}

function Metrics({ m }) {
  const { t } = useI18n();
  return (
    <div className="grid grid--4">
      <div className="card stat"><small>{t('rv_attendance')}</small><strong>{m.attendanceRate === null ? '—' : `${m.attendanceRate}%`}</strong><small>{t('pr_absent')} {m.absent} · {t('pr_lateMin')} {m.lateMinutes}</small></div>
      <div className="card stat"><small>{t('rv_tasks')}</small><strong>{m.tasksOnTime} / {m.tasksDone}</strong><small>{t('rv_onTime')} · {t('rv_overdueOpen')} {m.tasksOverdue}</small></div>
      <div className="card stat"><small>{t('rv_newCustomers')}</small><strong>{m.newCustomers}</strong><small>{t('rv_becameCustomers')} {m.becameCustomers}</small></div>
      <div className="card stat"><small>{t('rv_collections')}</small><strong><Amounts list={m.collections} /></strong></div>
    </div>
  );
}

function ScorePicker({ value, onChange, disabled }) {
  return (
    <span className="stars" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" disabled={disabled} className={n <= (value || 0) ? 'on' : ''} aria-label={String(n)} onClick={() => onChange(n)}>★</button>)}
    </span>
  );
}

function ReviewEditor({ id, onBack }) {
  const { t, lang } = useI18n();
  const state = useLoad(`/api/v2/performance/${id}`, [id]);
  return <Loading state={state}>{(d) => <EditorBody key={d.item.__v} r={d.item} lang={lang} t={t} onBack={onBack} reload={state.reload} />}</Loading>;
}

function EditorBody({ r, t, lang, onBack, reload }) {
  const [scores, setScores] = useState(Object.fromEntries(r.scores.map((s) => [s.key, s.score])));
  const [f, setF] = useState({ strengths: r.strengths, improve: r.improve, notes: r.notes });
  const { busy, error, run } = useAction();
  const locked = r.status === 'acknowledged';
  const save = (extra = {}) => run(async () => { await api(`/api/v2/performance/${r._id}`, { method: 'PUT', body: { scores, ...f, __v: r.__v, ...extra } }); reload(); });
  const submit = () => run(async () => {
    const saved = await api(`/api/v2/performance/${r._id}`, { method: 'PUT', body: { scores, ...f, __v: r.__v } });
    await api(`/api/v2/performance/${r._id}/submit`, { method: 'POST', body: { __v: saved.item.__v } });
    reload();
  });
  return (
    <>
      <div className="page-head">
        <div>
          <button type="button" className="link" onClick={onBack}>← {t('rv_board')}</button>
          <h2 style={{ margin: '6px 0 0' }}>{r.name} · <span dir="ltr">{r.month}</span> <Pill tone={STATUS_TONE[r.status]}>{t(`rv_st_${r.status}`)}</Pill></h2>
        </div>
        {r.average ? <div className="card stat" style={{ margin: 0 }}><small>{t('rv_average')}</small><strong>{r.average} / 5</strong><small>{r.rating && t(`rv_rate_${r.rating.key}`)}</small></div> : null}
      </div>
      <Metrics m={r.metrics} />
      <section className="card">
        <h2>{t('rv_scores')}</h2>
        <ul className="plain-list">
          {r.scores.map((s) => (
            <li key={s.key}><span>{lang === 'en' && s.en ? s.en : s.ar}</span><ScorePicker value={scores[s.key]} disabled={locked} onChange={(n) => setScores({ ...scores, [s.key]: n })} /></li>
          ))}
        </ul>
        <div className="form-grid" style={{ marginTop: 14 }}>
          {['strengths', 'improve', 'notes'].map((k) => (
            <label key={k} className="field field--wide">{t(`rv_${k}`)}<textarea rows={3} disabled={locked} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
          ))}
        </div>
        {r.employeeComment && <div className="alert alert--info"><strong>{t('rv_employeeComment')}:</strong> {r.employeeComment}</div>}
        <ErrorBox error={error} />
        {!locked && (
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => save()}>{t('save')}</button>
            {r.status === 'draft' && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => save({ refreshMetrics: true })}>{t('pr_refresh')}</button>}
            {r.status === 'draft' && <button type="button" className="btn btn--primary" disabled={busy} onClick={submit}>{t('rv_submit')}</button>}
          </div>
        )}
      </section>
    </>
  );
}

function Criteria() {
  const { t } = useI18n();
  const state = useLoad('/api/v2/performance/criteria');
  return <Loading state={state}>{(d) => <CriteriaForm items={d.items} t={t} />}</Loading>;
}

function CriteriaForm({ items, t }) {
  const [list, setList] = useState(items);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const save = () => run(async () => { const r = await api('/api/v2/performance/criteria', { method: 'PUT', body: { items: list } }); setList(r.items); setSaved(true); });
  return (
    <section className="card">
      <h2>{t('rv_tab_criteria')}</h2>
      <p className="muted">{t('rv_criteriaHint')}</p>
      {list.map((c, i) => (
        <div key={i} className="row tpl-row" style={{ marginBottom: 8 }}>
          <input aria-label="ar" value={c.ar} onChange={(e) => { setSaved(false); setList(list.map((x, j) => (j === i ? { ...x, ar: e.target.value } : x))); }} style={{ flex: 1 }} />
          <input aria-label="en" dir="ltr" placeholder="English" value={c.en || ''} onChange={(e) => { setSaved(false); setList(list.map((x, j) => (j === i ? { ...x, en: e.target.value } : x))); }} style={{ flex: 1 }} />
          <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setList(list.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn btn--small btn--ghost" onClick={() => setList([...list, { key: '', ar: '', en: '' }])}>{t('lecAddRow')}</button>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>{t('save')}</button>
        {saved && <span className="ok">✓ {t('saved')}</span>}
      </div>
      <ErrorBox error={error} />
    </section>
  );
}

// ---- the employee's own reviews ----
export function MyReviews() {
  const { t, lang } = useI18n();
  const state = useLoad('/api/v2/performance/mine');
  return (
    <>
      <h1 className="page-title">{t('myReviewsNav')}</h1>
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="card empty">{t('rv_noneYet')}</p> : d.items.map((r) => <MyReview key={r._id} r={r} t={t} lang={lang} reload={state.reload} />))}
      </Loading>
    </>
  );
}

function MyReview({ r, t, lang, reload }) {
  const [comment, setComment] = useState('');
  const { busy, error, run } = useAction();
  const ack = () => run(async () => { await api(`/api/v2/performance/${r._id}/acknowledge`, { method: 'POST', body: { comment } }); reload(); });
  return (
    <section className="card">
      <div className="card-head">
        <h2><span dir="ltr">{r.month}</span> · {r.average ? `${r.average} / 5` : '—'} {r.rating && <Pill tone="gold">{t(`rv_rate_${r.rating.key}`)}</Pill>}</h2>
        <Pill tone={STATUS_TONE[r.status]}>{t(`rv_st_${r.status}`)}</Pill>
      </div>
      <Metrics m={r.metrics} />
      <ul className="plain-list">{r.scores.map((s) => <li key={s.key}><span>{lang === 'en' && s.en ? s.en : s.ar}</span><span className="stars-static">{'★'.repeat(s.score || 0)}{'☆'.repeat(5 - (s.score || 0))}</span></li>)}</ul>
      {['strengths', 'improve', 'notes'].filter((k) => r[k]).map((k) => <p key={k}><strong>{t(`rv_${k}`)}:</strong> {r[k]}</p>)}
      <p className="muted"><small>{t('rv_by')} {r.reviewerName}</small></p>
      {r.status === 'submitted' ? (
        <div className="stack stack--full">
          <label className="field">{t('rv_yourComment')}<textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
          <ErrorBox error={error} />
          <div><button type="button" className="btn btn--primary" disabled={busy} onClick={ack}>{t('rv_acknowledge')}</button></div>
        </div>
      ) : r.employeeComment ? <p><strong>{t('rv_yourComment')}:</strong> {r.employeeComment}</p> : null}
    </section>
  );
}
