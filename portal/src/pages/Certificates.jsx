import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pager, Pill, useAction, useLoad } from '../components/ui.jsx';
import { owed } from './GroupCertificates.jsx';
import { loadCertKit } from '../certKit.js';

const PAPER_TONE = { none: 'muted', printed: 'info', ready: 'gold', shipped: 'info', delivered: 'ok' };
const NEXT_STEPS = { none: ['printed'], printed: ['ready', 'shipped'], ready: ['delivered'], shipped: ['delivered'], delivered: [] };

// Email and the paper copy: what was done, and the next step
function DeliveryCard({ c, canUpdate, onChanged }) {
  const { t, fmtDate } = useI18n();
  const dl = c.delivery || { paper: { status: 'none' }, log: [] };
  const paper = dl.paper || { status: 'none' };
  const [step, setStep] = useState(null);
  const [f, setF] = useState({ note: '', carrier: '', trackingNo: '', receivedBy: '' });
  const [msg, setMsg] = useState('');
  const { busy, error, run } = useAction();
  const email = () => run(() => api(`/api/v2/certificates/${c._id}/email`, { method: 'POST' })).then((r) => { setMsg(`${t('cdEmailed')}: ${r.to}`); onChanged(); }).catch(() => {});
  const save = (e) => { e.preventDefault(); run(() => api(`/api/v2/certificates/${c._id}/delivery`, { method: 'POST', body: { step, ...f } })).then(() => { setStep(null); setF({ note: '', carrier: '', trackingNo: '', receivedBy: '' }); onChanged(); }).catch(() => {}); };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="card no-print">
      <h2>{t('cdDelivery')}</h2>
      {c.paymentWaiver && <div className="alert alert--warn">{t('cdWaived')}: {c.paymentWaiver}</div>}
      <div className="info-grid">
        <div className="info"><small>{t('cdEmailed')}</small><div>{dl.emailedAt ? <>{fmtDate(dl.emailedAt)} <small className="muted" dir="ltr">{dl.emailedTo}</small></> : <span className="muted">{t('cdNotEmailed')}</span>}</div></div>
        <div className="info"><small>{t('cdViewed')}</small><div>{dl.viewedAt ? fmtDate(dl.viewedAt) : <span className="muted">{t('cdNotViewed')}</span>}</div></div>
        <div className="info"><small>{t('cdPaper')}</small><div><Pill tone={PAPER_TONE[paper.status]}>{t(`paper_${paper.status}`)}</Pill>{paper.trackingNo && <small dir="ltr"> {paper.carrier} {paper.trackingNo}</small>}{paper.receivedBy && <small> · {paper.receivedBy}</small>}</div></div>
      </div>
      {canUpdate && c.status === 'Valid' && (
        <div className="row">
          <button type="button" className="btn btn--small" disabled={busy} onClick={email}>{dl.emailedAt ? t('cdResend') : t('cdSendEmail')}</button>
          {(NEXT_STEPS[paper.status] || []).map((s) => <button key={s} type="button" className="btn btn--small btn--ghost" onClick={() => setStep(s)}>{t(`step_${s}`)}</button>)}
        </div>
      )}
      {msg && <div className="alert alert--ok">{msg}</div>}
      <ErrorBox error={error} />
      {step && (
        <form className="form-grid" onSubmit={save}>
          {step === 'shipped' && <><Field label={t('cdCarrier')}><input value={f.carrier} onChange={set('carrier')} /></Field><Field label={t('cdTracking')}><input dir="ltr" value={f.trackingNo} onChange={set('trackingNo')} /></Field></>}
          {step === 'delivered' && <Field label={`${t('cdReceivedBy')} *`}><input required value={f.receivedBy} onChange={set('receivedBy')} /></Field>}
          <Field label={t('note')}><input value={f.note} onChange={set('note')} /></Field>
          <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t(`step_${step}`)}</button><button type="button" className="btn btn--ghost" onClick={() => setStep(null)}>{t('cancel')}</button></div>
        </form>
      )}
      {(dl.log || []).length > 0 && (
        <>
          <h3>{t('cdLog')}</h3>
          <ul className="plain-list">{dl.log.slice().reverse().map((l, i) => <li key={i}><span>{PAPER_TONE[l.step] ? t(`paper_${l.step}`) : t(`step_${l.step}`)}{l.note ? ` — ${l.note}` : ''}</span><small className="muted">{l.byName} · {fmtDate(l.at)}</small></li>)}</ul>
        </>
      )}
    </section>
  );
}

const TONE = { Valid: 'ok', Suspended: 'gold', Cancelled: 'warn', Expired: 'muted', Replaced: 'muted' };
const SAMPLE = { kind: 'module', name: 'سارة أحمد علي', nameEn: 'Sara Ahmed Ali', program: 'دبلوم إدارة المشاريع الاحترافية', programEn: 'Professional Project Management Diploma', module: 'إدارة المخاطر', moduleEn: 'Risk Management', date: new Date().toISOString().slice(0, 10), number: 'NC-0000000', hours: 24 };

// Fills a template the same way the server does, for the live preview in the template editor
const fill = (text, d) => String(text || '').replace(/\{(\w+)\}/g, (m, k) => (d[k] !== undefined ? String(d[k]) : m));
export function previewDesign(t, kind = 'module') {
  const d = { ...SAMPLE, kind };
  if ((t.layout || 'nibras') === 'nibras') {
    return { layout: 'nibras', gender: 'female', subjectAr: kind === 'module' ? `${d.module} ضمن ${d.program}` : d.program, subjectEn: kind === 'module' ? `${d.moduleEn} module of the ${d.programEn}` : d.programEn };
  }
  const body = { module: { ar: 'قد أتم بنجاح متطلبات محور «{module}» ضمن برنامج «{program}»', en: 'has successfully completed the module “{moduleEn}” of the “{programEn}” program' }, program: { ar: 'قد أتم بنجاح جميع متطلبات برنامج «{program}»', en: 'has successfully completed all requirements of the “{programEn}” program' } }[kind];
  return {
    language: t.language || 'both', titleAr: fill(t.titleAr, d), titleEn: fill(t.titleEn, d), introAr: fill(t.introAr, d), introEn: fill(t.introEn, d),
    bodyAr: fill(t.bodyAr || body.ar, d), bodyEn: fill(t.bodyEn || body.en, d), footerAr: fill(t.footerAr, d), footerEn: fill(t.footerEn, d),
    logo: t.logo || '/assets/img/logo.png', background: t.background, primaryColor: t.primaryColor || '#5a020e', accentColor: t.accentColor || '#b98a35',
    showHours: t.showHours !== false, showAccreditations: t.showAccreditations !== false, signatures: t.signatures || []
  };
}

// The A4 landscape certificate. The same component is printed to PDF from the browser.
// Shows the A4 sheet at its real size, scaled down to fit the screen; printing uses the real size
function Scaled({ children }) {
  const box = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1, el.clientWidth / 1123));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={box} className="cert-scaler" style={{ height: 794 * scale }}><div className="cert-scaled" style={{ transform: `scale(${scale})` }}>{children}</div></div>;
}

export function CertificateSheet(props) {
  return <Scaled><SheetBody {...props} /></Scaled>;
}

// The academy's designed sheet (cert-nibras.js), shared with the website
export function NibrasSheet({ cert, design }) {
  const [html, setHtml] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadCertKit().then((k) => { if (live) setHtml(k.sheet(cert, design)); }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [cert, design]);
  if (failed) return <p className="error">The certificate design could not be loaded.</p>;
  return <div className="ncert-host" dangerouslySetInnerHTML={{ __html: html }} />;
}

function SheetBody({ cert, design: d, verifyUrl }) {
  if (d && d.layout === 'nibras') return <NibrasSheet cert={cert} design={d} />;
  return <ClassicSheet cert={cert} design={d} verifyUrl={verifyUrl} />;
}

function ClassicSheet({ cert, design: d, verifyUrl }) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (verifyUrl) QRCode.toDataURL(verifyUrl, { margin: 0, width: 240, color: { dark: d.primaryColor } }).then(setQr).catch(() => setQr(''));
  }, [verifyUrl, d.primaryColor]);
  const ar = d.language !== 'en';
  const en = d.language !== 'ar';
  const style = { '--c-primary': d.primaryColor, '--c-accent': d.accentColor, backgroundImage: d.background ? `url(${d.background})` : undefined };
  return (
    <div className="cert-sheet" style={style}>
      <div className="cert-frame">
        <header className="cert-head">
          <img src={d.logo} alt="" className="cert-logo" />
          <div className="cert-titles">
            {ar && <h1 dir="rtl">{d.titleAr}</h1>}
            {en && <h2 dir="ltr">{d.titleEn}</h2>}
          </div>
          {qr ? <img src={qr} alt="QR" className="cert-qr" /> : <span className="cert-qr" />}
        </header>
        <div className="cert-body">
          {ar && <p dir="rtl" className="cert-intro">{d.introAr}</p>}
          {en && <p dir="ltr" className="cert-intro">{d.introEn}</p>}
          {ar && <div dir="rtl" className="cert-name">{cert.trainee_name}</div>}
          {en && (cert.nameEn || !ar) && <div dir="ltr" className="cert-name cert-name--en">{cert.nameEn || cert.trainee_name}</div>}
          {ar && <p dir="rtl" className="cert-text">{d.bodyAr}</p>}
          {en && <p dir="ltr" className="cert-text">{d.bodyEn}</p>}
          {d.showHours && cert.hours > 0 && <p className="cert-meta">{ar && <span dir="rtl">بعدد {cert.hours} ساعة تدريبية</span>}{ar && en ? ' · ' : ''}{en && <span dir="ltr">{cert.hours} training hours</span>}</p>}
        </div>
        {d.showAccreditations && (cert.accreditations || []).length > 0 && (
          <div className="cert-accreditations">
            {cert.accreditations.map((a, i) => (
              <div key={i} className="cert-acc">{a.logo && <img src={a.logo} alt="" />}<span>{ar ? a.nameAr : a.nameEn || a.nameAr}{a.number ? ` · ${a.number}` : ''}</span></div>
            ))}
          </div>
        )}
        <footer className="cert-foot">
          <div className="cert-facts" dir="ltr">
            <span>No. <strong>{cert.cert_num}</strong></span>
            <span>{cert.issue_date}</span>
          </div>
          <div className="cert-signatures">
            {(d.signatures || []).map((s, i) => (
              <div key={i} className="cert-sign">
                {s.image ? <img src={s.image} alt="" /> : <span className="cert-sign-line" />}
                <strong>{ar ? s.nameAr : s.nameEn || s.nameAr}</strong>
                <small>{ar ? s.titleAr : s.titleEn || s.titleAr}</small>
              </div>
            ))}
          </div>
          {(d.footerAr || d.footerEn) && <p className="cert-footer-text">{ar ? d.footerAr : d.footerEn}</p>}
        </footer>
        {cert.status && cert.status !== 'Valid' && <div className="cert-void">{cert.status}</div>}
      </div>
    </div>
  );
}

// ---- one certificate ----

export function CertificateDetail() {
  const { id } = useParams();
  const { t, fmtDate } = useI18n();
  const { can, me } = useAuth();
  const navigate = useNavigate();
  const state = useLoad(`/api/v2/certificates/${id}`, [id]);
  const [dialog, setDialog] = useState(null);
  return (
    <Loading state={state}>
      {({ item: c, verifyUrl }) => (
        <>
          <div className="page-head no-print">
            <div>
              <Link to={me.user.isStaff ? '/certificates' : '/my-certificates'} className="muted">← {t('certificatesNav')}</Link>
              <h1 className="page-title"><span dir="ltr">{c.cert_num}</span> <Pill tone={TONE[c.status]}>{t(`cs_${c.status}`)}</Pill></h1>
              {c.replacedBy && <p>{t('replacedBy')}: <Link to={`/certificates/${c.replacedBy._id}`} dir="ltr">{c.replacedBy.cert_num}</Link></p>}
              {c.replaces && <p className="muted">{t('reissueOf')}: <span dir="ltr">{c.replaces.cert_num}</span></p>}
            </div>
            <div className="row">
              {c.kind !== 'legacy' && c.status === 'Valid' && <button type="button" className="btn btn--primary" onClick={() => window.print()}>{t('printPdf')}</button>}
              {c.kind === 'legacy' && c.pdf_url && <a className="btn btn--primary" href={c.pdf_url}>{t('download')}</a>}
              {me.user.isStaff && can('certificates.create', 'all') && !['legacy', 'manual'].includes(c.kind) && ['Valid', 'Suspended'].includes(c.status) && <button type="button" className="btn btn--ghost" onClick={() => setDialog('reissue')}>{t('reissue')}</button>}
              {me.user.isStaff && can('certificates.archive', 'all') && !['Replaced', 'Cancelled'].includes(c.status) && <button type="button" className="btn btn--ghost" onClick={() => setDialog('status')}>{t('changeStatus')}</button>}
            </div>
          </div>
          {c.kind !== 'legacy' && c.design ? <CertificateSheet cert={c} design={c.design} verifyUrl={verifyUrl} /> : (
            <section className="card">
              <div className="info-grid">
                <div className="info"><small>{t('name')}</small><div>{c.trainee_name}</div></div>
                <div className="info"><small>{t('program')}</small><div>{c.program_name}</div></div>
                <div className="info"><small>{t('date')}</small><div>{c.issue_date}</div></div>
              </div>
            </section>
          )}
          {me.user.isStaff && c.kind !== 'legacy' && <DeliveryCard c={c} canUpdate={can('certificates.update')} onChanged={state.reload} />}
          {!me.user.isStaff && c.delivery?.paper && c.delivery.paper.status !== 'none' && (
            <section className="card no-print"><p>{t('cdPaperYours')}: <Pill tone={PAPER_TONE[c.delivery.paper.status]}>{t(`paper_${c.delivery.paper.status}`)}</Pill>{c.delivery.paper.trackingNo && <small dir="ltr"> {c.delivery.paper.carrier} {c.delivery.paper.trackingNo}</small>}</p></section>
          )}
          {me.user.isStaff && (
            <section className="card no-print">
              <h2>{t('history')}</h2>
              <ul className="plain-list">{(c.statusHistory || []).slice().reverse().map((h, i) => <li key={i}><span>{t(`cs_${h.status}`)} — {h.reason}</span><small className="muted">{h.byName} · {fmtDate(h.at)}</small></li>)}</ul>
              {c.customer && <p><Link to={`/customers/${c.customer._id}`}>{c.customer.customerNo} {c.customer.nameAr}</Link></p>}
            </section>
          )}
          {dialog === 'status' && <StatusDialog c={c} onClose={() => setDialog(null)} onDone={() => { setDialog(null); state.reload(); }} />}
          {dialog === 'reissue' && <ReissueDialog c={c} onClose={() => setDialog(null)} onDone={(n) => { setDialog(null); navigate(`/certificates/${n._id}`); }} />}
        </>
      )}
    </Loading>
  );
}

function StatusDialog({ c, onClose, onDone }) {
  const { t } = useI18n();
  const [status, setStatus] = useState(c.status === 'Valid' ? 'Suspended' : 'Valid');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const options = ['Valid', 'Suspended', 'Expired', 'Cancelled'].filter((s) => s !== c.status);
  return (
    <Modal title={t('changeStatus')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/v2/certificates/${c._id}/status`, { method: 'POST', body: { status, reason } })).then(onDone).catch(() => {}); }}>
        <Field label={t('status')}><select value={status} onChange={(e) => setStatus(e.target.value)}>{options.map((s) => <option key={s} value={s}>{t(`cs_${s}`)}</option>)}</select></Field>
        {status === 'Cancelled' && <div className="alert alert--warn">{t('cancelCertHint')}</div>}
        <Field label={t('reason')}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className={`btn ${status === 'Cancelled' ? 'btn--danger' : 'btn--primary'}`} disabled={busy}>{t('confirm')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

function ReissueDialog({ c, onClose, onDone }) {
  const { t } = useI18n();
  const templates = useLoad('/api/v2/certificate-templates');
  const [f, setF] = useState({ nameAr: c.trainee_name, nameEn: c.nameEn || '', template: '', reason: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal title={t('reissue')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/v2/certificates/${c._id}/reissue`, { method: 'POST', body: f })).then((d) => onDone(d.item)).catch(() => {}); }}>
        <p className="muted">{t('reissueHint')}</p>
        <Field label={t('nameAr')}><input value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} /></Field>
        <Field label={t('nameEn')}><input dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
        <Field label={t('template')}><select value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}><option value="">{t('defaultTemplate')}</option>{(templates.data?.items || []).filter((x) => x.kind === c.kind && x.active).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></Field>
        <Field label={t('reason')}><input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('reissue')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// ---- lists ----

export default function Certificates() {
  const { t } = useI18n();
  const { can, me } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('issued');
  const [filter, setFilter] = useState({ q: '', status: '', delivery: '', page: 1 });
  const q = new URLSearchParams({ page: String(filter.page), limit: '50' });
  if (filter.q) q.set('q', filter.q);
  if (filter.status) q.set('status', filter.status);
  if (filter.delivery) q.set('delivery', filter.delivery);
  const state = useLoad(tab === 'issued' ? `/api/v2/certificates?${q}` : null, [tab]);
  const byHand = can('certificates.create', 'all') && ['super_admin', 'assistant'].includes(me?.user?.role);
  const tabs = ['issued', ...(byHand ? ['manualTab'] : []), ...(can('certificates.create', 'all') || can('certificates.approve', 'all') ? ['eligibleTab'] : []), ...(can('certificates.manage', 'all') ? ['templatesTab', 'accreditationsTab'] : [])];
  return (
    <>
      <h1 className="page-title">{t('certificatesNav')}</h1>
      <div className="tabs">{tabs.map((k) => <button key={k} type="button" className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{t(k)}</button>)}</div>
      {tab === 'issued' && (
        <>
          <div className="card filters">
            <Field label={t('search')}><input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value, page: 1 })} placeholder="NC-0000001" /></Field>
            <Field label={t('status')}><select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value, page: 1 })}><option value="">{t('all')}</option>{['Valid', 'Suspended', 'Cancelled', 'Expired', 'Replaced'].map((s) => <option key={s} value={s}>{t(`cs_${s}`)}</option>)}</select></Field>
            <Field label={t('cdDelivery')}><select value={filter.delivery} onChange={(e) => setFilter({ ...filter, delivery: e.target.value, page: 1 })}>{['', 'not_emailed', 'paper_pending', 'paper_ready'].map((s) => <option key={s} value={s}>{t(`dlv_${s || 'all'}`)}</option>)}</select></Field>
          </div>
          <section className="card">
            <Loading state={state}>
              {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
                <>
                  <div className="table-wrap">
                    <table className="table table--hover">
                      <thead><tr><th>{t('certNo')}</th><th>{t('name')}</th><th>{t('program')}</th><th>{t('module')}</th><th>{t('date')}</th><th>{t('status')}</th><th>{t('cdDelivery')}</th></tr></thead>
                      <tbody>{d.items.map((c) => (
                        <tr key={c._id} onClick={() => navigate(`/certificates/${c._id}`)}>
                          <td dir="ltr">{c.cert_num}</td><td>{c.trainee_name}</td><td>{c.program_name}</td><td>{c.moduleName || (c.kind === 'program' ? t('finalCert') : '—')}</td><td>{c.issue_date}</td>
                          <td><Pill tone={TONE[c.status]}>{t(`cs_${c.status}`)}</Pill></td>
                          <td>{c.kind === 'legacy' ? '—' : <>{c.delivery?.emailedAt ? '✉ ' : ''}<Pill tone={PAPER_TONE[c.delivery?.paper?.status || 'none']}>{t(`paper_${c.delivery?.paper?.status || 'none'}`)}</Pill></>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <Pager page={filter.page} total={d.total} limit={d.limit} onPage={(p) => setFilter({ ...filter, page: p })} />
                </>
              ))}
            </Loading>
          </section>
        </>
      )}
      {tab === 'manualTab' && <ManualIssue />}
      {tab === 'eligibleTab' && <Eligible />}
      {tab === 'templatesTab' && <Templates />}
      {tab === 'accreditationsTab' && <Accreditations />}
    </>
  );
}

// ---- a certificate written by hand: the owner and the assistant ----
const today = () => new Date().toISOString().slice(0, 10);
function ManualIssue() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const types = useLoad('/api/v2/certificates/manual/types', []);
  const [f, setF] = useState({ docType: 'course', gender: 'male', name: '', nameEn: '', program: '', programEn: '', hours: '', date: today(), numberMode: 'auto', number: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ready = (types.data?.items || []).find((x) => x.key === f.docType)?.ready;
  const save = (e) => {
    e.preventDefault();
    run(() => api('/api/v2/certificates/manual', { method: 'POST', body: { ...f, hours: Number(f.hours) || 0 } })).then((r) => navigate(`/certificates/${r.item._id}`)).catch(() => {});
  };
  const preview = {
    cert: { cert_num: f.numberMode === 'manual' ? f.number || '—' : 'NC-0000000', trainee_name: f.name || 'اسم المتدرب', nameEn: f.nameEn || 'Trainee name', hours: Number(f.hours) || 0, issue_date: f.date, status: 'Valid' },
    design: { layout: 'nibras', gender: f.gender, subjectAr: f.program || 'اسم البرنامج', subjectEn: f.programEn || 'Program name' }
  };
  return (
    <>
      <form className="card form-grid" onSubmit={save}>
        <p className="muted wide">{t('manualHint')}</p>
        <Field label={t('certDocType')}>
          <select value={f.docType} onChange={set('docType')}>
            {(types.data?.items || []).map((x) => <option key={x.key} value={x.key} disabled={!x.ready}>{lang === 'en' ? x.en : x.ar}{x.ready ? '' : ` (${t('designSoon')})`}</option>)}
          </select>
        </Field>
        <Field label={t('gender')}><select value={f.gender} onChange={set('gender')}><option value="male">{t('male')}</option><option value="female">{t('female')}</option></select></Field>
        <Field label={`${t('name')} (AR)`}><input required value={f.name} onChange={set('name')} /></Field>
        <Field label={`${t('name')} (EN)`}><input required dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
        <Field label={`${t('program')} (AR)`} hint={t('manualProgramHint')}><input required value={f.program} onChange={set('program')} placeholder="دورة إدارة الموارد البشرية" /></Field>
        <Field label={`${t('program')} (EN)`}><input required dir="ltr" value={f.programEn} onChange={set('programEn')} placeholder="Human Resources Management Course" /></Field>
        <Field label={t('trainingHours')}><input type="number" min="0" max="5000" value={f.hours} onChange={set('hours')} /></Field>
        <Field label={t('date')}><input type="date" required value={f.date} onChange={set('date')} /></Field>
        <Field label={t('certNumber')}>
          <select value={f.numberMode} onChange={set('numberMode')}><option value="auto">{t('numberAuto')}</option><option value="manual">{t('numberManual')}</option></select>
        </Field>
        {f.numberMode === 'manual' && <Field label={t('certNumber')} hint={t('numberManualHint')}><input required dir="ltr" value={f.number} onChange={set('number')} placeholder="MT-B2589" pattern="[A-Za-z0-9][A-Za-z0-9\-]{2,29}" /></Field>}
        <ErrorBox error={error} />
        <div className="row wide"><button type="submit" className="btn btn--primary" disabled={busy || !ready}>{t('issueCertificate')}</button></div>
      </form>
      <h2>{t('preview')}</h2>
      <CertificateSheet cert={preview.cert} design={preview.design} />
    </>
  );
}

function Eligible() {
  const { t, fmtDay } = useI18n();
  const { can } = useAuth();
  const [email, setEmail] = useState(true);
  const [waive, setWaive] = useState(null);
  const state = useLoad('/api/v2/certificates/eligible');
  const canIssue = can('certificates.create', 'all');
  // customer service may release a certificate before full payment (PLAN-V2 decision 1); issuing is the owner's
  const canRelease = can('certificates.manage', 'all') || can('certificates.approve', 'all');
  const templates = useLoad(canIssue ? '/api/v2/certificate-templates' : null);
  const [selected, setSelected] = useState([]);
  const [results, setResults] = useState(null);
  const { busy, error, run } = useAction();
  const key = (i) => `${i.enrollment}:${i.module || 'final'}`;
  const issue = () => run(() => api('/api/v2/certificates/issue-bulk', { method: 'POST', body: { email, items: state.data.items.filter((i) => selected.includes(key(i))).map((i) => ({ enrollment: i.enrollment, module: i.module })) } }))
    .then((d) => { setResults(d.results); setSelected([]); state.reload(); }).catch(() => {});
  return (
    <section className="card">
      <p className="muted">{t('cdAutoHint')}</p>
      {canIssue && templates.data && (templates.data.items || []).length === 0 && <div className="alert alert--info">{t('noTemplateHint')}</div>}
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
          <>
            {canIssue && <div className="card-head"><span>{selected.length} {t('selected')}</span><div className="row"><label className="check"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> {t('cdIssueEmail')}</label><button type="button" className="btn btn--primary" disabled={busy || !selected.length} onClick={issue}>{t('issueSelected')}</button></div></div>}
            <div className="table-wrap">
              <table className="table">
                <thead><tr>{canIssue && <th><input type="checkbox" aria-label="all" checked={selected.length > 0 && selected.length === d.items.filter((i) => !i.unpaid).length} onChange={(e) => setSelected(e.target.checked ? d.items.filter((i) => !i.unpaid).map(key) : [])} /></th>}<th>{t('customer')}</th><th>{t('program')}</th><th>{t('certificate')}</th><th>{t('approved')}</th><th>{t('cdUnpaid')}</th></tr></thead>
                <tbody>{d.items.map((i) => (
                  <tr key={key(i)}>
                    {canIssue && <td><input type="checkbox" aria-label={i.title} disabled={!!i.unpaid} checked={selected.includes(key(i))} onChange={() => setSelected((s) => (s.includes(key(i)) ? s.filter((x) => x !== key(i)) : [...s, key(i)]))} /></td>}
                    <td>{i.customer?.customerNo} {i.customer?.nameAr}</td>
                    <td>{i.program}<br /><small className="muted" dir="ltr">{i.enrollmentNo}</small></td>
                    <td>{i.kind === 'program' ? <Pill tone="ok">{t('finalCert')}</Pill> : i.title}</td>
                    <td>{fmtDay(i.approvedAt)}</td>
                    <td>{i.unpaid ? <><small className="late" dir="ltr">{owed(i.unpaid)}</small>{canRelease && <><br /><button type="button" className="btn btn--small btn--ghost" onClick={() => setWaive(i)}>{t('cdWaive')}</button></>}</> : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        ))}
      </Loading>
      <ErrorBox error={error} />
      {results && <ul className="plain-list">{results.map((r, i) => <li key={i}>{r.ok ? <><Link to={`/certificates/${r.id}`} dir="ltr">{r.cert_num}</Link>{r.emailError && <small className="late"> {t('cdEmailError')}: {r.emailError}</small>}</> : <span className="warn">{r.message}</span>}</li>)}</ul>}
      {waive && <WaiveDialog item={waive} email={email} onClose={() => setWaive(null)} onDone={() => { setWaive(null); state.reload(); }} />}
    </section>
  );
}

function WaiveDialog({ item, email, onClose, onDone }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal title={t('cdWaiveTitle')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/v2/certificates/issue', { method: 'POST', body: { enrollment: item.enrollment, module: item.module, waivePayment: reason, email } })).then(onDone).catch(() => {}); }}>
        <p>{item.customer?.customerNo} {item.customer?.nameAr} · {item.title}</p>
        <div className="alert alert--warn">{t('cdUnpaid')}: <span dir="ltr">{owed(item.unpaid)}</span></div>
        <Field label={`${t('cdWaiveReason')} *`}><input required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--danger" disabled={busy}>{t('cdWaive')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/admin/media', { method: 'POST', body: fd, credentials: 'same-origin' });
  const d = await res.json();
  if (!res.ok) throw new Error(d.message || 'Upload failed');
  return d.url;
}

function ImageField({ label, value, onChange }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Field label={label}>
      <div className="row">
        {value && <img src={value} alt="" style={{ height: 40 }} />}
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async (e) => { const f = e.target.files[0]; if (!f) return; setBusy(true); try { onChange(await uploadImage(f)); } finally { setBusy(false); } }} />
        {value && <button type="button" className="link" onClick={() => onChange('')}>{t('cancel')}</button>}
      </div>
    </Field>
  );
}

function Templates() {
  const { t } = useI18n();
  const state = useLoad('/api/v2/certificate-templates');
  const [editing, setEditing] = useState(null);
  if (editing) return <TemplateEditor item={editing === 'new' ? null : editing} onDone={() => { setEditing(null); state.reload(); }} />;
  return (
    <section className="card">
      <div className="card-head"><span className="muted">{t('templateHint')}</span><button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>+ {t('newTemplate')}</button></div>
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
          <ul className="plain-list">{d.items.map((x) => <li key={x._id}><span><strong>{x.name}</strong> · {x.kind === 'program' ? t('finalCert') : t('module')} {x.isDefault && <Pill tone="ok">{t('defaultTemplate')}</Pill>} {!x.active && <Pill tone="muted">{t('inactive')}</Pill>}</span><button type="button" className="btn btn--small" onClick={() => setEditing(x)}>{t('edit')}</button></li>)}</ul>
        ))}
      </Loading>
    </section>
  );
}

function TemplateEditor({ item, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState(item ? { layout: 'nibras', ...item } : { name: '', kind: 'module', layout: 'nibras', isDefault: true, language: 'both', titleAr: 'شهادة إتمام', titleEn: 'Certificate of Completion', introAr: 'تشهد أكاديمية نبراس للتدريب والتأهيل المهني بأن', introEn: 'Nibras Academy for Training & Professional Qualification certifies that', bodyAr: '', bodyEn: '', footerAr: '', footerEn: '', logo: '/assets/img/logo.png', background: '', primaryColor: '#5a020e', accentColor: '#b98a35', showHours: true, showAccreditations: true, signatures: [], active: true });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  const setSig = (i, k, v) => setF({ ...f, signatures: f.signatures.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const save = (e) => {
    e.preventDefault();
    run(() => api(item ? `/api/v2/certificate-templates/${item._id}` : '/api/v2/certificate-templates', { method: item ? 'PUT' : 'POST', body: f })).then(onDone).catch(() => {});
  };
  return (
    <>
      <form className="card form-grid" onSubmit={save}>
        <Field label={t('name')}><input required value={f.name} onChange={set('name')} /></Field>
        <Field label={t('kind')}><select value={f.kind} onChange={set('kind')} disabled={!!item}><option value="module">{t('module')}</option><option value="program">{t('finalCert')}</option></select></Field>
        <Field label={t('certLayout')}><select value={f.layout} onChange={set('layout')}><option value="nibras">{t('certLayoutNibras')}</option><option value="classic">{t('certLayoutClassic')}</option></select></Field>
        <Field label={t('templateLanguage')}><select value={f.language} onChange={set('language')}><option value="both">AR + EN</option><option value="ar">العربية</option><option value="en">English</option></select></Field>
        <Field label={t('primaryColor')}><input type="color" value={f.primaryColor} onChange={set('primaryColor')} /></Field>
        <Field label={t('accentColor')}><input type="color" value={f.accentColor} onChange={set('accentColor')} /></Field>
        <Field label={`${t('title')} (AR)`}><input value={f.titleAr} onChange={set('titleAr')} /></Field>
        <Field label={`${t('title')} (EN)`}><input dir="ltr" value={f.titleEn} onChange={set('titleEn')} /></Field>
        <Field label={`${t('intro')} (AR)`} wide><input value={f.introAr} onChange={set('introAr')} /></Field>
        <Field label={`${t('intro')} (EN)`} wide><input dir="ltr" value={f.introEn} onChange={set('introEn')} /></Field>
        <Field label={`${t('description')} (AR)`} hint={t('placeholdersHint')} wide><input value={f.bodyAr} onChange={set('bodyAr')} placeholder="قد أتم بنجاح متطلبات محور «{module}» ضمن برنامج «{program}»" /></Field>
        <Field label={`${t('description')} (EN)`} wide><input dir="ltr" value={f.bodyEn} onChange={set('bodyEn')} placeholder="has successfully completed the module “{moduleEn}” of the “{programEn}” program" /></Field>
        <Field label={`${t('footer')} (AR)`}><input value={f.footerAr} onChange={set('footerAr')} /></Field>
        <Field label={`${t('footer')} (EN)`}><input dir="ltr" value={f.footerEn} onChange={set('footerEn')} /></Field>
        <ImageField label={t('logo')} value={f.logo} onChange={set('logo')} />
        <ImageField label={t('background')} value={f.background} onChange={set('background')} />
        <label className="check"><input type="checkbox" checked={f.showHours} onChange={set('showHours')} /> {t('showHours')}</label>
        <label className="check"><input type="checkbox" checked={f.showAccreditations} onChange={set('showAccreditations')} /> {t('showAccreditations')}</label>
        <label className="check"><input type="checkbox" checked={f.isDefault} onChange={set('isDefault')} /> {t('defaultTemplate')}</label>
        <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> {t('active')}</label>
        <h3 className="field--wide">{t('signatures')}</h3>
        {f.signatures.map((s, i) => (
          <div className="field--wide form-grid" key={i}>
            <Field label={t('nameAr')}><input value={s.nameAr || ''} onChange={(e) => setSig(i, 'nameAr', e.target.value)} /></Field>
            <Field label={t('nameEn')}><input dir="ltr" value={s.nameEn || ''} onChange={(e) => setSig(i, 'nameEn', e.target.value)} /></Field>
            <Field label={`${t('jobTitle')} (AR)`}><input value={s.titleAr || ''} onChange={(e) => setSig(i, 'titleAr', e.target.value)} /></Field>
            <Field label={`${t('jobTitle')} (EN)`}><input dir="ltr" value={s.titleEn || ''} onChange={(e) => setSig(i, 'titleEn', e.target.value)} /></Field>
            <ImageField label={t('signatureImage')} value={s.image} onChange={(v) => setSig(i, 'image', v)} />
            <button type="button" className="btn btn--small btn--danger" onClick={() => setF({ ...f, signatures: f.signatures.filter((_, j) => j !== i) })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginInlineEnd: 4 }}><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              {t('cancel')}
            </button>
          </div>
        ))}
        {f.signatures.length < 4 && <div className="field--wide"><button type="button" className="btn btn--small" onClick={() => setF({ ...f, signatures: [...f.signatures, {}] })}>+ {t('add')}</button></div>}
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onDone}>{t('cancel')}</button></div>
      </form>
      <h2>{t('preview')}</h2>
      <div className="cert-preview"><CertificateSheet cert={{ trainee_name: SAMPLE.name, nameEn: SAMPLE.nameEn, cert_num: SAMPLE.number, issue_date: SAMPLE.date, hours: f.kind === 'module' ? SAMPLE.hours : 0, accreditations: [{ nameAr: 'جهة اعتماد (مثال)', nameEn: 'Accreditation body (sample)', number: 'ACC-123' }], status: 'Valid' }} design={previewDesign(f, f.kind)} verifyUrl="https://www.nibras-ac.com/pages/ar/verify.html?code=NC-0000000" /></div>
    </>
  );
}

function Accreditations() {
  const { t, fmtDay, label } = useI18n();
  const state = useLoad('/api/v2/accreditations');
  const programs = useLoad('/api/v2/programs?limit=500');
  const [editing, setEditing] = useState(null);
  return (
    <section className="card">
      <div className="card-head"><span /><button type="button" className="btn btn--primary" onClick={() => setEditing({})}>+ {t('newAccreditation')}</button></div>
      <Loading state={state}>
        {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('name')}</th><th>{t('accBody')}</th><th>{t('number')}</th><th>{t('programsNav')}</th><th>{t('validUntil')}</th><th /></tr></thead>
              <tbody>{d.items.map((a) => (
                <tr key={a._id} className={a.active ? '' : 'muted'}>
                  <td>{a.logo && <img src={a.logo} alt="" style={{ height: 24, verticalAlign: 'middle' }} />} {label({ ar: a.nameAr, en: a.nameEn })}</td>
                  <td>{a.body}</td><td dir="ltr">{a.number}</td>
                  <td>{a.allPrograms ? t('all') : a.programs.map((p) => p.titleAr).join('، ') || '—'}</td>
                  <td>{a.validUntil ? fmtDay(a.validUntil) : '—'}</td>
                  <td><button type="button" className="btn btn--small" onClick={() => setEditing(a)}>{t('edit')}</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </Loading>
      {editing && <AccreditationForm item={editing._id ? editing : null} programs={programs.data?.items || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload(); }} />}
    </section>
  );
}

function AccreditationForm({ item, programs, onClose, onSaved }) {
  const { t, label } = useI18n();
  const d = (v) => (v ? String(v).slice(0, 10) : '');
  const [f, setF] = useState({ nameAr: item?.nameAr || '', nameEn: item?.nameEn || '', body: item?.body || '', number: item?.number || '', logo: item?.logo || '', validFrom: d(item?.validFrom), validUntil: d(item?.validUntil), programs: (item?.programs || []).map((p) => p._id || p), allPrograms: !!item?.allPrograms, active: item ? item.active : true });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  return (
    <Modal title={item ? t('edit') : t('newAccreditation')} onClose={onClose} wide>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); run(() => api(item ? `/api/v2/accreditations/${item._id}` : '/api/v2/accreditations', { method: item ? 'PUT' : 'POST', body: { ...f, __v: item?.__v } })).then(onSaved).catch(() => {}); }}>
        <Field label={t('nameAr')}><input required value={f.nameAr} onChange={set('nameAr')} /></Field>
        <Field label={t('nameEn')}><input dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
        <Field label={t('accBody')}><input value={f.body} onChange={set('body')} /></Field>
        <Field label={t('number')}><input dir="ltr" value={f.number} onChange={set('number')} /></Field>
        <Field label={t('startDate')}><input type="date" value={f.validFrom} onChange={set('validFrom')} /></Field>
        <Field label={t('validUntil')}><input type="date" value={f.validUntil} onChange={set('validUntil')} /></Field>
        <ImageField label={t('logo')} value={f.logo} onChange={set('logo')} />
        <label className="check"><input type="checkbox" checked={f.allPrograms} onChange={set('allPrograms')} /> {t('allProgramsLabel')}</label>
        {!f.allPrograms && (
          <Field label={t('programsNav')} wide>
            <select multiple size={6} value={f.programs} onChange={(e) => setF({ ...f, programs: [...e.target.selectedOptions].map((o) => o.value) })}>
              {programs.map((p) => <option key={p._id} value={p._id}>{label({ ar: p.titleAr, en: p.titleEn })}</option>)}
            </select>
          </Field>
        )}
        <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> {t('active')}</label>
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

// ---- the customer's certificates ----

export function MyCertificates() {
  const { t, label } = useI18n();
  const state = useLoad('/api/v2/my/certificates');
  return (
    <>
      <h1 className="page-title">{t('myCertificates')}</h1>
      {state.data?.pending?.length > 0 && (
        <section className="card">
          <h2>{t('cdPending')}</h2>
          <ul className="plain-list">{state.data.pending.map((p, i) => (
            <li key={i}>
              <span><strong>{label({ ar: p.titleAr, en: p.titleEn })}</strong>{!p.final && <small className="muted"> · {p.program}</small>}</span>
              {p.remaining.length ? <span className="late">{t('cdPendingPay')}: <span dir="ltr">{owed(p.remaining)}</span></span> : <Pill tone="info">{t('cdPendingSoon')}</Pill>}
            </li>
          ))}</ul>
        </section>
      )}
      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noData')}</p> : (
            <ul className="plain-list">{d.items.map((c) => (
              <li key={c._id}>
                <span><strong>{c.moduleName || c.program_name}</strong>{c.moduleName && <small className="muted"> · {c.program_name}</small>}</span>
                <span dir="ltr">{c.cert_num} · {c.issue_date}</span>
                {c.delivery?.paper && c.delivery.paper.status !== 'none' && <Pill tone={PAPER_TONE[c.delivery.paper.status]}>{t('cdPaperYours')}: {t(`paper_${c.delivery.paper.status}`)}</Pill>}
                {c.kind === 'legacy' ? (c.pdf_url ? <a className="btn btn--small" href={c.pdf_url}>{t('download')}</a> : <span />) : <Link className="btn btn--small" to={`/certificates/${c._id}`}>{t('open_file')}</Link>}
              </li>
            ))}</ul>
          ))}
        </Loading>
      </section>
    </>
  );
}
