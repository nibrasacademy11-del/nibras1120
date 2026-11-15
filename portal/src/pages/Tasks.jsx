import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Loading, Modal, Pager, Pill, StaffSelect, fromLocalInput, toLocalInput, useAction, useLoad } from '../components/ui.jsx';

export function TaskForm({ customer, task, onClose, onSaved }) {
  const { t } = useI18n();
  const { me, can } = useAuth();
  const [f, setF] = useState({
    title: task?.title || '', description: task?.description || '', dueAt: toLocalInput(task?.dueAt), priority: task?.priority || 'normal',
    assignee: task?.assignee?._id || customer?.owner?.id || me.user.id, kind: task?.kind || (customer ? 'follow_up' : 'task')
  });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const canAssign = can('tasks.create', 'team');
  const submit = (e) => {
    e.preventDefault();
    const body = { ...f, dueAt: fromLocalInput(f.dueAt) };
    const req = task
      ? api(`/api/v2/tasks/${task._id}`, { method: 'PUT', body: { ...body, __v: task.__v } })
      : api('/api/v2/tasks', { method: 'POST', body: { ...body, customer: customer?.id } });
    run(() => req).then(onSaved).catch(() => {});
  };
  return (
    <Modal title={task ? t('edit') : t('newTask')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label={t('title')}><input required value={f.title} onChange={set('title')} /></Field>
        <Field label={t('description')}><textarea rows={3} value={f.description} onChange={set('description')} /></Field>
        {customer && !task && (
          <Field label={t('kind')}>
            <select value={f.kind} onChange={set('kind')}><option value="follow_up">{t('followUp')}</option><option value="task">{t('task')}</option></select>
          </Field>
        )}
        <Field label={t('dueAt')}><input type="datetime-local" value={f.dueAt} onChange={set('dueAt')} /></Field>
        <Field label={t('priority')}>
          <select value={f.priority} onChange={set('priority')}>{['low', 'normal', 'high'].map((p) => <option key={p} value={p}>{t(p)}</option>)}</select>
        </Field>
        {canAssign && <Field label={t('assignee')}><StaffSelect value={f.assignee} onChange={set('assignee')} /></Field>}
        <ErrorBox error={error} />
        <div className="row"><button className="btn btn--primary" disabled={busy}>{t('save')}</button><button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button></div>
      </form>
    </Modal>
  );
}

export function TaskTable({ items, onChanged, hideCustomer }) {
  const { t, fmtDate } = useI18n();
  const [editing, setEditing] = useState(null);
  const now = Date.now();
  const complete = (task, status) => api(`/api/v2/tasks/${task._id}`, { method: 'PUT', body: { __v: task.__v, status } }).then(onChanged);
  if (!items.length) return <p className="muted">{t('noData')}</p>;
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('title')}</th>{!hideCustomer && <th>{t('customer')}</th>}<th>{t('dueAt')}</th><th>{t('assignee')}</th><th>{t('priority')}</th><th>{t('status')}</th><th /></tr></thead>
          <tbody>
            {items.map((x) => {
              const late = x.status === 'open' && x.dueAt && new Date(x.dueAt).getTime() < now;
              return (
                <tr key={x._id}>
                  <td><strong>{x.title}</strong> {x.kind === 'follow_up' && <Pill tone="info">{t('followUp')}</Pill>}{x.description && <div className="muted">{x.description}</div>}</td>
                  {!hideCustomer && <td>{x.customer ? <Link to={`/customers/${x.customer._id}`}>{x.customer.customerNo} {x.customer.nameAr}</Link> : '—'}</td>}
                  <td className={`nowrap${late ? ' late' : ''}`}>{x.dueAt ? fmtDate(x.dueAt) : '—'}{late && <div><Pill tone="warn">{t('overdue')}</Pill></div>}</td>
                  <td>{x.assignee ? x.assignee.name : '—'}</td>
                  <td>{t(x.priority)}</td>
                  <td><Pill value={x.status}>{t(`task_${x.status}`)}</Pill></td>
                  <td className="nowrap">
                    {x.status === 'open' && (
                      <button type="button" className="btn btn--small btn--accent" onClick={() => complete(x, 'done')} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>{t('markDone')}</span>
                      </button>
                    )}{' '}
                    {x.status === 'open' && <button type="button" className="btn btn--small" onClick={() => setEditing(x)}>{t('edit')}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <TaskForm task={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </>
  );
}

export default function Tasks() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [filter, setFilter] = useState({ mine: '1', status: 'open', due: '' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const q = new URLSearchParams({ page: String(page), limit: '50', status: filter.status });
  if (filter.mine) q.set('mine', '1');
  if (filter.due) q.set('due', filter.due);
  const state = useLoad(`/api/v2/tasks?${q}`);
  const set = (k) => (e) => { setPage(1); setFilter({ ...filter, [k]: e.target.value }); };
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('tasks')}</h1>
        {can('tasks.create') && <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>+ {t('newTask')}</button>}
      </div>
      <div className="card filters">
        <Field label={t('assignee')}><select value={filter.mine} onChange={set('mine')}><option value="1">{t('mine')}</option>{can('tasks.view', 'team') && <option value="">{t('all')}</option>}</select></Field>
        <Field label={t('status')}><select value={filter.status} onChange={set('status')}>{['open', 'done', 'cancelled'].map((s) => <option key={s} value={s}>{t(`task_${s}`)}</option>)}</select></Field>
        <Field label={t('dueAt')}><select value={filter.due} onChange={set('due')}><option value="">{t('all')}</option><option value="overdue">{t('overdue')}</option><option value="today">{t('today')}</option></select></Field>
      </div>
      <section className="card">
        <Loading state={state}>{(d) => (<><TaskTable items={d.items} onChanged={state.reload} /><Pager page={page} total={d.total} limit={d.limit} onPage={setPage} /></>)}</Loading>
      </section>
      {adding && <TaskForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); state.reload(); }} />}
    </>
  );
}
