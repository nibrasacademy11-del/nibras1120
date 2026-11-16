// A customer's mobile with "copy" and "WhatsApp" next to it (16 Nov 2026), wherever a customer
// writes to the academy (complaints, website requests) and in their file.
import { useState } from 'react';
import { useI18n } from '../i18n.jsx';

// Egyptian mobiles written locally (01xxxxxxxxx) become international for WhatsApp
export const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  if (/^01\d{9}$/.test(d)) return `2${d}`;
  return d.replace(/^00/, '');
};

export default function PhoneActions({ phone, whatsapp }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  if (!phone && !whatsapp) return null;
  const number = phone || whatsapp;
  const copy = async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(number); } catch { /* the number stays selectable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="phone-actions" onClick={(e) => e.stopPropagation()}>
      <bdi dir="ltr" className="phone-actions__no">{number}</bdi>
      <button type="button" className="phone-actions__btn" onClick={copy} title={t('ph_copy')} aria-label={t('ph_copy')}>
        <i className={copied ? 'fas fa-check' : 'far fa-copy'} aria-hidden="true" />
      </button>
      <a className="phone-actions__btn phone-actions__btn--wa" href={`https://wa.me/${waNumber(whatsapp || phone)}`} target="_blank" rel="noreferrer" title={t('ph_whatsapp')} aria-label={t('ph_whatsapp')}>
        <i className="fab fa-whatsapp" aria-hidden="true" />
      </a>
      {copied && <small className="phone-actions__done">{t('ph_copied')}</small>}
    </span>
  );
}
