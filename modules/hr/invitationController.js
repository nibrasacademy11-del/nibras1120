// Team invitations: a team leader invites someone to their team; the person accepts or rejects
// from a private link; the owner or HR approves before the account works (setting
// teams.invitePolicy: 'approval' by default, or 'auto'). Nothing is activated just because a
// name or phone number was typed in.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Invitation = require('../../models/TeamInvitation');
const Team = require('../../models/Team');
const User = require('../../models/User');
const Employee = require('../../models/Employee');
const P = require('../../lib/permissions');
const A = require('../../lib/academy');
const audit = require('../../lib/audit');
const zones = require('../../lib/zones');
const { normalizePhone, normalizeEmail } = require('../../lib/customerData');
const { nextNumber } = require('../../lib/sequence');
const { HttpError } = require('../../lib/http');
const { brandedEmail } = require('../../lib/brandEmail');
const { isMailConfigured, createTransporter } = require('../../config/mailer');
const { notify, getSetting } = require('../crm/service');
const { assertNotPrimaryOwner } = require('../../lib/owner');

const DAYS = 7;
const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 160) => String(v ?? '').trim().slice(0, max);
const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
// an id whether or not the reference was populated
const idOf = (v) => (v && v._id ? v._id : v);
const step = (inv, status, by, note = '') => { inv.status = status; inv.history.push({ status, at: new Date(), by: by || null, note }); };

async function profile() {
    return { ...A.PROFILE_DEFAULT, ...((await getSetting('academy.profile')) || {}) };
}

// Pending invitations past their date become expired (also run by the daily job)
async function expireOld(now = new Date()) {
    const old = await Invitation.find({ status: 'pending', expiresAt: { $lt: now } }).populate('team', 'nameAr');
    for (const inv of old) {
        step(inv, 'expired', null, 'expired');
        inv.tokenHash = null;
        await inv.save();
        await notify(idOf(inv.invitedBy), { type: 'invitation.expired', titleAr: 'دعوة انتهت من غير رد', titleEn: 'An invitation expired without an answer', bodyAr: inv.team ? inv.team.nameAr : '', link: '/my-team', dedupeKey: `inv-exp:${inv._id}` });
    }
    return old.length;
}
exports.expireOld = expireOld;

// Which teams this person may invite to: the teams they lead (team scope), or any (all)
async function invitableTeams(req) {
    const scope = P.scopeFor(req.user.grants, 'teams.invite');
    if (scope === 'all') return Team.find({ active: true }).select('nameAr leader department').lean();
    if (scope === 'department') return Team.find({ active: true, _id: { $in: (req.user.departmentTeamIds || []).map(oid) } }).select('nameAr leader department').lean();
    if (scope === 'team') return Team.find({ active: true, leader: oid(req.user.id) }).select('nameAr leader department').lean();
    return [];
}

function listScope(req) {
    const scope = P.scopeFor(req.user.grants, 'teams.invite');
    if (scope === 'all') return {};
    if (scope === 'department') return { team: { $in: (req.user.departmentTeamIds || []).map(oid) } };
    return { $or: [{ invitedBy: oid(req.user.id) }, { team: { $in: (req.user.teamIds || []).map(oid) } }] };
}

const view = (i) => ({
    _id: i._id, team: i.team, invitedBy: i.invitedBy, name: i.name, phone: i.phone, email: i.email, jobTitle: i.jobTitle,
    status: i.status, expiresAt: i.expiresAt, acceptedAt: i.acceptedAt, decidedAt: i.decidedAt, decisionNote: i.decisionNote,
    createdAt: i.createdAt, history: i.history, __v: i.__v
});

exports.teams = async (req, res) => res.json({ items: await invitableTeams(req) });

exports.list = async (req, res) => {
    await expireOld();
    const filter = listScope(req);
    if (Invitation.STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const items = await Invitation.find(filter).populate('team', 'nameAr').populate('invitedBy', 'name').sort({ createdAt: -1 }).limit(300).lean();
    res.json({ items: items.map(view), policy: (await getSetting('teams.invitePolicy')) === 'auto' ? 'auto' : 'approval' });
};

// The link and the message are shown to the inviter once, so they can send them on WhatsApp
async function sendLink(req, inv, team, token) {
    const u = zones.urls(req);
    const link = `${u.staff}/portal/invite/${token}`;
    const prof = await profile();
    const leader = req.user.name;
    const textAr = `مرحباً ${inv.name}، ${leader} بيدعوك تنضم لفريق «${team.nameAr}» في ${prof.nameAr}. افتح اللينك علشان تقبل أو ترفض الدعوة (صالح ${DAYS} أيام): ${link}`;
    let emailed = false;
    if (inv.email && isMailConfigured()) {
        try {
            await createTransporter().sendMail({
                from: `"${prof.nameAr}" <${process.env.EMAIL_USER}>`,
                to: inv.email,
                subject: `دعوة للانضمام لفريق ${team.nameAr} - ${prof.nameAr}`,
                html: brandedEmail({ heading: `مرحباً ${inv.name}`, lines: [`${leader} بيدعوك تنضم لفريق «${team.nameAr}» في ${prof.nameAr}.`, `الدعوة صالحة ${DAYS} أيام، وبتشتغل مرة واحدة.`], button: { url: link, label: 'افتح الدعوة (قبول أو رفض)' }, noteEn: `${leader} invites you to join the team "${team.nameAr}" at ${prof.nameEn || 'Nibras Academy'}.`, footer: [prof.phone, prof.website].filter(Boolean).join(' · ') }),
                text: textAr
            });
            emailed = true;
            inv.emailedAt = new Date();
        } catch (e) {
            console.error('Invitation email failed:', e.message);
        }
    }
    const phone = String(inv.phone).replace(/\D/g, '').replace(/^0/, '20');
    return { link, emailed, whatsapp: `https://wa.me/${phone}?text=${encodeURIComponent(textAr)}`, message: textAr };
}

exports.create = async (req, res) => {
    const teams = await invitableTeams(req);
    // the team comes from what this person may invite to, never from the request alone
    const wanted = oid(req.body.team);
    const team = wanted ? teams.find((t) => String(t._id) === String(wanted)) : teams.length === 1 ? teams[0] : null;
    if (!team) throw new HttpError(403, 'مش مسموحلك تدعو لفريق ده. / You may not invite to this team.', 'FORBIDDEN');
    const name = str(req.body.name);
    const phone = str(req.body.phone, 30);
    const phoneKey = normalizePhone(phone);
    const rawEmail = str(req.body.email, 200);
    const email = rawEmail ? normalizeEmail(rawEmail) : '';
    if (name.length < 3) throw new HttpError(400, 'اكتب الاسم الكامل. / Enter the full name.', 'INVALID');
    if (phoneKey.length < 8) throw new HttpError(400, 'رقم التليفون مش صحيح. / The phone number is not valid.', 'INVALID');
    if (rawEmail && !email) throw new HttpError(400, 'الإيميل مش صحيح. / The email is not valid.', 'INVALID');

    // No second open invitation for the same person, and nobody who is already on the staff
    await expireOld();
    const open = await Invitation.findOne({ status: { $in: Invitation.OPEN }, $or: [{ phoneKey }, ...(email ? [{ email }] : [])] }).populate('team', 'nameAr').lean();
    if (open) throw new HttpError(409, `فيه دعوة مفتوحة للشخص ده بالفعل (${open.team ? open.team.nameAr : ''}). / There is already an open invitation for this person.`, 'DUPLICATE');
    const staffByEmail = email ? await User.findOne({ email, role: { $in: P.ROLES.filter((r) => r !== 'customer') }, status: 'active' }).select('_id').lean() : null;
    const empByPhone = await Employee.find({ status: 'active', phone: { $ne: '' } }).select('phone').lean();
    if (staffByEmail || empByPhone.some((e) => normalizePhone(e.phone) === phoneKey)) {
        throw new HttpError(409, 'الشخص ده موظف بالفعل. نقله بين الفرق بيكون من المالك أو الموارد البشرية. / This person is already on the staff.', 'ALREADY_STAFF');
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const inv = new Invitation({ team: team._id, invitedBy: req.user.id, name, phone, phoneKey, email, jobTitle: str(req.body.jobTitle, 120), tokenHash: hash(token), expiresAt: new Date(Date.now() + DAYS * 864e5) });
    step(inv, 'pending', req.user.id, 'invited');
    const sent = await sendLink(req, inv, team, token);
    await inv.save();
    await audit.record(req, { action: 'team.invitation_created', resource: 'teams', resourceId: inv._id, summary: `Invited ${name} to ${team.nameAr}`, meta: { team: String(team._id), emailed: sent.emailed } });
    res.status(201).json({ item: view(inv), ...sent });
};

// A fresh link (the old one stops working) and a fresh expiry
exports.resend = async (req, res) => {
    const inv = await Invitation.findOne({ _id: oid(req.params.id), ...listScope(req) }).populate('team', 'nameAr');
    if (!inv) throw new HttpError(404, 'Not found.');
    if (!['pending', 'expired'].includes(inv.status)) throw new HttpError(400, 'الدعوة دي مش مستنية رد. / This invitation is not waiting for an answer.');
    const token = crypto.randomBytes(32).toString('base64url');
    inv.tokenHash = hash(token);
    inv.expiresAt = new Date(Date.now() + DAYS * 864e5);
    step(inv, 'pending', req.user.id, 'link renewed');
    const sent = await sendLink(req, inv, inv.team, token);
    await inv.save();
    await audit.record(req, { action: 'team.invitation_renewed', resource: 'teams', resourceId: inv._id, summary: `Renewed the invitation of ${inv.name}` });
    res.json({ item: view(inv), ...sent });
};

exports.cancel = async (req, res) => {
    const inv = await Invitation.findOne({ _id: oid(req.params.id), ...listScope(req) });
    if (!inv) throw new HttpError(404, 'Not found.');
    if (!Invitation.OPEN.includes(inv.status)) throw new HttpError(400, 'الدعوة مقفولة بالفعل. / This invitation is already closed.');
    step(inv, 'cancelled', req.user.id, str(req.body.reason, 300));
    inv.tokenHash = null;
    inv.pendingPasswordHash = null;
    await inv.save();
    await audit.record(req, { action: 'team.invitation_cancelled', resource: 'teams', resourceId: inv._id, summary: `Cancelled the invitation of ${inv.name}`, reason: str(req.body.reason, 300) });
    res.json({ item: view(inv) });
};

// ---- the account and the membership, made only after acceptance (and approval) ----
async function activate(req, inv, actorId) {
    const team = await Team.findById(inv.team).select('nameAr department leader active');
    if (!team || !team.active) throw new HttpError(400, 'الفريق مش موجود أو موقوف. / The team does not exist or is inactive.');
    let user = inv.existingUser ? await User.findById(inv.existingUser) : null;
    if (user) {
        assertNotPrimaryOwner(user);
        if (await Employee.exists({ user: user._id, status: 'active' })) throw new HttpError(409, 'الشخص ده بقى موظف بالفعل. / This person is already on the staff.', 'ALREADY_STAFF');
        if (!P.isStaffRole(user.role)) { user.role = 'employee'; user.tokenVersion = (user.tokenVersion || 0) + 1; }
        user.status = 'active';
        await user.save();
    } else {
        const withPwd = await Invitation.findById(inv._id).select('+pendingPasswordHash');
        if (!withPwd.pendingPasswordHash) throw new HttpError(400, 'Missing password.');
        if (await User.exists({ email: inv.acceptedEmail })) throw new HttpError(409, 'الإيميل ده مستخدم لحساب تاني. / This email belongs to another account.', 'DUPLICATE');
        user = await User.create({ name: inv.name, email: inv.acceptedEmail, phone: inv.phone, role: 'employee', password: withPwd.pendingPasswordHash });
    }
    const { number } = await nextNumber('employee');
    const emp = await Employee.create({
        user: user._id, employeeNo: number, nameAr: inv.name, jobTitle: inv.jobTitle, team: team._id, department: team.department || null, phone: inv.phone,
        hireDate: new Date(), history: [{ team: team._id, department: team.department || null, jobTitle: inv.jobTitle, from: new Date(), by: actorId, reason: 'invitation' }], createdBy: actorId
    });
    inv.user = user._id;
    inv.employee = emp._id;
    inv.pendingPasswordHash = null;
    step(inv, 'active', actorId, 'account ready, added to the team');
    await inv.save();
    await audit.record(req, { action: 'team.member_added', resource: 'teams', resourceId: team._id, summary: `${inv.name} joined ${team.nameAr} by invitation`, meta: { invitation: String(inv._id), employee: String(emp._id), user: String(user._id) } });
    await notify(user._id, { type: 'team.welcome', titleAr: `أهلاً بيك في فريق ${team.nameAr}`, titleEn: `Welcome to the team ${team.nameAr}`, link: '/', dedupeKey: `inv-welcome:${inv._id}` });
    for (const to of new Set([String(idOf(inv.invitedBy)), String(team.leader || '')].filter(Boolean))) {
        await notify(to, { type: 'team.member_added', titleAr: `${inv.name} انضم للفريق`, titleEn: `${inv.name} joined the team`, link: '/my-team', dedupeKey: `inv-active:${inv._id}:${to}` });
    }
    return { user, emp };
}

// The owner or HR approves an accepted invitation (approval policy)
exports.approve = async (req, res) => {
    const inv = await Invitation.findById(oid(req.params.id));
    if (!inv) throw new HttpError(404, 'Not found.');
    if (inv.status !== 'accepted') throw new HttpError(400, 'الدعوة لازم تكون اتقبلت الأول. / The invitation must be accepted first.');
    await activate(req, inv, req.user.id);
    inv.decidedBy = req.user.id;
    inv.decidedAt = new Date();
    await inv.save();
    res.json({ item: view(inv) });
};

exports.decline = async (req, res) => {
    const inv = await Invitation.findById(oid(req.params.id));
    if (!inv) throw new HttpError(404, 'Not found.');
    if (inv.status !== 'accepted') throw new HttpError(400, 'الدعوة لازم تكون اتقبلت الأول. / The invitation must be accepted first.');
    const note = str(req.body.reason, 500);
    if (!note) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    step(inv, 'declined', req.user.id, note);
    inv.decidedBy = req.user.id;
    inv.decidedAt = new Date();
    inv.decisionNote = note;
    inv.pendingPasswordHash = null;
    await inv.save();
    await audit.record(req, { action: 'team.invitation_declined', resource: 'teams', resourceId: inv._id, summary: `Declined ${inv.name} after acceptance`, reason: note });
    await notify(idOf(inv.invitedBy), { type: 'invitation.declined', titleAr: `الإدارة ما وافقتش على انضمام ${inv.name}`, titleEn: `The admin did not approve ${inv.name}`, link: '/my-team', dedupeKey: `inv-decl:${inv._id}` });
    res.json({ item: view(inv) });
};

// ---- public: the person who received the link ----
async function byToken(token) {
    if (typeof token !== 'string' || token.length < 30 || token.length > 100) return null;
    return Invitation.findOne({ tokenHash: hash(token) }).populate('team', 'nameAr leader').populate('invitedBy', 'name');
}

exports.publicView = async (req, res) => {
    await expireOld();
    const inv = await byToken(req.params.token);
    if (!inv) return res.json({ status: 'invalid' });
    const prof = await profile();
    const leader = inv.team && inv.team.leader ? await User.findById(inv.team.leader).select('name').lean() : null;
    res.json({
        status: inv.status,
        academy: prof.nameAr, academyEn: prof.nameEn || '',
        team: inv.team ? inv.team.nameAr : '',
        leader: leader ? leader.name : inv.invitedBy ? inv.invitedBy.name : '',
        invitedBy: inv.invitedBy ? inv.invitedBy.name : '',
        name: inv.name.split(' ')[0],
        jobTitle: inv.jobTitle,
        expiresAt: inv.expiresAt,
        needsEmail: !inv.email
    });
};

exports.publicAccept = async (req, res) => {
    const inv = await byToken(req.params.token);
    if (!inv || inv.status !== 'pending' || inv.expiresAt < new Date()) throw new HttpError(410, 'الدعوة دي مش صالحة أو انتهت. / This invitation is no longer valid.', 'INVALID_INVITATION');
    // The person proves they are the one invited: the phone number must match the invitation
    if (normalizePhone(req.body.phone) !== inv.phoneKey) throw new HttpError(400, 'رقم التليفون مش مطابق للدعوة. / The phone number does not match the invitation.', 'PHONE_MISMATCH');
    const email = inv.email || normalizeEmail(req.body.email);
    if (!email) throw new HttpError(400, 'اكتب إيميلك. / Enter your email.', 'INVALID');
    const existing = await User.findOne({ email });
    if (existing) {
        // An existing account: the password of that account is the proof
        if (typeof req.body.password !== 'string' || !(await bcrypt.compare(req.body.password, existing.password))) throw new HttpError(401, 'فيه حساب بالإيميل ده: اكتب كلمة السر بتاعته. / This email has an account: enter its password.', 'EXISTING_ACCOUNT');
        if (await Employee.exists({ user: existing._id, status: 'active' })) throw new HttpError(409, 'انت موظف بالفعل. / You are already on the staff.', 'ALREADY_STAFF');
        inv.existingUser = existing._id;
    } else {
        if (typeof req.body.password !== 'string' || req.body.password.length < 8) throw new HttpError(400, 'اختار كلمة سر 8 حروف على الأقل. / Choose a password of at least 8 characters.', 'WEAK_PASSWORD');
        inv.pendingPasswordHash = await bcrypt.hash(req.body.password, 12);
    }
    inv.acceptedEmail = email;
    inv.acceptedAt = new Date();
    inv.tokenHash = null; // the link works once
    step(inv, 'accepted', existing ? existing._id : null, 'accepted by the invited person');
    await inv.save();
    await audit.record(req, { actor: { id: existing ? existing._id : null, name: inv.name, role: 'invitee' }, action: 'team.invitation_accepted', resource: 'teams', resourceId: inv._id, summary: `${inv.name} accepted the invitation` });
    const policy = (await getSetting('teams.invitePolicy')) === 'auto' ? 'auto' : 'approval';
    if (policy === 'auto') {
        await activate(req, inv, idOf(inv.invitedBy));
        return res.json({ status: 'active' });
    }
    // Tell the inviter and everyone who approves invitations
    const approvers = await User.find({ role: 'super_admin', status: 'active' }).select('_id').lean();
    for (const to of new Set([String(idOf(inv.invitedBy)), ...approvers.map((u) => String(u._id))])) {
        await notify(to, { type: 'invitation.accepted', titleAr: `${inv.name} قبل دعوة الفريق`, titleEn: `${inv.name} accepted the team invitation`, bodyAr: 'مستنية موافقة الإدارة', link: '/my-team', dedupeKey: `inv-acc:${inv._id}:${to}` });
    }
    res.json({ status: 'accepted' });
};

exports.publicReject = async (req, res) => {
    const inv = await byToken(req.params.token);
    if (!inv || inv.status !== 'pending' || inv.expiresAt < new Date()) throw new HttpError(410, 'الدعوة دي مش صالحة أو انتهت. / This invitation is no longer valid.', 'INVALID_INVITATION');
    step(inv, 'rejected', null, str(req.body.reason, 300) || 'rejected by the invited person');
    inv.tokenHash = null;
    await inv.save();
    await audit.record(req, { actor: { id: null, name: inv.name, role: 'invitee' }, action: 'team.invitation_rejected', resource: 'teams', resourceId: inv._id, summary: `${inv.name} rejected the invitation` });
    await notify(idOf(inv.invitedBy), { type: 'invitation.rejected', titleAr: `${inv.name} رفض دعوة الفريق`, titleEn: `${inv.name} rejected the team invitation`, link: '/my-team', dedupeKey: `inv-rej:${inv._id}` });
    res.json({ status: 'rejected' });
};

// ---- the team leader's view of their team: work facts only, never salaries or private files ----
exports.myTeam = async (req, res) => {
    const Task = require('../../models/Task');
    const Review = require('../../models/PerformanceReview');
    const led = await Team.find({ leader: oid(req.user.id), active: true }).select('nameAr department leader').populate('department', 'nameAr').lean();
    const own = led.length ? [] : await Team.find({ _id: { $in: (req.user.teamIds || []).map(oid) }, active: true }).select('nameAr department leader').populate('department', 'nameAr').lean();
    const teams = led.length ? led : own;
    const ids = teams.map((t) => t._id);
    const members = await Employee.find({ team: { $in: ids }, status: 'active' }).select('user employeeNo nameAr jobTitle team hireDate').sort({ nameAr: 1 }).lean();
    const users = members.map((m) => m.user);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const month = now.toISOString().slice(0, 7);
    const [tasks, reviews] = await Promise.all([
        Task.aggregate([{ $match: { assignee: { $in: users } } }, { $group: { _id: '$assignee', open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } }, overdue: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'open'] }, { $lt: ['$dueAt', now] }, { $ne: ['$dueAt', null] }] }, 1, 0] } }, doneMonth: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'done'] }, { $gte: ['$completedAt', monthStart] }] }, 1, 0] } } } }]),
        P.scopeFor(req.user.grants, 'reviews.view') && P.scopeFor(req.user.grants, 'reviews.view') !== 'own' ? Review.find({ user: { $in: users }, month }).select('user status average').lean() : []
    ]);
    let attendance = {};
    if (['team', 'department', 'all'].includes(P.scopeFor(req.user.grants, 'attendance.view'))) {
        const rows = await require('./attendanceController')._evaluate(users, month);
        const R = require('../../lib/reviews');
        attendance = Object.fromEntries(rows.map((r) => [r.user, R.attendanceRate(r.summary)]));
    }
    const byUser = (list) => Object.fromEntries(list.map((x) => [String(x._id || x.user), x]));
    const t = byUser(tasks);
    const rv = byUser(reviews);
    const leaders = await User.find({ _id: { $in: teams.map((x) => x.leader).filter(Boolean) } }).select('name').lean();
    res.json({
        teams: teams.map((x) => ({ _id: x._id, nameAr: x.nameAr, department: x.department ? x.department.nameAr : '', leader: (leaders.find((l) => String(l._id) === String(x.leader)) || {}).name || '', iLead: String(x.leader) === String(req.user.id) })),
        members: members.map((m) => ({
            user: m.user, employeeNo: m.employeeNo, name: m.nameAr, jobTitle: m.jobTitle, team: m.team, since: m.hireDate,
            isMe: String(m.user) === String(req.user.id),
            tasks: t[String(m.user)] ? { open: t[String(m.user)].open, overdue: t[String(m.user)].overdue, doneMonth: t[String(m.user)].doneMonth } : { open: 0, overdue: 0, doneMonth: 0 },
            attendanceRate: attendance[String(m.user)] ?? null,
            review: rv[String(m.user)] ? { status: rv[String(m.user)].status, average: rv[String(m.user)].average } : null
        })),
        canInvite: !!P.scopeFor(req.user.grants, 'teams.invite')
    });
};
