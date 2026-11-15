const mongoose = require('mongoose');
const Customer = require('../../models/Customer');
const Enrollment = require('../../models/Enrollment');
const CohortMember = require('../../models/CohortMember');
const Certificate = require('../../models/Certificate');
const Communication = require('../../models/Communication');
const Task = require('../../models/Task');
const Complaint = require('../../models/Complaint');
const User = require('../../models/User');
const P = require('../../lib/permissions');
const M = require('../../lib/money');
const R = require('../../lib/receivables');
const A = require('../../lib/academy');
const workflow = require('../../lib/moduleWorkflow');
const audit = require('../../lib/audit');
const { customerAccess } = require('../../lib/customerAccess');
const { HttpError, parseDate } = require('../../lib/http');
const { addEvent, getSetting } = require('./service');

// The CRM at a glance: the customer file's summary, ready-made lists of customers who need
// something, bulk follow-ups, WhatsApp messages from templates, and the leads board.

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const { DEFAULT_TEMPLATES, cleanTemplates, fillTemplate } = require('../../lib/whatsappTemplates');

const siteUrl = () => (process.env.SITE_URL || 'https://www.nibras-ac.com').replace(/\/$/, '');

// ---- ready lists ----

const LISTS = ['overdue', 'low_attendance', 'cert_unpaid', 'paper_pending', 'stale'];

async function listIds(name) {
    if (name === 'overdue') {
        const rows = await require('../finance/hubController')._unpaidRows({});
        return [...new Set(rows.filter((r) => r.late).map((r) => String(r.customerId)))];
    }
    if (name === 'low_attendance') {
        const groups = require('../learning/groups');
        const cohorts = await CohortMember.distinct('cohort', { status: 'active' });
        const ids = new Set();
        for (const c of cohorts.slice(0, 200)) {
            const stats = await groups.attendanceStats(c);
            if (!stats.held) continue;
            const members = await CohortMember.find({ cohort: c, status: 'active' }).select('customer').lean();
            for (const m of members) {
                const s = stats.byCustomer[String(m.customer)];
                if (((s ? s.n : 0) / stats.held) * 100 < 50) ids.add(String(m.customer));
            }
        }
        return [...ids];
    }
    if (name === 'cert_unpaid') {
        const certs = require('../learning/certificateController');
        const ens = await Enrollment.find({ status: { $in: ['active', 'on_hold', 'completed'] }, $or: [{ modules: { $elemMatch: { status: 'approved', certificate: true } } }, { eligibleForFinalCertificate: true }] }).select('customer').limit(3000).lean();
        const ids = new Set();
        for (const e of ens) if (!(await certs._paymentCheck(e)).clear) ids.add(String(e.customer));
        return [...ids];
    }
    if (name === 'paper_pending') {
        return (await Certificate.distinct('customer', { kind: { $in: ['module', 'program'] }, status: 'Valid', 'delivery.paper.status': { $ne: 'delivered' }, customer: { $ne: null } })).map(String);
    }
    if (name === 'stale') {
        return (await Customer.distinct('_id', { archived: false, status: { $in: ['lead', 'interested'] }, $or: [{ lastContactAt: null }, { lastContactAt: { $lt: new Date(Date.now() - 7 * 864e5) } }] })).map(String);
    }
    throw new HttpError(400, 'Unknown list.');
}
exports.LISTS = LISTS;
exports.listIds = listIds;

// ---- the file's summary ----

exports.summary = async (req, res) => {
    const customer = await Customer.findById(req.params.id).select('customerNo nameAr owner team status lastContactAt nextFollowUpAt registeredAt source user').populate('owner', 'name');
    if (!customer) throw new HttpError(404, 'Not found.');
    const access = customerAccess({ actor: req.user, grants: req.user.grants, customer: { ...customer.toObject(), owner: customer.owner?._id } });
    if (!access.inFile) throw new HttpError(404, 'Not found.');
    const groups = require('../learning/groups');
    const [enrollments, memberships, certs, tasks, complaints] = await Promise.all([
        Enrollment.find({ customer: customer._id, status: { $ne: 'cancelled' } }).select('enrollmentNo programTitleAr programTitleEn status modules modulesRequired').sort({ enrolledAt: -1 }).lean(),
        CohortMember.find({ customer: customer._id, status: 'active' }).populate('cohort', 'nameAr nameEn').lean(),
        Certificate.find({ customer: customer._id, kind: { $in: ['module', 'program'] }, status: { $in: ['Valid', 'Suspended'] } }).select('delivery.paper.status delivery.emailedAt delivery.viewedAt').lean(),
        Task.countDocuments({ customer: customer._id, status: 'open' }),
        Complaint.countDocuments({ customer: customer._id, status: { $in: ['open', 'in_progress'] } })
    ]);
    const attendance = [];
    for (const m of memberships) {
        if (!m.cohort) continue;
        const stats = await groups.attendanceStats(m.cohort._id);
        const s = stats.byCustomer[String(customer._id)];
        attendance.push({ group: m.cohort.nameAr, groupEn: m.cohort.nameEn, held: stats.held, attended: s ? s.n : 0, rate: stats.held ? Math.round(((s ? s.n : 0) / stats.held) * 100) : null });
    }
    let money = null;
    if (access.sections.financial) {
        const rows = await require('../finance/hubController')._unpaidRows({ customer: customer._id });
        const owed = {};
        const overdue = {};
        let maxLate = 0;
        for (const r of rows) {
            owed[r.currency] = M.round((owed[r.currency] || 0) + r.remaining, 3);
            if (r.late) { overdue[r.currency] = M.round((overdue[r.currency] || 0) + r.remaining, 3); maxLate = Math.max(maxLate, r.daysLate); }
        }
        const F = require('../../models/finance');
        const paid = await F.Payment.aggregate([{ $match: { customer: customer._id, status: 'confirmed' } }, { $group: { _id: '$currency', amount: { $sum: { $subtract: ['$amount', { $ifNull: ['$refundedAmount', 0] }] } } } }]);
        const list = (o) => Object.entries(o).map(([currency, amount]) => ({ currency, amount }));
        money = { paid: paid.map((p) => ({ currency: p._id, amount: M.round(p.amount, 3) })), owed: list(owed), overdue: list(overdue), maxDaysLate: maxLate };
    }
    const paperCount = (s) => certs.filter((c) => (c.delivery?.paper?.status || 'none') === s).length;
    res.json({
        owner: customer.owner ? customer.owner.name : null,
        status: customer.status,
        lastContactAt: customer.lastContactAt,
        nextFollowUpAt: customer.nextFollowUpAt,
        programs: enrollments.map((e) => ({ _id: e._id, enrollmentNo: e.enrollmentNo, titleAr: e.programTitleAr, titleEn: e.programTitleEn, status: e.status, progress: workflow.completion(e.modules, e.modulesRequired) })),
        attendance,
        money,
        certificates: { issued: certs.length, emailed: certs.filter((c) => c.delivery?.emailedAt).length, viewed: certs.filter((c) => c.delivery?.viewedAt).length, delivered: paperCount('delivered'), paperPending: certs.length - paperCount('delivered') },
        tasks, complaints
    });
};

// ---- bulk follow-ups ----

exports.bulkTasks = async (req, res) => {
    const title = str(req.body.title, 200);
    if (!title) throw new HttpError(400, 'عنوان المهمة مطلوب. / A title is required.');
    const ids = [...new Set((Array.isArray(req.body.customers) ? req.body.customers : []).map(String))].map(oid).filter(Boolean).slice(0, 500);
    if (!ids.length) throw new HttpError(400, 'اختر العملاء. / Choose the customers.');
    const fixed = oid(req.body.assignee);
    if (fixed) {
        const u = await User.findById(fixed).select('status role');
        if (!u || u.status === 'disabled' || !P.isStaffRole(u.role)) throw new HttpError(400, 'الموظف غير نشط. / The employee is not active.');
    }
    const dueAt = parseDate(req.body.dueAt);
    const customers = await Customer.find({ _id: { $in: ids } }).select('owner team customerNo');
    const { teamOf } = require('../../lib/teams');
    let created = 0;
    let skipped = 0;
    for (const c of customers) {
        const access = customerAccess({ actor: req.user, grants: req.user.grants, customer: c });
        const assignee = fixed || c.owner || oid(req.user.id);
        if (!access.inFile) { skipped++; continue; }
        await Task.create({ title, description: str(req.body.description, 2000), kind: 'follow_up', customer: c._id, assignee, team: await teamOf(assignee), createdBy: req.user.id, dueAt, priority: ['low', 'normal', 'high'].includes(req.body.priority) ? req.body.priority : 'normal' });
        await Customer.updateOne({ _id: c._id, $or: [{ nextFollowUpAt: null }, { nextFollowUpAt: { $gt: dueAt || new Date(8.64e15) } }] }, { $set: { nextFollowUpAt: dueAt } });
        created++;
    }
    await audit.record(req, { action: 'task.bulk_created', resource: 'tasks', summary: `${created} follow-ups: ${title}`, meta: { skipped } });
    res.json({ created, skipped });
};

// ---- WhatsApp from templates ----

exports.templates = async (req, res) => {
    res.json({ items: cleanTemplates(await getSetting('crm.whatsappTemplates')) || DEFAULT_TEMPLATES });
};

exports.whatsapp = async (req, res) => {
    const customer = await Customer.findById(req.params.id).select('customerNo nameAr owner team contact').populate('owner', 'name');
    if (!customer) throw new HttpError(404, 'Not found.');
    const access = customerAccess({ actor: req.user, grants: req.user.grants, customer: { ...customer.toObject(), owner: customer.owner?._id } });
    if (!access.inFile || !access.sections.contact) throw new HttpError(403, 'Forbidden.');
    const phone = customer.contact.whatsapp || customer.contact.phone;
    if (!R.waNumber(phone)) throw new HttpError(400, 'لا يوجد رقم صالح للعميل. / The customer has no valid number.', 'NO_PHONE');
    const templates = cleanTemplates(await getSetting('crm.whatsappTemplates')) || DEFAULT_TEMPLATES;
    const tpl = templates.find((x) => x.key === req.body.template);
    let text = str(req.body.text, 1500) || (tpl && tpl.text) || '';
    if (!text) throw new HttpError(400, 'اكتب الرسالة. / Write the message.');
    const profile = { ...A.PROFILE_DEFAULT, ...(await getSetting('academy.profile')) };
    let owed = '';
    if (text.includes('{owed}') && access.sections.financial) {
        const rows = await require('../finance/hubController')._unpaidRows({ customer: customer._id });
        const sums = {};
        for (const r of rows) sums[r.currency] = M.round((sums[r.currency] || 0) + r.remaining, 2);
        owed = Object.entries(sums).map(([c, v]) => `${v.toLocaleString('en-US')} ${c}`).join(' + ');
    }
    text = fillTemplate(text, { name: customer.nameAr, customerNo: customer.customerNo, owner: req.user.name, academy: profile.nameAr, owed, portal: `${siteUrl()}/portal/` });
    await Communication.create({ customer: customer._id, channel: 'whatsapp', direction: 'outbound', kind: tpl ? `template:${tpl.key}` : 'whatsapp', summary: text.slice(0, 3000), at: new Date(), by: req.user.id });
    await Customer.updateOne({ _id: customer._id }, { $set: { lastContactAt: new Date() } });
    await addEvent(req, customer._id, 'communication', `WhatsApp: ${tpl ? tpl.titleAr : 'message'}`, { section: 'contact' });
    res.json({ link: R.waLink(phone, text), text });
};

// ---- leads board ----

const BOARD = ['lead', 'interested', 'customer', 'lost'];

exports.board = async (req, res) => {
    const scope = P.scopeFilter(req.scope, req.user);
    const recent = new Date(Date.now() - 30 * 864e5);
    const columns = {};
    for (const status of BOARD) {
        const extra = ['customer', 'lost'].includes(status) ? { updatedAt: { $gte: recent } } : {};
        const filter = { ...scope, archived: false, status, ...extra };
        if (oid(req.query.owner)) filter.owner = oid(req.query.owner);
        const [items, total] = await Promise.all([
            Customer.find(filter).select('customerNo nameAr source owner lastContactAt nextFollowUpAt registeredAt lostReason __v').populate('owner', 'name').sort({ lastContactAt: 1, registeredAt: -1 }).limit(100).lean(),
            Customer.countDocuments(filter)
        ]);
        columns[status] = { total, items: items.map((c) => ({ id: c._id, customerNo: c.customerNo, name: c.nameAr, source: c.source, owner: c.owner?.name || '', lastContactAt: c.lastContactAt, nextFollowUpAt: c.nextFollowUpAt, registeredAt: c.registeredAt, lostReason: c.lostReason, __v: c.__v })) };
    }
    res.json({ columns, order: BOARD });
};

exports._fillTemplate = fillTemplate;
exports._cleanTemplates = cleanTemplates;
exports.DEFAULT_TEMPLATES = DEFAULT_TEMPLATES;
