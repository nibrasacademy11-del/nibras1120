// Certificates issue themselves (PLAN-V2 §5): when a module completes, or the program, and the
// program is paid in full, the certificate is issued and emailed, and appears on the customer's
// profile. While money is owed nothing is issued and the customer sees nothing (decision 1); the
// moment a payment clears the balance, what was waiting is issued. Customer service or the owner
// may release one earlier with a written reason (the "waive" in the certificates page).

const Enrollment = require('../../models/Enrollment');
const Certificate = require('../../models/Certificate');
const Cohort = require('../../models/Cohort');
const R = require('../../lib/certificateRules');
const certs = require('./certificateController');

const ACTIVE = ['active', 'on_hold', 'completed'];
// Runs as "the system": certificates it issues carry no person as issuer
const systemReq = () => ({ ip: '', get: () => '', user: { id: null, name: 'النظام', role: 'system', grants: {}, teamIds: [] } });

// The certificates an enrollment has earned and does not have yet, as the group's rule allows
// (modules, the program, or both)
async function due(e) {
    const cohort = e.cohort ? await Cohort.findById(e.cohort).select('certificateRule').lean() : null;
    const rule = R.normalizeRule((cohort && cohort.certificateRule) || {});
    const issued = await Certificate.find({ enrollment: e._id, status: { $in: ['Valid', 'Suspended'] }, kind: { $in: ['module', 'program'] } }).select('module kind').lean();
    const has = new Set(issued.map((c) => (c.kind === 'module' ? String(c.module) : 'program')));
    const items = [];
    if (rule.issue !== 'program') {
        for (const m of e.modules) if (m.certificate && m.status === 'approved' && !has.has(String(m.module))) items.push({ module: m.module, titleAr: m.titleAr });
    }
    if (rule.issue !== 'modules' && e.eligibleForFinalCertificate && !has.has('program')) items.push({ module: null, titleAr: e.programTitleAr });
    return { items, rule };
}

// Issues what the enrollment has earned if nothing is owed. Returns { issued: [numbers], held }.
async function issueDue(enrollmentId) {
    const e = await Enrollment.findById(enrollmentId);
    if (!e || !ACTIVE.includes(e.status)) return { issued: [], held: false };
    const { items, rule } = await due(e);
    if (!items.length) return { issued: [], held: false };
    const pay = await certs._paymentCheck(e);
    if (!pay.clear) return { issued: [], held: true };
    const issued = [];
    const req = systemReq();
    for (const it of items) {
        try {
            const c = await certs._issueOne(req, { enrollmentId: e._id, moduleId: it.module, templateId: rule.template, email: true });
            issued.push(c.cert_num);
        } catch (err) {
            if (err.code !== 'DUPLICATE' && err.code !== 11000) console.error('Automatic certificate failed:', String(e._id), it.titleAr, err.message);
        }
    }
    return { issued, held: false };
}

// Never lets a certificate problem break the work that triggered it (a lecture, a payment)
async function safely(fn) {
    try {
        return await fn();
    } catch (err) {
        console.error('Automatic certificates:', err.message);
        return null;
    }
}

const afterProgress = (enrollmentIds) => safely(async () => {
    const out = [];
    for (const id of [...new Set(enrollmentIds.map(String))]) out.push(await issueDue(id));
    return out;
});

// A confirmed payment may clear the balance: the customer's earned certificates follow at once
const afterPayment = (customerId) => safely(async () => {
    const es = await Enrollment.find({
        customer: customerId,
        status: { $in: ACTIVE },
        $or: [{ modules: { $elemMatch: { status: 'approved', certificate: true } } }, { eligibleForFinalCertificate: true }]
    }).select('_id').lean();
    const issued = [];
    for (const e of es) issued.push(...(await issueDue(e._id)).issued);
    return issued;
});

module.exports = { issueDue, afterProgress, afterPayment, systemReq };
