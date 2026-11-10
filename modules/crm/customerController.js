const crypto = require('crypto');
const mongoose = require('mongoose');
const Customer = require('../../models/Customer');
const CustomerEvent = require('../../models/CustomerEvent');
const CustomerNote = require('../../models/CustomerNote');
const Communication = require('../../models/Communication');
const Task = require('../../models/Task');
const CustomerDocument = require('../../models/CustomerDocument');
const AccessRequest = require('../../models/AccessRequest');
const User = require('../../models/User');
const audit = require('../../lib/audit');
const fieldCrypto = require('../../lib/fieldCrypto');
const P = require('../../lib/permissions');
const { teamOf } = require('../../lib/teams');
const { nextNumber } = require('../../lib/sequence');
const { HttpError, assertVersion, paging } = require('../../lib/http');
const { customerAccess, serializeCustomer, basicCard } = require('../../lib/customerAccess');
const data = require('../../lib/customerData');
const { addEvent, approvedSections, getSetting } = require('./service');
const { transferCustomer } = require('./transfer');

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const POPULATE = [
    { path: 'owner', select: 'name' },
    { path: 'team', select: 'nameAr nameEn' },
    { path: 'createdBy', select: 'name' }
];

// The card shows each program, its enrollment status and the status of each module.
// Accounts from before enrollments existed fall back to their old program list.
async function programsOf(customer) {
    const Enrollment = require('../../models/Enrollment');
    const list = await Enrollment.find({ customer: customer._id, status: { $ne: 'cancelled' } }).select('enrollmentNo programTitleAr programTitleEn status modules.titleAr modules.titleEn modules.status').sort({ enrolledAt: -1 }).limit(20).lean();
    if (list.length) {
        return list.map((e) => ({ enrollmentNo: e.enrollmentNo, title: e.programTitleAr, titleEn: e.programTitleEn, status: e.status, modules: e.modules.map((m) => ({ title: m.titleAr, titleEn: m.titleEn, status: m.status })) }));
    }
    if (!customer.user) return [];
    const u = await User.findById(customer.user._id || customer.user).select('enrolledCourses').lean();
    return u ? (u.enrolledCourses || []).slice(0, 20).map((title) => ({ title, status: null, modules: [] })) : [];
}

async function accessFor(req, customer) {
    const base = customerAccess({ actor: req.user, grants: req.user.grants, customer });
    if (base.inFile) return base;
    const approved = await approvedSections(req.user.id, customer._id);
    return approved.length ? customerAccess({ actor: req.user, grants: req.user.grants, customer, approvedSections: approved }) : base;
}

// Loads a customer the user may see at least the basic card of. minLevel 'file' requires the file itself
// or an approved request; anything less is answered as not found, so ids cannot be probed.
async function loadCustomer(req, id, { minLevel = 'basic' } = {}) {
    const customer = await Customer.findById(id).populate(POPULATE);
    if (!customer) throw new HttpError(404, 'Not found.');
    const access = await accessFor(req, customer);
    if (access.level === 'basic' && (minLevel !== 'basic' || !access.canLookup)) throw new HttpError(404, 'Not found.');
    return { customer, access };
}

// ---- list ----

exports.list = async (req, res) => {
    const { limit, page, skip } = paging(req.query);
    const and = [P.scopeFilter(req.scope, req.user)];
    const q = req.query;
    if (q.archived !== 'true') and.push({ archived: false });
    if (q.status) and.push({ status: String(q.status) });
    else and.push({ status: { $ne: 'merged' } });
    if (q.source) and.push({ source: String(q.source) });
    if (q.country) and.push({ country: String(q.country) });
    if (q.tag) and.push({ tags: String(q.tag) });
    if (q.segment) and.push({ segment: String(q.segment) });
    if (q.mine === '1') and.push({ owner: req.user.id });
    if (q.unassigned === '1') and.push({ owner: null });
    if (oid(q.owner)) and.push({ owner: oid(q.owner) });
    if (oid(q.team)) and.push({ team: oid(q.team) });
    if (q.noFollowUpDays) {
        const days = Math.min(Math.max(parseInt(q.noFollowUpDays, 10) || 0, 1), 365);
        and.push({ $or: [{ lastContactAt: null }, { lastContactAt: { $lt: new Date(Date.now() - days * 864e5) } }] });
    }
    if (q.q) {
        const text = String(q.q).trim().slice(0, 80);
        const or = [{ customerNo: text.toUpperCase() }, { nameAr: new RegExp(escapeRx(text), 'i') }, { nameEn: new RegExp(escapeRx(text), 'i') }];
        const phone = data.normalizePhone(text);
        if (phone.length >= 7) or.push({ 'contact.phoneNorm': phone });
        const email = data.normalizeEmail(text);
        if (email) or.push({ 'contact.email': email });
        and.push({ $or: or });
    }
    const filter = { $and: and };
    const sort = q.sort === 'name' ? { nameAr: 1 } : q.sort === 'followup' ? { nextFollowUpAt: 1 } : { registeredAt: -1 };
    const [items, total] = await Promise.all([
        Customer.find(filter).populate(POPULATE).sort(sort).skip(skip).limit(limit),
        Customer.countDocuments(filter)
    ]);
    res.json({
        items: items.map((c) => serializeCustomer(c, customerAccess({ actor: req.user, grants: req.user.grants, customer: c }))),
        total,
        page,
        limit
    });
};

// ---- one file ----

exports.get = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id);
    const namePolicy = await getSetting('customers.lookupNamePolicy');
    const out = serializeCustomer(customer, access, { namePolicy, programs: await programsOf(customer) });
    if (access.level === 'basic') out.canRequestAccess = !!P.scopeFor(req.user.grants, 'access_requests.create');
    if (access.level === 'granted') {
        await audit.record(req, { action: 'customer.viewed_with_access', resource: 'customers', resourceId: customer._id, summary: customer.customerNo });
    }
    res.json({ item: out });
};

// The full identity number, for those allowed; every reveal is logged
exports.revealIdentity = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    if (!access.canRevealIdentity) throw new HttpError(403, 'ليس لديك صلاحية عرض رقم الهوية كاملاً. / You may not see the full identity number.', 'FORBIDDEN');
    const i = customer.identity || {};
    const result = {
        nationalId: i.nationalIdEnc ? fieldCrypto.decrypt(i.nationalIdEnc) : '',
        passport: i.passportEnc ? fieldCrypto.decrypt(i.passportEnc) : ''
    };
    await audit.record(req, { action: 'customer.identity_revealed', resource: 'customers', resourceId: customer._id, summary: customer.customerNo, reason: str(req.body.reason, 300) });
    await addEvent(req, customer._id, 'identity_revealed', 'Full identity number viewed', { section: 'identity' });
    res.json(result);
};

// ---- create and update ----

function readInput(body) {
    const contact = body.contact || {};
    const identity = body.identity || {};
    return {
        nameAr: body.nameAr !== undefined ? str(body.nameAr) : undefined,
        nameEn: body.nameEn !== undefined ? str(body.nameEn) : undefined,
        country: body.country !== undefined ? str(body.country, 80) : undefined,
        source: Customer.SOURCES.includes(body.source) ? body.source : undefined,
        sourceDetail: body.sourceDetail !== undefined ? str(body.sourceDetail) : undefined,
        status: Customer.STATUSES.includes(body.status) && body.status !== 'merged' ? body.status : undefined,
        lostReason: body.lostReason !== undefined ? str(body.lostReason, 300) : undefined,
        segment: body.segment !== undefined ? str(body.segment, 60) : undefined,
        tags: Array.isArray(body.tags) ? [...new Set(body.tags.map((t) => str(String(t), 40)).filter(Boolean))].slice(0, 30) : undefined,
        contact: {
            phone: contact.phone !== undefined ? str(contact.phone, 30) : undefined,
            phone2: contact.phone2 !== undefined ? str(contact.phone2, 30) : undefined,
            whatsapp: contact.whatsapp !== undefined ? str(contact.whatsapp, 30) : undefined,
            email: contact.email !== undefined ? data.normalizeEmail(contact.email) || '' : undefined,
            address: contact.address !== undefined ? str(contact.address, 400) : undefined,
            city: contact.city !== undefined ? str(contact.city, 80) : undefined
        },
        identity: {
            nationality: identity.nationality !== undefined ? str(identity.nationality, 80) : undefined,
            nationalId: identity.nationalId !== undefined ? String(identity.nationalId || '') : undefined,
            passport: identity.passport !== undefined ? String(identity.passport || '') : undefined,
            birthDate: identity.birthDate !== undefined ? (identity.birthDate ? new Date(identity.birthDate) : null) : undefined,
            gender: ['', 'male', 'female'].includes(identity.gender) ? identity.gender : undefined
        }
    };
}

const hasAny = (obj) => Object.values(obj).some((v) => v !== undefined);

async function findDuplicates(keys, excludeId) {
    const query = data.duplicateQuery(keys, excludeId);
    if (!query) return [];
    const candidates = await Customer.find(query).populate(POPULATE).limit(20).lean();
    return data.explainMatches(keys, candidates);
}

async function duplicateCards(req, matches) {
    const namePolicy = await getSetting('customers.lookupNamePolicy');
    return matches.map((m) => {
        const access = customerAccess({ actor: req.user, grants: req.user.grants, customer: m.candidate });
        return { ...basicCard(m.candidate, access, { namePolicy }), matched: m.matched, strong: m.strong };
    });
}

// Whether the actor may give a customer to this owner: own scope only to themself,
// team scope to members of their teams, all scope to any active staff member
async function assertAssignable(req, scope, ownerId) {
    if (String(ownerId) === String(req.user.id)) return;
    if (scope === 'own' || !scope) throw new HttpError(403, 'لا يمكنك إسناد العميل لموظف آخر. / You cannot assign customers to someone else.');
    const u = await User.findById(ownerId).select('role status');
    if (!u || u.status === 'disabled' || !P.isStaffRole(u.role)) throw new HttpError(400, 'الموظف غير موجود أو غير نشط. / The employee is not active.');
    if (scope === 'team') {
        const team = await teamOf(ownerId);
        if (!team || !req.user.teamIds.includes(String(team))) throw new HttpError(403, 'الموظف ليس في فريقك. / The employee is not in your team.');
    }
}

exports.create = async (req, res) => {
    const input = readInput(req.body);
    if (!input.nameAr) throw new HttpError(400, 'اسم العميل مطلوب. / The customer name is required.');
    if (!input.contact.phone && !input.contact.email) throw new HttpError(400, 'أدخل رقم هاتف أو بريداً إلكترونياً. / Enter a phone number or email.');
    const identityGiven = input.identity.nationalId || input.identity.passport;
    if (identityGiven && !P.scopeFor(req.user.grants, 'customer_identity.create')) throw new HttpError(403, 'ليس لديك صلاحية إدخال بيانات الهوية. / You may not enter identity data.');

    const keys = data.duplicateKeys({ ...input.contact, ...input.identity });
    const matches = await findDuplicates(keys);
    if (matches.some((m) => m.strong)) {
        return res.status(409).json({ message: 'يوجد عميل مسجل بنفس رقم الهوية أو الجواز. / A customer with this identity number already exists.', code: 'DUPLICATE', matches: await duplicateCards(req, matches) });
    }
    if (matches.length && req.body.confirmNotDuplicate !== true) {
        return res.status(409).json({ message: 'يوجد عملاء ببيانات مشابهة. راجعهم قبل الإنشاء. / Similar customers exist. Review them first.', code: 'POSSIBLE_DUPLICATE', matches: await duplicateCards(req, matches) });
    }

    const ownerId = oid(req.body.owner) || (P.isStaffRole(req.user.role) ? oid(req.user.id) : null);
    if (ownerId) await assertAssignable(req, req.scope === 'all' ? 'all' : P.scopeFor(req.user.grants, 'customers.manage') || 'own', ownerId);
    const team = ownerId ? await teamOf(ownerId) : null;
    const { number } = await nextNumber('customer');

    const c = new Customer({
        customerNo: number,
        internalId: crypto.randomUUID(),
        nameAr: input.nameAr,
        nameEn: input.nameEn || '',
        country: input.country || '',
        source: input.source || 'other',
        sourceDetail: input.sourceDetail || '',
        status: input.status || 'lead',
        segment: input.segment || '',
        tags: input.tags || [],
        createdBy: req.user.id,
        owner: ownerId,
        team,
        ownerHistory: ownerId ? [{ owner: ownerId, team, from: new Date(), by: req.user.id, reason: 'created' }] : [],
        contact: {
            phone: input.contact.phone || '',
            phoneNorm: data.normalizePhone(input.contact.phone),
            phone2: input.contact.phone2 || '',
            whatsapp: input.contact.whatsapp || '',
            email: input.contact.email || '',
            address: input.contact.address || '',
            city: input.contact.city || ''
        },
        identity: {
            nationality: input.identity.nationality || '',
            birthDate: input.identity.birthDate || null,
            gender: input.identity.gender || '',
            ...data.identityFields('national_id', input.identity.nationalId),
            ...data.identityFields('passport', input.identity.passport)
        }
    });
    await c.save();
    await addEvent(req, c._id, 'created', `File ${c.customerNo} created`, { meta: { source: c.source } });
    await audit.record(req, { action: 'customer.created', resource: 'customers', resourceId: c._id, summary: `${c.customerNo} ${c.nameAr}`, meta: { possibleDuplicates: matches.length } });
    const saved = await Customer.findById(c._id).populate(POPULATE);
    res.status(201).json({ item: serializeCustomer(saved, customerAccess({ actor: req.user, grants: req.user.grants, customer: saved })) });
};

exports.update = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    if (customer.status === 'merged') throw new HttpError(400, 'هذا الملف مدمج في ملف آخر. / This file was merged into another.');
    assertVersion(customer, req.body.__v);
    const input = readInput(req.body);

    const general = ['nameAr', 'nameEn', 'source', 'sourceDetail', 'status', 'lostReason', 'segment', 'tags'];
    const generalChanged = general.some((k) => input[k] !== undefined) || input.country !== undefined;
    if (generalChanged && !access.canEdit) throw new HttpError(403, 'Forbidden.');
    if (hasAny(input.contact) && !access.canEditSection.contact) throw new HttpError(403, 'ليس لديك صلاحية تعديل بيانات التواصل. / You may not edit contact data.');
    if (hasAny(input.identity) && !access.canEditSection.identity) throw new HttpError(403, 'ليس لديك صلاحية تعديل بيانات الهوية. / You may not edit identity data.');

    const keys = data.duplicateKeys({
        phone: input.contact.phone, phone2: input.contact.phone2, email: input.contact.email,
        nationalId: input.identity.nationalId, passport: input.identity.passport
    });
    const matches = await findDuplicates(keys, customer._id);
    if (matches.some((m) => m.strong)) {
        return res.status(409).json({ message: 'رقم الهوية أو الجواز مسجل لعميل آخر. / This identity number belongs to another customer.', code: 'DUPLICATE', matches: await duplicateCards(req, matches) });
    }

    const before = customer.toObject();
    const nextStatus = input.status;
    if (nextStatus === 'lost' && !(input.lostReason || customer.lostReason)) throw new HttpError(400, 'سبب خسارة العميل مطلوب. / A reason is required for a lost customer.', 'REASON_REQUIRED');

    for (const k of general) if (input[k] !== undefined && !(k === 'nameAr' && !input[k])) customer[k] = input[k];
    if (input.country !== undefined) customer.country = input.country;
    for (const [k, v] of Object.entries(input.contact)) if (v !== undefined) customer.contact[k] = v;
    if (input.contact.phone !== undefined) customer.contact.phoneNorm = data.normalizePhone(input.contact.phone);
    const id = input.identity;
    if (id.nationality !== undefined) customer.identity.nationality = id.nationality;
    if (id.birthDate !== undefined) customer.identity.birthDate = id.birthDate;
    if (id.gender !== undefined) customer.identity.gender = id.gender;
    if (id.nationalId !== undefined) Object.assign(customer.identity, data.identityFields('national_id', id.nationalId));
    if (id.passport !== undefined) Object.assign(customer.identity, data.identityFields('passport', id.passport));

    await customer.save();

    const after = customer.toObject();
    const visible = audit.diff(
        { ...before, contact: undefined, identity: undefined, ownerHistory: undefined },
        { ...after, contact: undefined, identity: undefined, ownerHistory: undefined },
        [...general, 'country']
    );
    const contactChanges = audit.diff(before.contact, after.contact);
    delete contactChanges.phoneNorm;
    const identityChanged = ['nationality', 'nationalIdLast4', 'passportLast4', 'birthDate', 'gender'].filter((k) => String(before.identity?.[k] ?? '') !== String(after.identity?.[k] ?? ''));

    if (visible.status) await addEvent(req, customer._id, 'status_changed', `${visible.status.from} → ${visible.status.to}`, { meta: { lostReason: customer.lostReason || undefined } });
    const changedNames = [...Object.keys(visible).filter((k) => k !== 'status')];
    if (changedNames.length) await addEvent(req, customer._id, 'updated', `Updated: ${changedNames.join(', ')}`);
    if (Object.keys(contactChanges).length) await addEvent(req, customer._id, 'updated', `Contact updated: ${Object.keys(contactChanges).join(', ')}`, { section: 'contact' });
    if (identityChanged.length) await addEvent(req, customer._id, 'updated', `Identity updated: ${identityChanged.join(', ')}`, { section: 'identity' });

    await audit.record(req, {
        action: 'customer.updated', resource: 'customers', resourceId: customer._id, summary: customer.customerNo,
        reason: str(req.body.reason, 300),
        changes: { ...visible, ...Object.fromEntries(Object.entries(contactChanges).map(([k, v]) => [`contact.${k}`, v])), ...(identityChanged.length ? { identity: { from: 'hidden', to: identityChanged.join(', ') } } : {}) }
    });
    const saved = await Customer.findById(customer._id).populate(POPULATE);
    res.json({
        item: serializeCustomer(saved, await accessFor(req, saved)),
        possibleDuplicates: matches.length ? await duplicateCards(req, matches) : undefined
    });
};

exports.setArchived = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    if (!access.canArchive) throw new HttpError(403, 'Forbidden.');
    const reason = str(req.body.reason, 300);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const archived = req.body.archived !== false;
    customer.archived = archived;
    await customer.save();
    await addEvent(req, customer._id, archived ? 'archived' : 'restored', reason);
    await audit.record(req, { action: archived ? 'customer.archived' : 'customer.restored', resource: 'customers', resourceId: customer._id, summary: customer.customerNo, reason });
    res.json({ archived });
};

// ---- timeline ----

exports.timeline = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    const sections = ['general', ...Object.entries(access.sections).filter(([, v]) => v).map(([k]) => k)];
    const { limit, skip } = paging(req.query, { defaultLimit: 100, maxLimit: 300 });
    const items = await CustomerEvent.find({ customer: customer._id, section: { $in: sections } }).sort({ at: -1 }).skip(skip).limit(limit).lean();
    res.json({ items });
};

// ---- lookup (search by customer number, national ID or passport) ----

exports.lookup = async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 4) throw new HttpError(400, 'أدخل رقم العميل أو رقم الهوية أو الجواز. / Enter a customer number, national ID or passport number.');
    const or = [{ customerNo: q.toUpperCase() }];
    if (/^\d+$/.test(q)) or.push({ customerNo: `NB-${q.padStart(6, '0')}` });
    or.push({ 'identity.nationalIdIdx': fieldCrypto.blindIndex(q, 'national_id') });
    or.push({ 'identity.passportIdx': fieldCrypto.blindIndex(q, 'passport') });
    const found = await Customer.find({ $or: or, status: { $ne: 'merged' } }).populate(POPULATE).limit(5);
    const namePolicy = await getSetting('customers.lookupNamePolicy');
    const items = [];
    for (const c of found) {
        const access = await accessFor(req, c);
        items.push({
            ...basicCard(c, access, { namePolicy, programs: await programsOf(c) }),
            canRequestAccess: access.level !== 'full' && !!P.scopeFor(req.user.grants, 'access_requests.create') && String(c.owner?._id || '') !== req.user.id
        });
    }
    const kind = /^NB-/i.test(q) || /^\d{1,6}$/.test(q) ? 'customer_no' : 'identity';
    await audit.record(req, { action: 'customer.lookup', resource: 'customers', summary: `Lookup by ${kind}: ${items.length} found`, meta: { kind, results: items.map((i) => i.customerNo) } });
    res.json({ items });
};

// ---- duplicates and merge ----

exports.checkDuplicates = async (req, res) => {
    const b = req.body || {};
    const keys = data.duplicateKeys({ phone: b.phone, phone2: b.phone2, email: b.email, nationalId: b.nationalId, passport: b.passport });
    const matches = await findDuplicates(keys, oid(b.excludeId));
    res.json({ matches: await duplicateCards(req, matches) });
};

// Groups of files that share a phone, email or identity number
exports.duplicateGroups = async (req, res) => {
    const base = { status: { $ne: 'merged' } };
    const group = async (field, kind) => {
        const rows = await Customer.aggregate([
            { $match: { ...base, [field]: { $nin: ['', null] } } },
            { $group: { _id: `$${field}`, ids: { $push: '$_id' }, n: { $sum: 1 } } },
            { $match: { n: { $gt: 1 } } },
            { $limit: 200 }
        ]);
        return rows.map((r) => ({ kind, ids: r.ids.map(String) }));
    };
    const groups = [
        ...(await group('identity.nationalIdIdx', 'national_id')),
        ...(await group('identity.passportIdx', 'passport')),
        ...(await group('contact.phoneNorm', 'phone')),
        ...(await group('contact.email', 'email'))
    ];
    const ids = [...new Set(groups.flatMap((g) => g.ids))];
    const customers = await Customer.find({ _id: { $in: ids } }).populate(POPULATE).lean();
    const byId = Object.fromEntries(customers.map((c) => [String(c._id), c]));
    res.json({
        groups: groups.map((g) => ({
            kind: g.kind,
            customers: g.ids.map((id) => byId[id]).filter(Boolean).map((c) => ({
                id: String(c._id), customerNo: c.customerNo, nameAr: c.nameAr, owner: c.owner ? { id: String(c.owner._id), name: c.owner.name } : null,
                status: c.status, registeredAt: c.registeredAt, phone: c.contact?.phone, email: c.contact?.email
            }))
        }))
    });
};

// Merges another file into this one. The other file is kept (status merged, read-only) and all its
// notes, calls, tasks, documents, requests and timeline move here, so no history is lost.
exports.merge = async (req, res) => {
    const target = await Customer.findById(req.params.id);
    const source = await Customer.findById(oid(req.body.sourceId));
    if (!target || !source) throw new HttpError(404, 'Not found.');
    if (String(target._id) === String(source._id)) throw new HttpError(400, 'اختر ملفين مختلفين. / Choose two different files.');
    if (target.status === 'merged' || source.status === 'merged') throw new HttpError(400, 'أحد الملفين مدمج بالفعل. / One of the files was already merged.');
    const reason = str(req.body.reason, 500);
    if (!reason) throw new HttpError(400, 'سبب الدمج مطلوب. / A reason is required.', 'REASON_REQUIRED');
    assertVersion(target, req.body.__v);

    const plan = data.planMerge(target.toObject(), source.toObject());
    target.set(plan.set);
    await target.save();

    const move = { $set: { customer: target._id } };
    const moved = {
        notes: (await CustomerNote.updateMany({ customer: source._id }, move)).modifiedCount,
        communications: (await Communication.updateMany({ customer: source._id }, move)).modifiedCount,
        tasks: (await Task.updateMany({ customer: source._id }, move)).modifiedCount,
        documents: (await CustomerDocument.updateMany({ customer: source._id }, move)).modifiedCount,
        accessRequests: (await AccessRequest.updateMany({ customer: source._id }, move)).modifiedCount,
        events: (await CustomerEvent.updateMany({ customer: source._id }, { $set: { customer: target._id, movedFrom: source._id } })).modifiedCount
    };

    source.status = 'merged';
    source.mergedInto = target._id;
    source.archived = true;
    await source.save();

    await addEvent(req, target._id, 'merged', `${source.customerNo} merged into this file`, { meta: { source: String(source._id), conflicts: plan.conflicts.map((c) => c.field), moved, reason } });
    await addEvent(req, source._id, 'merged', `Merged into ${target.customerNo}`, { meta: { target: String(target._id), reason } });
    await audit.record(req, {
        action: 'customer.merged', resource: 'customers', resourceId: target._id,
        summary: `${source.customerNo} → ${target.customerNo}`, reason,
        meta: { source: String(source._id), filled: Object.keys(plan.set), conflicts: plan.conflicts.map((c) => c.field), moved }
    });
    res.json({ merged: true, filled: Object.keys(plan.set), conflicts: plan.conflicts.map((c) => c.field), moved });
};

// ---- ownership ----

exports.transfer = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    if (!access.canManage) throw new HttpError(403, 'Forbidden.');
    const to = oid(req.body.to);
    const reason = str(req.body.reason, 300);
    if (!to) throw new HttpError(400, 'اختر الموظف. / Choose the employee.');
    if (!reason) throw new HttpError(400, 'سبب النقل مطلوب. / A reason is required.', 'REASON_REQUIRED');
    if (String(customer.owner?._id || '') === String(to)) throw new HttpError(400, 'العميل مسند لهذا الموظف بالفعل. / Already assigned to this employee.');
    await assertAssignable(req, req.scope, to);
    const doc = await Customer.findById(customer._id);
    await transferCustomer(req, doc, to, reason);
    res.json({ ok: true });
};

// Distributes unassigned customers. strategy "even" gives each one to the listed employee with the
// fewest open customers at that moment; otherwise all go to "to".
exports.assign = async (req, res) => {
    const ids = (Array.isArray(req.body.customerIds) ? req.body.customerIds : []).map(oid).filter(Boolean).slice(0, 500);
    if (!ids.length) throw new HttpError(400, 'اختر العملاء. / Choose the customers.');
    const reason = str(req.body.reason, 300) || 'Lead assignment';
    const employees = req.body.strategy === 'even'
        ? (Array.isArray(req.body.employees) ? req.body.employees : []).map(oid).filter(Boolean)
        : [oid(req.body.to)].filter(Boolean);
    if (!employees.length) throw new HttpError(400, 'اختر الموظفين. / Choose the employees.');
    for (const e of employees) await assertAssignable(req, req.scope, e);

    const load = Object.fromEntries(await Promise.all(employees.map(async (e) => [String(e), await Customer.countDocuments({ owner: e, archived: false, status: { $in: ['lead', 'interested'] } })])));
    const customers = await Customer.find({ _id: { $in: ids }, ...P.scopeFilter(req.scope === 'all' ? 'all' : req.scope, req.user) });
    const result = {};
    for (const c of customers) {
        if (c.status === 'merged') continue;
        const to = Object.entries(load).sort((a, b) => a[1] - b[1])[0][0];
        if (String(c.owner || '') === to) continue;
        await transferCustomer(req, c, oid(to), reason);
        load[to] += 1;
        result[to] = (result[to] || 0) + 1;
    }
    res.json({ assigned: result });
};

exports.meta = async (req, res) => {
    res.json({ sources: Customer.SOURCES, statuses: Customer.STATUSES.filter((s) => s !== 'merged'), channels: Communication.CHANNELS, outcomes: Communication.OUTCOMES, documentCategories: CustomerDocument.CATEGORIES, sections: AccessRequest.SECTIONS });
};

exports._loadCustomer = loadCustomer;
exports._accessFor = accessFor;
