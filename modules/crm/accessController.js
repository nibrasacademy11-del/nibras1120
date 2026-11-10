const mongoose = require('mongoose');
const AccessRequest = require('../../models/AccessRequest');
const Customer = require('../../models/Customer');
const User = require('../../models/User');
const audit = require('../../lib/audit');
const P = require('../../lib/permissions');
const { customerAccess } = require('../../lib/customerAccess');
const { HttpError, assertVersion } = require('../../lib/http');
const { addEvent, notify } = require('./service');

// Access requests: an employee asks the customer's responsible employee (or an admin) to open
// specific sections of a file that is not theirs, for a stated purpose and a limited time.

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const MAX_HOURS = 24 * 30;
const isAdminApprover = (req) => P.scopeFor(req.user.grants, 'access_requests.approve') === 'all';

function view(r, now = new Date()) {
    const o = r.toObject ? r.toObject() : r;
    const active = o.status === 'approved' && o.expiresAt && new Date(o.expiresAt) > now;
    return { ...o, effectiveStatus: o.status === 'approved' && !active ? 'expired' : o.status, active };
}

const POP = [
    { path: 'customer', select: 'customerNo nameAr owner' },
    { path: 'requester', select: 'name' },
    { path: 'approver', select: 'name' },
    { path: 'decidedBy', select: 'name' }
];

exports.create = async (req, res) => {
    const customer = await Customer.findById(req.params.id).select('customerNo nameAr owner team status');
    if (!customer || customer.status === 'merged') throw new HttpError(404, 'Not found.');
    const access = customerAccess({ actor: req.user, grants: req.user.grants, customer });
    if (!access.canLookup) throw new HttpError(404, 'Not found.');
    if (access.inFile) throw new HttpError(400, 'لديك صلاحية على هذا الملف بالفعل. / You already have access to this file.');

    const sections = [...new Set((Array.isArray(req.body.sections) ? req.body.sections : []).filter((s) => AccessRequest.SECTIONS.includes(s)))];
    if (!sections.length) throw new HttpError(400, 'اختر البيانات المطلوبة. / Choose the data you need.');
    const purpose = str(req.body.purpose);
    if (purpose.length < 5) throw new HttpError(400, 'اكتب الغرض من الطلب. / Explain why you need it.');
    const durationHours = Math.min(Math.max(parseInt(req.body.durationHours, 10) || 24, 1), MAX_HOURS);

    const pending = await AccessRequest.exists({ requester: req.user.id, customer: customer._id, status: 'pending' });
    if (pending) throw new HttpError(409, 'لديك طلب قيد الانتظار لهذا العميل. / You already have a pending request for this customer.', 'DUPLICATE');

    const r = await AccessRequest.create({ customer: customer._id, requester: req.user.id, approver: customer.owner || null, sections, purpose, durationHours });
    await addEvent(req, customer._id, 'access', `Access requested by ${req.user.name}: ${sections.join(', ')}`, { meta: { request: String(r._id), purpose } });
    await audit.record(req, { action: 'access.requested', resource: 'access_requests', resourceId: r._id, summary: `${customer.customerNo}: ${sections.join(', ')}`, reason: purpose, meta: { durationHours } });

    const message = {
        type: 'access_request',
        titleAr: `طلب وصول لملف العميل ${customer.customerNo}`,
        titleEn: `Access request for customer ${customer.customerNo}`,
        bodyAr: `${req.user.name}: ${purpose}`,
        bodyEn: `${req.user.name}: ${purpose}`,
        link: '/access-requests'
    };
    if (customer.owner) await notify(customer.owner, message);
    else {
        // A file without a responsible employee goes to the admins
        const admins = await User.find({ role: { $in: ['super_admin', 'admin'] }, status: 'active' }).select('_id').lean();
        for (const a of admins) await notify(a._id, message);
    }
    res.status(201).json({ item: view(await r.populate(POP)) });
};

// box: incoming (to decide), outgoing (mine), all (admins)
exports.list = async (req, res) => {
    const box = String(req.query.box || 'incoming');
    let filter;
    if (box === 'outgoing') filter = { requester: req.user.id };
    else if (box === 'all') {
        if (!isAdminApprover(req)) throw new HttpError(403, 'Forbidden.');
        filter = {};
    } else {
        // The current owner of each file decides, so requests follow a transferred customer
        const owned = await Customer.find({ owner: req.user.id }).select('_id').lean();
        filter = isAdminApprover(req)
            ? { $or: [{ customer: { $in: owned.map((c) => c._id) } }, { approver: null }, { status: 'pending' }] }
            : { customer: { $in: owned.map((c) => c._id) } };
    }
    if (req.query.status) filter = { $and: [filter, { status: String(req.query.status) }] };
    const items = await AccessRequest.find(filter).populate(POP).sort({ createdAt: -1 }).limit(200);
    const now = new Date();
    res.json({ items: items.map((r) => view(r, now)) });
};

async function loadForDecision(req) {
    const r = await AccessRequest.findById(req.params.requestId);
    if (!r) throw new HttpError(404, 'Not found.');
    const customer = await Customer.findById(r.customer).select('customerNo owner');
    const isOwner = customer && customer.owner && String(customer.owner) === req.user.id && !!P.scopeFor(req.user.grants, 'access_requests.approve');
    return { r, customer, isOwner, isAdmin: isAdminApprover(req) };
}

exports.decide = async (req, res) => {
    const { r, customer, isOwner, isAdmin } = await loadForDecision(req);
    if (!isOwner && !isAdmin) throw new HttpError(403, 'فقط الموظف المسؤول عن الملف أو الإدارة يمكنه الرد. / Only the responsible employee or an admin can decide.');
    if (r.status !== 'pending') throw new HttpError(400, 'تم الرد على هذا الطلب. / This request was already decided.');
    if (String(r.requester) === req.user.id) throw new HttpError(400, 'Forbidden.');
    assertVersion(r, req.body.__v);
    const approve = req.body.decision === 'approve';
    const note = str(req.body.note);
    if (!approve && !note) throw new HttpError(400, 'اكتب سبب الرفض. / Write the reason for rejecting.', 'REASON_REQUIRED');

    r.status = approve ? 'approved' : 'rejected';
    r.decidedBy = req.user.id;
    r.decidedAt = new Date();
    r.decisionNote = note;
    r.adminDecision = !isOwner;
    if (approve) {
        // The approver may shorten the time asked for, never extend it
        const hours = Math.min(Math.max(parseInt(req.body.durationHours, 10) || r.durationHours, 1), r.durationHours);
        const sections = Array.isArray(req.body.sections) ? r.sections.filter((s) => req.body.sections.includes(s)) : r.sections;
        if (!sections.length) throw new HttpError(400, 'اختر بيانات واحدة على الأقل. / Approve at least one section.');
        r.sections = sections;
        r.durationHours = hours;
        r.expiresAt = new Date(Date.now() + hours * 3600 * 1000);
    }
    await r.save();

    await addEvent(req, r.customer, 'access', `Access ${r.status} for ${r.sections.join(', ')}${approve ? ` until ${r.expiresAt.toISOString().slice(0, 16).replace('T', ' ')}` : ''}`, { meta: { request: String(r._id) } });
    await audit.record(req, { action: approve ? 'access.approved' : 'access.rejected', resource: 'access_requests', resourceId: r._id, summary: `${customer ? customer.customerNo : r.customer}: ${r.sections.join(', ')}`, reason: note, meta: { adminDecision: r.adminDecision, expiresAt: r.expiresAt } });
    await notify(r.requester, {
        type: 'access_decision',
        titleAr: approve ? `تمت الموافقة على طلب الوصول للعميل ${customer?.customerNo}` : `تم رفض طلب الوصول للعميل ${customer?.customerNo}`,
        titleEn: approve ? `Access approved for customer ${customer?.customerNo}` : `Access rejected for customer ${customer?.customerNo}`,
        bodyAr: note,
        bodyEn: note,
        link: approve ? `/customers/${r.customer}` : '/access-requests'
    });
    res.json({ item: view(await r.populate(POP)) });
};

// The owner or an admin revokes an approval at any time; the requester can cancel a pending request
exports.revoke = async (req, res) => {
    const { r, customer, isOwner, isAdmin } = await loadForDecision(req);
    const isRequester = String(r.requester) === req.user.id;
    if (r.status === 'pending' && isRequester) {
        r.status = 'cancelled';
    } else if (r.status === 'approved' && (isOwner || isAdmin || isRequester)) {
        r.status = 'revoked';
        r.revokedBy = req.user.id;
        r.revokedAt = new Date();
    } else {
        throw new HttpError(400, 'لا يمكن إلغاء هذا الطلب. / This request cannot be cancelled.');
    }
    await r.save();
    await addEvent(req, r.customer, 'access', `Access ${r.status} (${r.sections.join(', ')})`, { meta: { request: String(r._id) } });
    await audit.record(req, { action: `access.${r.status}`, resource: 'access_requests', resourceId: r._id, summary: customer ? customer.customerNo : String(r.customer), reason: str(req.body.reason) });
    if (r.status === 'revoked' && !isRequester) {
        await notify(r.requester, { type: 'access_decision', titleAr: `تم إلغاء صلاحية الوصول للعميل ${customer?.customerNo}`, titleEn: `Access to customer ${customer?.customerNo} was revoked`, link: '/access-requests' });
    }
    res.json({ item: view(await r.populate(POP)) });
};
