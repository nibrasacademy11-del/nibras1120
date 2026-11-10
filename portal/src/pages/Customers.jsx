import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { EnumSelect, ErrorBox, Field, Loading, Modal, Pager, Pill, StaffSelect, useAction, useLoad, useStaff } from '../components/ui.jsx';

const STATUSES = ['lead', 'interested', 'customer', 'lost', 'inactive'];
const SOURCES = ['website', 'facebook', 'instagram', 'tiktok', 'whatsapp', 'phone', 'referral', 'walk_in', 'corporate', 'event', 'other'];

export function DuplicateList({ matches }) {
  const { t, en } = useI18n();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>{t('customerNo')}</th><th>{t('name')}</th><th>{t('owner')}</th><th>{t('status')}</th><th>{t('matchedBy')}</th><th /></tr></thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.id}>
              <td dir="ltr">{m.customerNo}</td>
              <td>{m.name}</td>
              <td>{m.owner ? m.owner.name : t('unassigned')}</td>
              <td><Pill value={m.status}>{en('status', m.status)}</Pill></td>
              <td>{m.matched.map((k) => t(k === 'national_id' ? 'nationalId' : k)).join('، ')}</td>
              <td><Link to={`/customers/${m.id}`}>{t('open_file')}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerForm({ onClose, onCreated }) {
  const { t, en } = useI18n();
  const { can } = useAuth();
  const [f, setF] = useState({ nameAr: '', nameEn: '', phone: '', email: '', whatsapp: '', country: '', city: '', source: 'phone', sourceDetail: '', status: 'lead', nationality: '', nationalId: '', passport: '', owner: '' });
  const [dups, setDups] = useState(null);
  const { busy, error, setError, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const canAssign = can('customers.manage', 'team');
  const canIdentity = can('customer_identity.create');

  async function submit(confirm) {
    setDups(null);
    try {
      const body = {
        nameAr: f.nameAr, nameEn: f.nameEn, country: f.country, source: f.source, sourceDetail: f.sourceDetail, status: f.status,
        contact: { phone: f.phone, email: f.email, whatsapp: f.whatsapp, city: f.city },
        identity: canIdentity ? { nationality: f.nationality, nationalId: f.nationalId, passport: f.passport } : undefined,
        owner: f.owner || undefined,
        confirmNotDuplicate: confirm === true
      };
      const d = await run(() => api('/api/v2/customers', { method: 'POST', body }));
      onCreated(d.item);
    } catch (e) {
      if (e.code === 'DUPLICATE' || e.code === 'POSSIBLE_DUPLICATE') {
        setError('');
        setDups({ strong: e.code === 'DUPLICATE', matches: e.body.matches });
      }
    }
  }

  return (
    <Modal title={t('newCustomer')} onClose={onClose} wide>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <Field label={`${t('nameAr')} *`}><input required value={f.nameAr} onChange={set('nameAr')} /></Field>
        <Field label={t('nameEn')}><input dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
        <Field label={t('phone')}><input dir="ltr" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label={t('email')}><input dir="ltr" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label={t('whatsapp')}><input dir="ltr" value={f.whatsapp} onChange={set('whatsapp')} /></Field>
        <Field label={t('country')}><input value={f.country} onChange={set('country')} /></Field>
        <Field label={t('city')}><input value={f.city} onChange={set('city')} /></Field>
        <Field label={t('source')}><EnumSelect group="source" options={SOURCES} value={f.source} onChange={set('source')} /></Field>
        <Field label={t('sourceDetail')}><input value={f.sourceDetail} onChange={set('sourceDetail')} /></Field>
        <Field label={t('status')}><EnumSelect group="status" options={STATUSES.filter((s) => s !== 'lost')} value={f.status} onChange={set('status')} /></Field>
        {canIdentity && (
          <>
            <Field label={t('nationality')}><input value={f.nationality} onChange={set('nationality')} /></Field>
            <Field label={t('nationalId')}><input dir="ltr" autoComplete="off" value={f.nationalId} onChange={set('nationalId')} /></Field>
            <Field label={t('passport')}><input dir="ltr" autoComplete="off" value={f.passport} onChange={set('passport')} /></Field>
          </>
        )}
        {canAssign && <Field label={t('owner')}><StaffSelect value={f.owner} onChange={set('owner')} allowEmpty /></Field>}

        {dups && (
          <div className="field--wide">
            <div className={`alert ${dups.strong ? 'alert--error' : 'alert--warn'}`}>{dups.strong ? t('strongDuplicate') : `${t('possibleDuplicates')}. ${t('duplicateHint')}`}</div>
            <DuplicateList matches={dups.matches} />
          </div>
        )}
        <div className="field--wide"><ErrorBox error={error} /></div>
        <div className="row field--wide">
          <button className="btn btn--primary" disabled={busy}>{busy ? t('saving') : t('save')}</button>
          {dups && !dups.strong && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => submit(true)}>{t('createAnyway')}</button>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
        </div>
        <p className="muted field--wide">{en('section', 'contact')}: {t('phone')} / {t('email')} — {t('required')}</p>
      </form>
    </Modal>
  );
}

function AssignBar({ ids, onDone }) {
  const { t } = useI18n();
  const [to, setTo] = useState('');
  const [even, setEven] = useState([]);
  const [mode, setMode] = useState('one');
  const { busy, error, run } = useAction();
  const submit = async () => {
    const body = mode === 'one' ? { customerIds: ids, to } : { customerIds: ids, strategy: 'even', employees: even };
    await run(() => api('/api/v2/customers/assign', { method: 'POST', body }));
    onDone();
  };
  return (
    <div className="card assign-bar">
      <strong>{ids.length} {t('selected')}</strong>
      <select value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="one">{t('assignSelected')}</option>
        <option value="even">{t('assignEven')}</option>
      </select>
      {mode === 'one' ? <StaffSelect value={to} onChange={setTo} /> : (
        <StaffMulti value={even} onChange={setEven} />
      )}
      <button type="button" className="btn btn--primary" disabled={busy || (mode === 'one' ? !to : even.length < 1)} onClick={() => submit().catch(() => {})}>{t('confirm')}</button>
      <ErrorBox error={error} />
    </div>
  );
}

function StaffMulti({ value, onChange }) {
  const { lang } = useI18n();
  const staff = useStaff();
  return (
    <select multiple size={4} value={value} onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))}>
      {(staff || []).map((s) => <option key={s.id} value={s.id}>{lang === 'en' && s.nameEn ? s.nameEn : s.name}</option>)}
    </select>
  );
}

export default function Customers() {
  const { t, en, fmtDay } = useI18n();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState([]);
  const page = parseInt(params.get('page') || '1', 10);
  const query = new URLSearchParams(params);
  query.set('limit', '50');
  const state = useLoad(`/api/v2/customers?${query}`);
  const canAssign = can('customers.manage', 'team');

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
    setSelected([]);
  };
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('customers')}</h1>
        {can('customers.create') && <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>+ {t('newCustomer')}</button>}
      </div>

      <form className="card filters" onSubmit={(e) => { e.preventDefault(); setParam('q', q.trim()); }}>
        <Field label={t('search')}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchHint')} /></Field>
        <Field label={t('status')}><EnumSelect group="status" options={STATUSES} value={params.get('status')} onChange={(v) => setParam('status', v)} allowEmpty emptyLabel={t('all')} /></Field>
        <Field label={t('source')}><EnumSelect group="source" options={SOURCES} value={params.get('source')} onChange={(v) => setParam('source', v)} allowEmpty emptyLabel={t('all')} /></Field>
        <Field label={t('owner')}>
          <select value={params.get('mine') ? 'mine' : params.get('unassigned') ? 'none' : ''} onChange={(e) => { const v = e.target.value; const next = new URLSearchParams(params); next.delete('mine'); next.delete('unassigned'); next.delete('page'); if (v === 'mine') next.set('mine', '1'); if (v === 'none') next.set('unassigned', '1'); setParams(next); }}>
            <option value="">{t('all')}</option>
            <option value="mine">{t('mine')}</option>
            {canAssign && <option value="none">{t('unassigned')}</option>}
          </select>
        </Field>
        <button className="btn btn--primary">{t('apply')}</button>
      </form>

      {canAssign && selected.length > 0 && <AssignBar ids={selected} onDone={() => { setSelected([]); state.reload(); }} />}

      <section className="card">
        <Loading state={state}>
          {(d) => (!d.items.length ? <p className="muted">{t('noResults')}</p> : (
            <>
              <div className="table-wrap">
                <table className="table table--hover">
                  <thead>
                    <tr>
                      {canAssign && <th />}
                      <th>{t('customerNo')}</th><th>{t('name')}</th><th>{t('phone')}</th><th>{t('status')}</th><th>{t('owner')}</th><th>{t('source')}</th><th>{t('registeredAt')}</th><th>{t('nextFollowUp')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((c) => (
                      <tr key={c.id} onClick={() => navigate(`/customers/${c.id}`)}>
                        {canAssign && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={c.customerNo} checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /></td>}
                        <td dir="ltr" className="nowrap">{c.customerNo}</td>
                        <td><strong>{c.nameAr || c.name}</strong>{c.tags && c.tags.length > 0 && <div className="tags">{c.tags.map((x) => <span key={x} className="tag">{x}</span>)}</div>}</td>
                        <td dir="ltr" className="nowrap">{c.contact ? c.contact.phone : '—'}</td>
                        <td><Pill value={c.status}>{en('status', c.status)}</Pill></td>
                        <td>{c.owner ? c.owner.name : <span className="muted">{t('unassigned')}</span>}</td>
                        <td>{en('source', c.source)}</td>
                        <td className="nowrap">{fmtDay(c.registeredAt)}</td>
                        <td className="nowrap">{c.nextFollowUpAt ? fmtDay(c.nextFollowUpAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">{t('total')}: {d.total}</p>
              <Pager page={page} total={d.total} limit={d.limit} onPage={(p) => setParam('page', String(p))} />
            </>
          ))}
        </Loading>
      </section>

      {creating && <CustomerForm onClose={() => setCreating(false)} onCreated={(c) => navigate(`/customers/${c.id}`)} />}
    </>
  );
}
