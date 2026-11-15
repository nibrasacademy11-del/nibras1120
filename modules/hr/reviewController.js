// Monthly performance reviews. The system fills the numbers (attendance, tasks, new customers,
// collections); the reviewer gives 1-5 scores on the criteria and writes notes; the employee reads
// it and acknowledges. Team leaders review their team (never themselves), HR and admins everyone.
const mongoose = require('mongoose');
const Employee = require('../../models/Employee');
const Task = require('../../models/Task');
const Customer = require('../../models/Customer');
const SystemSetting = require('../../models/SystemSetting');
const Review = require('../../models/PerformanceReview');
const { Payment } = require('../../models/finance');
const R = require('../../lib/reviews');
const P = require('../../lib/permissions');
const audit = require('../../lib/audit');
const { HttpError, assertVersion } = require('../../lib/http');
const { notify } = require('../crm/service');
const { _evaluate: evaluateAttendance } = require('./attendanceController');

const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 1500) => String(v ?? '').trim().slice(0, max);
const monthOf = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || '')) ? String(v) : null);
const FIELDS = { owner: 'user', team: 'team' };
const CRITERIA_KEY = 'hr.reviewCriteria';

async function criteria() {
    const doc = await SystemSetting.findOne({ key: CRITERIA_KEY }).lean();
    return R.cleanCriteria(doc && doc.value) || R.DEFAULT_CRITERIA;
}

function monthRange(month) {
    const [y, m] = month.split('-').map(Number);
    return { from: new Date(Date.UTC(y, m - 1, 1) - 3 * 3600e3), to: new Date(Date.UTC(y, m, 1) - 3 * 3600e3) };
}

// The system's numbers for one employee and month
async function metricsFor(userId, month) {
    const user = oid(userId);
    const { from, to } = monthRange(month);
    const [att] = await evaluateAttendance([user], month);
    const [done, overdue, newCustomers, became, collected] = await Promise.all([
        Task.find({ assignee: user, status: 'done', completedAt: { $gte: from, $lt: to } }).select('dueAt completedAt').lean(),
        Task.countDocuments({ assignee: user, status: 'open', dueAt: { $lt: to < new Date() ? to : new Date() } }),
        Customer.countDocuments({ owner: user, registeredAt: { $gte: from, $lt: to }, status: { $ne: 'merged' } }),
        Customer.countDocuments({ owner: user, status: 'customer', updatedAt: { $gte: from, $lt: to } }),
        Payment.aggregate([{ $match: { collectedBy: user, status: 'confirmed', paidAt: { $gte: from, $lt: to } } }, { $group: { _id: '$currency', amount: { $sum: '$amount' } } }])
    ]);
    const s = (att && att.summary) || {};
    return {
        workingDays: s.workingDays || 0,
        present: s.present || 0,
        absent: s.absent || 0,
        lateMinutes: s.lateMinutes || 0,
        attendanceRate: R.attendanceRate(s),
        tasksDone: done.length,
        tasksOnTime: done.filter((t) => !t.dueAt || t.completedAt <= t.dueAt).length,
        tasksOverdue: overdue,
        newCustomers,
        becameCustomers: became,
        collections: collected.map((c) => ({ currency: c._id, amount: Math.round(c.amount * 100) / 100 }))
    };
}

const view = (r) => {
    const o = r.toObject ? r.toObject() : r;
    return { ...o, rating: R.ratingOf(o.average) };
};

async function loadInScope(req, action = 'view') {
    const r = await Review.findById(req.params.id);
    if (!r) throw new HttpError(404, 'Not found.');
    const scope = P.scopeFor(req.user.grants, `reviews.${action}`);
    if (!P.recordInScope(scope, req.user, r, FIELDS)) throw new HttpError(404, 'Not found.');
    return r;
}

// Reviewers see the people they may review this month and where each review stands
exports.board = async (req, res) => {
    const month = monthOf(req.query.month) || new Date().toISOString().slice(0, 7);
    const scope = P.scopeFor(req.user.grants, 'reviews.create');
    const emps = await Employee.find({ status: 'active', ...P.scopeFilter(scope, req.user, FIELDS) }).select('user employeeNo nameAr jobTitle team').populate('team', 'nameAr').sort({ employeeNo: 1 }).lean();
    const people = emps.filter((e) => String(e.user) !== String(req.user.id));
    const reviews = await Review.find({ month, user: { $in: people.map((e) => e.user) } }).select('user status average').lean();
    const byUser = Object.fromEntries(reviews.map((r) => [String(r.user), r]));
    res.json({
        month,
        criteria: await criteria(),
        items: people.map((e) => {
            const r = byUser[String(e.user)];
            return { user: e.user, employeeNo: e.employeeNo, name: e.nameAr, jobTitle: e.jobTitle, team: e.team?.nameAr || '', review: r ? { _id: r._id, status: r.status, average: r.average, rating: R.ratingOf(r.average) } : null };
        })
    });
};

exports.list = async (req, res) => {
    const filter = P.scopeFilter(req.scope, req.user, FIELDS);
    if (monthOf(req.query.month)) filter.month = req.query.month;
    if (oid(req.query.user)) filter.user = oid(req.query.user);
    // employees see their own reviews only once submitted
    const items = await Review.find(filter).sort({ month: -1, name: 1 }).limit(300).lean();
    res.json({ items: items.filter((r) => r.status !== 'draft' || String(r.user) !== String(req.user.id)).map(view) });
};

exports.create = async (req, res) => {
    const month = monthOf(req.body.month);
    const user = oid(req.body.user);
    if (!month || !user) throw new HttpError(400, 'اختر الموظف والشهر. / Choose the employee and the month.');
    if (String(user) === String(req.user.id)) throw new HttpError(403, 'مينفعش تقيّم نفسك. / You cannot review yourself.', 'SELF_APPROVAL');
    const emp = await Employee.findOne({ user, status: 'active' }).select('user employeeNo nameAr team').lean();
    if (!emp) throw new HttpError(400, 'الموظف مش موجود. / Employee not found.');
    if (!P.recordInScope(req.scope, req.user, { user: emp.user, team: emp.team }, FIELDS)) throw new HttpError(403, 'Forbidden.');
    if (await Review.exists({ user, month })) throw new HttpError(409, 'تقييم الشهر ده موجود. / This month already has a review.', 'DUPLICATE');
    const crit = await criteria();
    const r = await Review.create({
        user, team: emp.team || null, name: emp.nameAr, employeeNo: emp.employeeNo, month,
        metrics: await metricsFor(user, month),
        scores: R.applyScores(crit, {}),
        reviewer: req.user.id, reviewerName: req.user.name
    });
    await audit.record(req, { action: 'review.created', resource: 'reviews', resourceId: r._id, summary: `Review ${month} for ${emp.nameAr}` });
    res.status(201).json({ item: view(r) });
};

exports.get = async (req, res) => {
    const r = await loadInScope(req);
    if (r.status === 'draft' && String(r.user) === String(req.user.id)) throw new HttpError(404, 'Not found.');
    res.json({ item: view(r), criteria: await criteria() });
};

exports.update = async (req, res) => {
    const r = await loadInScope(req, 'update');
    if (String(r.user) === String(req.user.id)) throw new HttpError(403, 'مينفعش تقيّم نفسك. / You cannot review yourself.', 'SELF_APPROVAL');
    if (r.status === 'acknowledged') throw new HttpError(400, 'الموظف اطّلع على التقييم وقفل. / The employee already acknowledged it.', 'LOCKED');
    assertVersion(r, req.body.__v);
    const before = { average: r.average };
    if (req.body.scores && typeof req.body.scores === 'object') {
        const crit = await criteria();
        r.scores = R.applyScores(crit, req.body.scores);
        r.average = R.averageOf(r.scores);
    }
    for (const k of ['strengths', 'improve', 'notes']) if (req.body[k] !== undefined) r[k] = str(req.body[k]);
    if (req.body.refreshMetrics && r.status === 'draft') r.metrics = await metricsFor(r.user, r.month);
    r.reviewer = req.user.id;
    r.reviewerName = req.user.name;
    await r.save();
    await audit.record(req, { action: 'review.updated', resource: 'reviews', resourceId: r._id, summary: `Review ${r.month} for ${r.name}`, changes: audit.diff(before, { average: r.average }) });
    res.json({ item: view(r) });
};

// Shows the review to the employee and tells them
exports.submit = async (req, res) => {
    const r = await loadInScope(req, 'update');
    if (String(r.user) === String(req.user.id)) throw new HttpError(403, 'Forbidden.');
    if (r.status !== 'draft') throw new HttpError(400, 'التقييم اتبعت قبل كده. / Already submitted.');
    assertVersion(r, req.body.__v);
    if (r.scores.some((s) => !s.score)) throw new HttpError(400, 'ادّي درجة لكل بند الأول. / Score every criterion first.', 'INCOMPLETE');
    r.status = 'submitted';
    r.submittedAt = new Date();
    await r.save();
    await notify(r.user, { type: 'review.submitted', titleAr: `تقييم أدائك لشهر ${r.month} جاهز`, titleEn: `Your ${r.month} performance review is ready`, link: '/my-performance', dedupeKey: `review:${r._id}` });
    await audit.record(req, { action: 'review.submitted', resource: 'reviews', resourceId: r._id, summary: `Review ${r.month} for ${r.name}: ${r.average}` });
    res.json({ item: view(r) });
};

// The employee reads their review and may add a comment
exports.acknowledge = async (req, res) => {
    const r = await Review.findById(req.params.id);
    if (!r || String(r.user) !== String(req.user.id) || r.status === 'draft') throw new HttpError(404, 'Not found.');
    if (r.status === 'acknowledged') return res.json({ item: view(r) });
    r.status = 'acknowledged';
    r.acknowledgedAt = new Date();
    r.employeeComment = str(req.body.comment);
    await r.save();
    await audit.record(req, { action: 'review.acknowledged', resource: 'reviews', resourceId: r._id, summary: `Review ${r.month} acknowledged` });
    res.json({ item: view(r) });
};

exports.mine = async (req, res) => {
    const items = await Review.find({ user: oid(req.user.id), status: { $ne: 'draft' } }).sort({ month: -1 }).limit(36).lean();
    res.json({ items: items.map(view) });
};

exports.getCriteria = async (req, res) => res.json({ items: await criteria() });

exports.setCriteria = async (req, res) => {
    const items = R.cleanCriteria(req.body.items);
    if (!items) throw new HttpError(400, 'اكتب من 1 لـ 12 بند. / Enter 1 to 12 criteria.');
    const before = await criteria();
    await SystemSetting.updateOne({ key: CRITERIA_KEY }, { $set: { value: items, updatedBy: req.user.id } }, { upsert: true });
    await audit.record(req, { action: 'review.criteria_changed', resource: 'reviews', summary: 'Review criteria changed', changes: { criteria: { from: before.map((c) => c.ar).join('، '), to: items.map((c) => c.ar).join('، ') } } });
    res.json({ items });
};
