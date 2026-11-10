const mongoose = require('mongoose');
const Certificate = require('../../models/Certificate');
const CertificateTemplate = require('../../models/CertificateTemplate');
const Accreditation = require('../../models/Accreditation');
const Enrollment = require('../../models/Enrollment');
const Customer = require('../../models/Customer');
const ProgramModule = require('../../models/ProgramModule');
const P = require('../../lib/permissions');
const audit = require('../../lib/audit');
const design = require('../../lib/certificateDesign');
const { nextNumber } = require('../../lib/sequence');
const { HttpError, assertVersion, paging, parseDate } = require('../../lib/http');
const { addEvent, notify } = require('../crm/service');

// Issuing, listing, revoking and reissuing certificates; templates and accreditations

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const FIELDS = { owner: 'owner', team: 'team' };
const DONE = ['approved', 'certificate_issued'];
const siteUrl = () => (process.env.SITE_URL || 'https://www.nibras-ac.com').replace(/\/$/, '');
const verifyUrl = (num, lang = 'ar') => `${siteUrl()}/pages/${lang}/verify.html?code=${encodeURIComponent(num)}`;

// ---- templates ----

const TEMPLATE_FIELDS = ['name', 'kind', 'isDefault', 'language', 'titleAr', 'titleEn', 'introAr', 'introEn', 'bodyAr', 'bodyEn', 'footerAr', 'footerEn', 'logo', 'background', 'primaryColor', 'accentColor', 'showHours', 'showAccreditations', 'signatures', 'active'];

exports.listTemplates = async (req, res) => {
    res.json({ items: await CertificateTemplate.find().sort({ kind: 1, isDefault: -1, name: 1 }).lean(), placeholders: design.PLACEHOLDERS, defaults: design.DEFAULT_BODY });
};

// Only paths on this site or https images are accepted for logos, backgrounds and signatures
const safeImage = (v) => (typeof v === 'string' && (/^\/(api\/media|assets)\//.test(v) || /^https:\/\//.test(v)) ? v.slice(0, 500) : '');

exports.saveTemplate = async (req, res) => {
    const data = {};
    for (const k of TEMPLATE_FIELDS) if (req.body[k] !== undefined) data[k] = req.body[k];
    for (const k of ['name', 'titleAr', 'titleEn', 'introAr', 'introEn', 'bodyAr', 'bodyEn', 'footerAr', 'footerEn']) if (data[k] !== undefined) data[k] = str(data[k], 600);
    for (const k of ['logo', 'background']) if (data[k] !== undefined) data[k] = safeImage(data[k]);
    if (Array.isArray(data.signatures)) {
        data.signatures = data.signatures.slice(0, 4).map((s) => ({ nameAr: str(s.nameAr, 80), nameEn: str(s.nameEn, 80), titleAr: str(s.titleAr, 80), titleEn: str(s.titleEn, 80), image: safeImage(s.image) }));
    }
    let doc;
    if (req.params.id) {
        doc = await CertificateTemplate.findById(req.params.id);
        if (!doc) throw new HttpError(404, 'Not found.');
        assertVersion(doc, req.body.__v);
        doc.set({ ...data, updatedBy: req.user.id });
        await doc.save();
    } else {
        if (!data.name || !['module', 'program'].includes(data.kind)) throw new HttpError(400, 'الاسم والنوع مطلوبان. / Name and type are required.');
        doc = await CertificateTemplate.create({ ...data, updatedBy: req.user.id });
    }
    if (doc.isDefault) await CertificateTemplate.updateMany({ kind: doc.kind, _id: { $ne: doc._id } }, { $set: { isDefault: false } });
    await audit.record(req, { action: req.params.id ? 'certificate_template.updated' : 'certificate_template.created', resource: 'certificates', resourceId: doc._id, summary: doc.name });
    res.json({ item: doc });
};

// ---- accreditations ----

exports.listAccreditations = async (req, res) => {
    res.json({ items: await Accreditation.find().populate('programs', 'titleAr').sort({ active: -1, nameAr: 1 }).lean() });
};

exports.saveAccreditation = async (req, res) => {
    const data = {
        nameAr: str(req.body.nameAr, 160), nameEn: str(req.body.nameEn, 160), body: str(req.body.body, 160), number: str(req.body.number, 80),
        logo: safeImage(req.body.logo), validFrom: parseDate(req.body.validFrom), validUntil: parseDate(req.body.validUntil),
        programs: (Array.isArray(req.body.programs) ? req.body.programs : []).map(oid).filter(Boolean),
        allPrograms: req.body.allPrograms === true, active: req.body.active !== false
    };
    if (!data.nameAr) throw new HttpError(400, 'الاسم مطلوب. / A name is required.');
    let doc;
    if (req.params.id) {
        doc = await Accreditation.findById(req.params.id);
        if (!doc) throw new HttpError(404, 'Not found.');
        assertVersion(doc, req.body.__v);
        doc.set(data);
        await doc.save();
    } else doc = await Accreditation.create(data);
    await audit.record(req, { action: 'accreditation.saved', resource: 'certificates', resourceId: doc._id, summary: doc.nameAr });
    res.json({ item: doc });
};

async function accreditationsFor(programId, at = new Date()) {
    const list = await Accreditation.find({
        active: true,
        $or: [{ allPrograms: true }, { programs: programId }],
        $and: [{ $or: [{ validFrom: null }, { validFrom: { $lte: at } }] }, { $or: [{ validUntil: null }, { validUntil: { $gte: at } }] }]
    }).lean();
    return list.map((a) => ({ nameAr: a.nameAr, nameEn: a.nameEn, body: a.body, number: a.number, logo: a.logo }));
}

// ---- issuing ----

async function templateFor(kind, templateId) {
    if (templateId) {
        const t = await CertificateTemplate.findOne({ _id: oid(templateId), kind, active: true }).lean();
        if (!t) throw new HttpError(400, 'القالب غير متاح لهذا النوع. / The template is not available for this type.');
        return t;
    }
    return CertificateTemplate.findOne({ kind, isDefault: true, active: true }).lean();
}

const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

// Creates one certificate for a module (moduleId) or for the whole program (no moduleId).
// Checks eligibility, prevents duplicates, freezes the design, and marks the module.
async function issueOne(req, { enrollmentId, moduleId, templateId, names, replaces, version = 1 }) {
    const e = await Enrollment.findById(enrollmentId);
    if (!e) throw new HttpError(404, 'Not found.');
    const customer = await Customer.findById(e.customer).select('customerNo nameAr nameEn user');
    const kind = moduleId ? 'module' : 'program';
    let mod = null;
    if (kind === 'module') {
        mod = e.modules.find((m) => String(m.module) === String(moduleId));
        if (!mod) throw new HttpError(404, 'Not found.');
        if (!mod.certificate) throw new HttpError(400, 'هذا المحور ليس له شهادة مستقلة. / This module has no certificate of its own.');
        if (!DONE.includes(mod.status)) throw new HttpError(400, 'المحور غير معتمد بعد. / The module is not approved yet.', 'NOT_ELIGIBLE');
    } else if (!e.eligibleForFinalCertificate) {
        throw new HttpError(400, 'لم يستوف التسجيل شروط الشهادة النهائية. / The enrollment does not meet the final certificate rule yet.', 'NOT_ELIGIBLE');
    }
    const existing = await Certificate.findOne({ enrollment: e._id, module: kind === 'module' ? mod.module : null, kind, status: { $in: ['Valid', 'Suspended'] } }).select('cert_num');
    if (existing && !replaces) throw new HttpError(409, `توجد شهادة سارية بالفعل (${existing.cert_num}). / A valid certificate already exists (${existing.cert_num}).`, 'DUPLICATE');

    const programModule = mod ? await ProgramModule.findById(mod.module).select('hours').lean() : null;
    const hours = kind === 'module' ? programModule?.hours || 0 : 0;
    const template = await templateFor(kind, templateId);
    const now = new Date();
    const number = replaces ? design.versionedNumber(replaces.cert_num.replace(/-\d+$/, ''), version) : (await nextNumber('certificate')).number;
    const nameAr = (names && names.nameAr) || customer.nameAr;
    const nameEn = (names && names.nameEn) || customer.nameEn || '';
    const data = {
        kind, name: nameAr, nameEn, program: e.programTitleAr, programEn: e.programTitleEn,
        module: mod ? mod.titleAr : '', moduleEn: mod ? mod.titleEn : '', date: isoDay(now), number, hours
    };
    const cert = await Certificate.create({
        cert_num: number,
        trainee_name: nameAr,
        nameEn,
        program_name: e.programTitleAr,
        programNameEn: e.programTitleEn,
        program_type: kind === 'module' ? 'شهادة محور' : 'شهادة إتمام برنامج',
        field: mod ? mod.titleAr : '',
        moduleName: mod ? mod.titleAr : '',
        moduleNameEn: mod ? mod.titleEn : '',
        hours,
        issue_date: data.date,
        status: 'Valid',
        userId: customer.user || null,
        kind,
        customer: customer._id,
        enrollment: e._id,
        module: mod ? mod.module : null,
        program: e.program,
        owner: e.owner,
        team: e.team,
        issuedAt: now,
        issuedBy: req.user.id,
        template: template ? template._id : null,
        design: design.buildDesign(template, data),
        accreditations: template && template.showAccreditations === false ? [] : await accreditationsFor(e.program, now),
        version,
        replaces: replaces ? replaces._id : null,
        statusHistory: [{ status: 'Valid', reason: replaces ? `Reissue of ${replaces.cert_num}` : 'Issued', by: req.user.id, byName: req.user.name, at: now }]
    });

    if (mod && mod.status === 'approved') {
        mod.status = 'certificate_issued';
        mod.history.push({ from: 'approved', to: 'certificate_issued', note: cert.cert_num, by: req.user.id, byName: req.user.name, at: now });
        await e.save();
    }
    await addEvent(req, customer._id, 'certificate', `${cert.cert_num}: ${kind === 'module' ? mod.titleAr : e.programTitleAr}${replaces ? ` (reissue of ${replaces.cert_num})` : ''}`);
    await audit.record(req, { action: replaces ? 'certificate.reissued' : 'certificate.issued', resource: 'certificates', resourceId: cert._id, summary: `${cert.cert_num} ${customer.customerNo}`, meta: { kind, enrollment: String(e._id) } });
    if (e.owner) await notify(e.owner, { type: 'certificate_issued', titleAr: `صدرت الشهادة ${cert.cert_num}`, titleEn: `Certificate ${cert.cert_num} was issued`, bodyAr: `${customer.nameAr} · ${data.module || data.program}`, bodyEn: `${customer.nameAr} · ${data.moduleEn || data.programEn}`, link: `/certificates/${cert._id}` });
    return cert;
}

exports.issue = async (req, res) => {
    let cert;
    try {
        cert = await issueOne(req, { enrollmentId: oid(req.body.enrollment), moduleId: oid(req.body.module), templateId: req.body.template });
    } catch (err) {
        if (err.code === 11000) throw new HttpError(409, 'توجد شهادة سارية بالفعل. / A valid certificate already exists.', 'DUPLICATE');
        throw err;
    }
    res.status(201).json({ item: cert });
};

// Issues many at once from the eligible list; each item succeeds or fails on its own
exports.issueBulk = async (req, res) => {
    const items = (Array.isArray(req.body.items) ? req.body.items : []).slice(0, 200);
    const results = [];
    for (const it of items) {
        try {
            const c = await issueOne(req, { enrollmentId: oid(it.enrollment), moduleId: oid(it.module), templateId: req.body.template });
            results.push({ ok: true, cert_num: c.cert_num, id: String(c._id) });
        } catch (err) {
            results.push({ ok: false, enrollment: it.enrollment, module: it.module, message: err.message });
        }
    }
    res.json({ results });
};

// Approved modules with a certificate still to issue, and enrollments ready for the final one
exports.eligible = async (req, res) => {
    const enrollments = await Enrollment.find({
        status: { $in: ['active', 'on_hold', 'completed'] },
        $or: [{ modules: { $elemMatch: { status: 'approved', certificate: true } } }, { eligibleForFinalCertificate: true }]
    }).populate('customer', 'customerNo nameAr').limit(1000).lean();
    const finals = await Certificate.find({ kind: 'program', enrollment: { $in: enrollments.map((e) => e._id) }, status: { $in: ['Valid', 'Suspended'] } }).select('enrollment').lean();
    const hasFinal = new Set(finals.map((f) => String(f.enrollment)));
    const items = [];
    for (const e of enrollments) {
        for (const m of e.modules) {
            if (m.status === 'approved' && m.certificate) items.push({ kind: 'module', enrollment: String(e._id), enrollmentNo: e.enrollmentNo, module: String(m.module), title: m.titleAr, program: e.programTitleAr, customer: e.customer, approvedAt: m.approvedAt });
        }
        if (e.eligibleForFinalCertificate && !hasFinal.has(String(e._id))) items.push({ kind: 'program', enrollment: String(e._id), enrollmentNo: e.enrollmentNo, module: null, title: e.programTitleAr, program: e.programTitleAr, customer: e.customer, approvedAt: e.completedAt });
    }
    res.json({ items });
};

// ---- reading ----

const POP = [{ path: 'customer', select: 'customerNo nameAr' }, { path: 'issuedBy', select: 'name' }, { path: 'replacedBy', select: 'cert_num' }, { path: 'replaces', select: 'cert_num' }];

exports.list = async (req, res) => {
    const { limit, page, skip } = paging(req.query);
    const and = [req.scope === 'all' ? {} : P.scopeFilter(req.scope, req.user, FIELDS)];
    const q = req.query;
    if (q.status) and.push({ status: String(q.status) });
    if (q.kind) and.push({ kind: String(q.kind) });
    if (oid(q.customer)) and.push({ customer: oid(q.customer) });
    if (oid(q.enrollment)) and.push({ enrollment: oid(q.enrollment) });
    if (q.q) {
        const text = String(q.q).trim().slice(0, 60);
        and.push({ $or: [{ cert_num: text.toUpperCase() }, { trainee_name: new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }] });
    }
    const filter = { $and: and };
    const [items, total] = await Promise.all([
        Certificate.find(filter).select('-pdf_data -design').populate(POP).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Certificate.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit });
};

async function loadVisible(req, id) {
    const cert = await Certificate.findById(id).select('-pdf_data').populate(POP);
    if (!cert) throw new HttpError(404, 'Not found.');
    if (req.user.role === 'customer') {
        const mine = cert.customer ? await Customer.exists({ _id: cert.customer._id, user: req.user.id }) : String(cert.userId) === req.user.id;
        if (!mine || !['Valid', 'Expired'].includes(cert.status)) throw new HttpError(404, 'Not found.');
        return cert;
    }
    const scope = P.scopeFor(req.user.grants, 'certificates.view');
    if (!scope || !P.recordInScope(scope, req.user, cert, FIELDS)) throw new HttpError(404, 'Not found.');
    return cert;
}

exports.get = async (req, res) => {
    const cert = await loadVisible(req, req.params.id);
    res.json({ item: cert, verifyUrl: verifyUrl(cert.cert_num), verifyUrlEn: verifyUrl(cert.cert_num, 'en') });
};

exports.mine = async (req, res) => {
    const files = await Customer.find({ user: req.user.id }).select('_id').lean();
    const items = await Certificate.find({
        $or: [{ customer: { $in: files.map((f) => f._id) } }, { userId: req.user.id }],
        status: { $in: ['Valid', 'Expired'] }
    }).select('-pdf_data -design').sort({ createdAt: -1 }).lean();
    res.json({ items });
};

// ---- status changes ----

exports.setStatus = async (req, res) => {
    const cert = await Certificate.findById(req.params.id);
    if (!cert) throw new HttpError(404, 'Not found.');
    const status = String(req.body.status);
    if (!['Valid', 'Suspended', 'Cancelled', 'Expired'].includes(status)) throw new HttpError(400, 'Invalid status.');
    if (cert.status === 'Replaced') throw new HttpError(400, 'هذه الشهادة استُبدلت بإصدار أحدث. / This certificate was replaced by a newer version.');
    if (status === 'Valid' && cert.status === 'Cancelled') throw new HttpError(400, 'لا تُعاد الشهادة الملغاة؛ أعد إصدارها. / A cancelled certificate is not restored; reissue it.');
    const reason = str(req.body.reason, 500);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const from = cert.status;
    cert.status = status;
    cert.statusReason = reason;
    cert.statusHistory.push({ status, reason, by: req.user.id, byName: req.user.name, at: new Date() });
    await cert.save();
    // A cancelled module certificate frees the module for a new one
    if (status === 'Cancelled' && cert.kind === 'module') {
        await Enrollment.updateOne({ _id: cert.enrollment, 'modules.module': cert.module, 'modules.status': 'certificate_issued' }, { $set: { 'modules.$.status': 'approved' } });
    }
    if (cert.customer) await addEvent(req, cert.customer, 'certificate', `${cert.cert_num}: ${from} → ${status} — ${reason}`);
    await audit.record(req, { action: 'certificate.status_changed', resource: 'certificates', resourceId: cert._id, summary: cert.cert_num, reason, changes: { status: { from, to: status } } });
    res.json({ item: cert });
};

// Issues a new version (for a corrected name or a new design); the old one becomes "Replaced"
// and its verification page points to the new number
exports.reissue = async (req, res) => {
    const old = await Certificate.findById(req.params.id);
    if (!old || old.kind === 'legacy') throw new HttpError(404, 'Not found.');
    if (!['Valid', 'Suspended'].includes(old.status)) throw new HttpError(400, 'يمكن إعادة إصدار الشهادات السارية أو المعلقة فقط. / Only valid or suspended certificates can be reissued.');
    const reason = str(req.body.reason, 500);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const now = new Date();
    old.status = 'Replaced';
    old.statusReason = reason;
    old.statusHistory.push({ status: 'Replaced', reason, by: req.user.id, byName: req.user.name, at: now });
    await old.save();
    let cert;
    try {
        cert = await issueOne(req, {
            enrollmentId: old.enrollment, moduleId: old.kind === 'module' ? old.module : null, templateId: req.body.template,
            names: { nameAr: str(req.body.nameAr, 200), nameEn: str(req.body.nameEn, 200) }, replaces: old, version: (old.version || 1) + 1
        });
    } catch (err) {
        // Put the old certificate back if the new one could not be created
        old.status = old.statusHistory[old.statusHistory.length - 2]?.status || 'Valid';
        old.statusHistory.push({ status: old.status, reason: 'Reissue failed', by: req.user.id, byName: req.user.name, at: new Date() });
        await old.save();
        throw err;
    }
    old.replacedBy = cert._id;
    await old.save();
    res.status(201).json({ item: cert });
};

exports._verifyUrl = verifyUrl;
