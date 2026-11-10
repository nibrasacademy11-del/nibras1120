import { useCallback, useEffect, useRef, useState } from 'react';
import { api, pickMessage } from '../api.js';
import { useI18n } from '../i18n.jsx';

// Loads data from the API and reloads on demand. Errors come back in the user's language.
export function useLoad(path, deps = []) {
  const { lang } = useI18n();
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const load = useCallback(() => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    api(path)
      .then((data) => setState({ data, error: '', loading: false }))
      .catch((e) => setState({ data: null, error: pickMessage(e.message, lang), loading: false }));
  }, [path, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}

// Runs a form action with a busy flag and a translated error
export function useAction() {
  const { lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (fn) => {
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(pickMessage(e.message, lang));
      throw e;
    } finally {
      setBusy(false);
    }
  }, [lang]);
  return { busy, error, setError, run };
}

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className={`modal${wide ? ' modal--wide' : ''}`} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

export function Field({ label, children, wide, hint }) {
  return (
    <label className={`field${wide ? ' field--wide' : ''}`}>
      {label}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export const ErrorBox = ({ error }) => (error ? <div className="alert alert--error" role="alert">{error}</div> : null);

export function Loading({ state, children }) {
  const { t } = useI18n();
  if (state.error) return <div className="alert alert--error">{state.error}</div>;
  if (!state.data) return <p className="muted">{t('loading')}</p>;
  return children(state.data);
}

const STATUS_TONE = { customer: 'ok', interested: 'gold', lead: 'info', lost: 'warn', inactive: 'muted', merged: 'muted', approved: 'ok', pending: 'gold', rejected: 'warn', revoked: 'muted', cancelled: 'muted', expired: 'muted', open: 'gold', done: 'ok', active: 'ok', left: 'muted' };
export function Pill({ tone, value, children }) {
  return <span className={`pill pill--${tone || STATUS_TONE[value] || 'muted'}`}>{children}</span>;
}

// Active staff list for owner / assignee / transfer pickers, loaded once per page
let staffCache = null;
export function useStaff() {
  const [staff, setStaff] = useState(staffCache || []);
  useEffect(() => {
    if (staffCache) return;
    api('/api/v2/staff').then((d) => { staffCache = d.items; setStaff(d.items); }).catch(() => {});
  }, []);
  return staff;
}

export function StaffSelect({ value, onChange, allowEmpty, exclude = [], required }) {
  const staff = useStaff();
  const { t, lang } = useI18n();
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} required={required}>
      {(allowEmpty || !value) && <option value="">{allowEmpty ? t('none') : '—'}</option>}
      {staff.filter((s) => !exclude.includes(s.id)).map((s) => (
        <option key={s.id} value={s.id}>{lang === 'en' && s.nameEn ? s.nameEn : s.name}</option>
      ))}
    </select>
  );
}

export function EnumSelect({ group, options, value, onChange, allowEmpty, emptyLabel }) {
  const { en } = useI18n();
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">{emptyLabel || '—'}</option>}
      {options.map((o) => <option key={o} value={o}>{en(group, o)}</option>)}
    </select>
  );
}

// Turns a <input type="datetime-local"> value into ISO and back
export const toLocalInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export function Pager({ page, total, limit, onPage }) {
  const { t } = useI18n();
  const pages = Math.max(Math.ceil((total || 0) / (limit || 1)), 1);
  if (pages <= 1) return null;
  return (
    <div className="row pager">
      <button type="button" className="btn btn--ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('prev')}</button>
      <span>{page} / {pages}</span>
      <button type="button" className="btn btn--ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('next')}</button>
    </div>
  );
}
