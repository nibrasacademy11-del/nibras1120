import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

// The block printed at the top of every A4 page set: logo, academy, title, when and by whom.
// Hidden on screen. Page numbers come from the @page rules in styles.css.
export function PrintHeader({ title, subtitle }) {
  const { t, fmtDate } = useI18n();
  const { me } = useAuth();
  return (
    <div className="print-only print-header">
      <img src="/logo.png" alt="" />
      <div>
        <strong>{t('academy')}</strong>
        <h1>{title}</h1>
        {subtitle && <div className="print-sub">{subtitle}</div>}
      </div>
      <div className="print-meta">
        <div>{t('generatedAt')}: {fmtDate(new Date())}</div>
        <div>{t('generatedBy')}: {me?.user?.name}</div>
      </div>
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
