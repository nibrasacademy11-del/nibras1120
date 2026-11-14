const mongoose = require('mongoose');
const Complaint = require('../../models/Complaint');
const Satisfaction = require('../../models/Satisfaction');
const Customer = require('../../models/Customer');
const Enrollment = require('../../models/Enrollment');
const User = require('../../models/User');
const P = require('../../lib/permissions');
const audit = require('../../lib/audit');
const { teamOf } = require('../../lib/teams');
const { nextNumber } = require('../../lib/sequence');
const { customerAccess } = require('../../lib/customerAccess');
const { HttpError, assertVersion, paging, parseDate } = require('../../lib/http');
const { addEvent, notify } = require('./service');

// Complaints (from staff or the customer portal) and satisfaction ratings

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const FIELDS = { owner: 'assignee', team: 'team' };
const POP = [{ path: 'customer', select: 'customerNo nameAr' }, { path: 'assignee', select: 'name' }, { path: 'createdBy', select: 'name' }, { path: 'enrollment', select: 'enrollmentNo programTitleAr' }];

async function customerFiles(userId) {
    return (await Customer.find({ user: userId }).select('_id owner team customerNo nameAr').lean());
}

exports.list = async (req, res) => {
    const { limit, page, skip } = paging(req.query);
    let base;
    if (req.user.role === 'customer') base = { customer: { $in: (await customerFiles(req.user.id)).map((c) => c._id) } };
    else base = P.scopeFilter(req.scope, req.user, FIELDS);
    const and = [base];
    if (req.query.status) and.push({ status: String(req.query.status) });
    if (req.query.category) and.push({ category: String(req.query.category) });
    if (oid(req.query.customer)) and.push({ customer: oid(req.query.customer) });
    if (req.query.mine === '1') and.push({ assignee: req.user.id });
    const filter = { $and: and };
    const [items, total] = await Promise.all([
        Complaint.find(filter).populate(POP).sort({ status: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
        Complaint.countDocuments(filter)
    ]);
    // Customers do not see internal notes
    if (req.user.role === 'customer') for (const c of items) c.updates = (c.updates || []).filter((u) => !u.internal);
    res.json({ items, total, page, limit });
};

exports.create = async (req, res) => {
    const subject = str(req.body.subject, 200);
    if (!subject) throw new HttpError(400, 'موضوع الشكوى مطلوب. / A subject is required.');
    let customer;
    let channel = Complaint.schema.path('channel').enumValues.includes(req.body.channel) ? req.body.channel : 'other';
    if (req.user.role === 'customer') {
        const files = await customerFiles(req.user.id);
        customer = files.find((f) => String(f._id) === String(req.body.customer)) || files[0];
        if (!customer) throw new HttpError(400, 'لا يوجد ملف عميل مرتبط بحسابك. / No customer file is linked to your account.');
        channel = 'portal';
    } else {
        customer = await Customer.findById(oid(req.body.customer)).select('owner team customerNo nameAr');
        if (!customer) throw new HttpError(400, 'اختر العميل. / Choose the customer.');
        const access = customerAccess({ actor: req.user, grants: req.user.grants, customer });
        if (!access.inFile && req.scope !== 'all') throw new HttpError(403, 'Forbidden.');
    }
    // Complaints go to the customer's responsible employee unless someone else is chosen
    const assignee = (req.user.role !== 'customer' && oid(req.body.assignee)) || customer.owner || null;
    const { number } = await nextNumber('complaint');
    const priority = ['low', 'normal', 'high', 'urgent'].includes(req.body.priority) ? req.body.priority : 'normal';
    const c = await Complaint.create({
        complaintNo: number,
        customer: customer._id,
        enrollment: oid(req.body.enrollment),
        subject,
        description: str(req.body.description, 5000),
        category: Complaint.CATEGORIES.includes(req.body.category) ? req.body.category : 'other',
        priority,
        channel,
        assignee,
        team: assignee ? await teamOf(assignee) : customer.team,
        dueAt: new Date(Date.now() + ({ urgent: 1, high: 2, normal: 5, low: 10 }[priority]) * 864e5),
        createdBy: req.user.id,
        updates: [{ at: new Date(), by: req.user.id, byName: req.user.name, status: 'open', note: 'Created', internal: false }]
    });
    await addEvent(req, customer._id, 'complaint', `${c.complaintNo}: ${subject}`);
    await audit.record(req, { action: 'complaint.created', resource: 'complaints', resourceId: c._id, summary: `${c.complaintNo} ${customer.customerNo}` });
    const message = { type: 'complaint', titleAr: `شكوى جديدة ${c.complaintNo}: ${subject}`, titleEn: `New complaint ${c.complaintNo}: ${subject}`, link: '/complaints' };
    if (assignee && String(assignee) !== req.user.id) await notify(assignee, message);
    if (!assignee) {
        const support = await User.find({ role: { $in: ['customer_support', 'super_admin'] }, status: 'active' }).select('_id').lean();
        for (const u of support) await notify(u._id, message);
    }
    res.status(201).json({ item: await Complaint.findById(c._id).populate(POP) });
};

exports.update = async (req, res) => {
    const c = await Complaint.findById(req.params.id);
    if (!c || !P.recordInScope(req.scope, req.user, c, FIELDS)) throw new HttpError(404, 'Not found.');
    assertVersion(c, req.body.__v);
    const note = str(req.body.note, 2000);
    const changes = {};
    if (req.body.status && req.body.status !== c.status) {
        if (!Complaint.STATUSES.includes(req.body.status)) throw new HttpError(400, 'Invalid status.');
        if (['resolved', 'closed'].includes(req.body.status) && !(str(req.body.resolution, 3000) || c.resolution)) {
            throw new HttpError(400, 'اكتب طريقة الحل. / Write the resolution.', 'REASON_REQUIRED');
        }
        changes.status = { from: c.status, to: req.body.status };
        c.status = req.body.status;
        if (['resolved', 'closed'].includes(c.status) && !c.resolvedAt) c.resolvedAt = new Date();
        if (['open', 'in_progress'].includes(c.status)) c.resolvedAt = null;
    }
    if (req.body.resolution !== undefined) c.resolution = str(req.body.resolution, 3000);
    if (['low', 'normal', 'high', 'urgent'].includes(req.body.priority)) c.priority = req.body.priority;
    if (req.body.assignee !== undefined && String(req.body.assignee || '') !== String(c.assignee || '')) {
        const to = oid(req.body.assignee);
        changes.assignee = { from: c.assignee ? String(c.assignee) : null, to: to ? String(to) : null };
        c.assignee = to;
        c.team = to ? await teamOf(to) : c.team;
        if (to) await notify(to, { type: 'complaint', titleAr: `شكوى مسندة إليك: ${c.complaintNo}`, titleEn: `Complaint assigned to you: ${c.complaintNo}`, link: '/complaints' });
    }
    if (note || Object.keys(changes).length) c.updates.push({ at: new Date(), by: req.user.id, byName: req.user.name, status: c.status, note, internal: req.body.internal === true });
    await c.save();
    if (changes.status) await addEvent(req, c.customer, 'complaint', `${c.complaintNo}: ${changes.status.from} → ${changes.status.to}`);
    await audit.record(req, { action: 'complaint.updated', resource: 'complaints', resourceId: c._id, summary: c.complaintNo, changes });
    res.json({ item: await Complaint.findById(c._id).populate(POP) });
};

// A customer rates a program they are enrolled in, the service in general, or a resolved complaint
exports.rate = async (req, res) => {
    const score = parseInt(req.body.score, 10);
    if (!(score >= 1 && score <= 5)) throw new HttpError(400, 'التقييم من 1 إلى 5. / The rating is from 1 to 5.');
    const kind = ['program', 'service', 'complaint'].includes(req.body.kind) ? req.body.kind : 'service';
    const files = await customerFiles(req.user.id);
    if (!files.length) throw new HttpError(400, 'لا يوجد ملف عميل مرتبط بحسابك. / No customer file is linked to your account.');
    let customer = files[0];
    let enrollment = null;
    let complaint = null;
    if (kind === 'program') {
        enrollment = await Enrollment.findOne({ _id: oid(req.body.enrollment), customer: { $in: files.map((f) => f._id) } }).select('customer program owner team');
        if (!enrollment) throw new HttpError(404, 'Not found.');
        customer = files.find((f) => String(f._id) === String(enrollment.customer));
    }
    if (kind === 'complaint') {
        complaint = await Complaint.findOne({ _id: oid(req.body.complaint), customer: { $in: files.map((f) => f._id) }, status: { $in: ['resolved', 'closed'] } }).select('customer assignee team');
        if (!complaint) throw new HttpError(404, 'Not found.');
        customer = files.find((f) => String(f._id) === String(complaint.customer));
    }
    const key = { customer: customer._id, kind, enrollment: enrollment ? enrollment._id : null, complaint: complaint ? complaint._id : null };
    const existing = await Satisfaction.findOne(key);
    const comment = str(req.body.comment, 2000);
    let doc;
    if (existing) {
        existing.previous.push({ score: existing.score, comment: existing.comment, at: existing.updatedAt });
        existing.score = score;
        existing.comment = comment;
        doc = await existing.save();
    } else {
        doc = await Satisfaction.create({
            ...key, score, comment,
            program: enrollment ? enrollment.program : null,
            owner: enrollment ? enrollment.owner : complaint ? complaint.assignee : customer.owner,
            team: enrollment ? enrollment.team : complaint ? complaint.team : customer.team
        });
    }
    await addEvent(req, customer._id, 'satisfaction', `${kind}: ${score}/5${comment ? ` — ${comment.slice(0, 120)}` : ''}`);
    res.json({ item: doc });
};

exports.myRatings = async (req, res) => {
    const files = await customerFiles(req.user.id);
    res.json({ items: await Satisfaction.find({ customer: { $in: files.map((f) => f._id) } }).lean() });
};

exports.meta = (req, res) => res.json({ statuses: Complaint.STATUSES, categories: Complaint.CATEGORIES });
exports._parseDate = parseDate;
