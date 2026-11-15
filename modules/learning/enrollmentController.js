const mongoose = require('mongoose');
const Enrollment = require('../../models/Enrollment');
const Course = require('../../models/Course');
const ProgramModule = require('../../models/ProgramModule');
const Cohort = require('../../models/Cohort');
const Customer = require('../../models/Customer');
const Team = require('../../models/Team');
const User = require('../../models/User');
const audit = require('../../lib/audit');
const P = require('../../lib/permissions');
const workflow = require('../../lib/moduleWorkflow');
const { teamOf } = require('../../lib/teams');
const { nextNumber } = require('../../lib/sequence');
const { customerAccess } = require('../../lib/customerAccess');
const { HttpError, assertVersion, paging } = require('../../lib/http');
const { addEvent, notify, getSetting } = require('../crm/service');
const groups = require('./groups');
const progress = require('./progress');
const CohortMember = require('../../models/CohortMember');

// Enrollments: a customer in a program, with each module progressing on its own

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const FIELDS = { owner: 'owner', team: 'team' };
const POP = [
    { path: 'customer', select: 'customerNo nameAr nameEn owner' },
    { path: 'owner', select: 'name' },
    { path: 'team', select: 'nameAr nameEn leader' },
    { path: 'cohort', select: 'nameAr nameEn startDate status' }
];

// Customers see their own enrollments: those of the customer files linked to their account
async function scopeFilter(req, scope) {
    if (req.user.role === 'customer') {
        const files = await Customer.find({ user: req.user.id }).select('_id').lean();
        return { customer: { $in: files.map((f) => f._id) } };
    }
    return P.scopeFilter(scope, req.user, FIELDS);
}

function inScope(req, permission, enrollment) {
    const scope = P.scopeFor(req.user.grants, permission);
    return !!scope && P.recordInScope(scope, req.user, enrollment, FIELDS);
}

// What this user may do on this enrollment's modules
async function workflowContext(req, enrollment) {
    const approveScope = P.scopeFor(req.user.grants, 'enrollments.approve');
    const teamId = enrollment.team ? String(enrollment.team._id || enrollment.team) : null;
    const team = teamId ? await Team.findById(teamId).select('leader').lean() : null;
    const needsTeamLeader = !!(team && team.leader) && (await getSetting('enrollments.teamLeaderReview')) !== false;
    return {
        roles: {
            worker: inScope(req, 'enrollments.update', enrollment),
            teamLeader: approveScope === 'team' && !!teamId && req.user.teamIds.includes(teamId),
            admin: approveScope === 'all'
        },
        needsTeamLeader,
        leader: team && team.leader
    };
}

async function view(req, enrollment) {
    const e = enrollment.toObject ? enrollment.toObject() : enrollment;
    const ctx = req.user.role === 'customer' ? null : await workflowContext(req, enrollment);
    return {
        ...e,
        progress: workflow.completion(e.modules, e.modulesRequired),
        modules: e.modules.map((m) => ({
            ...m,
            actions: ctx ? workflow.availableActions(m, ctx) : [],
            // Customers see progress, not the internal review notes
            ...(req.user.role === 'customer' ? { reviews: undefined, history: undefined, teamLeaderReview: undefined } : {})
        })),
        permissions: ctx ? {
            canUpdate: ctx.roles.worker,
            canManage: inScope(req, 'enrollments.manage', enrollment),
            needsTeamLeader: ctx.needsTeamLeader
        } : {}
    };
}

async function load(req, id, permission = 'enrollments.view') {
    const e = await Enrollment.findById(id).populate(POP);
    if (!e) throw new HttpError(404, 'Not found.');
    if (req.user.role === 'customer') {
        const mine = await Customer.exists({ _id: e.customer._id, user: req.user.id });
        if (!mine) throw new HttpError(404, 'Not found.');
    } else if (!inScope(req, permission, e)) {
        throw new HttpError(permission === 'enrollments.view' ? 404 : 403, permission === 'enrollments.view' ? 'Not found.' : 'Forbidden.');
    }
    return e;
}

const snapshot = (m) => ({ module: m._id, order: m.order, titleAr: m.titleAr, titleEn: m.titleEn, required: m.required, certificate: m.certificate, status: 'not_started', history: [] });

// ---- list and read ----

exports.list = async (req, res) => {
    const { limit, page, skip } = paging(req.query);
    const and = [await scopeFilter(req, req.scope)];
    const q = req.query;
    if (oid(q.program)) and.push({ program: oid(q.program) });
    if (oid(q.cohort)) and.push({ cohort: oid(q.cohort) });
    if (oid(q.customer)) and.push({ customer: oid(q.customer) });
    if (oid(q.owner)) and.push({ owner: oid(q.owner) });
    if (q.mine === '1') and.push({ owner: req.user.id });
    if (q.status) and.push({ status: String(q.status) });
    if (q.moduleStatus) and.push({ 'modules.status': String(q.moduleStatus) });
    const filter = { $and: and };
    const [items, total] = await Promise.all([
        Enrollment.find(filter).populate(POP).sort({ enrolledAt: -1 }).skip(skip).limit(limit).lean(),
        Enrollment.countDocuments(filter)
    ]);
    res.json({
        items: items.map((e) => ({ ...e, modules: undefined, progress: workflow.completion(e.modules, e.modulesRequired), moduleStatuses: e.modules.map((m) => m.status) })),
        total, page, limit
    });
};

exports.get = async (req, res) => {
    const e = await load(req, req.params.id);
    res.json({ item: await view(req, e) });
};

// Enrollments of one customer file, for its Programs tab
exports.forCustomer = async (req, res) => {
    const customer = await Customer.findById(req.params.id).select('owner team');
    if (!customer) throw new HttpError(404, 'Not found.');
    const access = customerAccess({ actor: req.user, grants: req.user.grants, customer });
    if (!access.inFile) throw new HttpError(404, 'Not found.');
    const items = await Enrollment.find({ customer: customer._id }).populate(POP).sort({ enrolledAt: -1 });
    res.json({ items: await Promise.all(items.map((e) => view(req, e))) });
};

// The signed-in customer's own programs
exports.mine = async (req, res) => {
    const files = await Customer.find({ user: req.user.id }).select('_id').lean();
    const items = await Enrollment.find({ customer: { $in: files.map((f) => f._id) }, status: { $ne: 'cancelled' } })
        .populate({ path: 'cohort', select: 'nameAr nameEn startDate schedule' }).sort({ enrolledAt: -1 });
    const paths = await progress.pathFor(items, files.map((f) => f._id));
    res.json({ items: await Promise.all(items.map(async (e) => ({ ...(await view(req, e)), path: paths[String(e._id)] }))) });
};

// ---- create and change ----

exports.create = async (req, res) => {
    const customer = await Customer.findById(oid(req.body.customer));
    if (!customer || customer.status === 'merged') throw new HttpError(404, 'Not found.');
    const access = customerAccess({ actor: req.user, grants: req.user.grants, customer });
    if (!access.inFile && req.scope !== 'all') throw new HttpError(403, 'Forbidden.');
    const program = await Course.findById(oid(req.body.program)).select('titleAr titleEn modulesRequired');
    if (!program) throw new HttpError(400, 'اختر البرنامج. / Choose the program.');

    let cohort = null;
    if (req.body.cohort) {
        cohort = await Cohort.findOne({ _id: oid(req.body.cohort), program: program._id });
        if (!cohort) throw new HttpError(400, 'المجموعة لا تتبع هذا البرنامج. / The group is not part of this program.');
        if (cohort.capacity > 0 && (await groups.activeCount(cohort._id)) >= cohort.capacity) {
            throw new HttpError(409, 'المجموعة مكتملة. / The group is full.', 'COHORT_FULL');
        }
    }

    // No group chosen: the nearest open group of the program, or the waiting list until one opens
    let waiting = false;
    if (!cohort && req.body.autoGroup !== false) {
        cohort = await groups.nearestOpenGroup(program._id);
        waiting = !cohort;
    }

    const owner = oid(req.body.owner) || customer.owner || oid(req.user.id);
    if (String(owner) !== req.user.id && req.scope === 'own' && String(owner) !== String(customer.owner)) {
        throw new HttpError(403, 'لا يمكنك إسناد التسجيل لموظف آخر. / You cannot assign the enrollment to someone else.');
    }
    const e = await createEnrollment(req, { customer, program, cohort, owner, enrolledAt: req.body.enrolledAt ? new Date(req.body.enrolledAt) : new Date(), notes: str(req.body.notes, 2000), waiting });
    res.status(201).json({ item: await view(req, await Enrollment.findById(e._id).populate(POP)) });
};

// A program without modules (a course) studies as one module named after it, made once
async function singleModule(program) {
    const p = program.titleAr ? program : await Course.findById(program._id).select('titleAr titleEn');
    return ProgramModule.findOneAndUpdate(
        { program: program._id, auto: true },
        { $setOnInsert: { program: program._id, auto: true, order: 1, titleAr: p.titleAr, titleEn: p.titleEn || '', required: true, certificate: true, active: true } },
        { upsert: true, returnDocument: 'after' }
    ).lean();
}

exports._singleModule = (program) => singleModule(program);

// Creates an enrollment with the program's current modules; also used when a group adds members
async function createEnrollment(req, { customer, program, cohort = null, owner = null, enrolledAt = new Date(), notes = '', waiting = false }) {
    const team = owner ? await teamOf(owner) : null;
    let modules = await ProgramModule.find({ program: program._id, active: true }).sort({ order: 1 }).lean();
    if (!modules.length) modules = [await singleModule(program)];
    // Checked here too, not only by the unique index: a new database may not have built the index yet
    if (await Enrollment.exists({ customer: customer._id, program: program._id, status: { $in: Enrollment.OPEN_STATUSES } })) {
        throw new HttpError(409, 'العميل مسجل في هذا البرنامج بالفعل. / The customer is already enrolled in this program.', 'ALREADY_ENROLLED');
    }
    const { number } = await nextNumber('enrollment');

    let e;
    try {
        e = await Enrollment.create({
            enrollmentNo: number,
            customer: customer._id,
            customerUser: customer.user || null,
            program: program._id,
            programTitleAr: program.titleAr,
            programTitleEn: program.titleEn || '',
            cohort: cohort ? cohort._id : null,
            owner,
            team,
            ownerHistory: owner ? [{ owner, team, from: new Date(), by: req.user.id, reason: 'enrolled' }] : [],
            enrolledAt,
            modules: modules.map(snapshot),
            modulesRequired: program.modulesRequired || 0,
            waitingSince: waiting ? new Date() : null,
            notes,
            createdBy: req.user.id
        });
    } catch (err) {
        if (err.code === 11000 && err.keyPattern && err.keyPattern.program) {
            throw new HttpError(409, 'العميل مسجل في هذا البرنامج بالفعل. / The customer is already enrolled in this program.', 'ALREADY_ENROLLED');
        }
        throw err;
    }

    if (['lead', 'interested', 'inactive', 'lost'].includes(customer.status)) {
        const from = customer.status;
        customer.status = 'customer';
        await customer.save();
        await addEvent(req, customer._id, 'status_changed', `${from} → customer (enrolled)`);
    }
    await addEvent(req, customer._id, 'enrolled', `${e.enrollmentNo}: ${program.titleAr}${cohort ? ` · ${cohort.nameAr}` : ''} (${modules.length} modules)`);
    await audit.record(req, { action: 'enrollment.created', resource: 'enrollments', resourceId: e._id, summary: `${e.enrollmentNo} ${customer.customerNo} → ${program.titleAr}` });
    if (cohort) await groups.addMember({ cohort, customer, enrollment: e._id, by: req.user.id, via: 'enrollment' });
    // The customer is told by email: the program, the group and when it starts (PLAN-V2 §6 #5)
    const customerEmails = require('../../lib/customerEmails');
    const to = await customerEmails.emailOf(customer).catch(() => '');
    if (to) await customerEmails.enrolled(to, { name: customer.nameAr, program: program.titleAr, group: cohort && cohort.nameAr, startDate: cohort && cohort.startDate, waiting });
    return e;
}
exports.createEnrollment = createEnrollment;

const STATUS_NEEDS_REASON = ['on_hold', 'withdrawn', 'cancelled'];

exports.update = async (req, res) => {
    const e = await load(req, req.params.id, 'enrollments.update');
    assertVersion(e, req.body.__v);
    const reason = str(req.body.reason, 500);
    const changes = {};

    if (req.body.status !== undefined && req.body.status !== e.status) {
        if (!Enrollment.ENROLLMENT_STATUSES.includes(req.body.status)) throw new HttpError(400, 'Invalid status.');
        if (STATUS_NEEDS_REASON.includes(req.body.status) && !reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
        if (req.body.status === 'completed' && P.scopeFor(req.user.grants, 'enrollments.approve') !== 'all') throw new HttpError(403, 'Forbidden.');
        if (req.body.status === 'cancelled' && !inScope(req, 'enrollments.manage', e)) throw new HttpError(403, 'Forbidden.');
        changes.status = { from: e.status, to: req.body.status };
        e.status = req.body.status;
        e.statusReason = reason;
        e.completedAt = e.status === 'completed' ? new Date() : null;
    }
    if (req.body.cohort !== undefined && String(req.body.cohort || '') !== String(e.cohort?._id || '')) {
        const cohort = req.body.cohort ? await Cohort.findOne({ _id: oid(req.body.cohort), program: e.program }) : null;
        if (req.body.cohort && !cohort) throw new HttpError(400, 'المجموعة لا تتبع هذا البرنامج. / The group is not part of this program.');
        if (cohort && cohort.capacity > 0 && (await groups.activeCount(cohort._id)) >= cohort.capacity) {
            throw new HttpError(409, 'المجموعة مكتملة. / The group is full.', 'COHORT_FULL');
        }
        changes.cohort = { from: e.cohort ? e.cohort.nameAr : null, to: cohort ? cohort.nameAr : null };
        // Membership follows the enrollment's group, so lectures show in the right place
        if (e.cohort) {
            await CohortMember.updateOne(
                { cohort: e.cohort._id || e.cohort, customer: e.customer._id || e.customer, status: 'active' },
                { $set: { status: 'removed', removedAt: new Date(), removedBy: req.user.id, removeReason: 'Moved to another group' } }
            );
        }
        if (cohort) await groups.addMember({ cohort, customer: await Customer.findById(e.customer._id || e.customer), enrollment: e._id, by: req.user.id, via: 'enrollment' });
        e.cohort = cohort ? cohort._id : null;
    }
    if (req.body.notes !== undefined) e.notes = str(req.body.notes, 2000);

    // Moving the enrollment to another employee follows the same rules as a customer transfer
    if (req.body.owner !== undefined && String(req.body.owner) !== String(e.owner?._id || '')) {
        if (!inScope(req, 'enrollments.manage', e)) throw new HttpError(403, 'Forbidden.');
        if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
        const to = oid(req.body.owner);
        const u = to && await User.findById(to).select('status role name');
        if (!u || u.status === 'disabled' || !P.isStaffRole(u.role)) throw new HttpError(400, 'الموظف غير نشط. / The employee is not active.');
        const team = await teamOf(to);
        const open = e.ownerHistory.find((h) => !h.to);
        if (open) open.to = new Date();
        e.ownerHistory.push({ owner: to, team, from: new Date(), by: req.user.id, reason });
        changes.owner = { from: e.owner ? e.owner.name : null, to: u.name };
        e.owner = to;
        e.team = team;
        await notify(to, { type: 'enrollment_assigned', titleAr: `تم إسناد التسجيل ${e.enrollmentNo} إليك`, titleEn: `Enrollment ${e.enrollmentNo} was assigned to you`, link: `/enrollments/${e._id}` });
    }

    await e.save();
    if (Object.keys(changes).length) {
        await addEvent(req, e.customer._id, 'enrollment_updated', `${e.enrollmentNo}: ${Object.keys(changes).join(', ')}`, { meta: changes });
        await audit.record(req, { action: 'enrollment.updated', resource: 'enrollments', resourceId: e._id, summary: e.enrollmentNo, reason, changes });
    }
    res.json({ item: await view(req, await Enrollment.findById(e._id).populate(POP)) });
};

// Adds program modules created after the customer enrolled
exports.syncModules = async (req, res) => {
    const e = await load(req, req.params.id, 'enrollments.update');
    const have = new Set(e.modules.map((m) => String(m.module)));
    const missing = await ProgramModule.find({ program: e.program, active: true, _id: { $nin: [...have] } }).sort({ order: 1 }).lean();
    for (const m of missing) e.modules.push(snapshot(m));
    e.modules.sort((a, b) => a.order - b.order);
    if (missing.length) {
        const c = workflow.completion(e.modules, e.modulesRequired);
        e.eligibleForFinalCertificate = c.complete;
        await e.save();
        await addEvent(req, e.customer._id, 'enrollment_updated', `${e.enrollmentNo}: ${missing.length} modules added`);
        await audit.record(req, { action: 'enrollment.modules_added', resource: 'enrollments', resourceId: e._id, summary: `${e.enrollmentNo}: ${missing.map((m) => m.titleAr).join(', ')}` });
    }
    res.json({ added: missing.length, item: await view(req, await Enrollment.findById(e._id).populate(POP)) });
};

// ---- module progress ----

const NOTE_REQUIRED = ['team_leader_reject', 'reject', 'reopen'];

exports.transition = async (req, res) => {
    const e = await load(req, req.params.id, 'enrollments.view');
    if (!Enrollment.OPEN_STATUSES.includes(e.status) && e.status !== 'completed') {
        throw new HttpError(400, 'التسجيل غير نشط. / The enrollment is not active.');
    }
    assertVersion(e, req.body.__v);
    const mod = e.modules.find((m) => String(m.module) === String(req.params.moduleId));
    if (!mod) throw new HttpError(404, 'Not found.');
    const action = String(req.body.action || '');
    const note = str(req.body.note, 1000);
    if (NOTE_REQUIRED.includes(action) && !note) throw new HttpError(400, 'اكتب السبب. / Write the reason.', 'REASON_REQUIRED');

    const ctx = await workflowContext(req, e);
    const result = workflow.check(action, mod, ctx);
    if (!result.ok) {
        const messages = {
            wrong_status: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية للمحور. / Not possible in the module’s current status.',
            needs_team_leader_review: 'يجب أن يراجع قائد الفريق المحور أولاً. / The team leader must review the module first.',
            already_reviewed: 'راجع قائد الفريق هذا المحور بالفعل. / The team leader already reviewed it.',
            not_allowed: 'ليس لديك صلاحية لهذا الإجراء. / You do not have permission for this action.'
        };
        throw new HttpError(result.reason === 'not_allowed' ? 403 : 400, messages[result.reason] || 'Not allowed.', result.reason.toUpperCase());
    }

    const now = new Date();
    const from = mod.status;
    const by = { by: req.user.id, byName: req.user.name, at: now };
    if (action === 'start' || action === 'rework') mod.startedAt = mod.startedAt || now;
    if (action === 'submit') {
        mod.submittedAt = now;
        mod.teamLeaderReview = null;
        mod.rejectionReason = '';
    }
    if (action === 'team_leader_approve' || action === 'team_leader_reject') {
        const review = { stage: 'team_leader', decision: action === 'team_leader_approve' ? 'approved' : 'rejected', note, ...by };
        mod.teamLeaderReview = review;
        mod.reviews.push(review);
    }
    if (action === 'approve' || action === 'reject') {
        mod.reviews.push({ stage: 'admin', decision: action === 'approve' ? 'approved' : 'rejected', note, ...by });
    }
    if (action === 'approve') {
        mod.approvedAt = now;
        mod.approvedBy = req.user.id;
    }
    if (result.to === 'rejected') mod.rejectionReason = note;
    if (action === 'reopen') {
        mod.approvedAt = null;
        mod.approvedBy = null;
        mod.teamLeaderReview = null;
    }
    mod.status = result.to;
    mod.history.push({ from, to: result.to, note: note || action, ...by });

    const c = workflow.completion(e.modules, e.modulesRequired);
    const wasEligible = e.eligibleForFinalCertificate;
    e.eligibleForFinalCertificate = c.complete;
    if (c.complete && e.status === 'active') {
        e.status = 'completed';
        e.completedAt = now;
    } else if (!c.complete && e.status === 'completed') {
        e.status = 'active';
        e.completedAt = null;
    }
    await e.save();
    if (result.to === 'approved') await require('./autoCertificates').afterProgress([e._id]);

    const label = `${e.enrollmentNo} · ${mod.titleAr}`;
    await addEvent(req, e.customer._id, 'module', `${mod.titleAr}: ${from} → ${result.to}${note ? ` — ${note.slice(0, 120)}` : ''}`, { meta: { enrollment: String(e._id), action } });
    await audit.record(req, { action: `module.${action}`, resource: 'enrollments', resourceId: e._id, summary: label, reason: note, changes: { [`module:${mod.titleAr}`]: { from, to: result.to } } });

    // Tell the next person in the chain
    const link = `/enrollments/${e._id}`;
    if (action === 'submit') {
        if (ctx.needsTeamLeader && ctx.leader) {
            await notify(ctx.leader, { type: 'module_review', titleAr: `محور بانتظار مراجعتك: ${label}`, titleEn: `Module waiting for your review: ${label}`, link: '/reviews' });
        } else {
            await notifyAdmins({ type: 'module_review', titleAr: `محور بانتظار الاعتماد: ${label}`, titleEn: `Module waiting for approval: ${label}`, link: '/reviews' });
        }
    }
    if (action === 'team_leader_approve') {
        await notifyAdmins({ type: 'module_review', titleAr: `محور بانتظار الاعتماد النهائي: ${label}`, titleEn: `Module waiting for final approval: ${label}`, link: '/reviews' });
    }
    if (['approve', 'reject', 'team_leader_reject', 'reopen'].includes(action) && e.owner && String(e.owner._id || e.owner) !== req.user.id) {
        const ar = { approve: 'تم اعتماد', reject: 'تم رفض', team_leader_reject: 'رفض قائد الفريق', reopen: 'أعيد فتح' }[action];
        const en = { approve: 'Approved', reject: 'Rejected', team_leader_reject: 'Rejected by the team leader', reopen: 'Reopened' }[action];
        await notify(e.owner._id || e.owner, { type: 'module_decision', titleAr: `${ar}: ${label}`, titleEn: `${en}: ${label}`, bodyAr: note, bodyEn: note, link });
    }
    if (!wasEligible && c.complete) await addEvent(req, e.customer._id, 'enrollment_completed', `${e.enrollmentNo}: all required modules approved`);

    res.json({ item: await view(req, await Enrollment.findById(e._id).populate(POP)) });
};

async function notifyAdmins(message) {
    const admins = await User.find({ role: 'super_admin', status: 'active' }).select('_id').lean();
    for (const a of admins) await notify(a._id, message);
}

// Modules waiting for this user's review: team leaders see their teams' submissions,
// admins see what is ready for final approval
exports.reviews = async (req, res) => {
    const approveScope = P.scopeFor(req.user.grants, 'enrollments.approve');
    if (!approveScope) throw new HttpError(403, 'Forbidden.');
    const filter = { 'modules.status': 'ready_for_review', status: { $in: [...Enrollment.OPEN_STATUSES, 'completed'] } };
    if (approveScope !== 'all') filter.team = { $in: req.user.teamIds };
    const items = await Enrollment.find(filter).populate(POP).sort({ updatedAt: 1 }).limit(500);
    const out = [];
    for (const e of items) {
        const ctx = await workflowContext(req, e);
        for (const m of e.modules) {
            if (m.status !== 'ready_for_review') continue;
            const actions = workflow.availableActions(m, ctx).filter((a) => a !== 'reopen');
            if (!actions.length) continue;
            out.push({
                enrollmentId: String(e._id), enrollmentNo: e.enrollmentNo, __v: e.__v,
                customer: e.customer, owner: e.owner, team: e.team, program: e.programTitleAr,
                module: { id: String(m.module), titleAr: m.titleAr, titleEn: m.titleEn, submittedAt: m.submittedAt, teamLeaderReview: m.teamLeaderReview },
                actions
            });
        }
    }
    res.json({ items: out });
};
