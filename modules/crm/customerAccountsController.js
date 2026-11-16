// Customer sign-in accounts (15 Nov 2026): customer service and the owner see every customer who
// has an account on the website, with the date they signed up, and can give one a temporary
// password when they forgot theirs and cannot use the emailed link. The temporary password is
// shown once; the customer must choose a new one as soon as they sign in with it.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Customer = require('../../models/Customer');
const sessions = require('../../lib/sessions');
const audit = require('../../lib/audit');
const { HttpError, paging } = require('../../lib/http');
const { isStaffRole } = require('../../lib/permissions');

const CUSTOMER_ROLES = ['customer', 'student', 'user'];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Easy to read aloud on the phone: no 0/O, 1/l/I
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function temporaryPassword(length = 10) {
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}

exports.list = async (req, res) => {
    const { limit, page, skip } = paging(req.query, { defaultLimit: 50, maxLimit: 100 });
    const filter = { role: { $in: CUSTOMER_ROLES } };
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q) {
        const re = new RegExp(escape(q), 'i');
        const linked = await Customer.find({ customerNo: re, user: { $ne: null } }).select('user').limit(50).lean();
        filter.$or = [{ name: re }, { email: re }, { phone: re }, { _id: { $in: linked.map((c) => c.user) } }];
    }
    const [items, total] = await Promise.all([
        User.find(filter).select('name email phone status emailVerifiedAt lastLoginAt mustChangePassword createdAt').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        User.countDocuments(filter)
    ]);
    const files = await Customer.find({ user: { $in: items.map((u) => u._id) } }).select('user customerNo').lean();
    const fileOf = new Map(files.map((c) => [String(c.user), c]));
    res.json({
        items: items.map((u) => {
            const c = fileOf.get(String(u._id));
            return { ...u, customer: c ? { _id: c._id, customerNo: c.customerNo } : null };
        }),
        total,
        page,
        limit
    });
};

exports.resetPassword = async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, 'الحساب غير موجود. / Account not found.', 'NOT_FOUND');
    // Staff passwords are never reset from here: only customers' accounts
    if (isStaffRole(user.role)) throw new HttpError(403, 'هذا ليس حساب عميل. / This is not a customer account.', 'NOT_A_CUSTOMER');
    if (user.status === 'disabled') throw new HttpError(409, 'الحساب موقوف. / The account is disabled.', 'DISABLED');

    const password = temporaryPassword();
    user.password = await bcrypt.hash(password, 10);
    user.mustChangePassword = true;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    // Sign out every device that was signed in with the old password
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await sessions.revokeAllSessions(user._id, { reason: 'password_reset_by_staff' });
    await audit.record(req, { action: 'customer_account.password_reset', resource: 'customer_accounts', resourceId: user._id, summary: `Temporary password for ${user.email}` });
    res.json({ password, email: user.email });
};

// The website account of one customer file, shown in the file itself (16 Nov 2026)
exports.ofCustomer = async (req, res) => {
    const c = await Customer.findById(req.params.id).select('user').lean();
    if (!c) throw new HttpError(404, 'Not found.');
    if (!c.user) return res.json({ account: null });
    const u = await User.findById(c.user).select('name email phone role status emailVerifiedAt lastLoginAt mustChangePassword createdAt').lean();
    res.json({ account: u && !isStaffRole(u.role) ? u : null });
};

exports._temporaryPassword = temporaryPassword;
