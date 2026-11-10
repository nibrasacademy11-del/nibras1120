import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, pickMessage } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Pill } from '../components/ui.jsx';
import { ProgramSummary } from './CustomerDetail.jsx';

// Search any customer by number, national ID or passport. People who are not responsible
// for the customer see the basic card and can ask for more.
export default function Lookup() {
  const { t, en, lang } = useI18n();
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setResult((await api(`/api/v2/customers/lookup?q=${encodeURIComponent(q.trim())}`)).items);
    } catch (err) {
      setError(pickMessage(err.message, lang));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">{t('lookup')}</h1>
      <form className="card lookup-form" onSubmit={search}>
        <p className="muted">{t('lookupHint')}</p>
        <div className="row">
          <input dir="ltr" autoComplete="off" required minLength={4} value={q} onChange={(e) => setQ(e.target.value)} placeholder="NB-000123" className="grow" />
          <button className="btn btn--primary" disabled={busy}>{t('search')}</button>
        </div>
        {error && <div className="alert alert--error">{error}</div>}
      </form>
      {result && (
        <section className="card">
          {!result.length ? <p className="muted">{t('noResults')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('customerNo')}</th><th>{t('name')}</th><th>{t('owner')}</th><th>{t('programs')}</th><th>{t('status')}</th><th /></tr></thead>
                <tbody>
                  {result.map((c) => (
                    <tr key={c.id}>
                      <td dir="ltr">{c.customerNo}</td>
                      <td>{c.name}</td>
                      <td>{c.owner ? c.owner.name : t('unassigned')}</td>
                      <td><ProgramSummary programs={c.programs} /></td>
                      <td><Pill value={c.status}>{en('status', c.status)}</Pill></td>
                      <td><Link to={`/customers/${c.id}`}>{c.access === 'full' ? t('open_file') : c.canRequestAccess ? t('requestAccess') : t('open_file')}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
