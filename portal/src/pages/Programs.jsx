import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pager, Pill, useAction, useLoad } from '../components/ui.jsx';
import { ProgramForm } from './Website.jsx';
import { LectureForm } from './Groups.jsx';

// The lectures of one module, on the program page: everyone enrolled sees them at once. The owner
// presses "the module is finished": whoever entered all its lectures gets the module's certificate.
function ModuleLectures({ programId, module: m, lectures, enrolled, canEdit, zoomConnected, onChanged }) {
  const { t, fmtDate } = useI18n();
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState('');
  const { busy, error, run } = useAction();
  // m is null for a program without modules: the server keeps its lectures in one hidden module
  const mine = m ? lectures.filter((l) => String(l.module) === String(m._id)) : lectures;
  const finish = () => run(() => api(`/api/v2/modules/${m._id}/finish`, { method: 'POST' })).then((r) => {
    setConfirm(false);
    setMsg(t('pg_finishDone').replace('{n}', r.completed).replace('{c}', r.issued).replace('{w}', r.waitingPayment).replace('{m}', r.missing));
    onChanged();
  }).catch(() => {});
  const reopen = () => run(() => api(`/api/v2/modules/${m._id}/reopen`, { method: 'POST' })).then(() => { setMsg(''); onChanged(); }).catch(() => {});
  return (
    <div className="mod-lectures">
      <div className="mod-lectures__head">
        <strong>{t('pg_lectures')} ({mine.length})</strong>
        {m?.finishedAt && <Pill tone="ok">{t('pg_finished')}</Pill>}
        <span className="grow" />
        {canEdit && <button type="button" className="btn btn--small" onClick={() => setForm({})}>+ {t('pg_addLecture')}</button>}
        {canEdit && m && !m.finishedAt && mine.length > 0 && <button type="button" className="btn btn--small btn--primary" onClick={() => setConfirm(true)}>{t('pg_finish')}</button>}
        {canEdit && m?.finishedAt && <button type="button" className="btn btn--small btn--ghost" disabled={busy} onClick={reopen}>{t('pg_reopen')}</button>}
      </div>
      {!mine.length ? <p className="muted mod-lectures__empty">{t('pg_noLectures')}</p> : (
        <ol className="mod-lectures__list">
          {mine.map((l) => (
            <li key={l._id} className={l.status === 'cancelled' ? 'is-cancelled' : ''}>
              <span className="grow"><strong>{l.titleAr}</strong><br /><small className="muted">{fmtDate(l.startsAt)} · {l.durationMin} {t('minutesShort')}{l.recordings?.length ? ` · ${t('pg_hasRecording')}` : ''}</small></span>
              {l.zoom?.joinUrl || l.zoom?.managed ? <Pill tone="ok">{t('pg_hasLink')}</Pill> : <Pill tone="warn">{t('pg_noLink')}</Pill>}
              <small className="muted nowrap">{t('pg_entered')} {l.entered || 0} / {enrolled}</small>
              {canEdit && l.status !== 'cancelled' && <button type="button" className="btn btn--small btn--ghost" onClick={() => setForm({ item: l })}>{t('edit')}</button>}
            </li>
          ))}
        </ol>
      )}
      {msg && <div className="alert alert--ok">{msg}</div>}
      <ErrorBox error={error} />
      {form && <LectureForm postUrl={`/api/v2/programs/${programId}/lectures`} lecture={form.item} modules={m ? [m] : []} zoomConnected={zoomConnected} onClose={() => setForm(null)} onSaved={() => { setForm(null); onChanged(); }} />}
      {confirm && (
        <Modal title={`${t('pg_finish')}: ${m?.titleAr || ''}`} onClose={() => setConfirm(false)}>
          <div className="stack">
            <p>{t('pg_finishConfirm')}</p>
            <div className="row"><button type="button" className="btn btn--primary" disabled={busy} onClick={finish}>{t('pg_finish')}</button><button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>{t('cancel')}</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Programs() {
  const { t, en, label } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState({ q: '', type: '', page: 1 });
  const params = new URLSearchParams({ page: String(query.page), limit: '100' });
  if (query.q) params.set('q', query.q);
  if (query.type) params.set('type', query.type);
  const state = useLoad(`/api/v2/programs?${params}`);
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const specialties = useLoad(adding ? '/api/v2/website/specialties' : null, [adding]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('programsNav')}</h1>
          <p className="muted" style={{ margin: 0 }}>{t('pg_allInOne')}</p>
        </div>
        {can('website.manage', 'all') && <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>+ {t('wsNewProgram')}</button>}
      </div>
      {adding && <ProgramForm specialties={specialties.data?.items || []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); state.reload(); }} />}
      <form className="card filters" onSubmit={(e) => { e.preventDefault(); setQuery({ ...query, q, page: 1 }); }}>
        <Field label={t('search')}><input value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label={t('type')}>
          <select value={query.type} onChange={(e) => setQuery({ ...query, type: e.target.value, page: 1 })}>
            <option value="">{t('all')}</option>
            {['course', 'diploma', 'master', 'phd'].map((x) => <option key={x} value={x}>{en('programType', x)}</option>)}
          </select>
        </Field>
        <button className="btn btn--primary">{t('apply')}</button>
      </form>
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noResults')}</p> : (
            <>
              <div className="table-wrap">
                <table className="table table--hover">
                  <thead><tr><th>{t('program')}</th><th>{t('type')}</th><th>{t('modules')}</th><th>{t('enrollmentsNav')}</th><th>{t('status')}</th></tr></thead>
                  <tbody>
                    {d.items.map((p) => (
                      <tr key={p._id} onClick={() => navigate(`/programs/${p._id}`)}>
                        <td><strong>{label({ ar: p.titleAr, en: p.titleEn })}</strong><br /><small className="muted">{p.specialty}</small></td>
                        <td>{en('programType', p.type)}</td>
                        <td>{p.modules || <span className="muted">0</span>}</td>
                        <td>{p.openEnrollments}</td>
                        <td><small className="muted">{t(`wsStatus_${p.status}`)}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={query.page} total={d.total} limit={d.limit} onPage={(p) => setQuery({ ...query, page: p })} />
            </>
          ))}
        </Loading>
      </section>
    </>
  );
}

function ModuleForm({ programId, mod, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState({
    code: mod?.code || '', titleAr: mod?.titleAr || '', titleEn: mod?.titleEn || '', descriptionAr: mod?.descriptionAr || '', descriptionEn: mod?.descriptionEn || '',
    requirements: (mod?.requirements || []).join('\n'), hours: mod?.hours || 0, required: mod ? mod.required : true, certificate: mod ? mod.certificate : true, active: mod ? mod.active : true
  });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const body = { ...f, hours: Number(f.hours) || 0, requirements: f.requirements.split('\n').map((x) => x.trim()).filter(Boolean) };
    const req = mod ? api(`/api/v2/modules/${mod._id}`, { method: 'PUT', body: { ...body, __v: mod.__v } }) : api(`/api/v2/programs/${programId}/modules`, { method: 'POST', body });
    run(() => req).then(onSaved).catch(() => {});
  };
  return (
    <Modal title={mod ? t('edit') : t('newModule')} onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        <Field label={`${t('nameAr')} *`}><input required value={f.titleAr} onChange={set('titleAr')} /></Field>
        <Field label={t('nameEn')}><input dir="ltr" value={f.titleEn} onChange={set('titleEn')} /></Field>
        <Field label={t('codeLabel')}><input dir="ltr" value={f.code} onChange={set('codeLabel')} /></Field>
        <Field label={t('hoursLabel')}><input type="number" min={0} value={f.hours} onChange={set('hours')} /></Field>
        <Field label={t('description')} wide><textarea rows={3} value={f.descriptionAr} onChange={set('descriptionAr')} /></Field>
        <Field label={`${t('description')} (EN)`} wide><textarea dir="ltr" rows={2} value={f.descriptionEn} onChange={set('descriptionEn')} /></Field>
        <Field label={t('requirements')} hint={t('requirementsHint')} wide><textarea rows={4} value={f.requirements} onChange={set('requirements')} /></Field>
        <label className="check"><input type="checkbox" checked={f.required} onChange={set('required')} /> {t('requiredModule')}</label>
        <label className="check"><input type="checkbox" checked={f.certificate} onChange={set('certificate')} /> {t('moduleCertificate')}</label>
        {mod && <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> {t('active')}</label>}
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function CohortForm({ programId, cohort, modules = [], onClose, onSaved }) {
  const { t, label } = useI18n();
  const d = (v) => (v ? String(v).slice(0, 10) : '');
  const [f, setF] = useState({
    nameAr: cohort?.nameAr || '', nameEn: cohort?.nameEn || '', startDate: d(cohort?.startDate), endDate: d(cohort?.endDate), schedule: cohort?.schedule || '',
    instructor: cohort?.instructor || '', delivery: cohort?.delivery || 'online', capacity: cohort?.capacity || 0, status: cohort?.status || 'open', notes: cohort?.notes || '',
    modules: cohort?.modules || []
  });
  const toggleModule = (id) => setF({ ...f, modules: f.modules.includes(id) ? f.modules.filter((m) => m !== id) : [...f.modules, id] });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const req = cohort ? api(`/api/v2/cohorts/${cohort._id}`, { method: 'PUT', body: { ...f, __v: cohort.__v } }) : api(`/api/v2/programs/${programId}/cohorts`, { method: 'POST', body: f });
    run(() => req).then(onSaved).catch(() => {});
  };
  return (
    <Modal title={cohort ? t('edit') : t('newCohort')} onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        <Field label={`${t('nameAr')} *`}><input required value={f.nameAr} onChange={set('nameAr')} /></Field>
        <Field label={t('nameEn')}><input dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
        <Field label={t('startDate')}><input type="date" value={f.startDate} onChange={set('startDate')} /></Field>
        <Field label={t('endDate')}><input type="date" value={f.endDate} onChange={set('endDate')} /></Field>
        <Field label={t('schedule')}><input value={f.schedule} onChange={set('schedule')} /></Field>
        <Field label={t('instructor')}><input value={f.instructor} onChange={set('instructor')} /></Field>
        <Field label={t('delivery')}><select value={f.delivery} onChange={set('delivery')}>{['online', 'onsite', 'hybrid'].map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></Field>
        <Field label={t('capacity')} hint={t('capacityHint')}><input type="number" min={0} value={f.capacity} onChange={set('capacity')} /></Field>
        <Field label={t('status')}><select value={f.status} onChange={set('status')}>{['planned', 'open', 'running', 'finished', 'cancelled'].map((x) => <option key={x} value={x}>{t(`coSt_${x}`)}</option>)}</select></Field>
        <Field label={t('note')} wide><input value={f.notes} onChange={set('notes')} /></Field>
        {modules.length > 0 && (
          <fieldset className="field--wide checks">
            <legend>{t('grpModules')} <small className="muted">{t('grpModulesHint')}</small></legend>
            {modules.map((m) => <label className="check" key={m._id}><input type="checkbox" checked={f.modules.includes(m._id)} onChange={() => toggleModule(m._id)} /> {label({ ar: m.titleAr, en: m.titleEn })}</label>)}
          </fieldset>
        )}
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// The program's accreditations (printed on its certificates), and a module that has its own:
// changing one module never changes the others (16 Nov 2026)
function ProgramAccreditations({ programId, canEdit }) {
  const { t, label } = useI18n();
  const state = useLoad(`/api/v2/programs/${programId}/accreditations`, [programId]);
  const [ids, setIds] = useState(null);
  const [mod, setMod] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('acc_title')}</h2>
        <p className="muted" style={{ margin: 0, flexBasis: '100%' }}>{t('acc_hint')}</p>
      </div>
      <Loading state={state}>
        {(d) => {
          if (!d.items.length) return <p className="muted">{t('acc_none')} <Link to="/certificates">{t('acc_add')}</Link></p>;
          const chosen = ids ?? d.items.filter((a) => a.inProgram).map((a) => String(a._id));
          const nameOf = (id) => { const a = d.items.find((x) => String(x._id) === id); return a ? label({ ar: a.nameAr, en: a.nameEn }) : ''; };
          const save = async () => {
            setBusy(true);
            try { await api(`/api/v2/programs/${programId}/accreditations`, { method: 'PUT', body: { ids: chosen } }); setSaved(true); setIds(null); state.reload(); } finally { setBusy(false); }
          };
          return (
            <>
              <div className="acc-grid">
                {d.items.map((a) => (
                  <label key={a._id} className={`acc-pick${chosen.includes(String(a._id)) ? ' on' : ''}`}>
                    <input type="checkbox" disabled={!canEdit || a.allPrograms} checked={chosen.includes(String(a._id))} onChange={() => { setSaved(false); setIds(toggle(chosen, String(a._id))); }} />
                    {a.logo && <img src={a.logo} alt="" />}
                    <span><strong>{label({ ar: a.nameAr, en: a.nameEn })}</strong>{a.body && <small className="muted">{a.body}</small>}{a.allPrograms && <small className="muted">{t('acc_all')}</small>}</span>
                  </label>
                ))}
              </div>
              {canEdit && ids !== null && <div className="row" style={{ marginTop: 10 }}><button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={save}>{t('save')}</button></div>}
              {saved && <div className="alert alert--ok">{t('saved')}</div>}
              {d.modules.length > 0 && (
                <div className="acc-modules">
                  <h3>{t('acc_modules')}</h3>
                  <ul className="plain-list">
                    {d.modules.map((m) => (
                      <li key={m._id}>
                        <span><strong>{label({ ar: m.titleAr, en: m.titleEn })}</strong><br /><small className="muted">{m.custom ? (m.ids.map(nameOf).filter(Boolean).join('، ') || t('acc_noneOnModule')) : t('acc_sameAsProgram')}</small></span>
                        {canEdit && <button type="button" className="btn btn--small btn--ghost" onClick={() => setMod({ ...m, ids: m.custom ? m.ids : chosen })}>{t('edit')}</button>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {mod && (
                <Modal title={`${t('acc_moduleTitle')}: ${mod.titleAr}`} onClose={() => setMod(null)}>
                  <label className="check settings__check"><input type="radio" checked={!mod.custom} onChange={() => setMod({ ...mod, custom: false })} /> {t('acc_sameAsProgram')}</label>
                  <label className="check settings__check"><input type="radio" checked={mod.custom} onChange={() => setMod({ ...mod, custom: true })} /> {t('acc_custom')}</label>
                  {mod.custom && (
                    <div className="acc-grid" style={{ marginTop: 10 }}>
                      {d.items.map((a) => (
                        <label key={a._id} className={`acc-pick${mod.ids.includes(String(a._id)) ? ' on' : ''}`}>
                          <input type="checkbox" checked={mod.ids.includes(String(a._id))} onChange={() => setMod({ ...mod, ids: toggle(mod.ids, String(a._id)) })} />
                          <span><strong>{label({ ar: a.nameAr, en: a.nameEn })}</strong></span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="muted"><small>{t('acc_moduleNote')}</small></p>
                  <div className="row">
                    <button type="button" className="btn btn--primary" onClick={async () => { await api(`/api/v2/modules/${mod._id}/accreditations`, { method: 'PUT', body: { custom: mod.custom, ids: mod.ids } }); setMod(null); state.reload(); }}>{t('save')}</button>
                    <button type="button" className="btn btn--ghost" onClick={() => setMod(null)}>{t('cancel')}</button>
                  </div>
                </Modal>
              )}
            </>
          );
        }}
      </Loading>
    </section>
  );
}

export function ProgramDetail() {
  const { id } = useParams();
  const { t, en, label, fmtDay } = useI18n();
  const { can } = useAuth();
  const state = useLoad(`/api/v2/programs/${id}`, [id]);
  const specialties = useLoad(can('website.manage', 'all') ? '/api/v2/website/specialties' : null);
  const lectures = useLoad(`/api/v2/programs/${id}/lectures`, [id]);
  const zoomStatus = useLoad(can('programs.update', 'all') ? '/api/v2/zoom/status' : null);
  const [dialog, setDialog] = useState(null);
  const [rule, setRule] = useState(null);
  const canEdit = can('programs.update', 'all');
  const done = () => { setDialog(null); state.reload(); };

  const move = async (modules, index, dir) => {
    const list = modules.filter((m) => m.active).map((m) => m._id);
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    await api(`/api/v2/programs/${id}/modules/order`, { method: 'POST', body: { ids: list } });
    state.reload();
  };

  return (
    <Loading state={state}>
      {({ item: p, modules, cohorts, waiting = 0 }) => {
        const active = modules.filter((m) => m.active);
        const retired = modules.filter((m) => !m.active);
        const required = rule ?? p.modulesRequired ?? 0;
        return (
          <>
            <Link to="/programs" className="muted">← {t('programsNav')}</Link>
            <h1 className="page-title">{label({ ar: p.titleAr, en: p.titleEn })} <small className="muted">{en('programType', p.type)}</small></h1>

            {/* How the program shows on the website: edited here, not in a second place */}
            <section className="card program-site">
              <div className="card-head">
                <h2>{t('pg_site')}</h2>
                {can('website.manage', 'all') && <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'site' })}>{t('edit')}</button>}
              </div>
              <div className="program-site__row">
                {p.image ? <img src={p.image} alt="" className="program-site__img" loading="lazy" /> : <div className="program-site__img program-site__img--empty" aria-hidden="true">▤</div>}
                <div className="program-site__info">
                  <div><strong>{t('wsPrice')}:</strong> <span dir="ltr">{p.price} {p.currency}</span>{p.discountPercent ? ` (−${p.discountPercent}%)` : ''}</div>
                  <div><strong>{t('status')}:</strong> {t(`wsStatus_${p.status}`)}{p.featured ? ` · ${t('wsFeatured')}` : ''}</div>
                  {p.descriptionAr && <p className="muted program-site__desc">{p.descriptionAr}</p>}
                  <a href={`/pages/ar/program-detail.html?slug=${encodeURIComponent(p.slug || p._id)}`} target="_blank" rel="noopener noreferrer">{t('pg_viewOnSite')} ↗</a>
                </div>
              </div>
            </section>
            {waiting > 0 && <div className="alert alert--info">{waiting} {t('pg_waiting')}</div>}

            <section className="card">
              <div className="card-head">
                <h2>{t('modules')} ({active.length})</h2>
                <p className="muted" style={{ margin: 0, flexBasis: '100%' }}>{t('pg_lecturesHint')}</p>
                {can('programs.create', 'all') && <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'module' })}>+ {t('newModule')}</button>}
              </div>
              {/* no modules, or only the hidden one: the lectures straight away (a course or a diploma without modules) */}
              {!active.length || (active.length === 1 && active[0].auto) ? (
                <>
                  <p className="muted">{t('pg_noModulesHint')}</p>
                  <ModuleLectures programId={id} module={active[0] || null} lectures={lectures.data?.items || []} enrolled={lectures.data?.enrolled || 0} canEdit={canEdit} zoomConnected={!!zoomStatus.data?.configured} onChanged={() => { lectures.reload(); state.reload(); }} />
                </>
              ) : (
                <ol className="module-list">
                  {active.map((m, i) => (
                    <li key={m._id} className="module-item">
                      <div className="module-row">
                        <span className="module-order">{i + 1}</span>
                        <div className="grow">
                          <strong>{label({ ar: m.titleAr, en: m.titleEn })}</strong> {m.code && <small className="muted" dir="ltr">{m.code}</small>}
                          <div className="module-meta">
                            {m.hours ? `${m.hours} ${t('hours')} · ` : ''}{m.required ? t('requiredModule') : t('optional')}{m.certificate ? ` · ${t('moduleCertificate')}` : ''}
                          </div>
                          {m.requirements.length > 0 && <ul className="module-meta">{m.requirements.map((r, k) => <li key={k}>{r}</li>)}</ul>}
                        </div>
                        {canEdit && (
                          <div className="module-actions">
                            <button type="button" className="btn btn--small" disabled={i === 0} onClick={() => move(modules, i, -1)} aria-label="up">↑</button>
                            <button type="button" className="btn btn--small" disabled={i === active.length - 1} onClick={() => move(modules, i, 1)} aria-label="down">↓</button>
                            <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'module', item: m })}>{t('edit')}</button>
                          </div>
                        )}
                      </div>
                      <ModuleLectures programId={id} module={m} lectures={lectures.data?.items || []} enrolled={lectures.data?.enrolled || 0} canEdit={canEdit} zoomConnected={!!zoomStatus.data?.configured} onChanged={() => { lectures.reload(); state.reload(); }} />
                    </li>
                  ))}
                </ol>
              )}
              {retired.length > 0 && (
                <details className="module-meta"><summary>{t('inactive')} ({retired.length})</summary>
                  <ul>{retired.map((m) => <li key={m._id}>{m.titleAr} {canEdit && <button type="button" className="link" onClick={() => setDialog({ kind: 'module', item: m })}>{t('edit')}</button>}</li>)}</ul>
                </details>
              )}
            </section>

            <ProgramAccreditations programId={id} canEdit={canEdit} />

            <section className="card">
              <h2>{t('rules')}</h2>
              <form className="row" onSubmit={async (e) => { e.preventDefault(); await api(`/api/v2/programs/${id}/rules`, { method: 'PUT', body: { modulesRequired: required } }); setRule(null); state.reload(); }}>
                <Field label={t('modulesRequired')} hint={t('modulesRequiredHint')}>
                  <input type="number" min={0} max={active.length} value={required} disabled={!canEdit} onChange={(e) => setRule(Number(e.target.value))} />
                </Field>
                {canEdit && rule !== null && <button className="btn btn--primary">{t('save')}</button>}
              </form>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>{t('cohorts')}</h2>
                {can('programs.create', 'all') && <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'cohort' })}>+ {t('newCohort')}</button>}
              </div>
              {!cohorts.length ? <p className="muted">{t('noData')}</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('name')}</th><th>{t('startDate')}</th><th>{t('schedule')}</th><th>{t('instructor')}</th><th>{t('enrolled')}</th><th>{t('status')}</th><th /></tr></thead>
                    <tbody>
                      {cohorts.map((c) => (
                        <tr key={c._id}>
                          <td><Link to={`/groups/${c._id}`}><strong>{label({ ar: c.nameAr, en: c.nameEn })}</strong></Link><br /><small className="muted">{t(c.delivery)}</small></td>
                          <td>{fmtDay(c.startDate)}{c.endDate ? ` – ${fmtDay(c.endDate)}` : ''}</td>
                          <td>{c.schedule || '—'}</td>
                          <td>{c.instructor || '—'}</td>
                          <td><Link to={`/groups/${c._id}`}>{c.enrolled}{c.capacity ? ` / ${c.capacity}` : ''}</Link></td>
                          <td><Pill tone={c.status === 'open' || c.status === 'running' ? 'ok' : 'muted'}>{t(`coSt_${c.status}`)}</Pill></td>
                          <td>{canEdit && <button type="button" className="btn btn--small" onClick={() => setDialog({ kind: 'cohort', item: c })}>{t('edit')}</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            {dialog?.kind === 'site' && <ProgramForm item={p} specialties={specialties.data?.items || []} onClose={() => setDialog(null)} onSaved={done} />}
            {dialog?.kind === 'module' && <ModuleForm programId={id} mod={dialog.item} onClose={() => setDialog(null)} onSaved={done} />}
            {dialog?.kind === 'cohort' && <CohortForm programId={id} cohort={dialog.item} modules={modules.filter((m) => m.active)} onClose={() => setDialog(null)} onSaved={done} />}
          </>
        );
      }}
    </Loading>
  );
}
