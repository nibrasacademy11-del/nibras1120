import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Pill, useLoad } from '../components/ui.jsx';
import { SECTIONS, actionsOn, itemVisible, resourceOf } from '../components/navigation.js';

// "What can I see?": every section of the admin panel, the pages this person can open and what
// they can do there (and on whose records), and the pages they cannot open.
// Admins can look at it as any role, to explain the panel to an employee.

const SCOPE_TONE = { all: 'ok', team: 'info', own: 'gold' };
const CUSTOMER_PARTS = ['customer_contact', 'customer_identity', 'customer_financial', 'customer_documents', 'customer_notes'];

function Abilities({ resource, grants }) {
  const { t } = useI18n();
  const by = actionsOn(resource, grants);
  const rows = ['all', 'team', 'own'].filter((s) => by[s].length);
  if (!resource) return null;
  if (!rows.length) return <small className="muted">{t('maOnlyOpen')}</small>;
  return (
    <div className="ma-abilities">
      {rows.map((s) => (
        <div key={s} className="ma-ability">
          <Pill tone={SCOPE_TONE[s]}>{t(`ma_scope_${s}`)}</Pill>
          <span>{by[s].map((a) => t(`ma_act_${a}`)).join('، ')}</span>
        </div>
      ))}
    </div>
  );
}

export default function MyAccess() {
  const { t, label } = useI18n();
  const { me, can } = useAuth();
  const isAdmin = can('roles.view', 'all');
  const roles = useLoad(isAdmin ? '/api/v2/roles' : null);
  const [asRole, setAsRole] = useState('');
  const role = (isAdmin && asRole && roles.data?.roles.find((r) => r.role === asRole)) || null;
  const user = role
    ? { role: role.role, isStaff: role.role !== 'customer', grants: role.grants }
    : { role: me.user.role, isStaff: me.user.isStaff, grants: me.grants };
  const roleLabel = role ? label(role.label) : label(me.user.roleLabel);
  const sections = SECTIONS.filter((s) => !(s.customerOnly && user.isStaff) && !(user.isStaff === false && !s.customerOnly && s.key !== 'sec_account'));
  const visibleCount = sections.reduce((n, s) => n + s.items.filter((i) => itemVisible(i, user)).length, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('myAccessNav')}</h1>
          <p className="muted">{role ? t('maViewingAs') : t('maYourRole')}: <strong>{roleLabel}</strong> · {visibleCount} {t('maPages')}</p>
        </div>
        {isAdmin && roles.data && (
          <label className="row">
            <span className="muted">{t('maViewAs')}</span>
            <select value={asRole} onChange={(e) => setAsRole(e.target.value)}>
              <option value="">{t('maMe')}</option>
              {roles.data.roles.map((r) => <option key={r.role} value={r.role}>{label(r.label)} ({r.users})</option>)}
            </select>
          </label>
        )}
      </div>

      <section className="card ma-legend">
        <strong>{t('maLegendTitle')}</strong>
        <div className="row"><Pill tone="ok">{t('ma_scope_all')}</Pill><small>{t('ma_scopeHint_all')}</small></div>
        <div className="row"><Pill tone="info">{t('ma_scope_team')}</Pill><small>{t('ma_scopeHint_team')}</small></div>
        <div className="row"><Pill tone="gold">{t('ma_scope_own')}</Pill><small>{t('ma_scopeHint_own')}</small></div>
      </section>

      {sections.map((sec) => {
        const shown = sec.items.filter((i) => itemVisible(i, user));
        const hidden = sec.items.filter((i) => !itemVisible(i, user) && !(i.customerOnly && user.isStaff) && !(i.staffOnly && !user.isStaff));
        if (!shown.length && !hidden.length) return null;
        return (
          <section key={sec.key} className="card">
            <h2>{t(sec.key)} <small className="muted">({shown.length}/{shown.length + hidden.length})</small></h2>
            <div className="ma-grid">
              {shown.map((i) => (
                <div key={i.to + i.key} className="ma-page">
                  <div className="ma-page__head"><span aria-hidden="true">{i.icon}</span>{role ? <strong>{t(i.key)}</strong> : <Link to={i.to}><strong>{t(i.key)}</strong></Link>}</div>
                  <small className="muted">{t(i.desc)}</small>
                  <Abilities resource={resourceOf(i)} grants={user.grants} />
                </div>
              ))}
            </div>
            {hidden.length > 0 && (
              <details className="ma-hidden">
                <summary>{t('maNotAvailable')} ({hidden.length})</summary>
                <ul className="plain-list">{hidden.map((i) => <li key={i.to + i.key}><span>{t(i.key)}</span><small className="muted">{t(i.desc)}</small></li>)}</ul>
              </details>
            )}
          </section>
        );
      })}

      {user.isStaff && (
        <section className="card">
          <h2>{t('maCustomerData')}</h2>
          <p className="muted"><small>{t('maCustomerDataHint')}</small></p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('maPart')}</th><th>{t('ma_act_view')}</th><th>{t('ma_act_update')}</th></tr></thead>
              <tbody>
                {['customers', ...CUSTOMER_PARTS].map((r) => {
                  const v = user.grants?.[`${r}.view`];
                  const u = user.grants?.[`${r}.update`];
                  return (
                    <tr key={r}>
                      <td>{t(`ma_res_${r}`)}</td>
                      <td>{v ? <Pill tone={SCOPE_TONE[v]}>{t(`ma_scope_${v}`)}</Pill> : <span className="muted">—</span>}</td>
                      <td>{u ? <Pill tone={SCOPE_TONE[u]}>{t(`ma_scope_${u}`)}</Pill> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!user.grants?.['customers.view'] && <p className="muted">{t('maLookupOnly')}</p>}
        </section>
      )}

      {!role && <p className="muted"><small>{t('maAskAdmin')}</small></p>}
      {role && <p className="muted"><small>{t('maChangeRoles')} <Link to="/roles">{t('roles')}</Link></small></p>}
    </>
  );
}
