const mongoose = require('mongoose');
const Customer = require('../../models/Customer');
const CustomerNote = require('../../models/CustomerNote');
const Communication = require('../../models/Communication');
const Task = require('../../models/Task');
const User = require('../../models/User');
const audit = require('../../lib/audit');
const P = require('../../lib/permissions');
const { teamOf } = require('../../lib/teams');
const { HttpError, assertVersion, paging, parseDate } = require('../../lib/http');
const { addEvent, notify } = require('./service');
const { _loadCustomer: loadCustomer } = require('./customerController');

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---- internal notes ----

exports.listNotes = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    if (!access.sections.notes) throw new HttpError(403, 'Forbidden.');
    const items = await CustomerNote.find({ customer: customer._id, archived: false }).populate('author', 'name').sort({ pinned: -1, createdAt: -1 }).lean();
    res.json({ items });
};

exports.addNote = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    if (!access.canAddNote) throw new HttpError(403, 'Forbidden.');
    const body = str(req.body.body, 5000);
    if (!body) throw new HttpError(400, 'اكتب الملاحظة. / Write the note.');
    const note = await CustomerNote.create({ customer: customer._id, body, author: req.user.id, pinned: req.body.pinned === true });
    await addEvent(req, customer._id, 'note', body.slice(0, 140), { section: 'notes' });
    res.status(201).json({ item: await note.populate('author', 'name') });
};

// Authors edit their own notes; the earlier text is kept in the note's edit history
exports.updateNote = async (req, res) => {
    const note = await CustomerNote.findById(req.params.noteId);
    if (!note) throw new HttpError(404, 'Not found.');
    const { access } = await loadCustomer(req, note.customer, { minLevel: 'file' });
    if (!access.sections.notes) throw new HttpError(404, 'Not found.');
    const isAuthor = String(note.author) === req.user.id;
    if (!isAuthor && P.scopeFor(req.user.grants, 'customer_notes.manage') !== 'all') throw new HttpError(403, 'Forbidden.');
    assertVersion(note, req.body.__v);
    if (req.body.body !== undefined) {
        const body = str(req.body.body, 5000);
        if (!body) throw new HttpError(400, 'اكتب الملاحظة. / Write the note.');
        if (body !== note.body) {
            note.edits.push({ at: new Date(), by: req.user.id, previous: note.body });
            note.body = body;
        }
    }
    if (req.body.pinned !== undefined) note.pinned = req.body.pinned === true;
    if (req.body.archived === true) {
        note.archived = true;
        await audit.record(req, { action: 'note.archived', resource: 'customer_notes', resourceId: note._id, summary: 'Note archived', meta: { customer: String(note.customer) } });
    }
    await note.save();
    res.json({ item: await note.populate('author', 'name') });
};

// ---- communication history ----

exports.listCommunications = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    if (!access.sections.contact) throw new HttpError(403, 'Forbidden.');
    const items = await Communication.find({ customer: customer._id }).populate('by', 'name').sort({ at: -1 }).limit(300).lean();
    res.json({ items });
};

// Logs a call or message, and can schedule the next follow-up in the same step
exports.addCommunication = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    if (!access.inFile || !access.canEdit) throw new HttpError(403, 'Forbidden.');
    const channel = Communication.CHANNELS.includes(req.body.channel) ? req.body.channel : null;
    if (!channel) throw new HttpError(400, 'اختر وسيلة التواصل. / Choose the channel.');
    const at = parseDate(req.body.at) || new Date();
    const item = await Communication.create({
        customer: customer._id,
        channel,
        direction: req.body.direction === 'inbound' ? 'inbound' : 'outbound',
        outcome: Communication.OUTCOMES.includes(req.body.outcome) ? req.body.outcome : '',
        summary: str(req.body.summary, 3000),
        at,
        durationMinutes: Math.min(Math.max(Number(req.body.durationMinutes) || 0, 0), 600),
        by: req.user.id
    });
    await Customer.updateOne({ _id: customer._id, $or: [{ lastContactAt: null }, { lastContactAt: { $lt: at } }] }, { $set: { lastContactAt: at } });
    await addEvent(req, customer._id, 'communication', `${channel}${item.outcome ? ` · ${item.outcome}` : ''}: ${item.summary.slice(0, 120)}`, { section: 'contact' });

    let followUp = null;
    const followUpAt = parseDate(req.body.followUpAt);
    if (followUpAt) {
        const assignee = customer.owner ? customer.owner._id : oid(req.user.id);
        followUp = await Task.create({
            title: str(req.body.followUpTitle, 200) || `متابعة ${customer.nameAr}`,
            kind: 'follow_up',
            customer: customer._id,
            assignee,
            team: await teamOf(assignee),
            createdBy: req.user.id,
            dueAt: followUpAt
        });
        await refreshNextFollowUp(customer._id);
        await addEvent(req, customer._id, 'task', `Follow-up scheduled for ${followUpAt.toISOString().slice(0, 16).replace('T', ' ')}`);
    }
    res.status(201).json({ item: await item.populate('by', 'name'), followUp });
};

// ---- tasks and follow-ups ----

async function refreshNextFollowUp(customerId) {
    if (!customerId) return;
    const next = await Task.findOne({ customer: customerId, status: 'open', kind: 'follow_up', dueAt: { $ne: null } }).sort({ dueAt: 1 }).select('dueAt').lean();
    await Customer.updateOne({ _id: customerId }, { $set: { nextFollowUpAt: next ? next.dueAt : null } });
}

const TASK_FIELDS = { owner: 'assignee', team: 'team' };
const POP = [{ path: 'assignee', select: 'name' }, { path: 'createdBy', select: 'name' }, { path: 'customer', select: 'customerNo nameAr' }];

exports.listTasks = async (req, res) => {
    const { limit, page, skip } = paging(req.query, { defaultLimit: 100, maxLimit: 300 });
    const and = [P.scopeFilter(req.scope, req.user, TASK_FIELDS)];
    const q = req.query;
    if (q.mine === '1') and.push({ assignee: req.user.id });
    if (oid(q.assignee)) and.push({ assignee: oid(q.assignee) });
    if (oid(q.customer)) and.push({ customer: oid(q.customer) });
    if (q.kind) and.push({ kind: String(q.kind) });
    and.push({ status: q.status ? String(q.status) : 'open' });
    const now = new Date();
    if (q.due === 'overdue') and.push({ dueAt: { $lt: now } });
    if (q.due === 'today') {
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        and.push({ dueAt: { $lte: end } });
    }
    const filter = { $and: and };
    const [items, total] = await Promise.all([
        Task.find(filter).populate(POP).sort({ dueAt: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
        Task.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit });
};

async function assertTaskAssignee(req, assignee) {
    if (String(assignee) === req.user.id) return;
    const scope = P.scopeFor(req.user.grants, 'tasks.create');
    if (scope === 'all') return;
    if (scope === 'team') {
        const team = await teamOf(assignee);
        if (team && req.user.teamIds.includes(String(team))) return;
    }
    throw new HttpError(403, 'لا يمكنك إسناد مهام لهذا الموظف. / You cannot assign tasks to this employee.');
}

exports.createTask = async (req, res) => {
    const title = str(req.body.title, 200);
    if (!title) throw new HttpError(400, 'عنوان المهمة مطلوب. / A title is required.');
    const assignee = oid(req.body.assignee) || oid(req.user.id);
    await assertTaskAssignee(req, assignee);
    const u = await User.findById(assignee).select('status role name');
    if (!u || u.status === 'disabled' || !P.isStaffRole(u.role)) throw new HttpError(400, 'الموظف غير نشط. / The employee is not active.');
    let customerId = null;
    if (req.body.customer) {
        const { customer, access } = await loadCustomer(req, req.body.customer, { minLevel: 'file' });
        if (!access.inFile) throw new HttpError(403, 'Forbidden.');
        customerId = customer._id;
    }
    const task = await Task.create({
        title,
        description: str(req.body.description, 3000),
        kind: req.body.kind === 'follow_up' && customerId ? 'follow_up' : 'task',
        customer: customerId,
        assignee,
        team: await teamOf(assignee),
        createdBy: req.user.id,
        dueAt: parseDate(req.body.dueAt),
        priority: ['low', 'normal', 'high'].includes(req.body.priority) ? req.body.priority : 'normal'
    });
    if (customerId) {
        await refreshNextFollowUp(customerId);
        await addEvent(req, customerId, 'task', `${task.kind === 'follow_up' ? 'Follow-up' : 'Task'}: ${title}`);
    }
    if (String(assignee) !== req.user.id) {
        await notify(assignee, { type: 'task_assigned', titleAr: `مهمة جديدة: ${title}`, titleEn: `New task: ${title}`, bodyAr: `من ${req.user.name}`, bodyEn: `From ${req.user.name}`, link: '/tasks' });
    }
    res.status(201).json({ item: await Task.findById(task._id).populate(POP) });
};

exports.updateTask = async (req, res) => {
    const task = await Task.findById(req.params.taskId);
    if (!task || !P.recordInScope(req.scope, req.user, task, TASK_FIELDS)) throw new HttpError(404, 'Not found.');
    assertVersion(task, req.body.__v);
    const before = { title: task.title, assignee: String(task.assignee), dueAt: task.dueAt, status: task.status, priority: task.priority };
    if (req.body.title !== undefined) task.title = str(req.body.title, 200) || task.title;
    if (req.body.description !== undefined) task.description = str(req.body.description, 3000);
    if (req.body.dueAt !== undefined) {
        task.dueAt = parseDate(req.body.dueAt);
        task.remindedAt = null;
    }
    if (['low', 'normal', 'high'].includes(req.body.priority)) task.priority = req.body.priority;
    if (req.body.assignee !== undefined && String(req.body.assignee) !== String(task.assignee)) {
        const to = oid(req.body.assignee);
        await assertTaskAssignee(req, to);
        task.assignee = to;
        task.team = await teamOf(to);
        await notify(to, { type: 'task_assigned', titleAr: `مهمة مسندة إليك: ${task.title}`, titleEn: `Task assigned to you: ${task.title}`, link: '/tasks' });
    }
    if (['open', 'done', 'cancelled'].includes(req.body.status) && req.body.status !== task.status) {
        task.status = req.body.status;
        task.completedAt = req.body.status === 'done' ? new Date() : null;
        task.completedBy = req.body.status === 'done' ? req.user.id : null;
        if (req.body.result !== undefined) task.result = str(req.body.result, 2000);
        if (task.customer) await addEvent(req, task.customer, 'task', `${task.title}: ${task.status}${task.result ? ` — ${task.result.slice(0, 120)}` : ''}`);
    }
    await task.save();
    if (task.customer) await refreshNextFollowUp(task.customer);
    const after = { title: task.title, assignee: String(task.assignee), dueAt: task.dueAt, status: task.status, priority: task.priority };
    const changes = audit.diff(before, after);
    if (changes.assignee || changes.status) {
        await audit.record(req, { action: 'task.updated', resource: 'tasks', resourceId: task._id, summary: task.title, changes });
    }
    res.json({ item: await Task.findById(task._id).populate(POP) });
};

exports._refreshNextFollowUp = refreshNextFollowUp;
