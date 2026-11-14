const mongoose = require('mongoose');
const Cohort = require('../../models/Cohort');
const CohortMember = require('../../models/CohortMember');
const Enrollment = require('../../models/Enrollment');
const Certificate = require('../../models/Certificate');
const CertificateTemplate = require('../../models/CertificateTemplate');
const P = require('../../lib/permissions');
const R = require('../../lib/certificateRules');
const workflow = require('../../lib/moduleWorkflow');
const audit = require('../../lib/audit');
const { customerAccess, displayName } = require('../../lib/customerAccess');
const { HttpError } = require('../../lib/http');
const { addEvent, notify, getSetting } = require('../crm/service');
const groups = require('./groups');
const certs = require('./certificateController');

// Certificates by group: the group's rule, who gets a certificate and who is held back (and why),
// issuing them together, approving a module for the whole group, and the daily automatic run.

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const MAX_RUN = 200;

// Runs as "the system" when the daily job issues certificates
const systemReq = () => ({ ip: '', get: () => '', user: { id: null, name: 'النظام', role: 'system', grants: {}, teamIds: [] } });

async function loadCohort(id) {
    const c = await Cohort.findById(id);
    if (!c) throw new HttpError(404, 'Not found.');
    return c;
}

// The group members' enrollments in the group's program
async function memberEnrollments(cohort) {
    const members = await CohortMember.find({ cohort: cohort._id, status: 'active' }).lean();
    const byCustomer = Object.fromEntries(members.map((m) => [String(m.customer), m]));
    const linked = members.map((m) => m.enrollment).filter(Boolean);
    const enrollments = await Enrollment.find({
        $or: [{ _id: { $in: linked } }, { customer: { $in: members.map((m) => m.customer) }, program: cohort.program }],
        status: { $in: ['active', 'on_hold', 'completed'] }
    }).populate('customer', 'customerNo nameAr owner team user');
    // One enrollment per member: the linked one, else the newest in the program
    const pick = {};
    for (const e of enrollments.sort((a, b) => b.enrolledAt - a.enrolledAt)) {
        const key = String(e.customer._id);
        if (!byCustomer[key]) continue;
        const m = byCustomer[key];
        if (!pick[key] || (m.enrollment && String(m.enrollment) === String(e._id))) pick[key] = e;
    }
    return Object.values(pick);
}

// Every certificate the group's rule covers, with what holds each one back
async function plan(cohort) {
    const rule = R.normalizeRule(cohort.certificateRule || {});
    const enrollments = await memberEnrollments(cohort);
    const covered = (cohort.modules || []).map(String);
    const [stats, issued] = await Promise.all([
        groups.attendanceStats(cohort._id),
        Certificate.find({ enrollment: { $in: enrollments.map((e) => e._id) }, status: { $in: ['Valid', 'Suspended'] }, kind: { $in: ['module', 'program'] } }).select('enrollment module kind cert_num').lean()
    ]);
    const has = new Set(issued.map((c) => `${c.enrollment}:${c.kind === 'module' ? c.module : 'program'}`));
    const items = [];
    const moduleSummary = {};
    for (const e of enrollments) {
        const pay = await certs._paymentCheck(e);
        const s = stats.byCustomer[String(e.customer._id)];
        const rate = stats.held ? Math.round(((s ? s.n : 0) / stats.held) * 100) : null;
        const base = { enrollment: String(e._id), enrollmentNo: e.enrollmentNo, customer: e.customer, rate, remaining: pay.clear ? [] : pay.byCurrency };
        for (const m of e.modules) {
            if (covered.length && !covered.includes(String(m.module))) continue;
            const ms = (moduleSummary[String(m.module)] = moduleSummary[String(m.module)] || { module: String(m.module), titleAr: m.titleAr, titleEn: m.titleEn, counts: {} });
            ms.counts[m.status] = (ms.counts[m.status] || 0) + 1;
            if (rule.issue === 'program' || !m.certificate) continue;
            const isIssued = m.status === 'certificate_issued' || has.has(`${e._id}:${m.module}`);
            const reason = R.holdReason({ approved: workflow.DONE.includes(m.status), paid: pay.clear, rate, minAttendance: rule.minAttendance, issued: isIssued });
            items.push({ ...base, kind: 'module', module: String(m.module), titleAr: m.titleAr, titleEn: m.titleEn, reason });
        }
        if (rule.issue !== 'modules') {
            const reason = R.holdReason({ approved: e.eligibleForFinalCertificate, paid: pay.clear, rate, minAttendance: rule.minAttendance, issued: has.has(`${e._id}:program`) });
            items.push({ ...base, kind: 'program', module: null, titleAr: e.programTitleAr, titleEn: e.programTitleEn, reason });
        }
    }
    return { rule, held: stats.held, items, modules: Object.values(moduleSummary) };
}

// Issues the ready certificates (all, or those listed in `only`)
async function issueReady(req, cohort, { only = null } = {}) {
    const p = await plan(cohort);
    const wanted = only ? new Set(only.map((o) => `${o.enrollment}:${o.module || 'program'}`)) : null;
    const ready = p.items.filter((i) => i.reason === null && (!wanted || wanted.has(`${i.enrollment}:${i.module || 'program'}`))).slice(0, MAX_RUN);
    const results = [];
    for (const it of ready) {
        try {
            const c = await certs._issueOne(req, { enrollmentId: it.enrollment, moduleId: it.module, templateId: p.rule.template, email: p.rule.sendEmail });
            results.push({ ok: true, cert_num: c.cert_num, id: String(c._id), customerNo: it.customer.customerNo, emailError: c.$locals.emailError });
        } catch (err) {
            results.push({ ok: false, customerNo: it.customer.customerNo, title: it.titleAr, message: err.message, code: err.code });
        }
    }
    return results;
}

// ---- endpoints ----

exports.get = async (req, res) => {
    const cohort = await loadCohort(req.params.id);
    const p = await plan(cohort);
    const namePolicy = await getSetting('customers.lookupNamePolicy');
    const templates = await CertificateTemplate.find({ active: true }).select('name kind').lean();
    res.json({
        rule: p.rule,
        due: R.ruleDue(p.rule, cohort),
        held: p.held,
        modules: p.modules,
        templates,
        items: p.items.map((i) => {
            const access = customerAccess({ actor: req.user, grants: req.user.grants, customer: i.customer });
            return { ...i, customer: { _id: i.customer._id, customerNo: i.customer.customerNo, name: displayName(i.customer, access, namePolicy), canOpen: access.inFile } };
        }),
        canIssue: P.scopeFor(req.user.grants, 'certificates.create') === 'all',
        canApprove: P.scopeFor(req.user.grants, 'enrollments.approve') === 'all'
    });
};

exports.saveRule = async (req, res) => {
    const cohort = await loadCohort(req.params.id);
    const before = R.normalizeRule(cohort.certificateRule || {});
    const rule = R.normalizeRule(req.body, before);
    if (rule.mode === 'on_date' && !rule.date) throw new HttpError(400, 'حدد تاريخ الإصدار. / Set the issue date.');
    if (rule.mode === 'after_end' && !cohort.endDate) throw new HttpError(400, 'حدد تاريخ نهاية المجموعة أولاً. / Set the group end date first.');
    if (rule.template && !(await CertificateTemplate.exists({ _id: oid(rule.template), active: true }))) throw new HttpError(400, 'القالب غير متاح. / The template is not available.');
    cohort.certificateRule = rule;
    await cohort.save();
    await audit.record(req, { action: 'cohort.certificate_rule', resource: 'certificates', resourceId: cohort._id, summary: `${cohort.nameAr}: ${rule.mode}`, changes: audit.diff(before, rule, Object.keys(rule)) });
    res.json({ rule });
};

exports.issue = async (req, res) => {
    const cohort = await loadCohort(req.params.id);
    const only = Array.isArray(req.body.items) ? req.body.items.slice(0, MAX_RUN) : null;
    const results = await issueReady(req, cohort, { only });
    await audit.record(req, { action: 'cohort.certificates_issued', resource: 'certificates', resourceId: cohort._id, summary: `${cohort.nameAr}: ${results.filter((r) => r.ok).length} issued`, meta: { failed: results.filter((r) => !r.ok).length } });
    res.json({ results });
};

// The admin approves one module for the whole group (or the chosen members) in one step
exports.approveModule = async (req, res) => {
    const cohort = await loadCohort(req.params.id);
    const moduleId = String(oid(req.body.module) || '');
    if (!moduleId) throw new HttpError(400, 'اختر المحور. / Choose the module.');
    const note = str(req.body.note, 500) || `Approved for group ${cohort.nameAr}`;
    const only = Array.isArray(req.body.enrollments) ? new Set(req.body.enrollments.map(String)) : null;
    const out = { approved: 0, already: 0, skipped: 0 };
    const approvedIds = [];
    const now = new Date();
    for (const e of await memberEnrollments(cohort)) {
        if (only && !only.has(String(e._id))) continue;
        const mod = e.modules.find((m) => String(m.module) === moduleId);
        if (!mod) { out.skipped++; continue; }
        if (workflow.DONE.includes(mod.status)) { out.already++; continue; }
        if (!R.GROUP_APPROVABLE.includes(mod.status)) { out.skipped++; continue; }
        const from = mod.status;
        const by = { by: req.user.id, byName: req.user.name, at: now };
        mod.startedAt = mod.startedAt || now;
        mod.status = 'approved';
        mod.approvedAt = now;
        mod.approvedBy = req.user.id;
        mod.rejectionReason = '';
        mod.reviews.push({ stage: 'admin', decision: 'approved', note, ...by });
        mod.history.push({ from, to: 'approved', note, ...by });
        const c = workflow.completion(e.modules, e.modulesRequired);
        e.eligibleForFinalCertificate = c.complete;
        if (c.complete && e.status === 'active') {
            e.status = 'completed';
            e.completedAt = now;
        }
        await e.save();
        await addEvent(req, e.customer._id, 'module', `${mod.titleAr}: ${from} → approved (${cohort.nameAr})`, { meta: { enrollment: String(e._id), action: 'group_approve' } });
        out.approved++;
        approvedIds.push(e._id);
    }
    // Paid-up members get their certificates now; the others when they pay
    if (approvedIds.length) await require('./autoCertificates').afterProgress(approvedIds);
    await audit.record(req, { action: 'module.group_approved', resource: 'enrollments', resourceId: cohort._id, summary: `${cohort.nameAr}: ${out.approved} approved`, reason: note, meta: { module: moduleId, ...out } });
    res.json(out);
};

// ---- the daily run ----

async function runDue() {
    const out = { groups: 0, issued: 0, failed: 0, heldUnpaid: 0 };
    const cohorts = await Cohort.find({ 'certificateRule.mode': { $in: ['on_approval', 'on_date', 'after_end'] }, status: { $ne: 'cancelled' } }).limit(100);
    const req = systemReq();
    for (const cohort of cohorts) {
        if (!R.ruleDue(cohort.certificateRule, cohort)) continue;
        out.groups++;
        try {
            const results = await issueReady(req, cohort);
            out.issued += results.filter((r) => r.ok).length;
            out.failed += results.filter((r) => !r.ok).length;
            // Approved but unpaid: the responsible employee and the customer are told once
            const p = await plan(cohort);
            for (const it of p.items.filter((i) => i.reason === 'unpaid')) {
                out.heldUnpaid++;
                const key = `cert-unpaid:${it.enrollment}:${it.module || 'program'}`;
                const owed = R.money(it.remaining);
                if (it.customer.owner) {
                    await notify(it.customer.owner, { type: 'certificate_unpaid', titleAr: `شهادة متوقفة على السداد: ${it.customer.customerNo}`, titleEn: `Certificate waiting for payment: ${it.customer.customerNo}`, bodyAr: `${it.titleAr} · المتبقي ${owed}`, bodyEn: `${it.titleEn || it.titleAr} · due ${owed}`, link: `/customers/${it.customer._id}`, dedupeKey: key });
                }
                if (it.customer.user) {
                    await notify(it.customer.user, { type: 'certificate_unpaid', titleAr: `شهادتك جاهزة بعد سداد المتبقي: ${owed}`, titleEn: `Your certificate is ready once ${owed} is paid`, bodyAr: it.titleAr, bodyEn: it.titleEn || it.titleAr, link: '/my-certificates', dedupeKey: `${key}:customer` });
                }
            }
        } catch (err) {
            out.failed++;
            console.error('Group certificates failed:', cohort._id, err.message);
        }
    }
    return out;
}

module.exports = Object.assign(exports, { plan, issueReady, runDue });
