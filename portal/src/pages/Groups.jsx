import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, fromLocalInput, toLocalInput, useAction, useLoad } from '../components/ui.jsx';

// Training groups: their lectures (Zoom), members (with bulk add) and attendance

const STATE_TONE = { upcoming: 'info', open: 'ok', ended: 'muted', cancelled: 'warn' };

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

export function CopyButton({ text }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button type="button" className="btn btn--small btn--ghost" onClick={() => copyText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>
      {done ? t('lecCopied') : t('lecCopy')}
    </button>
  );
}

function ZoomStatus({ connected, canManage }) {
  const { t } = useI18n();
  const [check, setCheck] = useState(null);
  const test = () => api('/api/v2/zoom/status').then(setCheck).catch((e) => setCheck({ ok: false, error: e.message }));
  return (
    <div className="row">
      <Pill tone={connected ? 'ok' : 'gold'}>{connected ? t('grpZoomOn') : t('grpZoomOff')}</Pill>
      {connected && canManage && <button type="button" className="btn btn--small btn--ghost" onClick={test}>{t('grpZoomCheck')}</button>}
      {check && (check.ok ? <small className="ok">{t('grpZoomOk')} · {t('grpZoomAccount')}: <span dir="ltr">{check.email}</span></small> : <small className="late">{check.error || t('grpZoomOff')}</small>)}
    </div>
  );
}

export default function Groups() {
  const { t, label, fmtDay, fmtDate } = useI18n();
  const { can } = useAuth();
  const state = useLoad('/api/v2/groups');
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('groupsNav')}</h1>
        {state.data && <ZoomStatus connected={state.data.zoomConnected} canManage={can('programs.update', 'all')} />}
      </div>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('name')}</th><th>{t('grpProgram')}</th><th>{t('startDate')}</th><th>{t('grpMembers')}</th><th>{t('grpNextLecture')}</th><th>{t('status')}</th></tr></thead>
                <tbody>
                  {d.items.map((g) => (
                    <tr key={g._id}>
                      <td><Link to={`/groups/${g._id}`}><strong>{label({ ar: g.nameAr, en: g.nameEn })}</strong></Link>{g.instructor && <><br /><small className="muted">{g.instructor}</small></>}</td>
                      <td>{g.program ? label({ ar: g.program.titleAr, en: g.program.titleEn }) : '—'}</td>
                      <td>{fmtDay(g.startDate)}{g.endDate ? ` – ${fmtDay(g.endDate)}` : ''}</td>
                      <td>{g.members}{g.capacity ? ` / ${g.capacity}` : ''}</td>
                      <td>{g.nextLecture ? <>{fmtDate(g.nextLecture.startsAt)}<br /><small className="muted">{label({ ar: g.nextLecture.titleAr, en: g.nextLecture.titleEn })}</small></> : <span className="muted">{t('grpNoNext')}</span>}</td>
                      <td><Pill tone={['open', 'running'].includes(g.status) ? 'ok' : 'muted'}>{g.status}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Loading>
      </section>
    </>
  );
}

export function GroupDetail() {
  const { id } = useParams();
  const { t, label, fmtDay } = useI18n();
  const state = useLoad(`/api/v2/groups/${id}`, [id]);
  const [tab, setTab] = useState('grpLectures');
  return (
    <Loading state={state}>
      {(d) => {
        const g = d.item;
        const covered = g.modules && g.modules.length ? d.modules.filter((m) => g.modules.includes(m._id)) : [];
        return (
          <>
            <div className="page-head">
              <div>
                <h1 className="page-title">{label({ ar: g.nameAr, en: g.nameEn })}</h1>
                <div className="module-meta">
                  <Link to={`/programs/${g.program._id}`}>{label({ ar: g.program.titleAr, en: g.program.titleEn })}</Link>
                  {' · '}{fmtDay(g.startDate)}{g.endDate ? ` – ${fmtDay(g.endDate)}` : ''}
                  {g.instructor ? ` · ${g.instructor}` : ''}
                  {' · '}{t('grpMembers')}: {g.members}{g.capacity ? ` / ${g.capacity}` : ''}
                </div>
                <div className="tags">
                  {covered.length ? covered.map((m) => <span className="tag" key={m._id}>{label({ ar: m.titleAr, en: m.titleEn })}</span>) : <span className="tag">{t('grpAllModules')}</span>}
                </div>
              </div>
              <ZoomStatus connected={d.zoomConnected} canManage={d.canManage} />
            </div>
            <div className="tabs" role="tablist">
              {['grpLectures', 'grpMembers'].map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{t(k)}</button>)}
            </div>
            {tab === 'grpLectures' && <LecturesTab group={g} modules={covered.length ? covered : d.modules.filter((m) => m.active)} zoomConnected={d.zoomConnected} canManage={d.canManage} />}
            {tab === 'grpMembers' && <MembersTab group={g} canManage={d.canManage} canEnroll={d.canEnroll} onChanged={state.reload} />}
          </>
        );
      }}
    </Loading>
  );
}

// ---- lectures ----

function LecturesTab({ group, modules, zoomConnected, canManage }) {
  const { t, label, fmtDate } = useI18n();
  const state = useLoad(`/api/v2/groups/${group._id}/lectures`);
  const [dialog, setDialog] = useState(null);
  const [msg, setMsg] = useState('');
  const done = () => { setDialog(null); state.reload(); };
  const sync = (l) => {
    setMsg('');
    api(`/api/v2/lectures/${l._id}/sync`, { method: 'POST' })
      .then((r) => { setMsg(`${t('lecAttendance')}: ${r.attendance}${r.recording ? ` · ${t('lecRecordings')} ✓` : ''}`); state.reload(); })
      .catch((e) => setMsg(e.message));
  };
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('grpLectures')}</h2>
        {canManage && <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'form' })}>+ {t('lecNew')}</button>}
      </div>
      <p className="muted"><small>{t('lecHostHint')}</small></p>
      {msg && <div className="alert alert--info">{msg}</div>}
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('lecStartsAt')}</th><th>{t('lecTitleAr')}</th><th>{t('lecLinkMode')}</th><th>{t('status')}</th><th>{t('lecAttendance')}</th><th /></tr></thead>
              <tbody>
                {d.items.map((l) => (
                  <tr key={l._id}>
                    <td className="nowrap">{fmtDate(l.startsAt)}<br /><small className="muted">{l.durationMin} {t('lecMinutes')}</small></td>
                    <td>
                      <strong>{label({ ar: l.titleAr, en: l.titleEn })}</strong>
                      {l.module && modules.find((m) => m._id === l.module) && <><br /><small className="muted">{label({ ar: modules.find((m) => m._id === l.module).titleAr, en: modules.find((m) => m._id === l.module).titleEn })}</small></>}
                      {l.status === 'cancelled' && l.cancelReason && <><br /><small className="late">{l.cancelReason}</small></>}
                      {l.zoom?.lastError && <><br /><small className="late">{t('lecZoomError')}: {l.zoom.lastError}</small></>}
                    </td>
                    <td>
                      <Pill tone={l.zoom?.managed ? 'ok' : l.zoom?.joinUrl ? 'info' : 'warn'}>{l.zoom?.managed ? t('lecManaged') : l.zoom?.joinUrl ? t('lecManualLink') : t('lecNoLink')}</Pill>
                      {l.zoom?.passcode && <><br /><small>{t('lecPasscode')}: <code dir="ltr">{l.zoom.passcode}</code></small></>}
                      {l.zoom?.joinUrl && <div className="row"><CopyButton text={l.zoom.joinUrl} /><small className="muted">{t('lecGeneralLink')}</small></div>}
                    </td>
                    <td><Pill tone={STATE_TONE[l.state]}>{t(`lecState_${l.state}`)}</Pill>{l.recordings?.length ? <><br /><small>{t('lecRecordings')}: {l.recordings.length}</small></> : null}</td>
                    <td>{l.attendance.present} {t('lecPresent')}<br /><small className="muted">{l.attendance.clicked} {t('lecClicks')}</small></td>
                    <td className="row">
                      <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'attendance', item: l })}>{t('lecAttendance')}</button>
                      {canManage && l.status !== 'cancelled' && <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'form', item: l })}>{t('edit')}</button>}
                      {canManage && l.zoom?.managed && l.state === 'ended' && zoomConnected && <button type="button" className="btn btn--small btn--ghost" onClick={() => sync(l)}>{t('lecSync')}</button>}
                      {canManage && l.status !== 'cancelled' && l.state !== 'ended' && <button type="button" className="btn btn--small btn--danger" onClick={() => setDialog({ kind: 'cancel', item: l })}>{t('lecCancel')}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Loading>
      {dialog?.kind === 'form' && <LectureForm group={group} lecture={dialog.item} modules={modules} zoomConnected={zoomConnected} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'cancel' && <ReasonDialog title={t('lecCancel')} onClose={() => setDialog(null)} onSubmit={(reason) => api(`/api/v2/lectures/${dialog.item._id}/cancel`, { method: 'POST', body: { reason } }).then(done)} />}
      {dialog?.kind === 'attendance' && <AttendanceDialog lecture={dialog.item} canManage={canManage} onClose={() => { setDialog(null); state.reload(); }} />}
    </section>
  );
}

function RowsEditor({ rows, onChange, withPasscode }) {
  const { t } = useI18n();
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="stack">
      {rows.map((r, i) => (
        <div className="row" key={i}>
          <input placeholder={t('lecItemTitle')} value={r.title} onChange={(e) => set(i, 'title', e.target.value)} />
          <input dir="ltr" placeholder="https://" value={r.url} onChange={(e) => set(i, 'url', e.target.value)} />
          {withPasscode && <input dir="ltr" placeholder={t('lecPasscode')} value={r.passcode || ''} onChange={(e) => set(i, 'passcode', e.target.value)} />}
          <button type="button" className="icon-btn" aria-label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div><button type="button" className="btn btn--small btn--ghost" onClick={() => onChange([...rows, { title: '', url: '', passcode: '' }])}>{t('lecAddRow')}</button></div>
    </div>
  );
}

function LectureForm({ group, lecture, modules, zoomConnected, onClose, onSaved }) {
  const { t, label } = useI18n();
  const editing = !!lecture;
  const [f, setF] = useState({
    titleAr: lecture?.titleAr || '', titleEn: lecture?.titleEn || '', module: editing ? lecture.module || '' : modules.length === 1 ? modules[0]._id : '',
    startsAt: toLocalInput(lecture?.startsAt), durationMin: lecture?.durationMin || 90,
    mode: editing ? (lecture.zoom?.managed ? 'zoom' : 'manual') : zoomConnected ? 'zoom' : 'manual',
    registration: true, joinUrl: lecture?.zoom?.joinUrl || '', passcode: lecture?.zoom?.passcode || '',
    materials: lecture?.materials || [], recordings: (lecture?.recordings || []).filter((r) => r.source !== 'zoom'), notes: lecture?.notes || ''
  });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const body = {
      titleAr: f.titleAr, titleEn: f.titleEn, module: f.module || null, startsAt: fromLocalInput(f.startsAt), durationMin: Number(f.durationMin),
      materials: f.materials.filter((m) => m.title && m.url), notes: f.notes
    };
    if (!editing) Object.assign(body, { mode: f.mode, registration: f.registration });
    if (f.mode === 'manual') Object.assign(body, { joinUrl: f.joinUrl, passcode: f.passcode });
    if (editing) Object.assign(body, { __v: lecture.__v, recordings: f.recordings.filter((r) => r.url) });
    const req = editing ? api(`/api/v2/lectures/${lecture._id}`, { method: 'PUT', body }) : api(`/api/v2/groups/${group._id}/lectures`, { method: 'POST', body });
    run(() => req).then(onSaved).catch(() => {});
  };
  const zoomRecordings = (lecture?.recordings || []).filter((r) => r.source === 'zoom');
  return (
    <Modal title={editing ? t('edit') : t('lecNew')} onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        <Field label={`${t('lecTitleAr')} *`}><input required value={f.titleAr} onChange={set('titleAr')} /></Field>
        <Field label={t('lecTitleEn')}><input dir="ltr" value={f.titleEn} onChange={set('titleEn')} /></Field>
        <Field label={`${t('lecStartsAt')} *`}><input type="datetime-local" required value={f.startsAt} onChange={set('startsAt')} /></Field>
        <Field label={t('lecDuration')}><input type="number" min={5} max={600} value={f.durationMin} onChange={set('durationMin')} /></Field>
        <Field label={t('lecModule')} wide>
          <select value={f.module} onChange={set('module')}>
            <option value="">{t('lecNoModule')}</option>
            {modules.map((m) => <option key={m._id} value={m._id}>{label({ ar: m.titleAr, en: m.titleEn })}</option>)}
          </select>
        </Field>
        {!editing && (
          <fieldset className="field--wide checks">
            <legend>{t('lecLinkMode')}</legend>
            <label className="check"><input type="radio" name="mode" value="zoom" checked={f.mode === 'zoom'} disabled={!zoomConnected} onChange={set('mode')} /> {t('lecModeZoom')}{!zoomConnected && <small className="muted"> ({t('grpZoomOff')})</small>}</label>
            {f.mode === 'zoom' && <label className="check"><input type="checkbox" checked={f.registration} onChange={set('registration')} /> {t('lecRegistration')}</label>}
            <label className="check"><input type="radio" name="mode" value="manual" checked={f.mode === 'manual'} onChange={set('mode')} /> {t('lecModeManual')}</label>
          </fieldset>
        )}
        {f.mode === 'manual' && (
          <>
            <Field label={t('lecJoinUrl')}><input dir="ltr" type="url" placeholder="https://zoom.us/j/..." value={f.joinUrl} onChange={set('joinUrl')} /></Field>
            <Field label={t('lecPasscode')}><input dir="ltr" value={f.passcode} onChange={set('passcode')} /></Field>
          </>
        )}
        <div className="field field--wide">{t('lecMaterials')}<RowsEditor rows={f.materials} onChange={(materials) => setF({ ...f, materials })} /></div>
        {editing && (
          <div className="field field--wide">
            {t('lecRecordings')}
            {zoomRecordings.map((r) => <div key={r._id}><small>Zoom: <a href={r.url} target="_blank" rel="noreferrer" dir="ltr">{r.url}</a></small></div>)}
            <RowsEditor rows={f.recordings} withPasscode onChange={(recordings) => setF({ ...f, recordings })} />
          </div>
        )}
        <Field label={t('note')} wide><input value={f.notes} onChange={set('notes')} /></Field>
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function ReasonDialog({ title, onClose, onSubmit }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal title={title} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => onSubmit(reason)).catch(() => {}); }}>
        <Field label={`${t('reason')} *`}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--danger" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function AttendanceDialog({ lecture, canManage, onClose }) {
  const { t, label, fmtDate } = useI18n();
  const state = useLoad(`/api/v2/lectures/${lecture._id}/attendance`);
  const mark = (customer, present) => api(`/api/v2/lectures/${lecture._id}/attendance`, { method: 'POST', body: { customer, present } }).then(state.reload);
  return (
    <Modal title={`${t('lecAttendance')}: ${label({ ar: lecture.titleAr, en: lecture.titleEn })}`} onClose={onClose} wide>
      <Loading state={state}>
        {(d) => (
          <>
            {d.lecture.syncedAt && <p className="muted"><small>{t('lecSynced')}: {fmtDate(d.lecture.syncedAt)}</small></p>}
            {!d.items.length ? <p className="muted">{t('noData')}</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('customerNo')}</th><th>{t('name')}</th><th>{t('lecAttendance')}</th><th>{t('lecMinutes')}</th><th>{t('lecClicks')}</th><th>{t('lecSource')}</th>{canManage && <th />}</tr></thead>
                  <tbody>
                    {d.items.map((r) => (
                      <tr key={r.customer._id}>
                        <td>{r.customer.customerNo}</td>
                        <td>{r.customer.name}</td>
                        <td><Pill tone={r.present ? 'ok' : 'muted'}>{r.present ? t('lecPresent') : t('lecAbsent')}</Pill></td>
                        <td>{r.minutes || '—'}</td>
                        <td>{r.clicks || '—'}</td>
                        <td>{t(`src_${r.source}`)}</td>
                        {canManage && <td><button type="button" className="btn btn--small btn--ghost" onClick={() => mark(r.customer._id, !r.present)}>{r.present ? t('lecMarkAbsent') : t('lecMarkPresent')}</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Loading>
    </Modal>
  );
}

// ---- members ----

function MembersTab({ group, canManage, canEnroll, onChanged }) {
  const { t, fmtDay } = useI18n();
  const [removed, setRemoved] = useState(false);
  const state = useLoad(`/api/v2/groups/${group._id}/members?removed=${removed ? 1 : 0}`, [removed]);
  const [dialog, setDialog] = useState(null);
  const done = () => { setDialog(null); state.reload(); onChanged(); };
  return (
    <section className="card">
      <div className="card-head">
        <h2>{removed ? t('grpShowRemoved') : t('grpMembers')}</h2>
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={() => setRemoved(!removed)}>{removed ? t('grpShowActive') : t('grpShowRemoved')}</button>
          {canManage && !removed && <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'add' })}>+ {t('grpAddMembers')}</button>}
        </div>
      </div>
      <Loading state={state}>
        {(d) => (
          <>
            {!removed && <p className="muted">{t('grpHeld')}: {d.held}</p>}
            {!d.items.length ? <p className="muted">{t('noData')}</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('customerNo')}</th><th>{t('name')}</th><th>{t('enrollmentsNav')}</th>{!removed && <th>{t('grpAttendanceRate')}</th>}<th>{removed ? t('grpRemovedAt') : t('grpAddedAt')}</th>{canManage && !removed && <th />}</tr></thead>
                  <tbody>
                    {d.items.map((m) => (
                      <tr key={m._id}>
                        <td>{m.customer.canOpen ? <Link to={`/customers/${m.customer._id}`}>{m.customer.customerNo}</Link> : m.customer.customerNo}</td>
                        <td>{m.customer.name}{!m.hasPortal && <><br /><small className="late">{t('grpNoPortal')}</small></>}{m.hasPortal && !m.hasEmail && <><br /><small className="muted">{t('grpNoEmail')}</small></>}</td>
                        <td>{m.enrollment ? <Link to={`/enrollments/${m.enrollment._id}`}>{m.enrollment.enrollmentNo}</Link> : <small className="late">{t('grpNotEnrolled')}</small>}</td>
                        {!removed && <td>{m.rate === null ? '—' : `${m.rate}%`} <small className="muted">({m.attended}/{d.held})</small></td>}
                        <td>{fmtDay(removed ? m.removedAt : m.addedAt)}{removed && m.removeReason ? <><br /><small className="muted">{m.removeReason}</small></> : null}</td>
                        {canManage && !removed && <td><button type="button" className="btn btn--small btn--ghost" onClick={() => setDialog({ kind: 'remove', item: m })}>{t('grpRemove')}</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Loading>
      {dialog?.kind === 'add' && <BulkAdd group={group} canEnroll={canEnroll} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'remove' && <ReasonDialog title={`${t('grpRemoveTitle')}: ${dialog.item.customer.customerNo}`} onClose={() => setDialog(null)} onSubmit={(reason) => api(`/api/v2/groups/${group._id}/members/${dialog.item._id}/remove`, { method: 'POST', body: { reason } }).then(done)} />}
    </section>
  );
}

function BulkAdd({ group, canEnroll, onClose, onDone }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [picked, setPicked] = useState({});
  const [enroll, setEnroll] = useState(false);
  const [result, setResult] = useState(null);
  const { busy, error, run } = useAction();
  const check = (body) => run(() => api(`/api/v2/groups/${group._id}/members/preview`, { method: 'POST', body })).then((p) => {
    setPreview(p);
    setPicked(Object.fromEntries(p.found.filter((f) => !f.alreadyMember).map((f) => [f._id, true])));
    setResult(null);
  }).catch(() => {});
  const chosen = Object.keys(picked).filter((k) => picked[k]);
  const missing = preview ? preview.found.filter((f) => picked[f._id] && !f.enrollmentNo).length : 0;
  const add = () => run(() => api(`/api/v2/groups/${group._id}/members`, { method: 'POST', body: { customers: chosen, enroll } })).then(setResult).catch(() => {});

  if (result) {
    return (
      <Modal title={t('grpResult')} onClose={onDone}>
        <ul className="plain-list">
          <li>{t('grpAdded')}: <strong>{result.added}</strong></li>
          {result.enrolled > 0 && <li>{t('grpEnrolledNew')}: {result.enrolled}</li>}
          {result.notEnrolled > 0 && <li className="late">{t('grpNotEnrolled')}: {result.notEnrolled}</li>}
          {result.already > 0 && <li>{t('grpAlready')}: {result.already}</li>}
          {result.full > 0 && <li className="late">{t('grpFull')}: {result.full}</li>}
          {result.failed.length > 0 && <li className="late">{t('grpFailed')}: {result.failed.map((f) => `${f.customerNo} (${f.message})`).join('، ')}</li>}
        </ul>
        <button type="button" className="btn btn--primary" onClick={onDone}>{t('close')}</button>
      </Modal>
    );
  }
  return (
    <Modal title={t('grpAddMembers')} onClose={onClose} wide>
      <div className="stack">
        <Field label={t('grpPasteHint')}><textarea rows={6} dir="ltr" value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={busy || !text.trim()} onClick={() => check({ text })}>{t('grpCheck')}</button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => check({ source: 'program' })}>{t('grpFromProgram')}</button>
        </div>
        <ErrorBox error={error} />
        {preview && (
          <>
            <h3>{t('grpFound')}: {preview.found.length}</h3>
            {preview.found.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th><input type="checkbox" aria-label="all" checked={chosen.length > 0 && chosen.length === preview.found.filter((f) => !f.alreadyMember).length} onChange={(e) => setPicked(Object.fromEntries(preview.found.filter((f) => !f.alreadyMember).map((f) => [f._id, e.target.checked])))} /></th><th>{t('customerNo')}</th><th>{t('name')}</th><th>{t('grpMatchedBy')}</th><th>{t('status')}</th></tr></thead>
                  <tbody>
                    {preview.found.map((f) => (
                      <tr key={f._id}>
                        <td><input type="checkbox" disabled={f.alreadyMember} checked={!!picked[f._id]} onChange={(e) => setPicked({ ...picked, [f._id]: e.target.checked })} /></td>
                        <td>{f.customerNo}</td>
                        <td>{f.name}<br /><small className="muted" dir="ltr">{f.line}</small></td>
                        <td>{t(`match_${f.matchedBy}`)}</td>
                        <td>{f.alreadyMember ? <Pill tone="muted">{t('grpAlready')}</Pill> : f.enrollmentNo ? <small>{f.enrollmentNo}</small> : <Pill tone="gold">{t('grpNotEnrolled')}</Pill>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.notFound.length > 0 && <div className="alert alert--warn"><strong>{t('grpNotFound')} ({preview.notFound.length}):</strong> <span dir="ltr">{preview.notFound.join('، ')}</span></div>}
            {preview.ambiguous.length > 0 && <div className="alert alert--warn"><strong>{t('grpAmbiguous')}:</strong> {preview.ambiguous.map((a) => `${a.line} → ${a.matches.map((m) => m.customerNo).join('/')}`).join('، ')}</div>}
            {missing > 0 && canEnroll && <label className="check"><input type="checkbox" checked={enroll} onChange={(e) => setEnroll(e.target.checked)} /> {t('grpEnrollMissing')} ({missing})</label>}
            {preview.capacity > 0 && <p className="muted">{t('capacity')}: {preview.members} / {preview.capacity}</p>}
            <div className="row">
              <button type="button" className="btn btn--primary" disabled={busy || !chosen.length} onClick={add}>{t('grpAddSelected')} ({chosen.length})</button>
              <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// The groups of one customer, on the customer file
export function CustomerGroups({ c }) {
  const { t, label, fmtDay } = useI18n();
  const state = useLoad(`/api/v2/customers/${c._id}/groups`, [c._id]);
  if (state.data && !state.data.items.length) return null;
  return (
    <section className="card">
      <h2>{t('groupsNav')}</h2>
      <Loading state={state}>
        {(d) => (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('name')}</th><th>{t('grpProgram')}</th><th>{t('grpAttendanceRate')}</th><th>{t('status')}</th></tr></thead>
              <tbody>
                {d.items.map((m) => (
                  <tr key={m._id}>
                    <td><Link to={`/groups/${m.cohort._id}`}>{label({ ar: m.cohort.nameAr, en: m.cohort.nameEn })}</Link><br /><small className="muted">{fmtDay(m.cohort.startDate)}</small></td>
                    <td>{m.cohort.program ? label({ ar: m.cohort.program.titleAr, en: m.cohort.program.titleEn }) : '—'}</td>
                    <td>{m.rate === null ? '—' : `${m.rate}%`} <small className="muted">({m.attended}/{m.held})</small></td>
                    <td><Pill tone={m.status === 'active' ? 'ok' : 'muted'}>{m.status === 'active' ? t('grpShowActive') : t('grpShowRemoved')}</Pill>{m.removeReason ? <><br /><small className="muted">{m.removeReason}</small></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loading>
    </section>
  );
}
