import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { Field, Loading, useLoad, useStaff } from '../components/ui.jsx';
import { PrintButton, PrintHeader } from '../components/Print.jsx';
import { Money } from './Finance.jsx';

const GROUPS = ['crm', 'learning', 'finance', 'hr', 'admin'];

export default function Reports() {
  const { t, label } = useI18n();
  const state = useLoad('/api/v2/reports');
  return (
    <>
      <h1 className="page-title">{t('reportsNav')}</h1>
      <Loading state={state}>
        {(d) => GROUPS.map((g) => {
          const list = d.items.filter((r) => r.group === g);
          if (!list.length) return null;
          return (
            <section className="card" key={g}>
              <h2>{t(`rg_${g}`)}</h2>
              <ul className="report-list">
                {list.map((r) => <li key={r.id}><Link to={`/reports/${r.id}`}>{label({ ar: r.titleAr, en: r.titleEn })}</Link></li>)}
              </ul>
            </section>
          );
        })}
      </Loading>
    </>
  );
}

function FilterInput({ def, value, onChange }) {
  const { t, en, lang } = useI18n();
  const staff = useStaff();
  const programs = useLoad(def.type === 'program' ? '/api/v2/programs?limit=500' : null);
  const teams = useLoad(def.type === 'team' ? '/api/v2/teams' : null);
  const name = t(`f_${def.key}`);
  const set = (e) => onChange(e.target.value);
  if (def.type === 'date') return <Field label={name}><input type="date" value={value || ''} onChange={set} /></Field>;
  if (def.type === 'month') return <Field label={name}><input type="month" value={value || ''} onChange={set} /></Field>;
  if (def.type === 'staff') return <Field label={name}><select value={value || ''} onChange={set}><option value="">{t('all')}</option>{staff.map((s) => <option key={s.id} value={s.id}>{lang === 'en' && s.nameEn ? s.nameEn : s.name}</option>)}</select></Field>;
  if (def.type === 'program') return <Field label={name}><select value={value || ''} onChange={set}><option value="">{t('all')}</option>{(programs.data?.items || []).map((p) => <option key={p._id} value={p._id}>{p.titleAr}</option>)}</select></Field>;
  if (def.type === 'team') return <Field label={name}><select value={value || ''} onChange={set}><option value="">{t('all')}</option>{(teams.data?.items || []).map((x) => <option key={x._id} value={x._id}>{x.nameAr}</option>)}</select></Field>;
  if (def.type === 'currency') return <Field label={name}><input dir="ltr" maxLength={3} value={value || ''} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder="SAR" /></Field>;
  if (def.type === 'select') {
    const group = { status: null, source: 'source', method: 'payMethod' }[def.key];
    return (
      <Field label={name}>
        <select value={value || ''} onChange={set}>
          <option value="">{t('all')}</option>
          {def.options.map((o) => <option key={o} value={o}>{group ? en(group, o) : t(`v_${o}`) !== `v_${o}` ? t(`v_${o}`) : o}</option>)}
        </select>
      </Field>
    );
  }
  return <Field label={name}><input value={value || ''} onChange={set} /></Field>;
}

function formatCell(v, type, lang) {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'date') return new Date(v).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB');
  if (type === 'money') return <Money amount={v} currency="" />;
  if (type === 'number') return Number(v).toLocaleString('en-US', { maximumFractionDigits: 6 });
  return String(v);
}

export function ReportView() {
  const { id } = useParams();
  const { t, label, lang, en } = useI18n();
  const list = useLoad('/api/v2/reports');
  const def = list.data?.items.find((r) => r.id === id);
  const [draft, setDraft] = useState({});
  const [applied, setApplied] = useState({});
  const q = new URLSearchParams(Object.entries(applied).filter(([, v]) => v));
  const state = useLoad(def ? `/api/v2/reports/${id}?${q}` : null, [id, def]);
  if (list.data && !def) return <div className="card empty">{t('forbidden')}</div>;
  const title = def ? label({ ar: def.titleAr, en: def.titleEn }) : '';
  const filterText = Object.entries(applied).filter(([, v]) => v).map(([k, v]) => `${t(`f_${k}`)}: ${v}`).join(' · ');

  return (
    <div className={def?.orientation === 'landscape' ? 'report-landscape' : ''}>
      <div className="page-head no-print">
        <div>
          <Link to="/reports" className="muted">← {t('reportsNav')}</Link>
          <h1 className="page-title">{title}</h1>
        </div>
        {state.data && (
          <div className="row">
            <PrintButton what={`report:${id}`} title={title} filters={applied} landscape={def.orientation === 'landscape'} className="btn btn--primary" />
            {def.canExport && <a className="btn btn--ghost" href={`/api/v2/reports/${id}/xlsx?${q}&lang=${lang}`}>{t('exportExcel')}</a>}
          </div>
        )}
      </div>
      {def && def.filters.length > 0 && (
        <form className="card filters no-print" onSubmit={(e) => { e.preventDefault(); setApplied(draft); }}>
          {def.filters.map((f) => <FilterInput key={f.key} def={f} value={draft[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v })} />)}
          <button className="btn btn--primary">{t('apply')}</button>
        </form>
      )}
      <PrintHeader title={title} subtitle={filterText} />
      <Loading state={state}>
        {(d) => (
          <section className="card report-card">
            {d.totals && (
              <div className="report-totals">
                {Object.entries(d.totals).filter(([k]) => !['byCurrency', 'baseCurrency'].includes(k)).map(([k, v]) => <span key={k}>{t(`tot_${k}`)}: <strong>{typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v}</strong>{['base', 'collected', 'refunds', 'expenses', 'commissions', 'net'].includes(k) && d.totals.baseCurrency ? ` ${d.totals.baseCurrency}` : ''}</span>)}
                {d.totals.byCurrency && Object.entries(d.totals.byCurrency).map(([c, v]) => <span key={c}><Money amount={v} currency={c} strong /></span>)}
              </div>
            )}
            {!d.rows.length ? <p className="muted">{t('noData')}</p> : (
              <div className="table-wrap">
                <table className="table report-table">
                  <thead><tr>{d.columns.map((c) => <th key={c.key} className={['money', 'number'].includes(c.type) ? 'num' : ''}>{lang === 'en' ? c.en : c.ar}</th>)}</tr></thead>
                  <tbody>
                    {d.rows.map((r, i) => (
                      <tr key={i}>{d.columns.map((c) => {
                        let v = r[c.key];
                        if (c.key === 'status' && typeof v === 'string') v = en('status', v) !== v ? en('status', v) : t(`v_${v}`) !== `v_${v}` ? t(`v_${v}`) : v;
                        if (c.key === 'source') v = en('source', v);
                        if (c.key === 'method') v = en('payMethod', v);
                        return <td key={c.key} className={['money', 'number'].includes(c.type) ? 'num' : ''}>{formatCell(v, c.type, lang)}</td>;
                      })}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted report-foot">{d.rows.length} {t('rowsLabel')}</p>
          </section>
        )}
      </Loading>
    </div>
  );
}
