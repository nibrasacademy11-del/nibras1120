// The customer's personal data on the website profile, and the requests to change it.
//
// The data printed on certificates is locked: a field that has a value changes only through a
// request that the owner or customer service approves (or by the owner, directly in the file).
// An empty field the customer may fill once, from the profile.

const mongoose = require('mongoose');
const Customer = require('../../models/Customer');
const User = require('../../models/User');
const ProfileRequest = require('../../models/ProfileRequest');
const Certificate = require('../../models/Certificate');
const data = require('../../lib/customerData');
const fieldCrypto = require('../../lib/fieldCrypto');
const audit = require('../../lib/audit');
const sessions = require('../../lib/sessions');
const accountEmails = require('../../lib/accountEmails');
const { HttpError } = require('../../lib/http');
const { addEvent, notify } = require('./service');

const FIELDS = ['nameAr', 'nameEn', 'phone', 'email', 'country', 'nationality', 'nationalId', 'passport', 'birthDate'];
const IDENTITY = { nationalId: 'national_id', passport: 'passport' };
const NAME_FIELDS = ['nameAr', 'nameEn'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const masked = (last4) => (last4 ? `••••${last4}` : '');
const siteUrl = (req) => process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
const profileLink = (req, lang) => `${siteUrl(req)}/pages/${lang === 'en' ? 'en' : 'ar'}/profile.html`;

// What the customer sees: identity numbers as the last four digits only
function currentValues(customer, user) {
    const id = customer.identity || {};
    return {
        nameAr: customer.nameAr || '',
        nameEn: customer.nameEn || '',
        phone: (customer.contact && customer.contact.phone) || user.phone || '',
        email: user.email || '',
        country: customer.country || '',
        nationality: id.nationality || '',
        nationalId: masked(id.nationalIdLast4),
        passport: masked(id.passportLast4),
        birthDate: day(id.birthDate)
    };
}

// One value checked and cleaned; throws with a message the customer understands
function cleanValue(field, raw) {
    const v = str(raw, 200);
    const bad = (ar, en) => { throw new HttpError(400, `${ar} / ${en}`, 'INVALID_VALUE'); };
    switch (field) {
        case 'nameAr':
            if (v.length < 5 || !/[؀-ۿ]/.test(v) || /[A-Za-z0-9]/.test(v)) bad('اكتب الاسم بالعربي كاملاً كما في الهوية', 'Write the full name in Arabic, as on the ID');
            return v.replace(/\s+/g, ' ');
        case 'nameEn':
            if (!/^[A-Za-z][A-Za-z .'-]{3,199}$/.test(v)) bad('اكتب الاسم بالحروف الإنجليزية كما في الجواز', 'Write the full name in English letters, as in the passport');
            return v.replace(/\s+/g, ' ');
        case 'phone': {
            const digits = data.normalizePhone(v);
            if (digits.length < 7 || digits.length > 16) bad('رقم الموبايل غير صحيح', 'The mobile number is not valid');
            return v.slice(0, 30);
        }
        case 'email': {
            const e = v.toLowerCase();
            if (!EMAIL_PATTERN.test(e)) bad('الإيميل غير صحيح', 'The email is not valid');
            return e;
        }
        case 'country':
        case 'nationality':
            if (v.length < 2) bad('اكتب القيمة كاملة', 'Write the full value');
            return v.slice(0, 80);
        case 'nationalId':
        case 'passport': {
            const clean = fieldCrypto.normalizeIdentifier(v);
            if (!/^[A-Z0-9]{5,30}$/.test(clean)) bad('رقم الهوية أو الجواز غير صحيح', 'The ID or passport number is not valid');
            return clean;
        }
        case 'birthDate': {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) bad('اختر تاريخ الميلاد', 'Choose the birth date');
            const d = new Date(`${v}T00:00:00Z`);
            const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
            if (Number.isNaN(d.getTime()) || age < 5 || age > 110) bad('تاريخ الميلاد غير صحيح', 'The birth date is not valid');
            return v;
        }
        default:
            throw new HttpError(400, 'حقل غير معروف. / Unknown field.', 'UNKNOWN_FIELD');
    }
}

// An email, ID or passport that already belongs to someone else is refused before anything is saved
async function assertFree(field, value, customer, user) {
    if (field === 'email' && await User.exists({ email: value, _id: { $ne: user._id } })) {
        throw new HttpError(409, 'هذا الإيميل مستخدم لحساب آخر. / This email belongs to another account.', 'EMAIL_TAKEN');
    }
    if (IDENTITY[field]) {
        const idx = fieldCrypto.blindIndex(value, IDENTITY[field]);
        const key = field === 'passport' ? 'identity.passportIdx' : 'identity.nationalIdIdx';
        if (await Customer.exists({ [key]: idx, _id: { $ne: customer._id }, status: { $ne: 'merged' } })) {
            throw new HttpError(409, 'هذا الرقم مسجل لعميل آخر، تواصل معنا. / This number belongs to another customer; please contact us.', 'IDENTITY_TAKEN');
        }
    }
}

// Writes one cleaned value into the file (and the account, for the name, phone and email)
function applyValue(customer, user, field, value) {
    switch (field) {
        case 'nameAr': customer.nameAr = value; user.name = value.slice(0, 120); break;
        case 'nameEn': customer.nameEn = value; break;
        case 'phone': customer.contact.phone = value; customer.contact.phoneNorm = data.normalizePhone(value); user.phone = value; break;
        case 'email': customer.contact.email = value; user.email = value; break;
        case 'country': customer.country = value; break;
        case 'nationality': customer.identity.nationality = value; break;
        case 'nationalId': Object.assign(customer.identity, data.identityFields('national_id', value)); break;
        case 'passport': Object.assign(customer.identity, data.identityFields('passport', value)); break;
        case 'birthDate': customer.identity.birthDate = new Date(`${value}T00:00:00Z`); break;
        default: break;
    }
}

async function myFile(req) {
    if (req.user.isStaff) throw new HttpError(403, 'هذه الصفحة لحسابات العملاء. / This page is for customer accounts.', 'CUSTOMERS_ONLY');
    const [user, customer] = await Promise.all([
        User.findById(req.user.id),
        Customer.findOne({ user: req.user.id, status: { $ne: 'merged' } }).sort({ createdAt: 1 })
    ]);
    if (!user) throw new HttpError(401, 'Unauthorized.');
    if (!customer) throw new HttpError(404, 'لا يوجد ملف مرتبط بحسابك، تواصل معنا. / No file is linked to your account; please contact us.', 'NO_FILE');
    return { user, customer };
}

const requestView = (r) => ({
    _id: r._id, status: r.status, reason: r.reason, decisionNote: r.decisionNote, createdAt: r.createdAt, decidedAt: r.decidedAt,
    changes: r.changes.map((c) => ({ field: c.field, from: c.from, to: c.to })), reissued: r.reissued || [], __v: r.__v
});

// ---- the customer ----

exports.mine = async (req, res) => {
    const { user, customer } = await myFile(req);
    const values = currentValues(customer, user);
    const requests = await ProfileRequest.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(10).lean();
    res.json({
        customerNo: customer.customerNo,
        account: { email: user.email, emailVerified: !!user.emailVerifiedAt, createdAt: user.createdAt },
        fields: FIELDS.map((f) => ({ field: f, value: values[f], locked: !!values[f] })),
        // either number is enough: once one is there the other is not asked for
        idGiven: !!(customer.identity && (customer.identity.nationalIdLast4 || customer.identity.passportLast4)),
        pending: requests.find((r) => r.status === 'pending') ? requestView(requests.find((r) => r.status === 'pending')) : null,
        history: requests.map(requestView)
    });
};

// Fills empty fields only; a field that has a value answers LOCKED
exports.complete = async (req, res) => {
    const { user, customer } = await myFile(req);
    if (req.body.confirm !== true) throw new HttpError(400, 'أكّد أن البيانات مطابقة للهوية. / Confirm the details match your ID.', 'CONFIRM_REQUIRED');
    const values = currentValues(customer, user);
    const input = req.body.values && typeof req.body.values === 'object' ? req.body.values : {};
    const filled = [];
    for (const field of FIELDS) {
        if (input[field] === undefined || str(input[field]) === '') continue;
        if (field === 'email') throw new HttpError(409, 'الإيميل يتغير بطلب تعديل. / The email changes by request.', 'LOCKED');
        if (values[field]) throw new HttpError(409, 'هذه البيانات مسجلة بالفعل ولا تتغير إلا بطلب تعديل. / This is already recorded and changes only by request.', 'LOCKED');
        const v = cleanValue(field, input[field]);
        await assertFree(field, v, customer, user);
        applyValue(customer, user, field, v);
        filled.push(field);
    }
    if (!filled.length) throw new HttpError(400, 'لا توجد بيانات جديدة. / Nothing new to save.', 'NOTHING');
    await customer.save();
    await user.save();
    await addEvent(req, customer._id, 'updated', `Completed by the customer on the website: ${filled.join(', ')}`, { section: filled.some((f) => IDENTITY[f] || f === 'nationality' || f === 'birthDate') ? 'identity' : 'general' });
    await audit.record(req, { action: 'customer.profile_completed', resource: 'customers', resourceId: customer._id, summary: `${customer.customerNo}: ${filled.join(', ')}` });
    res.json({ ok: true, filled });
};

exports.request = async (req, res) => {
    const { user, customer } = await myFile(req);
    if (await ProfileRequest.exists({ customer: customer._id, status: 'pending' })) {
        throw new HttpError(409, 'لديك طلب تعديل قيد المراجعة. انتظر الرد أو ألغه أولاً. / You already have a request under review.', 'PENDING_EXISTS');
    }
    const reason = str(req.body.reason, 500);
    if (reason.length < 5) throw new HttpError(400, 'اكتب سبب التعديل. / Write the reason for the change.', 'REASON_REQUIRED');
    const values = currentValues(customer, user);
    const input = req.body.changes && typeof req.body.changes === 'object' ? req.body.changes : {};
    const changes = [];
    for (const field of FIELDS) {
        if (input[field] === undefined || str(input[field]) === '') continue;
        const v = cleanValue(field, input[field]);
        if (IDENTITY[field]) {
            const last4 = v.slice(-4);
            const kind = field === 'passport' ? 'passport' : 'nationalId';
            const sameIdx = customer.identity && customer.identity[`${kind}Idx`] === fieldCrypto.blindIndex(v, IDENTITY[field]);
            if (sameIdx) continue;
            await assertFree(field, v, customer, user);
            changes.push({ field, from: values[field], to: masked(last4), toEnc: fieldCrypto.encrypt(v) });
        } else {
            if (v === values[field]) continue;
            await assertFree(field, v, customer, user);
            changes.push({ field, from: values[field], to: v });
        }
    }
    if (!changes.length) throw new HttpError(400, 'لم تغيّر أي بيانات. / Nothing was changed.', 'NOTHING');
    const r = await ProfileRequest.create({ customer: customer._id, user: user._id, changes, reason });
    await addEvent(req, customer._id, 'profile_request', `Change requested on the website: ${changes.map((c) => c.field).join(', ')} — ${reason}`);
    // The owner and customer service see it in their notifications
    const reviewers = await User.find({ role: { $in: ['super_admin', 'customer_support'] }, status: 'active' }).select('_id').lean();
    for (const u of reviewers) {
        await notify(u._id, { type: 'profile_request', titleAr: `طلب تعديل بيانات: ${customer.nameAr}`, titleEn: `Data change request: ${customer.nameEn || customer.nameAr}`, bodyAr: changes.map((c) => accountEmails.FIELD_LABELS[c.field]).join('، '), link: '/profile-requests' });
    }
    res.status(201).json({ item: requestView(r) });
};

exports.cancel = async (req, res) => {
    const { customer } = await myFile(req);
    const r = await ProfileRequest.findOne({ _id: oid(req.params.id), customer: customer._id });
    if (!r) throw new HttpError(404, 'Not found.');
    if (r.status !== 'pending') throw new HttpError(409, 'تم الرد على الطلب بالفعل. / The request was already answered.', 'ALREADY_DECIDED');
    r.status = 'cancelled';
    r.decidedAt = new Date();
    await r.save();
    await addEvent(req, customer._id, 'profile_request', 'Change request cancelled by the customer');
    res.json({ item: requestView(r) });
};

// ---- the owner and customer service ----

exports.list = async (req, res) => {
    const q = {};
    if (ProfileRequest.STATUSES.includes(req.query.status)) q.status = req.query.status;
    if (oid(req.query.customer)) q.customer = oid(req.query.customer);
    const items = await ProfileRequest.find(q).sort({ status: 1, createdAt: -1 }).limit(200)
        .populate('customer', 'customerNo nameAr nameEn').lean();
    const pending = await ProfileRequest.countDocuments({ status: 'pending' });
    res.json({
        pending,
        items: items.map((r) => ({ ...requestView(r), customer: r.customer, decidedByName: r.decidedByName }))
    });
};

// Certificates still in force get a new version with the corrected name
async function reissueForName(req, customer, why) {
    const { reissueOne } = require('../learning/certificateController');
    const certs = await Certificate.find({ customer: customer._id, status: { $in: ['Valid', 'Suspended'] }, kind: { $in: ['module', 'program'] } });
    const done = [];
    for (const c of certs) {
        try {
            const n = await reissueOne(req, c, { reason: why });
            done.push(n.cert_num);
        } catch (err) {
            console.error('Reissue after a name change failed:', c.cert_num, err.message);
        }
    }
    return done;
}
exports._reissueForName = reissueForName;

exports.decide = async (req, res) => {
    const r = await ProfileRequest.findById(oid(req.params.id));
    if (!r) throw new HttpError(404, 'Not found.');
    if (req.body.__v !== undefined && Number(req.body.__v) !== r.__v) throw new HttpError(409, 'تغيّر الطلب، حدّث الصفحة. / The request changed; reload.', 'STALE');
    if (r.status !== 'pending') throw new HttpError(409, 'تم الرد على الطلب بالفعل. / The request was already answered.', 'ALREADY_DECIDED');
    const decision = req.body.decision;
    if (!['approve', 'reject'].includes(decision)) throw new HttpError(400, 'Invalid decision.');
    const note = str(req.body.note, 500);
    if (decision === 'reject' && note.length < 3) throw new HttpError(400, 'اكتب سبب الرفض، سيصل للعميل. / Write why; the customer will read it.', 'REASON_REQUIRED');

    const customer = await Customer.findById(r.customer);
    const user = await User.findById(r.user);
    if (!customer || !user) throw new HttpError(404, 'Not found.');

    let reissued = [];
    if (decision === 'approve') {
        const before = currentValues(customer, user);
        let emailChanged = false;
        for (const c of r.changes) {
            const value = IDENTITY[c.field] ? fieldCrypto.decrypt(c.toEnc) : c.to;
            await assertFree(c.field, value, customer, user);   // still free at the time of approval
            applyValue(customer, user, c.field, value);
            if (c.field === 'email') emailChanged = true;
        }
        if (emailChanged) {
            // The new address is confirmed again, and old sessions end with the old address
            user.emailVerifiedAt = null;
            user.tokenVersion = (user.tokenVersion || 0) + 1;
        }
        await customer.save();
        await user.save();
        if (emailChanged) {
            await sessions.revokeAllSessions(user._id, { reason: 'email_changed' });
            await require('../../controllers/authController')._sendVerification(req, user, req.body.lang).catch(() => null);
        }
        if (r.changes.some((c) => NAME_FIELDS.includes(c.field))) {
            reissued = await reissueForName(req, customer, `Name corrected by request (${String(r._id).slice(-6)})`);
        }
        await audit.record(req, {
            action: 'customer.profile_request_approved', resource: 'customers', resourceId: customer._id, summary: customer.customerNo,
            reason: note || r.reason,
            changes: Object.fromEntries(r.changes.map((c) => [c.field, { from: IDENTITY[c.field] ? 'hidden' : before[c.field], to: IDENTITY[c.field] ? 'hidden' : c.to }]))
        });
    } else {
        await audit.record(req, { action: 'customer.profile_request_rejected', resource: 'customers', resourceId: customer._id, summary: customer.customerNo, reason: note });
    }

    r.status = decision === 'approve' ? 'approved' : 'rejected';
    r.decidedBy = req.user.id;
    r.decidedByName = req.user.name;
    r.decidedAt = new Date();
    r.decisionNote = note;
    r.reissued = reissued;
    await r.save();
    await addEvent(req, customer._id, 'profile_request', `Change request ${r.status}${note ? `: ${note}` : ''}${reissued.length ? ` — reissued ${reissued.join(', ')}` : ''}`);
    await notify(user._id, { type: 'profile_request', titleAr: r.status === 'approved' ? 'تم تعديل بياناتك' : 'بخصوص طلب تعديل بياناتك', titleEn: r.status === 'approved' ? 'Your details were updated' : 'About your change request', link: '/pages/ar/profile.html' });
    await accountEmails.profileDecision(user, r, { profileLink: profileLink(req, req.body.lang), reissued }).catch(() => {});
    res.json({ item: requestView(r), reissued });
};

exports.FIELDS = FIELDS;
exports._cleanValue = cleanValue;
