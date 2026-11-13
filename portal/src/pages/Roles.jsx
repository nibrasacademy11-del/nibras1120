import { useEffect, useMemo, useState } from 'react';
import { api, pickMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

const SCOPE_KEYS = { '': 'scopeNone', own: 'scopeOwn', team: 'scopeTeam', department: 'scopeDepartment', all: 'scopeAll' };

export default function Roles() {
  const { can } = useAuth();
  const { t, label, lang } = useI18n();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('admin');
  const [draft, setDraft] = useState({});
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = can('roles.manage', 'all');

  const load = () =>
    api('/api/v2/roles')
      .then((d) => setData(d))
      .catch((e) => setError(pickMessage(e.message, lang)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const role = useMemo(() => data && data.roles.find((r) => r.role === selected), [data, selected]);
  useEffect(() => {
    if (role) setDraft({ ...role.grants });
    setMessage('');
    setError('');
  }, [role]);

  if (error && !data) return <div className="card alert alert--error">{error}</div>;
  if (!data) return <p className="muted">{t('loading')}</p>;

  const { resources, actions, actionLabels, scopes } = data.catalog;
  const editable = canManage && role && role.editable;
  const dirty = role && JSON.stringify(draft) !== JSON.stringify(role.grants);

  const setCell = (key, value) =>
    setDraft((d) => {
      const next = { ...d };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });

  async function save(resetToDefault) {
    setError('');
    setMessage('');
    if (!reason.trim()) return setError(t('reasonRequired'));
    setBusy(true);
    try {
      await api(`/api/v2/roles/${selected}`, {
        method: 'PUT',
        body: resetToDefault ? { reset: true, reason } : { grants: draft, reason }
      });
      setReason('');
      setMessage(t('saved'));
      await load();
    } catch (e) {
      setError(pickMessage(e.message, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">{t('roles')}</h1>
      <div className="role-tabs">
        {data.roles.map((r) => (
          <button
            key={r.role}
            type="button"
            className={`role-tab${r.role === selected ? ' active' : ''}`}
            onClick={() => setSelected(r.role)}
          >
            {label(r.label)}
            <small>{r.users} {t('users')}{r.customized ? ` · ${t('customized')}` : ''}</small>
          </button>
        ))}
      </div>

      <section className="card">
        {!role.editable && <div className="alert alert--info">{t('fixedRole')}</div>}
        {role.editable && !canManage && <div className="alert alert--info">{t('readOnlyRoles')}</div>}
        <div className="table-wrap">
          <table className="table matrix">
            <thead>
              <tr>
                <th>{t('permission')}</th>
                {actions.map((a) => <th key={a}>{label(actionLabels[a])}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(resources).map(([res, resLabel]) => (
                <tr key={res}>
                  <th scope="row">{label(resLabel)}</th>
                  {actions.map((a) => {
                    const key = `${res}.${a}`;
                    const value = draft[key] || '';
                    return (
                      <td key={a}>
                        {editable ? (
                          <select
                            className={`scope scope--${value || 'none'}`}
                            value={value}
                            aria-label={`${label(resLabel)} ${label(actionLabels[a])}`}
                            onChange={(e) => setCell(key, e.target.value)}
                          >
                            <option value="">{t('scopeNone')}</option>
                            {scopes.map((s) => <option key={s} value={s}>{t(SCOPE_KEYS[s])}</option>)}
                          </select>
                        ) : (
                          <span className={`scope scope--${value || 'none'}`}>{t(SCOPE_KEYS[value])}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editable && (
          <div className="stack save-bar">
            <label className="field">
              {t('reason')}
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </label>
            <div className="row">
              <button type="button" className="btn btn--primary" disabled={busy || !dirty} onClick={() => save(false)}>{t('save')}</button>
              {role.customized && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => save(true)}>{t('reset')}</button>}
            </div>
          </div>
        )}
        {message && <div className="alert alert--ok">{message}</div>}
        {error && <div className="alert alert--error">{error}</div>}
      </section>
    </>
  );
}
