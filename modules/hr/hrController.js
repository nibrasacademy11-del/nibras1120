const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Employee = require('../../models/Employee');
const Department = require('../../models/Department');
const Team = require('../../models/Team');
const audit = require('../../lib/audit');
const sessions = require('../../lib/sessions');
const { nextNumber } = require('../../lib/sequence');
const { HttpError, assertVersion, paging } = require('../../lib/http');
const { assertNotPrimaryOwner } = require('../../lib/owner');
const P = require('../../lib/permissions');
const { transferAllFrom } = require('../crm/transfer');

// Departments, teams and employee files. A staff member's sign-in account is a User;
// the Employee document holds the HR side and the history of moves between teams.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 160) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ADMIN_ROLES = ['super_admin'];

// ---- departments ----

exports.listDepartments = async (req, res) => {
    const items = await Department.find().sort({ active: -1, nameAr: 1 }).lean();
    res.json({ items });
};

exports.saveDepartment = async (req, res) => {
    const body = { nameAr: str(req.body.nameAr), nameEn: str(req.body.nameEn), manager: oid(req.body.manager), active: req.body.active !== false };
    if (!body.nameAr) throw new HttpError(400, 'اسم القسم مطلوب. / The department name is required.');
    let doc;
    if (req.params.id) {
        doc = await Department.findById(req.params.id);
        if (!doc) throw new HttpError(404, 'Not found.');
        assertVersion(doc, req.body.__v);
        const before = doc.toObject();
        doc.set(body);
        await doc.save();
        await audit.record(req, { action: 'department.updated', resource: 'teams', resourceId: doc._id, summary: `Department ${doc.nameAr}`, changes: audit.diff(before, doc.toObject(), Object.keys(body)) });
    } else {
        doc = await Department.create(body);
        await audit.record(req, { action: 'department.created', resource: 'teams', resourceId: doc._id, summary: `Department ${doc.nameAr}` });
    }
    res.json({ item: doc });
};

// ---- teams ----

exports.listTeams = async (req, res) => {
    const filter = req.scope === 'all' ? {} : { _id: { $in: req.user.teamIds } };
    const teams = await Team.find(filter).populate('leader', 'name email').populate('department', 'nameAr nameEn').sort({ active: -1, nameAr: 1 }).lean();
    const counts = await Employee.aggregate([{ $match: { status: 'active', team: { $in: teams.map((t) => t._id) } } }, { $group: { _id: '$team', n: { $sum: 1 } } }]);
    const byTeam = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    res.json({ items: teams.map((t) => ({ ...t, members: byTeam[String(t._id)] || 0 })) });
};

exports.saveTeam = async (req, res) => {
    const body = { nameAr: str(req.body.nameAr), nameEn: str(req.body.nameEn), department: oid(req.body.department), active: req.body.active !== false };
    if (!body.nameAr) throw new HttpError(400, 'اسم الفريق مطلوب. / The team name is required.');
    const leader = oid(req.body.leader);
    if (leader) {
        const u = await User.findById(leader).select('role status');
        if (!u || u.status === 'disabled' || !P.isStaffRole(u.role)) throw new HttpError(400, 'قائد الفريق يجب أن يكون موظفاً نشطاً. / The leader must be an active staff member.');
    }
    let doc;
    if (req.params.id) {
        doc = await Team.findById(req.params.id);
        if (!doc) throw new HttpError(404, 'Not found.');
        assertVersion(doc, req.body.__v);
        const before = doc.toObject();
        doc.set(body);
        if (String(doc.leader || '') !== String(leader || '')) {
            const now = new Date();
            const open = doc.leaderHistory.find((h) => !h.to);
            if (open) open.to = now;
            if (leader) doc.leaderHistory.push({ leader, from: now, by: req.user.id });
            doc.leader = leader;
        }
        await doc.save();
        await audit.record(req, { action: 'team.updated', resource: 'teams', resourceId: doc._id, summary: `Team ${doc.nameAr}`, changes: audit.diff(before, doc.toObject(), [...Object.keys(body), 'leader']) });
    } else {
        doc = await Team.create({ ...body, leader, leaderHistory: leader ? [{ leader, from: new Date(), by: req.user.id }] : [] });
        await audit.record(req, { action: 'team.created', resource: 'teams', resourceId: doc._id, summary: `Team ${doc.nameAr}` });
    }
    res.json({ item: doc });
};

// ---- employees ----

function employeeScopeFilter(req) {
    return P.scopeFilter(req.scope, req.user, { owner: 'user', team: 'team' });
}

exports.listEmployees = async (req, res) => {
    const { limit, page, skip } = paging(req.query, { defaultLimit: 100, maxLimit: 500 });
    const filter = { ...employeeScopeFilter(req) };
    if (req.query.status) filter.status = String(req.query.status);
    if (oid(req.query.team)) filter.team = oid(req.query.team);
    if (oid(req.query.department)) filter.department = oid(req.query.department);
    if (req.query.q) {
        const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60), 'i');
        filter.$and = [{ $or: [{ nameAr: rx }, { nameEn: rx }, { employeeNo: rx }, { jobTitle: rx }] }];
    }
    const [items, total] = await Promise.all([
        Employee.find(filter)
            .populate('user', 'email role status lastLoginAt twoFactor.enabled')
            .populate('team', 'nameAr nameEn')
            .populate('department', 'nameAr nameEn')
            .sort({ status: 1, nameAr: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Employee.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit });
};

async function loadInScope(req) {
    const emp = await Employee.findById(req.params.id)
        .populate('user', 'email role status lastLoginAt twoFactor.enabled')
        .populate('team', 'nameAr nameEn leader')
        .populate('department', 'nameAr nameEn')
        .populate('history.team', 'nameAr nameEn')
        .populate('history.department', 'nameAr nameEn')
        .populate('history.by', 'name');
    if (!emp) throw new HttpError(404, 'Not found.');
    const record = { user: emp.user && emp.user._id, team: emp.team && emp.team._id };
    if (!P.recordInScope(req.scope, req.user, record, { owner: 'user', team: 'team' })) throw new HttpError(404, 'Not found.');
    return emp;
}

exports.getEmployee = async (req, res) => {
    res.json({ item: await loadInScope(req) });
};

function checkRoleAssignment(req, role, currentRole) {
    if (!P.ROLES.includes(role) || role === 'customer') throw new HttpError(400, 'دور غير صالح لموظف. / Not a staff role.');
    const touchesAdmin = ADMIN_ROLES.includes(role) || (currentRole && ADMIN_ROLES.includes(P.normalizeRole(currentRole)));
    if (touchesAdmin && req.user.role !== 'super_admin') {
        throw new HttpError(403, 'فقط مدير النظام يمكنه منح أو سحب صلاحية المدير. / Only the super admin hands out admin roles.');
    }
}

const tempPassword = () => crypto.randomBytes(9).toString('base64url');

// Creates the sign-in account and the HR file together. An existing customer account can be
// turned into a staff account by using its email. The temporary password is shown once.
exports.createEmployee = async (req, res) => {
    const email = str(req.body.email, 200).toLowerCase();
    const nameAr = str(req.body.nameAr);
    const role = String(req.body.role || 'employee');
    if (!nameAr || !EMAIL_PATTERN.test(email)) throw new HttpError(400, 'الاسم والبريد الإلكتروني مطلوبان. / Name and a valid email are required.');
    checkRoleAssignment(req, role);

    let user = await User.findOne({ email });
    if (user && (await Employee.exists({ user: user._id }))) throw new HttpError(409, 'هذا البريد مسجل لموظف بالفعل. / This email already belongs to an employee.', 'DUPLICATE');
    if (user) assertNotPrimaryOwner(user);
    if (user && P.isAdminRole(user.role) && req.user.role !== 'super_admin') throw new HttpError(403, 'Forbidden.');

    let password = null;
    if (user) {
        user.role = role;
        user.status = 'active';
        user.tokenVersion = (user.tokenVersion || 0) + 1;
    } else {
        password = tempPassword();
        user = new User({ name: nameAr, email, phone: str(req.body.phone, 30), role, password: await bcrypt.hash(password, 10), mustChangePassword: true });
    }
    await user.save();

    const department = oid(req.body.department);
    const team = oid(req.body.team);
    const jobTitle = str(req.body.jobTitle, 120);
    const { number } = await nextNumber('employee');
    const emp = await Employee.create({
        user: user._id,
        employeeNo: number,
        nameAr,
        nameEn: str(req.body.nameEn),
        jobTitle,
        department,
        team,
        phone: str(req.body.phone, 30),
        hireDate: req.body.hireDate ? new Date(req.body.hireDate) : new Date(),
        history: [{ department, team, jobTitle, from: new Date(), by: req.user.id, reason: 'hired' }],
        createdBy: req.user.id
    });
    await audit.record(req, { action: 'employee.created', resource: 'employees', resourceId: emp._id, summary: `Employee ${emp.employeeNo} ${nameAr} (${role})`, meta: { email, role } });
    res.status(201).json({ item: emp, temporaryPassword: password });
};

exports.updateEmployee = async (req, res) => {
    const emp = await loadInScope(req);
    assertVersion(emp, req.body.__v);
    const before = { nameAr: emp.nameAr, nameEn: emp.nameEn, jobTitle: emp.jobTitle, phone: emp.phone, department: String(emp.department?._id || ''), team: String(emp.team?._id || '') };

    if (req.body.nameAr !== undefined) emp.nameAr = str(req.body.nameAr) || emp.nameAr;
    if (req.body.nameEn !== undefined) emp.nameEn = str(req.body.nameEn);
    if (req.body.phone !== undefined) emp.phone = str(req.body.phone, 30);
    if (req.body.hireDate !== undefined) emp.hireDate = req.body.hireDate ? new Date(req.body.hireDate) : null;
    if (req.body.shift !== undefined) emp.shift = oid(req.body.shift);

    const next = {
        department: req.body.department !== undefined ? oid(req.body.department) : emp.department?._id || null,
        team: req.body.team !== undefined ? oid(req.body.team) : emp.team?._id || null,
        jobTitle: req.body.jobTitle !== undefined ? str(req.body.jobTitle, 120) : emp.jobTitle
    };
    const moved = String(next.department || '') !== before.department || String(next.team || '') !== before.team || next.jobTitle !== before.jobTitle;
    // Moving someone to another team needs teams.assign: everywhere (all), or within the actor's
    // department (both teams in it). The team id from the request is checked, never trusted.
    const teamChanged = String(next.team || '') !== before.team;
    if (teamChanged) {
        const scope = P.scopeFor(req.user.grants, 'teams.assign');
        const deptTeams = (req.user.departmentTeamIds || []).map(String);
        const inDept = scope === 'department' && (!before.team || deptTeams.includes(before.team)) && (!next.team || deptTeams.includes(String(next.team)));
        if (scope !== 'all' && !inDept) throw new HttpError(403, 'نقل الموظفين بين الفرق للمالك والموارد البشرية. / Only the owner and HR move employees between teams.', 'FORBIDDEN');
        if (String(emp.user._id || emp.user) === String(req.user.id) && req.user.role !== 'super_admin') throw new HttpError(403, 'لا يمكنك نقل نفسك. / You cannot move yourself.', 'SELF_APPROVAL');
        if (next.team) {
            const target = await Team.findById(next.team).select('active department');
            if (!target || !target.active) throw new HttpError(400, 'الفريق مش موجود أو موقوف. / The team does not exist or is inactive.');
            if (req.body.department === undefined) next.department = target.department || next.department;
        }
    }
    if (moved) {
        const now = new Date();
        const open = emp.history.find((h) => !h.to);
        if (open) open.to = now;
        emp.history.push({ ...next, from: now, by: req.user.id, reason: str(req.body.reason, 300) || 'updated' });
        emp.department = next.department;
        emp.team = next.team;
        emp.jobTitle = next.jobTitle;
    }

    // A role change needs the users.manage permission on top of editing the HR file
    if (req.body.role !== undefined) {
        const user = await User.findById(emp.user._id);
        if (req.body.role !== user.role) {
            if (P.scopeFor(req.user.grants, 'users.manage') !== 'all') throw new HttpError(403, 'Forbidden.');
            if (String(user._id) === String(req.user.id)) throw new HttpError(400, 'لا يمكنك تغيير دورك. / You cannot change your own role.');
            assertNotPrimaryOwner(user);
            checkRoleAssignment(req, req.body.role, user.role);
            const from = user.role;
            user.role = req.body.role;
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            await user.save();
            await sessions.revokeAllSessions(user._id, { reason: 'role_changed' });
            await audit.record(req, { action: 'user.role_changed', resource: 'users', resourceId: user._id, summary: `Role of ${user.email}`, changes: { role: { from, to: user.role } } });
        }
    }

    await emp.save();
    if (teamChanged) {
        const { notify } = require('../crm/service');
        const newTeam = next.team ? await Team.findById(next.team).select('nameAr leader').lean() : null;
        await notify(emp.user._id || emp.user, { type: 'team.moved', titleAr: newTeam ? `اتنقلت لفريق ${newTeam.nameAr}` : 'اتشلت من فريقك', titleEn: newTeam ? `You moved to the team ${newTeam.nameAr}` : 'You were removed from your team', link: '/', dedupeKey: `moved:${emp._id}:${Date.now()}` });
        if (newTeam && newTeam.leader) await notify(newTeam.leader, { type: 'team.member_added', titleAr: `${emp.nameAr} انضم لفريقك`, titleEn: `${emp.nameAr} joined your team`, link: '/my-team', dedupeKey: `moved-in:${emp._id}:${Date.now()}` });
    }
    const after = { nameAr: emp.nameAr, nameEn: emp.nameEn, jobTitle: emp.jobTitle, phone: emp.phone, department: String(emp.department?._id || emp.department || ''), team: String(emp.team?._id || emp.team || '') };
    const changes = audit.diff(before, after);
    if (Object.keys(changes).length) {
        await audit.record(req, { action: moved ? 'employee.moved' : 'employee.updated', resource: 'employees', resourceId: emp._id, summary: `Employee ${emp.employeeNo}`, reason: str(req.body.reason, 300), changes });
    }
    res.json({ item: await Employee.findById(emp._id).populate('user', 'email role status').populate('team', 'nameAr nameEn').populate('department', 'nameAr nameEn') });
};

// An employee leaves: the account is disabled and signed out, and their customers and open tasks
// move to another employee. Nothing is deleted; history and ownership records stay.
exports.offboardEmployee = async (req, res) => {
    const emp = await loadInScope(req);
    if (emp.status === 'left') throw new HttpError(400, 'الموظف غير نشط بالفعل. / The employee already left.');
    const reason = str(req.body.reason, 500);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const transferTo = oid(req.body.transferTo);
    if (String(emp.user._id) === String(req.user.id)) throw new HttpError(400, 'Forbidden.');

    const user = await User.findById(emp.user._id);
    assertNotPrimaryOwner(user);
    if (P.isAdminRole(user.role) && req.user.role !== 'super_admin') throw new HttpError(403, 'Forbidden.');

    let moved = { customers: 0, tasks: 0, enrollments: 0, complaints: 0 };
    if (transferTo) {
        const target = await User.findById(transferTo).select('status role');
        if (!target || target.status === 'disabled' || !P.isStaffRole(target.role) || String(target._id) === String(user._id)) {
            throw new HttpError(400, 'اختر موظفاً نشطاً لاستلام العملاء. / Choose an active employee to receive the customers.');
        }
        moved = await transferAllFrom(req, { from: user._id, to: target._id, reason: `Employee left: ${reason}` });
    }

    const now = new Date();
    const open = emp.history.find((h) => !h.to);
    if (open) open.to = now;
    emp.status = 'left';
    emp.leftAt = now;
    emp.leftReason = reason;
    await emp.save();
    user.status = 'disabled';
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await sessions.revokeAllSessions(user._id, { reason: 'employee_left' });
    await Team.updateMany({ leader: user._id }, { $set: { leader: null } });

    await audit.record(req, { action: 'employee.left', resource: 'employees', resourceId: emp._id, summary: `Employee ${emp.employeeNo} left; moved ${moved.customers} customers, ${moved.tasks} tasks, ${moved.enrollments} enrollments and ${moved.complaints} complaints`, reason, meta: { transferTo: transferTo && String(transferTo), ...moved } });
    res.json({ message: 'تم.', moved });
};

// Staff list for pickers (owner, assignee, transfer target): names only
exports.staffDirectory = async (req, res) => {
    const users = await User.find({ status: 'active', role: { $in: P.ROLES.filter((r) => r !== 'customer') } }).select('name role').sort({ name: 1 }).lean();
    const emps = await Employee.find({ user: { $in: users.map((u) => u._id) } }).select('user team nameAr nameEn').lean();
    const byUser = Object.fromEntries(emps.map((e) => [String(e.user), e]));
    res.json({
        items: users.map((u) => ({
            id: String(u._id),
            name: byUser[String(u._id)]?.nameAr || u.name,
            nameEn: byUser[String(u._id)]?.nameEn || '',
            role: u.role,
            team: byUser[String(u._id)]?.team || null
        }))
    });
};

// The signed-in person's own HR file: team, leader, department, job; nothing about others
exports.myFile = async (req, res) => {
    const emp = await Employee.findOne({ user: req.user.id }).select('employeeNo nameAr nameEn jobTitle team department phone hireDate status').populate('team', 'nameAr leader').populate('department', 'nameAr').lean();
    if (!emp) return res.json({ item: null });
    const leader = emp.team && emp.team.leader ? await User.findById(emp.team.leader).select('name').lean() : null;
    res.json({ item: { ...emp, team: emp.team ? { _id: emp.team._id, nameAr: emp.team.nameAr } : null, leader: leader ? leader.name : '', iAmLeader: !!(emp.team && String(emp.team.leader) === String(req.user.id)) } });
};
