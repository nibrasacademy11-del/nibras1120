import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

// The academy's identity (name, contacts, tax number), loaded once and shared by every printout
let academyCache = null;
let academyPromise = null;
export function useAcademy() {
  const [profile, setProfile] = useState(academyCache);
  useEffect(() => {
    if (academyCache) return;
    academyPromise = academyPromise || api('/api/v2/academy').then((d) => { academyCache = d.profile; return d.profile; }).catch(() => null);
    academyPromise.then((p) => p && setProfile(p));
  }, []);
  return profile;
}
export const refreshAcademy = () => { academyCache = null; academyPromise = null; };

// The academy's band: logo, names, contacts. Used on printouts and on the receipt.
export function BrandBand({ title, subtitle, children }) {
  const { lang } = useI18n();
  const a = useAcademy() || {};
  const contacts = [a.address, a.phone, a.email, a.website].filter(Boolean);
  return (
    <div className="brand-band">
      <div className="brand-band__top">
        <img src="/logo.png" alt="" />
        <div className="brand-band__names">
          <strong>{lang === 'en' && a.nameEn ? a.nameEn : a.nameAr || 'أكاديمية نبراس'}</strong>
          {lang !== 'en' && a.nameEn && <small dir="ltr">{a.nameEn}</small>}
        </div>
        {children}
      </div>
      {(title || subtitle) && (
        <div className="brand-band__title">
          {title && <h1>{title}</h1>}
          {subtitle && <div className="print-sub">{subtitle}</div>}
        </div>
      )}
      {contacts.length > 0 && <div className="brand-band__contacts">{contacts.map((c, i) => <span key={i}>{i > 0 && ' · '}<bdi dir="auto">{c}</bdi></span>)}</div>}
    </div>
  );
}

// Repeated at the bottom of every printed page: contacts and registration numbers
export function PrintFooter() {
  const { t } = useI18n();
  const a = useAcademy() || {};
  const parts = [a.nameAr, a.phone, a.website, a.taxNumber ? `${t('taxNumber')}: ${a.taxNumber}` : '', a.commercialRegister ? `${t('crNumber')}: ${a.commercialRegister}` : ''].filter(Boolean);
  return <div className="print-only print-footer">{parts.map((c, i) => <span key={i}>{i > 0 && ' · '}<bdi dir="auto">{c}</bdi></span>)}</div>;
}

// The block printed at the top of every A4 page set: the academy band, the title, when and by whom.
// Hidden on screen. Page numbers come from the @page rules in styles.css.
export function PrintHeader({ title, subtitle }) {
  const { t, fmtDate } = useI18n();
  const { me } = useAuth();
  return (
    <div className="print-only print-header">
      <BrandBand title={title} subtitle={subtitle}>
        <div className="print-meta">
          <div>{t('generatedAt')}: {fmtDate(new Date())}</div>
          <div>{t('generatedBy')}: {me?.user?.name}</div>
        </div>
      </BrandBand>
      <PrintFooter />
    </div>
  );
}

// Prints the page (the browser's "Save as PDF" makes the PDF) and records it in the audit log
export function PrintButton({ what, title, filters, landscape, className = 'btn btn--ghost' }) {
  const { t } = useI18n();
  const print = () => {
    document.body.classList.toggle('print-landscape', !!landscape);
    api('/api/v2/reports/printed', { method: 'POST', body: { what, title, filters } }).catch(() => {});
    setTimeout(() => window.print(), 50);
  };
  return <button type="button" className={`${className} no-print`} onClick={print}>{t('printPdf')}</button>;
}
