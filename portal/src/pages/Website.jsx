import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, pickMessage } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Loading, Modal, Pill, useAction, useLoad } from '../components/ui.jsx';
import PhoneActions from '../components/PhoneActions.jsx';

// The public website, managed from the portal (it replaces the old admin page):
// the programs catalog, page images, pathways, home cards, numbers, testimonials,
// website requests and user accounts. It uses the same server endpoints the old page used.

const TYPES = ['course', 'diploma', 'master', 'phd'];
const STATUSES = ['available', 'coming_soon', 'unavailable', 'hidden'];
const lines = (v) => (Array.isArray(v) ? v.join('\n') : v || '');
const toList = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);

// Images are shrunk in the browser first (the server accepts up to 4 MB)
async function shrink(file, max = 1600) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap || (bitmap.width <= max && bitmap.height <= max && file.size < 900 * 1024)) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ? new File([b], 'image.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.85));
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', await shrink(file));
  const res = await fetch('/api/admin/media', { method: 'POST', body: fd, credentials: 'same-origin' });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || 'Upload failed');
  return d.url;
}

function ImagePick({ value, onChange }) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try { onChange(await uploadImage(file)); } catch (err) { setError(pickMessage(err.message, lang)); } finally { setBusy(false); }
  };
  return (
    <div className="image-pick">
      {value ? <img src={value} alt="" /> : <div className="image-empty">—</div>}
      <div className="row">
        <label className="btn btn--small btn--ghost">{busy ? '…' : t('wsChooseImage')}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} /></label>
        {value && <button type="button" className="btn btn--small btn--ghost" onClick={() => onChange('')}>{t('wsRemoveImage')}</button>}
      </div>
      {error && <small className="late">{error}</small>}
    </div>
  );
}

// ---- programs catalog ----

// Also used on the program page, so a program is set up in one place (PLAN-V2 §4)
export function ProgramForm({ item, specialties, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState({
    titleAr: item?.titleAr || '', titleEn: item?.titleEn || '', slug: item?.slug || '', type: item?.type || 'course', specialty: item?.specialty || '',
    descriptionAr: item?.descriptionAr || '', descriptionEn: item?.descriptionEn || '',
    objectivesAr: lines(item?.objectivesAr), objectivesEn: lines(item?.objectivesEn), topicsAr: lines(item?.topicsAr), topicsEn: lines(item?.topicsEn),
    audienceAr: lines(item?.audienceAr), audienceEn: lines(item?.audienceEn), outcomesAr: lines(item?.outcomesAr), outcomesEn: lines(item?.outcomesEn),
    duration: item?.duration || '', deliveryMethod: item?.deliveryMethod || 'عن بُعد (أونلاين)', price: item?.price ?? 0, discountPercent: item?.discountPercent ?? 0,
    currency: item?.currency || 'EGP', image: item?.image || '', status: item?.status || 'available', featured: !!item?.featured, certificateType: item?.certificateType || 'شهادة مهنية معتمدة',
    seoTitleAr: item?.seoTitleAr || '', seoDescriptionAr: item?.seoDescriptionAr || ''
  });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const body = { ...f, price: Number(f.price), discountPercent: Number(f.discountPercent) };
    for (const k of ['objectivesAr', 'objectivesEn', 'topicsAr', 'topicsEn', 'audienceAr', 'audienceEn', 'outcomesAr', 'outcomesEn']) body[k] = toList(f[k]);
    if (!body.slug) delete body.slug;
    run(() => api(item ? `/api/courses/${item._id}` : '/api/courses', { method: item ? 'PUT' : 'POST', body })).then(onSaved).catch(() => {});
  };
  const area = (k, label) => <Field label={label} wide><textarea rows={3} value={f[k]} onChange={set(k)} /></Field>;
  return (
    <Modal title={item ? `${t('edit')}: ${item.titleAr}` : t('wsNewProgram')} onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        <Field label={`${t('wsTitleAr')} *`}><input required value={f.titleAr} onChange={set('titleAr')} /></Field>
        <Field label={t('wsTitleEn')}><input dir="ltr" value={f.titleEn} onChange={set('titleEn')} /></Field>
        <Field label={t('wsTrack')}><select value={f.type} onChange={set('type')}>{TYPES.map((x) => <option key={x} value={x}>{t(`wsType_${x}`)}</option>)}</select></Field>
        <Field label={`${t('wsSpecialty')} *`}><select required value={f.specialty} onChange={set('specialty')}><option value="">—</option>{specialties.map((s) => <option key={s.key} value={s.ar}>{s.ar}</option>)}{f.specialty && !specialties.some((s) => s.ar === f.specialty) && <option value={f.specialty}>{f.specialty}</option>}</select></Field>
        <Field label={t('wsPrice')}><input type="number" min={0} step="0.01" dir="ltr" value={f.price} onChange={set('price')} /></Field>
        <Field label={t('currency')}><input dir="ltr" maxLength={4} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
        <Field label={t('wsDiscount')}><input type="number" min={0} max={90} dir="ltr" value={f.discountPercent} onChange={set('discountPercent')} /></Field>
        <Field label={t('status')}><select value={f.status} onChange={set('status')}>{STATUSES.map((x) => <option key={x} value={x}>{t(`wsStatus_${x}`)}</option>)}</select></Field>
        <Field label={t('wsDuration')}><input value={f.duration} onChange={set('duration')} /></Field>
        <Field label={t('wsDelivery')}><input value={f.deliveryMethod} onChange={set('deliveryMethod')} /></Field>
        <Field label={t('wsCertType')}><input value={f.certificateType} onChange={set('certificateType')} /></Field>
        <label className="check"><input type="checkbox" checked={f.featured} onChange={set('featured')} /> {t('wsFeatured')}</label>
        <div className="field field--wide">{t('wsImage')}<ImagePick value={f.image} onChange={(image) => setF({ ...f, image })} /></div>
        {area('descriptionAr', t('wsDescAr'))}
        {area('descriptionEn', t('wsDescEn'))}
        <p className="muted field--wide"><small>{t('wsLinesHint')}</small></p>
        {area('objectivesAr', t('wsObjectives'))}
        {area('topicsAr', t('wsTopics'))}
        {area('audienceAr', t('wsAudience'))}
        {area('outcomesAr', t('wsOutcomes'))}
        <Field label={t('wsSeoTitle')}><input value={f.seoTitleAr} onChange={set('seoTitleAr')} /></Field>
        <Field label={t('wsSeoDesc')}><input value={f.seoDescriptionAr} onChange={set('seoDescriptionAr')} /></Field>
        <Field label={t('wsSlug')} hint={t('wsSlugHint')}><input dir="ltr" value={f.slug} onChange={set('slug')} /></Field>
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function Catalog() {
  const { t, lang } = useI18n();
  const { zone, urls } = useAuth();
  const [type, setType] = useState('');
  const state = useLoad(`/api/courses?limit=500${type ? `&type=${type}` : ''}`, [type]);
  const meta = useLoad('/api/v2/website/specialties');
  const [dialog, setDialog] = useState(null);
  const [msg, setMsg] = useState('');
  const done = () => { setDialog(null); state.reload(); };
  const remove = async (c) => {
    setMsg('');
    if (!window.confirm(`${t('wsDeleteConfirm')} ${c.titleAr}`)) return;
    try { await api(`/api/courses/${c._id}`, { method: 'DELETE' }); state.reload(); } catch (e) { setMsg(pickMessage(e.message, lang)); }
  };
  const toggleFeatured = (c) => api(`/api/courses/${c._id}`, { method: 'PUT', body: { featured: !c.featured } }).then(state.reload).catch((e) => setMsg(pickMessage(e.message, lang)));
  return (
    <section className="card">
      <div className="card-head">
        <div className="row">{['', ...TYPES].map((x) => <button key={x} type="button" className={`btn btn--small ${type === x ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setType(x)}>{x ? t(`wsType_${x}`) : t('all')}</button>)}</div>
        <button type="button" className="btn btn--primary" onClick={() => setDialog({})}>+ {t('wsNewProgram')}</button>
      </div>
      {msg && <div className="alert alert--error">{msg}</div>}
      <Loading state={state}>
        {(d) => (!d.courses.length ? <p className="muted">{t('noData')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th /><th>{t('wsTitleAr')}</th><th>{t('wsTrack')}</th><th>{t('wsPrice')}</th><th>{t('status')}</th><th>{t('wsFeatured')}</th><th /></tr></thead>
              <tbody>
                {d.courses.map((c) => (
                  <tr key={c._id}>
                    <td>{c.image ? <img className="thumb" src={c.image} alt="" /> : null}</td>
                    <td><strong>{c.titleAr}</strong><br /><small className="muted">{c.specialty}</small></td>
                    <td>{t(`wsType_${c.type}`)}</td>
                    <td dir="ltr" className="nowrap">{Number(c.price).toLocaleString('en-US')} {c.currency}{c.discountPercent ? <small className="ok"> −{c.discountPercent}%</small> : null}</td>
                    <td><Pill tone={c.status === 'available' ? 'ok' : c.status === 'hidden' ? 'muted' : 'gold'}>{t(`wsStatus_${c.status}`)}</Pill></td>
                    <td><button type="button" className={`star-toggle${c.featured ? ' on' : ''}`} aria-label={t('wsFeatured')} onClick={() => toggleFeatured(c)}>★</button></td>
                    <td className="actions nowrap">
                      <button type="button" className="btn btn--small" onClick={() => setDialog({ item: c })}>{t('edit')}</button>
                      {zone === 'cms'
                        ? <a className="btn btn--small btn--ghost" href={`${urls.staff}/portal/programs/${c._id}`}>{t('wsModulesGroups')} ↗</a>
                        : <Link className="btn btn--small btn--ghost" to={`/programs/${c._id}`}>{t('wsModulesGroups')}</Link>}
                      <a className="btn btn--small btn--ghost" href={`/pages/${lang === 'en' ? 'en' : 'ar'}/program-detail.html?id=${c._id}`} target="_blank" rel="noreferrer">{t('wsView')}</a>
                      <button type="button" className="btn btn--small btn--ghost" onClick={() => remove(c)}>{t('wsDelete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Loading>
      {dialog && <ProgramForm item={dialog.item} specialties={meta.data?.items || []} onClose={() => setDialog(null)} onSaved={done} />}
    </section>
  );
}

// ---- site sections (page images, pathways, cards, numbers) ----

function useSite() {
  return useLoad('/api/admin/site');
}

function SaveBar({ busy, error, saved }) {
  const { t } = useI18n();
  return (
    <div className="row">
      <button className="btn btn--primary" disabled={busy}>{t('save')}</button>
      {saved && <span className="ok">{t('saved')}</span>}
      <ErrorBox error={error} />
    </div>
  );
}

function SectionForm({ section, initial, children }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    setSaved(false);
    run(() => api(`/api/admin/site/${section}`, { method: 'PUT', body: { value } })).then(() => setSaved(true)).catch(() => {});
  };
  return <form className="stack stack--full" onSubmit={submit}>{children(value, setValue)}<SaveBar busy={busy} error={error} saved={saved} /></form>;
}

function Heroes() {
  const { label } = useI18n();
  const state = useSite();
  return (
    <section className="card">
      <Loading state={state}>
        {(d) => (
          <SectionForm section="heroes" initial={d.heroes}>
            {(v, setV) => (
              <div className="card-grid">
                {d.heroPages.map((p) => (
                  <div key={p.key} className="mini-card"><strong>{label({ ar: p.ar, en: p.en })}</strong><ImagePick value={v[p.key]} onChange={(url) => setV({ ...v, [p.key]: url })} /></div>
                ))}
              </div>
            )}
          </SectionForm>
        )}
      </Loading>
    </section>
  );
}

// Cards with a fixed set of keys: the admin edits their texts and images
function CardsEditor({ section, fields }) {
  const { t } = useI18n();
  const state = useSite();
  return (
    <section className="card">
      <Loading state={state}>
        {(d) => (
          <SectionForm section={section} initial={d[section].map((x) => ({ ...x, pointsAr: lines(x.pointsAr), pointsEn: lines(x.pointsEn) }))}>
            {(v, setV) => (
              <div className="card-grid">
                {v.map((item, i) => {
                  const set = (k, val) => setV(v.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
                  return (
                    <div key={item.key} className="mini-card">
                      <ImagePick value={item.image} onChange={(url) => set('image', url)} />
                      {fields.map(([k, lab, kind]) => (
                        <Field key={k} label={t(lab)}>
                          {kind === 'area' ? <textarea rows={3} dir={k.endsWith('En') ? 'ltr' : undefined} value={item[k] || ''} onChange={(e) => set(k, e.target.value)} /> : <input dir={k.endsWith('En') ? 'ltr' : undefined} value={item[k] || ''} onChange={(e) => set(k, e.target.value)} />}
                        </Field>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionForm>
        )}
      </Loading>
    </section>
  );
}

function Stats() {
  const { t } = useI18n();
  const state = useSite();
  return (
    <section className="card">
      <Loading state={state}>
        {(d) => (
          <SectionForm section="stats" initial={d.stats}>
            {(v, setV) => (
              <>
                {v.map((s, i) => {
                  const set = (k, val) => setV(v.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
                  return (
                    <div key={i} className="row stat-row">
                      <input type="number" min={0} dir="ltr" aria-label={t('wsValue')} value={s.value} onChange={(e) => set('value', Number(e.target.value))} />
                      <input dir="ltr" maxLength={4} aria-label={t('wsSuffix')} placeholder="+" value={s.suffix || ''} onChange={(e) => set('suffix', e.target.value)} />
                      <input aria-label={t('wsLabelAr')} placeholder={t('wsLabelAr')} value={s.labelAr || ''} onChange={(e) => set('labelAr', e.target.value)} />
                      <input dir="ltr" aria-label={t('wsLabelEn')} placeholder={t('wsLabelEn')} value={s.labelEn || ''} onChange={(e) => set('labelEn', e.target.value)} />
                      <input dir="ltr" aria-label={t('wsIcon')} placeholder="fa-star" value={s.icon || ''} onChange={(e) => set('icon', e.target.value)} />
                      <button type="button" className="icon-btn btn--small btn--danger" aria-label="Remove" title="حذف" onClick={() => setV(v.filter((_, j) => j !== i))}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  );
                })}
                <div><button type="button" className="btn btn--small btn--ghost" onClick={() => setV([...v, { value: 0, suffix: '+', icon: 'fa-star', labelAr: '', labelEn: '' }])}>{t('lecAddRow')}</button></div>
              </>
            )}
          </SectionForm>
        )}
      </Loading>
    </section>
  );
}

// ---- the website's links (footer of every page): any platform, its icon picked from a set ----

function SiteLinks() {
  const { t, label } = useI18n();
  const state = useSite();
  return (
    <section className="card">
      <p className="muted">{t('wsLinksHint')}</p>
      <Loading state={state}>
        {(d) => (
          <SectionForm section="links" initial={d.links || []}>
            {(v, setV) => {
              const set = (i, k, val) => setV(v.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
              const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= v.length) return; const next = [...v]; [next[i], next[j]] = [next[j], next[i]]; setV(next); };
              const iconOf = (key) => (d.platforms.find((p) => p.key === key) || { icon: 'fas fa-globe' }).icon;
              return (
                <>
                  <div className="links-preview" aria-label={t('wsLinksPreview')}>
                    {v.filter((l) => l.url).map((l, i) => <span key={i} className="links-preview__item" title={l.label || l.platform}><i className={iconOf(l.platform)} aria-hidden="true" /></span>)}
                  </div>
                  <div className="link-list">
                    {v.map((l, i) => (
                      <div key={i} className="link-row">
                        <div className="link-row__icons" role="radiogroup" aria-label={t('wsLinkIcon')}>
                          {d.platforms.map((p) => (
                            <button key={p.key} type="button" role="radio" aria-checked={l.platform === p.key} title={label({ ar: p.ar, en: p.en })} className={`icon-pick${l.platform === p.key ? ' on' : ''}`} onClick={() => set(i, 'platform', p.key)}>
                              <i className={p.icon} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                        <div className="link-row__fields">
                          <input dir="ltr" placeholder="https://www.tiktok.com/@..." value={l.url || ''} onChange={(e) => set(i, 'url', e.target.value)} aria-label={t('wsLinkUrl')} />
                          <input placeholder={t('wsLinkLabel')} value={l.label || ''} onChange={(e) => set(i, 'label', e.target.value)} aria-label={t('wsLinkLabel')} />
                          <div className="row">
                            <button type="button" className="btn btn--small btn--ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="up">↑</button>
                            <button type="button" className="btn btn--small btn--ghost" disabled={i === v.length - 1} onClick={() => move(i, 1)} aria-label="down">↓</button>
                            <button type="button" className="btn btn--small btn--ghost" onClick={() => setV(v.filter((_, j) => j !== i))}>{t('set_remove')}</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div><button type="button" className="btn btn--small btn--ghost" onClick={() => setV([...v, { platform: 'tiktok', url: '', label: '' }])}>+ {t('wsLinkAdd')}</button></div>
                </>
              );
            }}
          </SectionForm>
        )}
      </Loading>
    </section>
  );
}

// ---- professional or academic master's: the comparison on the masters page ----

function MasterCompare() {
  const { t } = useI18n();
  const state = useSite();
  return (
    <section className="card">
      <p className="muted">{t('wsCompareHint')} <a href="/pages/ar/masters.html" target="_blank" rel="noreferrer">{t('wsCompareOpen')} ↗</a></p>
      <Loading state={state}>
        {(d) => (
          <SectionForm section="masterCompare" initial={d.masterCompare}>
            {(v, setV) => {
              const set = (k, val) => setV({ ...v, [k]: val });
              const setRow = (i, k, val) => setV({ ...v, rows: v.rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)) });
              const text = (k, area) => (
                <div className="form-grid">
                  <Field label={`${t(`wsC_${k}`)} (ع)`}>{area ? <textarea rows={2} value={v[`${k}Ar`] || ''} onChange={(e) => set(`${k}Ar`, e.target.value)} /> : <input value={v[`${k}Ar`] || ''} onChange={(e) => set(`${k}Ar`, e.target.value)} />}</Field>
                  <Field label={`${t(`wsC_${k}`)} (EN)`}>{area ? <textarea dir="ltr" rows={2} value={v[`${k}En`] || ''} onChange={(e) => set(`${k}En`, e.target.value)} /> : <input dir="ltr" value={v[`${k}En`] || ''} onChange={(e) => set(`${k}En`, e.target.value)} />}</Field>
                </div>
              );
              return (
                <>
                  <label className="check settings__check"><input type="checkbox" checked={v.visible !== false} onChange={(e) => set('visible', e.target.checked)} /> {t('wsCompareVisible')}</label>
                  {text('title')}
                  {text('intro', true)}
                  {text('professional')}
                  {text('academic')}
                  <h3>{t('wsCompareRows')}</h3>
                  <div className="compare-rows">
                    {(v.rows || []).map((r, i) => (
                      <div key={i} className="compare-row">
                        <div className="compare-row__head">
                          <input className="compare-row__aspect" placeholder={t('wsC_aspect')} value={r.aspectAr || ''} onChange={(e) => setRow(i, 'aspectAr', e.target.value)} />
                          <input dir="ltr" placeholder="Aspect" value={r.aspectEn || ''} onChange={(e) => setRow(i, 'aspectEn', e.target.value)} />
                          <button type="button" className="btn btn--small btn--ghost" onClick={() => set('rows', v.rows.filter((_, j) => j !== i))}>{t('set_remove')}</button>
                        </div>
                        <div className="form-grid">
                          <Field label={v.professionalAr || t('wsC_professional')}><textarea rows={2} value={r.professionalAr || ''} onChange={(e) => setRow(i, 'professionalAr', e.target.value)} /></Field>
                          <Field label={v.academicAr || t('wsC_academic')}><textarea rows={2} value={r.academicAr || ''} onChange={(e) => setRow(i, 'academicAr', e.target.value)} /></Field>
                          <Field label="Professional (EN)"><textarea dir="ltr" rows={2} value={r.professionalEn || ''} onChange={(e) => setRow(i, 'professionalEn', e.target.value)} /></Field>
                          <Field label="Academic (EN)"><textarea dir="ltr" rows={2} value={r.academicEn || ''} onChange={(e) => setRow(i, 'academicEn', e.target.value)} /></Field>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div><button type="button" className="btn btn--small btn--ghost" onClick={() => set('rows', [...(v.rows || []), { aspectAr: '', aspectEn: '', professionalAr: '', professionalEn: '', academicAr: '', academicEn: '' }])}>+ {t('wsCompareAddRow')}</button></div>
                  {text('note', true)}
                  {text('cta')}
                </>
              );
            }}
          </SectionForm>
        )}
      </Loading>
    </section>
  );
}

// ---- testimonials ----

function Testimonials() {
  const { t } = useI18n();
  const state = useLoad('/api/admin/testimonials');
  const [dialog, setDialog] = useState(null);
  const done = () => { setDialog(null); state.reload(); };
  return (
    <section className="card">
      <div className="card-head"><span /><button type="button" className="btn btn--primary" onClick={() => setDialog({})}>+ {t('wsNewTestimonial')}</button></div>
      <Loading state={state}>
        {(d) => (!(d.testimonials || []).length ? <p className="muted">{t('noData')}</p> : (
          <ul className="plain-list">{d.testimonials.map((x) => (
            <li key={x._id}>
              <span><strong>{x.nameAr}</strong> <small className="muted">{x.roleAr}</small><br /><small>{x.quoteAr}</small></span>
              <span className="row">{!x.visible && <Pill tone="muted">{t('wsHidden')}</Pill>}<button type="button" className="btn btn--small" onClick={() => setDialog({ item: x })}>{t('edit')}</button><button type="button" className="btn btn--small btn--ghost" onClick={() => window.confirm(t('wsDeleteConfirm')) && api(`/api/admin/testimonials/${x._id}`, { method: 'DELETE' }).then(state.reload)}>{t('wsDelete')}</button></span>
            </li>
          ))}</ul>
        ))}
      </Loading>
      {dialog && <TestimonialForm item={dialog.item} onClose={() => setDialog(null)} onSaved={done} />}
    </section>
  );
}

function TestimonialForm({ item, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState({ nameAr: item?.nameAr || '', nameEn: item?.nameEn || '', roleAr: item?.roleAr || '', roleEn: item?.roleEn || '', quoteAr: item?.quoteAr || '', quoteEn: item?.quoteEn || '', image: item?.image || '', order: item?.order || 0, visible: item ? item.visible !== false : true });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <Modal title={item ? t('edit') : t('wsNewTestimonial')} onClose={onClose} wide>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); run(() => api(item ? `/api/admin/testimonials/${item._id}` : '/api/admin/testimonials', { method: item ? 'PUT' : 'POST', body: { ...f, order: Number(f.order) } })).then(onSaved).catch(() => {}); }}>
        <Field label={`${t('name')} *`}><input required value={f.nameAr} onChange={set('nameAr')} /></Field>
        <Field label={t('nameEn')}><input dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
        <Field label={t('wsRole')}><input value={f.roleAr} onChange={set('roleAr')} /></Field>
        <Field label={t('wsRoleEn')}><input dir="ltr" value={f.roleEn} onChange={set('roleEn')} /></Field>
        <Field label={`${t('wsQuote')} *`} wide><textarea required rows={3} value={f.quoteAr} onChange={set('quoteAr')} /></Field>
        <Field label={t('wsQuoteEn')} wide><textarea rows={3} dir="ltr" value={f.quoteEn} onChange={set('quoteEn')} /></Field>
        <div className="field">{t('wsImage')}<ImagePick value={f.image} onChange={(image) => setF({ ...f, image })} /></div>
        <Field label={t('wsOrder')}><input type="number" dir="ltr" value={f.order} onChange={set('order')} /></Field>
        <label className="check"><input type="checkbox" checked={f.visible} onChange={set('visible')} /> {t('wsVisible')}</label>
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// ---- requests from the website ----

const INQ_STATUSES = ['New', 'In Progress', 'Replied', 'Closed'];

function Inquiries() {
  const { t, fmtDate } = useI18n();
  const [f, setF] = useState({ status: '', type: '' });
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const state = useLoad(`/api/inquiries?${q}`, [f.status, f.type]);
  const setStatus = (i, status) => api(`/api/inquiries/${i._id}`, { method: 'PUT', body: { status } }).then(state.reload);
  return (
    <section className="card">
      <div className="row">
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">{t('all')}</option><option value="enrollment">{t('wsInqEnrollment')}</option><option value="message">{t('wsInqMessage')}</option></select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">{t('all')}</option>{INQ_STATUSES.map((s) => <option key={s} value={s}>{t(`inq_${s.replace(' ', '')}`)}</option>)}</select>
      </div>
      <Loading state={state}>
        {(d) => (!d.inquiries.length ? <p className="muted">{t('noData')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('date')}</th><th>{t('name')}</th><th>{t('wsInqKind')}</th><th>{t('wsInqMessageCol')}</th><th>{t('status')}</th></tr></thead>
              <tbody>{d.inquiries.map((i) => (
                <tr key={i._id}>
                  <td className="nowrap">{fmtDate(i.createdAt)}</td>
                  <td>{i.customer ? <Link to={`/customers/${i.customer}`}>{i.name}</Link> : i.name}<br /><PhoneActions phone={i.phone} />{i.email && <><br /><small className="muted" dir="ltr">{i.email}</small></>}</td>
                  <td>{(i.items || []).length ? <><Pill tone="gold">{t('wsInqEnrollment')}</Pill><br /><small>{i.items.map((x) => x.title).join('، ')}</small></> : i.inquiryType}</td>
                  <td><small>{i.subject ? <strong>{i.subject}: </strong> : null}{String(i.message || '').slice(0, 300)}</small></td>
                  <td><select value={i.status} onChange={(e) => setStatus(i, e.target.value)}>{INQ_STATUSES.map((s) => <option key={s} value={s}>{t(`inq_${s.replace(' ', '')}`)}</option>)}</select></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </Loading>
    </section>
  );
}

// ---- user accounts (website sign-ups and staff logins) ----

// Sign-in accounts (customers and staff): a staff page of its own (/user-accounts), not website work
const TABS = ['catalog', 'heroes', 'pathways', 'cards', 'stats', 'testimonials', 'links', 'compare', 'inquiries'];

export default function Website() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'catalog';
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('websiteNav')}</h1>
        <a className="btn btn--ghost" href="/" target="_blank" rel="noreferrer">{t('wsOpenSite')}</a>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setParams({ tab: k })}>{t(`ws_${k}`)}</button>)}
      </div>
      {tab === 'catalog' && <Catalog />}
      {tab === 'heroes' && <Heroes />}
      {tab === 'pathways' && <CardsEditor section="pathways" fields={[['titleAr', 'wsTitleAr'], ['titleEn', 'wsTitleEn'], ['taglineAr', 'wsTagline'], ['taglineEn', 'wsTaglineEn'], ['descAr', 'wsDescAr', 'area'], ['descEn', 'wsDescEn', 'area']]} />}
      {tab === 'cards' && (
        <>
          <h2>{t('wsGuideCards')}</h2>
          <CardsEditor section="guideCards" fields={[['titleAr', 'wsTitleAr'], ['titleEn', 'wsTitleEn'], ['textAr', 'wsDescAr', 'area'], ['textEn', 'wsDescEn', 'area'], ['linkAr', 'wsLinkAr'], ['linkEn', 'wsLinkEn']]} />
          <h2>{t('wsServiceCards')}</h2>
          <CardsEditor section="serviceCards" fields={[['titleAr', 'wsTitleAr'], ['titleEn', 'wsTitleEn'], ['subtitleAr', 'wsTagline'], ['textAr', 'wsDescAr', 'area'], ['pointsAr', 'wsPoints', 'area'], ['linkAr', 'wsLinkAr']]} />
        </>
      )}
      {tab === 'stats' && <Stats />}
      {tab === 'testimonials' && <Testimonials />}
      {tab === 'links' && <SiteLinks />}
      {tab === 'compare' && <MasterCompare />}
      {tab === 'inquiries' && <Inquiries />}
    </>
  );
}
