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
// A4 landscape is 1123 x 794 px; a portrait sheet (the diploma) 794 x 1123
function Scaled({ children, portrait = false }) {
  const [w, h] = portrait ? [794, 1123] : [1123, 794];
  const box = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1, el.clientWidth / w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return <div ref={box} className="cert-scaler" style={{ height: h * scale }}><div className="cert-scaled" style={{ width: portrait ? '210mm' : undefined, transform: `scale(${scale})` }}>{children}</div></div>;
}

export function CertificateSheet(props) {
  const d = props.design || {};
  return <Scaled portrait={d.layout === 'nibras' && ['diploma', 'degree'].includes(d.docType)}><SheetBody {...props} /></Scaled>;
}

// The academy's designed sheet (cert-nibras.js), shared with the website
// verifyUrl: the QR code in its top corner opens it. nameFile: the page title becomes the saved
// PDF's name (the trainee, the kind and the program) while the certificate is open.
export function NibrasSheet({ cert, design, verifyUrl, nameFile }) {
  const [html, setHtml] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadCertKit()
      .then((k) => Promise.all([k, verifyUrl ? QRCode.toDataURL(verifyUrl, { margin: 0, width: 360, errorCorrectionLevel: 'M', color: { dark: k.qrColor(design, cert) } }).catch(() => '') : '']))
      .then(([k, q]) => { if (live) setHtml(k.sheet(cert, design, { qr: q })); })
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [cert, design, verifyUrl]);
  useEffect(() => {
    if (!nameFile) return undefined;
    const before = document.title;
    loadCertKit().then((k) => { document.title = k.fileName(cert, design); }).catch(() => {});
    return () => { document.title = before; };
  }, [cert, design, nameFile]);
  if (failed) return <p className="error">The certificate design could not be loaded.</p>;
  return <div className="ncert-host" dangerouslySetInnerHTML={{ __html: html }} />;
}

function SheetBody({ cert, design: d, verifyUrl }) {
  if (d && d.layout === 'nibras') return <NibrasSheet cert={cert} design={d} verifyUrl={verifyUrl} nameFile={!!cert._id} />;
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
          {c.kind === 'manual' && ['super_admin', 'assistant'].includes(me.user.role) && <LinkCard c={c} onChanged={state.reload} />}
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
  const [f, setF] = useState({ nameAr: c.trainee_name, nameEn: c.nameEn || '', reason: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal title={t('reissue')} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/v2/certificates/${c._id}/reissue`, { method: 'POST', body: f })).then((d) => onDone(d.item)).catch(() => {}); }}>
        <p className="muted">{t('reissueHint')}</p>
        <Field label={t('nameAr')}><input value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} /></Field>
        <Field label={t('nameEn')}><input dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
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
  const tabs = ['issued', ...(byHand ? ['manualTab'] : []), ...(can('certificates.create', 'all') || can('certificates.approve', 'all') ? ['eligibleTab'] : [])];
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
    </>
  );
}

// ---- linking a hand-written certificate to a customer ----
// Search every customer by name, mobile, email or number, and pick one
function CustomerPicker({ value, onPick }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [found, setFound] = useState({ loading: false, items: [] });
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setFound({ loading: false, items: [] }); return undefined; }
    let live = true;
    setFound((s) => ({ ...s, loading: true }));
    const timer = setTimeout(() => {
      api(`/api/v2/customers?${new URLSearchParams({ q: text, limit: '10' })}`).then((r) => live && setFound({ loading: false, items: r.items || [] })).catch(() => live && setFound({ loading: false, items: [] }));
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);
  const line = (c) => [c.customerNo, c.contact?.phone, c.contact?.email].filter(Boolean).join(' · ');
  if (value) {
    return (
      <div className="picked-customer">
        <span className="pill pill--ok">✓</span>
        <strong>{value.nameAr || value.name}</strong>
        <small className="muted" dir="ltr">{line(value)}</small>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onPick(null)}>{t('change')}</button>
      </div>
    );
  }
  return (
    <div className="customer-picker">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchCustomerHint')} autoFocus />
      {found.loading && <small className="muted">…</small>}
      {!found.loading && q.trim().length >= 2 && !found.items.length && <small className="muted">{t('noCustomerFound')}</small>}
      {found.items.length > 0 && (
        <ul className="customer-picker__list">
          {found.items.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)}>
                <strong>{c.nameAr || c.name}{c.nameEn ? <span dir="ltr"> · {c.nameEn}</span> : null}</strong>
                <small className="muted" dir="ltr">{line(c)}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// On a hand-written certificate: who it belongs to, and changing that (link, change, unlink)
function LinkCard({ c, onChanged }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useAction();
  const save = (customer) => run(() => api(`/api/v2/certificates/${c._id}/link`, { method: 'POST', body: { customer: customer ? customer.id : null } })).then(() => { setEditing(false); onChanged(); }).catch(() => {});
  return (
    <section className="card no-print">
      <h2>{t('linkedCustomer')}</h2>
      {c.customer
        ? <p><Link to={`/customers/${c.customer._id}`}>{c.customer.customerNo} · {c.customer.nameAr}</Link> <small className="muted">{t('linkedShowsInProfile')}</small></p>
        : <p className="muted">{t('notLinked')}</p>}
      {editing ? (
        <>
          <CustomerPicker value={null} onPick={(x) => x && save(x)} />
          <div className="row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>{t('cancel')}</button></div>
        </>
      ) : (
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)} disabled={busy}>{c.customer ? t('linkOther') : t('linkToCustomer')}</button>
          {c.customer && <button type="button" className="btn btn--ghost" onClick={() => save(null)} disabled={busy}>{t('unlink')}</button>}
        </div>
      )}
      <ErrorBox error={error} />
    </section>
  );
}

// ---- a certificate written by hand: the owner and the assistant ----
const today = () => new Date().toISOString().slice(0, 10);
function ManualIssue() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const types = useLoad('/api/v2/certificates/manual/types', []);
  const year = String(new Date().getFullYear());
  const [f, setF] = useState({ docType: 'course', gender: '', name: '', nameEn: '', program: '', programEn: '', hours: '', date: today(), numberMode: 'auto', number: '', specialization: '', degree: '', admittedYear: year, conferredYear: year });
  const [rows, setRows] = useState([{ module: '', percentage: '', grade: '' }, { module: '', percentage: '', grade: '' }, { module: '', percentage: '', grade: '' }]);
  const setRow = (i, k) => (e) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  const isDegree = f.docType === 'degree';
  const [linked, setLinked] = useState(false);
  const [customer, setCustomer] = useState(null);
  // picking a customer fills the names that are still empty
  const pick = (c) => { setCustomer(c); if (c) setF((cur) => ({ ...cur, name: cur.name || c.nameAr || '', nameEn: cur.nameEn || c.nameEn || '' })); };
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ready = (types.data?.items || []).find((x) => x.key === f.docType)?.ready;
  const save = (e) => {
    e.preventDefault();
    run(() => api('/api/v2/certificates/manual', { method: 'POST', body: { ...f, hours: Number(f.hours) || 0, ...(isDegree ? { rows } : {}), linkCustomer: linked && !!customer, customer: linked && customer ? customer.id : null } })).then((r) => navigate(`/certificates/${r.item._id}`)).catch(() => {});
  };
  const preview = {
    cert: { cert_num: f.numberMode === 'manual' ? f.number || '—' : 'NC-0000000', trainee_name: f.name || 'اسم المتدرب', nameEn: f.nameEn || 'Trainee name', hours: Number(f.hours) || 0, issue_date: f.date, status: 'Valid' },
    design: { layout: 'nibras', docType: f.docType, gender: f.gender, subjectAr: f.program || 'اسم البرنامج', subjectEn: f.programEn || 'Program name',
      ...(isDegree ? { transcript: { specialization: f.specialization || 'Specialization', degree: f.degree || 'Degree', programEn: f.programEn || 'Program name', admittedYear: f.admittedYear, conferredYear: f.conferredYear, rows: rows.filter((r) => r.module) } } : {}) }
  };
  return (
    <>
      <form className="card form-grid" onSubmit={save}>
        <p className="muted field--wide">{t('manualHint')}</p>
        <Field label={t('certDocType')}>
          <select value={f.docType} onChange={set('docType')}>
            {(types.data?.items || []).map((x) => <option key={x.key} value={x.key} disabled={!x.ready}>{lang === 'en' ? x.en : x.ar}{x.ready ? '' : ` (${t('designSoon')})`}</option>)}
          </select>
        </Field>
        <div className="field--wide link-box">
          <label className="check"><input type="checkbox" checked={linked} onChange={(e) => { setLinked(e.target.checked); if (!e.target.checked) setCustomer(null); }} /> {t('linkExisting')}</label>
          <small className="muted">{t('linkExistingHint')}</small>
          {linked && <CustomerPicker value={customer} onPick={pick} />}
        </div>
        <Field label={t('gender')} hint={t('genderWordingHint')}><select required value={f.gender} onChange={set('gender')}><option value="" disabled>{t('choose')}</option><option value="male">{t('male')}</option><option value="female">{t('female')}</option></select></Field>
        <Field label={`${t('name')} (AR)`}><input required value={f.name} onChange={set('name')} /></Field>
        <Field label={`${t('name')} (EN)`}><input required dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
        <Field label={`${t('program')} (AR)`} hint={t('manualProgramHint')}><input required value={f.program} onChange={set('program')} placeholder="دورة إدارة الموارد البشرية" /></Field>
        <Field label={`${t('program')} (EN)`}><input required dir="ltr" value={f.programEn} onChange={set('programEn')} placeholder="Human Resources Management Course" /></Field>
        {!isDegree && <Field label={t('trainingHours')}><input type="number" min="0" max="5000" value={f.hours} onChange={set('hours')} /></Field>}
        {isDegree && (
          <>
            <Field label={t('trSpecialization')}><input required dir="ltr" value={f.specialization} onChange={set('specialization')} placeholder="Business Administration" /></Field>
            <Field label={t('trDegree')}><input required dir="ltr" value={f.degree} onChange={set('degree')} placeholder="Master" list="tr-degrees" /><datalist id="tr-degrees"><option value="Diploma" /><option value="Master" /><option value="Doctorate" /></datalist></Field>
            <Field label={t('trAdmitted')}><input dir="ltr" inputMode="numeric" pattern="[0-9]{4}" value={f.admittedYear} onChange={set('admittedYear')} /></Field>
            <Field label={t('trConferred')}><input dir="ltr" inputMode="numeric" pattern="[0-9]{4}" value={f.conferredYear} onChange={set('conferredYear')} /></Field>
            <div className="field--wide tr-rows-box">
              <table className="table tr-rows" dir="ltr">
                <thead><tr><th>Module Name</th><th>Percentage</th><th>Grade</th><th /></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td><input value={r.module} onChange={setRow(i, 'module')} placeholder="Strategic Planning" /></td>
                      <td><input type="number" min="0" max="100" step="0.1" value={r.percentage} onChange={setRow(i, 'percentage')} placeholder="95" /></td>
                      <td><input value={r.grade} onChange={setRow(i, 'grade')} maxLength={4} placeholder={window.NibrasCertificate?.gradeOf(r.percentage) || t('trGradeAuto')} /></td>
                      <td><button type="button" className="btn btn--ghost btn--sm" onClick={() => setRows(rows.filter((x, j) => j !== i))} disabled={rows.length < 2} aria-label={t('remove')}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row"><button type="button" className="btn btn--ghost" onClick={() => setRows([...rows, { module: '', percentage: '', grade: '' }])} disabled={rows.length >= 15}>+ {t('trAddRow')}</button><small className="muted">{t('trRowsHint')}</small></div>
            </div>
          </>
        )}
        <Field label={t('date')}><input type="date" required value={f.date} onChange={set('date')} /></Field>
        <Field label={t('certNumber')}>
          <select value={f.numberMode} onChange={set('numberMode')}><option value="auto">{t('numberAuto')}</option><option value="manual">{t('numberManual')}</option></select>
        </Field>
        {f.numberMode === 'manual' && <Field label={t('certNumber')} hint={t('numberManualHint')}><input required dir="ltr" value={f.number} onChange={set('number')} placeholder="MT-B2589" pattern="[A-Za-z0-9][A-Za-z0-9\-]{2,29}" /></Field>}
        <ErrorBox error={error} />
        <div className="row field--wide"><button type="submit" className="btn btn--primary" disabled={busy || !ready || (linked && !customer)}>{t('issueCertificate')}</button>{linked && !customer && <small className="muted">{t('pickCustomerFirst')}</small>}</div>
      </form>
      <h2>{t('preview')}</h2>
      <CertificateSheet cert={preview.cert} design={preview.design} verifyUrl={`https://www.nibras-ac.com/pages/ar/verify.html?code=${encodeURIComponent(preview.cert.cert_num)}`} />
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
  const [selected, setSelected] = useState([]);
  const [results, setResults] = useState(null);
  const { busy, error, run } = useAction();
  const key = (i) => `${i.enrollment}:${i.module || 'final'}`;
  const issue = () => run(() => api('/api/v2/certificates/issue-bulk', { method: 'POST', body: { email, items: state.data.items.filter((i) => selected.includes(key(i))).map((i) => ({ enrollment: i.enrollment, module: i.module })) } }))
    .then((d) => { setResults(d.results); setSelected([]); state.reload(); }).catch(() => {});
  return (
    <section className="card">
      <p className="muted">{t('cdAutoHint')}</p>
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
