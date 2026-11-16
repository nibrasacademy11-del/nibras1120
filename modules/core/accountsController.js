// Sign-in accounts (16 Nov 2026): the owner and the assistant see every account (staff and
// customers) and change anyone's role from one place: a customer becomes an employee, an employee
// becomes the assistant or a customer again. The employee file follows: it is created for someone
// who becomes staff, and closed (kept, as "left") for someone who stops being staff.

const User = require('../../models/User');
const Employee = require('../../models/Employee');
const Customer = require('../../models/Customer');
const audit = require('../../lib/audit');
const sessions = require('../../lib/sessions');
const P = require('../../lib/permissions');
const { nextNumber } = require('../../lib/sequence');
const { HttpError, paging } = require('../../lib/http');
const { assertNotPrimaryOwner } = require('../../lib/owner');

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isOwner = (req) => req.user.role === 'super_admin';

exports.list = async (req, res) => {
    const { limit, page, skip } = paging(req.query, { defaultLimit: 50, maxLimit: 100 });
    const filter = {};
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q) {
        const re = new RegExp(escape(q), 'i');
        filter.$or = [{ name: re }, { email: re }, { phone: re }];
    }
    const kind = String(req.query.kind || '');
    if (kind === 'staff') filter.role = { $in: P.ROLES.filter((r) => P.isStaffRole(r)).concat(Object.keys(P.LEGACY_ROLES).filter((r) => P.isStaffRole(P.LEGACY_ROLES[r]))) };
    if (kind === 'customers') filter.role = { $in: ['customer', 'student', 'user'] };
    const [items, total] = await Promise.all([
        User.find(filter).select('name email phone role status isPrimaryOwner emailVerifiedAt lastLoginAt createdAt').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        User.countDocuments(filter)
    ]);
    res.json({
        items: items.map((u) => ({ ...u, role: P.normalizeRole(u.role) })),
        total, page, limit,
        roles: P.ROLES.map((r) => ({ key: r, ar: P.ROLE_LABELS[r].ar, en: P.ROLE_LABELS[r].en })),
        canGiveOwner: isOwner(req)
    });
};

exports.setRole = async (req, res) => {
    const role = String(req.body.role || '');
    if (!P.ROLES.includes(role)) throw new HttpError(400, 'دور غير معروف. / Unknown role.', 'BAD_ROLE');
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, 'الحساب غير موجود. / Account not found.', 'NOT_FOUND');
    assertNotPrimaryOwner(user);
    if (String(user._id) === req.user.id) throw new HttpError(400, 'لا يمكنك تغيير دورك أنت. / You cannot change your own role.', 'SELF');
    const before = P.normalizeRole(user.role);
    if (before === role) return res.json({ role, unchanged: true });
    // only the owner makes someone an owner, or touches an owner's account
    if ((role === 'super_admin' || before === 'super_admin') && !isOwner(req)) throw new HttpError(403, 'المالك فقط. / The owner only.', 'OWNER_ONLY');

    const wasStaff = P.isStaffRole(before);
    const willBeStaff = P.isStaffRole(role);
    let emp = await Employee.findOne({ user: user._id });
    if (wasStaff && !willBeStaff) {
        // a staff member with customers hands them over first (Employees → leaving)
        const owned = await Customer.countDocuments({ owner: user._id, status: { $ne: 'merged' } });
        if (owned) throw new HttpError(409, `عنده ${owned} عميل. انقلهم لموظف تاني الأول من «الموظفين». / They have ${owned} customers: transfer them first.`, 'HAS_CUSTOMERS');
        if (emp && emp.status === 'active') {
            emp.status = 'left';
            emp.leftAt = new Date();
            emp.leftReason = 'became a customer';
            await emp.save();
        }
    }
    if (willBeStaff) {
        if (!emp) {
            const { number } = await nextNumber('employee');
            emp = await Employee.create({ user: user._id, employeeNo: number, nameAr: user.name, phone: user.phone || '', history: [{ from: new Date(), by: req.user.id, reason: 'role given from sign-in accounts' }] });
        } else if (emp.status !== 'active') {
            emp.status = 'active';
            emp.leftAt = null;
            emp.leftReason = '';
            await emp.save();
        }
    }
    user.role = role;
    user.status = 'active';
    // the old role stops at once: every device signs in again
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await sessions.revokeAllSessions(user._id, { reason: 'role_changed' });
    await audit.record(req, { action: 'users.role_changed', resource: 'users', resourceId: user._id, summary: `${user.email}: ${before} → ${role}`, changes: { role: { from: before, to: role } } });
    res.json({ role, employee: emp ? { _id: emp._id, employeeNo: emp.employeeNo, status: emp.status } : null });
};

