const mongoose = require('mongoose');
const Certificate = require('../../models/Certificate');
const Enrollment = require('../../models/Enrollment');
const Customer = require('../../models/Customer');
const ProgramModule = require('../../models/ProgramModule');
const P = require('../../lib/permissions');
const audit = require('../../lib/audit');
const design = require('../../lib/certificateDesign');
const { nextNumber } = require('../../lib/sequence');
const { HttpError, paging } = require('../../lib/http');
const { addEvent, notify, getSetting } = require('../crm/service');
const User = require('../../models/User');
const R = require('../../lib/certificateRules');
const { outstandingFor } = require('../finance/balances');
const { brandedEmail } = require('../../lib/brandEmail');

// Issuing, listing, revoking and reissuing certificates. Every certificate prints on the academy's
// designed sheets (assets/js/cert-nibras.js); there are no templates or accreditations to choose
// (removed 17 Nov 2026: the accreditation logos are part of the sheets).

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const FIELDS = { owner: 'owner', team: 'team' };
const DONE = ['approved', 'certificate_issued'];
const siteUrl = () => (process.env.SITE_URL || 'https://www.nibras-ac.com').replace(/\/$/, '');
const verifyUrl = (num, lang = 'ar') => `${siteUrl()}/pages/${lang}/verify.html?code=${encodeURIComponent(num)}`;

// ---- issuing by hand (17 Nov 2026) ----
// The owner and the assistant write a certificate themselves: for someone with no account or no
// enrollment, or anything the system did not issue. Its number is the next in the series or one
// they type, and it is verified on the website like any other.
const MANUAL_NUMBER = /^[A-Za-z0-9][A-Za-z0-9-]{2,29}$/;
exports.issueManual = async (req, res) => {
    if (P.roleLevel(req.user.role) !== 'owner') throw new HttpError(403, 'المالك والمساعد فقط. / The owner and the assistant only.', 'FORBIDDEN');
    const b = req.body || {};
    const docType = str(b.docType, 20);
    const type = design.NIBRAS.DOC_TYPES[docType];
    if (!type) throw new HttpError(400, 'اختر نوع الشهادة. / Choose the kind of certificate.', 'BAD_TYPE');
    if (!type.sheet) throw new HttpError(400, 'تصميم هذا النوع لم يُرفع بعد. / This kind has no design yet.', 'NO_DESIGN');
    const name = str(b.name, 160);
    const nameEn = str(b.nameEn, 160);
    const program = str(b.program, 200);
    const programEn = str(b.programEn, 200);
    if (!name || !nameEn) throw new HttpError(400, 'اكتب الاسم بالعربي والإنجليزي. / Write the name in Arabic and English.', 'NAME_REQUIRED');
    if (!program || !programEn) throw new HttpError(400, 'اكتب اسم البرنامج بالعربي والإنجليزي. / Write the program in Arabic and English.', 'PROGRAM_REQUIRED');
    // the wording follows it (المتدرب / المتدربة, his / her, He / She), so it is always chosen
    if (!['male', 'female'].includes(b.gender)) throw new HttpError(400, 'اختر النوع (ذكر أو أنثى). / Choose male or female.', 'GENDER_REQUIRED');
    const hours = Math.min(Math.max(parseInt(b.hours, 10) || 0, 0), 5000);
    // the grades of a degree: up to 15 modules, each with its percentage and grade
    let transcript;
    if (docType === 'degree') {
        const rows = (Array.isArray(b.rows) ? b.rows : []).map((r) => {
            const pct = r && r.percentage !== '' && r.percentage != null ? Number(r.percentage) : null;
            return { module: str(r && r.module, 120), percentage: pct != null && Number.isFinite(pct) ? Math.min(Math.max(Math.round(pct * 10) / 10, 0), 100) : '', grade: str(r && r.grade, 4).toUpperCase() };
        }).filter((r) => r.module);
        if (!rows.length) throw new HttpError(400, 'أضف محور واحد على الأقل. / Add at least one module.', 'ROWS_REQUIRED');
        if (rows.length > 15) throw new HttpError(400, 'الحد الأقصى 15 محور. / At most 15 modules.', 'TOO_MANY_ROWS');
        for (const r of rows) if (!r.grade) r.grade = design.NIBRAS.gradeOf(r.percentage);
        const year = (v) => (/^\d{4}$/.test(String(v || '').trim()) ? String(v).trim() : '');
        transcript = { specialization: str(b.specialization, 120), degree: str(b.degree, 60), programEn, admittedYear: year(b.admittedYear), conferredYear: year(b.conferredYear), rows };
        if (!transcript.specialization || !transcript.degree) throw new HttpError(400, 'اكتب التخصص والدرجة. / Write the specialization and the degree.', 'DETAILS_REQUIRED');
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? String(b.date) : isoDay(new Date());
    // linked to a customer of the academy only when the owner ticks "an existing customer" and picks
    // one; otherwise it stays with no one, even if the name matches somebody
    const linkTo = b.linkCustomer === true ? await customerToLink(b.customer) : null;
    let number = str(b.number, 30).toUpperCase();
    if (b.numberMode === 'manual') {
        if (!MANUAL_NUMBER.test(number)) throw new HttpError(400, 'رقم الشهادة: حروف إنجليزية وأرقام وشرطة فقط (3 إلى 30). / Certificate number: letters, digits and dashes (3 to 30).', 'BAD_NUMBER');
        if (await Certificate.exists({ cert_num: number })) throw new HttpError(409, `الرقم ${number} مستخدم في شهادة أخرى. / The number ${number} is already used.`, 'DUPLICATE');
    } else {
        number = (await nextNumber('certificate')).number;
    }
    const now = new Date();
    const data = { kind: 'program', name, nameEn, program, programEn, date, number, hours, docType, gender: b.gender, transcript };
    const cert = await Certificate.create({
        cert_num: number,
        trainee_name: name,
        nameEn,
        program_name: program,
        programNameEn: programEn,
        program_type: type.ar,
        docType,
        hours,
        issue_date: date,
        status: 'Valid',
        kind: 'manual',
        ...linkFields(linkTo),
        issuedAt: now,
        issuedBy: req.user.id,
        design: design.buildDesign({ layout: 'nibras', name: 'nibras' }, data),
        statusHistory: [{ status: 'Valid', reason: 'Issued by hand', by: req.user.id, byName: req.user.name, at: now }]
    });
    await audit.record(req, { action: 'certificate.issued_manual', resource: 'certificates', resourceId: cert._id, summary: `${number}: ${name} · ${program}${linkTo ? ` → ${linkTo.customerNo}` : ''}` });
    if (linkTo) await addEvent(req, linkTo._id, 'certificate', `${number}: ${program} (issued by hand)`);
    res.status(201).json({ item: cert, verifyUrl: verifyUrl(number) });
};

// The customer a hand-written certificate is linked to (it then shows in their profile)
async function customerToLink(id) {
    const c = oid(id) ? await Customer.findById(id).select('customerNo nameAr user owner team status') : null;
    if (!c || c.status === 'merged') throw new HttpError(400, 'اختر العميل من القائمة. / Pick the customer from the list.', 'CUSTOMER_REQUIRED');
    return c;
}
const linkFields = (c) => ({ customer: c ? c._id : null, userId: c ? c.user || null : null, owner: c ? c.owner || null : null, team: c ? c.team || null : null });

// Later: link a hand-written certificate to a customer's profile, or unlink it (the owner and the assistant)
exports.linkManual = async (req, res) => {
    if (P.roleLevel(req.user.role) !== 'owner') throw new HttpError(403, 'المالك والمساعد فقط. / The owner and the assistant only.', 'FORBIDDEN');
    const cert = await Certificate.findById(req.params.id);
    if (!cert) throw new HttpError(404, 'Not found.');
    if (cert.kind !== 'manual') throw new HttpError(400, 'الربط متاح للشهادات اليدوية فقط. / Only hand-written certificates are linked here.', 'NOT_MANUAL');
    const before = cert.customer ? String(cert.customer) : null;
    const to = req.body && req.body.customer ? await customerToLink(req.body.customer) : null;
    Object.assign(cert, linkFields(to));
    await cert.save();
    await audit.record(req, { action: to ? 'certificate.linked' : 'certificate.unlinked', resource: 'certificates', resourceId: cert._id, summary: `${cert.cert_num}: ${to ? to.customerNo : 'no one'}`, changes: { customer: { from: before, to: to ? String(to._id) : null } } });
    if (to) await addEvent(req, to._id, 'certificate', `${cert.cert_num}: linked (issued by hand)`);
    res.json({ item: await Certificate.findById(cert._id).select('-pdf_data').populate(POP) });
};

// The kinds the owner can issue by hand, and which of them have their design yet
exports.manualTypes = async (req, res) => {
    res.json({ items: Object.entries(design.NIBRAS.DOC_TYPES).map(([key, t]) => ({ key, ar: t.ar, en: t.en, ready: !!t.sheet })) });
};

// ---- issuing ----


const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

// Whether the customer has paid everything the payment rule asks for before a certificate
async function paymentCheck(enrollment) {
    const rule = await getSetting('certificates.paymentRule');
    if (rule === 'off') return { clear: true, byCurrency: [] };
    return rule === 'enrollment' ? outstandingFor({ enrollment: enrollment._id }) : outstandingFor({ customer: enrollment.customer });
}

// The certificate on the customer's page of the website, where it is viewed and downloaded as PDF
const siteCertUrl = (id, lang = 'ar') => `${siteUrl()}/pages/${lang}/certificate.html?id=${id}`;

// Sends the certificate link to the customer and records it on the certificate
async function emailCertificate(req, cert) {
    const mail = require('../../lib/mail');
    const customer = await Customer.findById(cert.customer).select('nameAr contact.email user');
    let to = customer && customer.contact && customer.contact.email;
    if (!to && customer && customer.user) to = (await User.findById(customer.user).select('email').lean() || {}).email;
    if (!to) throw new HttpError(400, 'لا يوجد إيميل لهذا العميل. / This customer has no email.', 'NO_EMAIL');
    const title = cert.kind === 'module' ? cert.moduleName : cert.program_name;
    // spoken to as a woman or a man, as on the certificate itself
    const female = (cert.design && cert.design.gender) === 'female';
    const sent = await mail.send({
        kind: 'certificate-ready',
        to,
        subject: `شهادتك جاهزة - أكاديمية نبراس / Your certificate is ready - ${cert.cert_num}`,
        html: brandedEmail({
            heading: `مبروك يا ${cert.trainee_name}!`,
            lines: ['صدرت شهادتك:', title],
            highlight: `رقم الشهادة: ${cert.cert_num}`,
            button: { label: 'عرض الشهادة وتحميلها PDF', url: siteCertUrl(cert._id) },
            secondary: { label: 'رابط التحقق من الشهادة', url: verifyUrl(cert.cert_num) },
            noteEn: `Congratulations! Your certificate ${cert.cert_num} is ready on your Nibras profile, where you can view it and download it as PDF.`,
            footer: 'يمكن لأي جهة التحقق من الشهادة برقمها أو بمسح رمز QR المطبوع عليها.'
        }),
        text: `مبروك! صدرت شهادتك ${cert.cert_num} (${title}). ${female ? 'اعرضيها وحمّليها' : 'اعرضها وحمّلها'} من صفحتك: ${siteCertUrl(cert._id)}`
    });
    if (!mail.delivered(sent)) throw new HttpError(400, 'تعذر إرسال الإيميل (إعدادات البريد غير مكتملة). / The email could not be sent (email is not set up).', 'NO_MAIL');
    const now = new Date();
    await Certificate.updateOne({ _id: cert._id }, {
        $set: { 'delivery.emailedAt': now, 'delivery.emailedTo': to },
        $inc: { 'delivery.emailCount': 1 },
        $push: { 'delivery.log': { step: 'emailed', note: to, by: req.user.id || null, byName: req.user.name, at: now } }
    });
    return to;
}

// Creates one certificate for a module (moduleId) or for the whole program (no moduleId).
// Checks eligibility, prevents duplicates, freezes the design, and marks the module.
async function issueOne(req, { enrollmentId, moduleId, templateId, names, replaces, version = 1, waive = '', email = false }) {
    const e = await Enrollment.findById(enrollmentId);
    if (!e) throw new HttpError(404, 'Not found.');
    const customer = await Customer.findById(e.customer).select('customerNo nameAr nameEn user identity.gender');
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
    // Nothing owed (a reissue of a certificate already handed over is not checked again)
    if (!replaces && !waive) {
        const pay = await paymentCheck(e);
        if (!pay.clear) throw new HttpError(409, `لا تصدر الشهادة قبل سداد المتبقي: ${R.money(pay.byCurrency)}. / The certificate is issued only after the balance is paid: ${R.money(pay.byCurrency)}.`, 'UNPAID');
    }

    const programModule = mod ? await ProgramModule.findById(mod.module).select('hours').lean() : null;
    // a module certificate shows the module's hours; the final one the hours of the whole program
    const hours = kind === 'module'
        ? programModule?.hours || 0
        : (await ProgramModule.find({ program: e.program, active: true }).select('hours').lean()).reduce((n, m) => n + (m.hours || 0), 0);
    const course = await require('../../models/Course').findById(e.program).select('type').lean();
    const template = null; // the academy's sheets only
    const now = new Date();
    // A reissue keeps the original number and adds the version: NC-0000001 -> NC-0000001-2 -> -3.
    // Only a number that already carries a version (version 2 or more) drops its last part first.
    const baseNumber = replaces && (replaces.version || 1) > 1 ? replaces.cert_num.replace(/-\d+$/, '') : replaces ? replaces.cert_num : '';
    const number = replaces ? design.versionedNumber(baseNumber, version) : (await nextNumber('certificate')).number;
    const nameAr = (names && names.nameAr) || customer.nameAr;
    const nameEn = (names && names.nameEn) || customer.nameEn || '';
    const data = {
        kind, name: nameAr, nameEn, program: e.programTitleAr, programEn: e.programTitleEn,
        module: mod ? mod.titleAr : '', moduleEn: mod ? mod.titleEn : '', date: isoDay(now), number, hours,
        docType: course ? course.type : 'course', gender: customer.identity && customer.identity.gender
    };
    const cert = await Certificate.create({
        cert_num: number,
        trainee_name: nameAr,
        nameEn,
        program_name: e.programTitleAr,
        programNameEn: e.programTitleEn,
        program_type: kind === 'module' ? 'شهادة محور' : 'شهادة إتمام برنامج',
        docType: data.docType,
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
        accreditations: [],
        version,
        replaces: replaces ? replaces._id : null,
        paymentWaiver: waive || '',
        statusHistory: [{ status: 'Valid', reason: replaces ? `Reissue of ${replaces.cert_num}` : waive ? `Issued with balance waived: ${waive}` : 'Issued', by: req.user.id, byName: req.user.name, at: now }]
    });

    if (mod && mod.status === 'approved') {
        mod.status = 'certificate_issued';
        mod.history.push({ from: 'approved', to: 'certificate_issued', note: cert.cert_num, by: req.user.id, byName: req.user.name, at: now });
        await e.save();
    }
    await addEvent(req, customer._id, 'certificate', `${cert.cert_num}: ${kind === 'module' ? mod.titleAr : e.programTitleAr}${replaces ? ` (reissue of ${replaces.cert_num})` : ''}`);
    await audit.record(req, { action: replaces ? 'certificate.reissued' : 'certificate.issued', resource: 'certificates', resourceId: cert._id, summary: `${cert.cert_num} ${customer.customerNo}`, meta: { kind, enrollment: String(e._id) } });
    if (customer.user && !replaces) {
        await notify(customer.user, { type: 'certificate_issued', titleAr: `صدرت شهادتك: ${data.module || data.program}`, titleEn: `Your certificate is ready: ${data.moduleEn || data.programEn || data.program}`, link: `/certificates/${cert._id}` });
    }
    if (email) {
        try {
            await emailCertificate(req, cert);
        } catch (err) {
            cert.$locals.emailError = err.message;   // issuing still succeeded; the caller reports it
        }
    }
    if (e.owner) await notify(e.owner, { type: 'certificate_issued', titleAr: `صدرت الشهادة ${cert.cert_num}`, titleEn: `Certificate ${cert.cert_num} was issued`, bodyAr: `${customer.nameAr} · ${data.module || data.program}`, bodyEn: `${customer.nameAr} · ${data.moduleEn || data.programEn}`, link: `/certificates/${cert._id}` });
    return cert;
}

exports.issue = async (req, res) => {
    let cert;
    try {
        cert = await issueOne(req, { enrollmentId: oid(req.body.enrollment), moduleId: oid(req.body.module), templateId: req.body.template, waive: waiverOf(req), email: req.body.email === true });
    } catch (err) {
        if (err.code === 11000) throw new HttpError(409, 'توجد شهادة سارية بالفعل. / A valid certificate already exists.', 'DUPLICATE');
        throw err;
    }
    res.status(201).json({ item: cert, emailError: cert.$locals.emailError });
};

// Issuing although money is owed needs the certificates "manage" permission and a written reason
function waiverOf(req) {
    const reason = str(req.body.waivePayment, 300);
    if (!reason) return '';
    const g = req.user.grants || {};
    if (g['certificates.manage'] !== 'all' && g['certificates.approve'] !== 'all') throw new HttpError(403, 'Forbidden.');
    return reason;
}

// Issues many at once from the eligible list; each item succeeds or fails on its own
exports.issueBulk = async (req, res) => {
    const items = (Array.isArray(req.body.items) ? req.body.items : []).slice(0, 200);
    const results = [];
    for (const it of items) {
        try {
            const c = await issueOne(req, { enrollmentId: oid(it.enrollment), moduleId: oid(it.module), templateId: req.body.template, email: req.body.email === true });
            results.push({ ok: true, cert_num: c.cert_num, id: String(c._id), emailError: c.$locals.emailError });
        } catch (err) {
            results.push({ ok: false, enrollment: it.enrollment, module: it.module, message: err.message, code: err.code });
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
    // Who still owes money (they are listed, but issuing waits for the payment)
    const checked = {};
    for (const it of items) {
        const e = enrollments.find((x) => String(x._id) === it.enrollment);
        if (!checked[it.enrollment]) checked[it.enrollment] = await paymentCheck({ _id: e._id, customer: e.customer._id });
        it.unpaid = checked[it.enrollment].clear ? null : checked[it.enrollment].byCurrency;
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
    if (q.delivery === 'not_emailed') and.push({ kind: { $ne: 'legacy' }, 'delivery.emailedAt': null });
    if (q.delivery === 'paper_pending') and.push({ kind: { $ne: 'legacy' }, status: 'Valid', 'delivery.paper.status': { $ne: 'delivered' } });
    if (q.delivery === 'paper_ready') and.push({ 'delivery.paper.status': 'ready' });
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
    if (req.user.role === 'customer' && cert.kind !== 'legacy' && !(cert.delivery && cert.delivery.viewedAt)) {
        const now = new Date();
        await Certificate.updateOne({ _id: cert._id, 'delivery.viewedAt': null }, { $set: { 'delivery.viewedAt': now }, $push: { 'delivery.log': { step: 'viewed', note: '', by: null, byName: 'customer', at: now } } });
    }
    res.json({ item: cert, verifyUrl: verifyUrl(cert.cert_num), verifyUrlEn: verifyUrl(cert.cert_num, 'en') });
};

exports.mine = async (req, res) => {
    const files = await Customer.find({ user: req.user.id }).select('_id').lean();
    const items = await Certificate.find({
        $or: [{ customer: { $in: files.map((f) => f._id) } }, { userId: req.user.id }],
        status: { $in: ['Valid', 'Expired'] }
    }).select('-pdf_data -design').sort({ createdAt: -1 }).lean();
    // Only issued certificates: one waiting for payment is not shown, not even that it exists
    // (PLAN-V2 decision 1); it is issued and appears here once the program is paid
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
    // a hand-written certificate has no enrollment to reissue from: cancel it and write a new one
    if (!old || old.kind === 'legacy' || old.kind === 'manual') throw new HttpError(404, 'Not found.');
    const cert = await reissueOne(req, old, {
        reason: str(req.body.reason, 500), templateId: req.body.template,
        names: { nameAr: str(req.body.nameAr, 200), nameEn: str(req.body.nameEn, 200) }
    });
    res.status(201).json({ item: cert });
};

// A new version of a certificate (same number plus the version); the old one becomes Replaced.
// Empty names take the customer's current ones, so a corrected name reaches the new copy.
async function reissueOne(req, old, { reason, names = {}, templateId } = {}) {
    if (!['Valid', 'Suspended'].includes(old.status)) throw new HttpError(400, 'يمكن إعادة إصدار الشهادات السارية أو المعلقة فقط. / Only valid or suspended certificates can be reissued.');
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const now = new Date();
    old.status = 'Replaced';
    old.statusReason = reason;
    old.statusHistory.push({ status: 'Replaced', reason, by: req.user.id, byName: req.user.name, at: now });
    await old.save();
    let cert;
    try {
        cert = await issueOne(req, {
            enrollmentId: old.enrollment, moduleId: old.kind === 'module' ? old.module : null, templateId,
            names, replaces: old, version: (old.version || 1) + 1
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
    return cert;
}

// ---- delivery: email and the paper copy ----

exports.email = async (req, res) => {
    const cert = await loadVisible(req, req.params.id);
    if (cert.kind === 'legacy' || cert.status !== 'Valid') throw new HttpError(400, 'تُرسل الشهادات السارية فقط. / Only valid certificates are sent.');
    const to = await emailCertificate(req, cert);
    await audit.record(req, { action: 'certificate.emailed', resource: 'certificates', resourceId: cert._id, summary: `${cert.cert_num} → ${to}` });
    res.json({ ok: true, to });
};

exports.delivery = async (req, res) => {
    const cert = await Certificate.findById(req.params.id);
    if (!cert || cert.kind === 'legacy') throw new HttpError(404, 'Not found.');
    const scope = P.scopeFor(req.user.grants, 'certificates.update');
    if (!scope || !P.recordInScope(scope, req.user, cert, FIELDS)) throw new HttpError(403, 'Forbidden.');
    const step = String(req.body.step || '');
    const paper = cert.delivery.paper;
    if (!R.canMovePaper(paper.status, step)) throw new HttpError(400, 'خطوة غير متاحة الآن. / This step is not available now.', 'WRONG_STEP');
    if (cert.status !== 'Valid') throw new HttpError(400, 'الشهادة غير سارية. / The certificate is not valid.');
    const now = new Date();
    const note = str(req.body.note, 300);
    if (step === 'printed') paper.printedAt = now;
    if (step === 'ready') { paper.readyAt = now; paper.method = 'pickup'; }
    if (step === 'shipped') {
        paper.shippedAt = now;
        paper.method = 'shipping';
        paper.carrier = str(req.body.carrier, 80);
        paper.trackingNo = str(req.body.trackingNo, 80);
    }
    if (step === 'delivered') {
        const receivedBy = str(req.body.receivedBy, 160);
        if (!receivedBy) throw new HttpError(400, 'اكتب اسم المستلم. / Write who received it.', 'RECEIVER_REQUIRED');
        paper.deliveredAt = now;
        paper.receivedBy = receivedBy;
        paper.handedBy = req.user.id;
        if (!paper.method) paper.method = 'pickup';
    }
    paper.status = step;
    cert.delivery.log.push({ step, note: [note, step === 'shipped' ? [paper.carrier, paper.trackingNo].filter(Boolean).join(' ') : '', step === 'delivered' ? paper.receivedBy : ''].filter(Boolean).join(' · '), by: req.user.id, byName: req.user.name, at: now });
    await cert.save();
    if (cert.customer) await addEvent(req, cert.customer, 'certificate', `${cert.cert_num}: paper ${step}${step === 'delivered' ? ` → ${paper.receivedBy}` : ''}`);
    const customer = cert.customer ? await Customer.findById(cert.customer).select('user') : null;
    if (customer && customer.user && ['ready', 'shipped'].includes(step)) {
        await notify(customer.user, {
            type: 'certificate_paper',
            titleAr: step === 'ready' ? `شهادتك الورقية جاهزة للاستلام: ${cert.cert_num}` : `تم شحن شهادتك الورقية: ${cert.cert_num}`,
            titleEn: step === 'ready' ? `Your paper certificate is ready for pickup: ${cert.cert_num}` : `Your paper certificate was shipped: ${cert.cert_num}`,
            bodyAr: step === 'shipped' ? [paper.carrier, paper.trackingNo].filter(Boolean).join(' ') : '',
            link: `/certificates/${cert._id}`
        });
    }
    await audit.record(req, { action: `certificate.paper_${step}`, resource: 'certificates', resourceId: cert._id, summary: cert.cert_num, reason: note });
    res.json({ item: cert });
};

exports._verifyUrl = verifyUrl;
exports._issueOne = issueOne;
exports.reissueOne = reissueOne;
exports._paymentCheck = paymentCheck;
exports._emailCertificate = emailCertificate;
