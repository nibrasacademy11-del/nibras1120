const User = require('../models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { ROLES, LEGACY_ROLES, normalizeRole, isStaffRole } = require('../lib/permissions');
const sessions = require('../lib/sessions');
const audit = require('../lib/audit');
const { checkSecondFactor } = require('../lib/twoFactor');
const intake = require('../modules/crm/intake');
const zones = require('../lib/zones');
const owner = require('../lib/owner');
const accountEmails = require('../lib/accountEmails');
const mail = require('../lib/mail');

// Staff sign in on staff.*, customers on the public site. Says where to go instead.
function wrongPlace(req, user) {
    const zone = zones.zoneOf(req);
    const staff = isStaffRole(user.role);
    if (zones.accountFits(zone, staff)) return null;
    const u = zones.urls(req);
    return staff
        ? { status: 403, body: { message: `حسابات الموظفين بتدخل من ${u.staff}/portal/login / Staff sign in at ${u.staff}/portal/login`, code: 'WRONG_PORTAL', url: `${u.staff}/portal/login` } }
        : { status: 403, body: { message: `حسابات العملاء بتدخل من الموقع ${u.site}/pages/ar/login.html / Customers sign in on the website: ${u.site}/pages/en/login.html`, code: 'WRONG_PORTAL', url: `${u.site}/pages/ar/login.html` } };
}

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PRIVATE_FIELDS = User.PRIVATE_FIELDS;

function publicUser(user) {
    return {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        isStaff: isStaffRole(user.role),
        emailVerified: !!user.emailVerifiedAt
    };
}

// Reset links must point at our own domain, never at a client-supplied Origin header
function siteUrl(req) {
    return process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
}
const langOf = (v) => (v === 'en' ? 'en' : 'ar');
const sha = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
// The site pages a customer is sent to; staff go to the staff address
const pageUrl = (req, user, page, lang = 'ar') => `${isStaffRole(user.role) ? zones.urls(req).staff : siteUrl(req)}/pages/${langOf(lang)}/${page}`;

// A fresh confirmation link (24 hours) for the account's email
async function sendVerification(req, user, lang) {
    const token = crypto.randomBytes(32).toString('hex');
    user.emailVerifyToken = sha(token);
    user.emailVerifyExpire = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    return accountEmails.verifyEmail(user, `${pageUrl(req, user, 'confirm-email.html', lang)}?token=${token}`);
}

// "Your password was changed" after a reset or a change, so a stranger's change does not go unseen
function tellPasswordChanged(req, user, lang) {
    return accountEmails.passwordChanged(user, pageUrl(req, user, 'forgot-password.html', lang)).catch(() => {});
}
exports._tellPasswordChanged = tellPasswordChanged;
exports._sendVerification = sendVerification;

const LOCKED_MESSAGE = 'تم إيقاف الدخول مؤقتاً بسبب محاولات خاطئة متكررة. حاول بعد 15 دقيقة. / Sign-in is paused after repeated failed attempts. Try again in 15 minutes.';

exports.register = async (req, res) => {
    try {
        if (zones.isStaffZone(zones.zoneOf(req))) {
            return res.status(403).json({ message: 'حسابات الموظفين بيعملها المدير. / Staff accounts are created by the admin.', code: 'WRONG_PORTAL' });
        }
        const { email, phone, password } = req.body;
        // The name as on the identity card, in Arabic and in English: it goes on the certificates
        const name = typeof req.body.nameAr === 'string' ? req.body.nameAr : req.body.name;
        const nameEn = typeof req.body.nameEn === 'string' ? req.body.nameEn.trim().slice(0, 200) : '';
        if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string'
            || !name.trim() || !email.trim() || !password) {
            return res.status(400).json({ message: 'Name, email and password are required.' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            return res.status(400).json({ message: 'Please enter a valid email address.' });
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
        }

        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) return res.status(400).json({ message: 'This email is already registered.' });

        const passwordHash = await bcrypt.hash(password, 10);

        const user = new User({
            name: name.trim().slice(0, 120),
            email: normalizedEmail,
            phone: typeof phone === 'string' ? phone.trim().slice(0, 30) : '',
            password: passwordHash,
            role: 'student'
        });
        await user.save();
        // New accounts get a customer file of their own
        const filed = await intake.safely(() => intake.ingestUser(user), 'register');
        if (nameEn && filed && filed.customer && !filed.customer.nameEn) {
            await require('../models/Customer').updateOne({ _id: filed.customer._id }, { $set: { nameEn } });
        }

        await sessions.startSession(req, res, user);
        const sent = await sendVerification(req, user, req.body.lang).catch(() => null);
        res.status(201).json({ message: 'Account created successfully.', user: publicUser(user), verificationSent: mail.delivered(sent) });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
};

async function finishLogin(req, res, user, { twoFactor }) {
    const wrong = wrongPlace(req, user);
    if (wrong) return res.status(wrong.status).json(wrong.body);
    await sessions.startSession(req, res, user, { twoFactor });
    user.lastLoginAt = new Date();
    await user.save();
    await sessions.logAttempt(req, { email: user.email, user, success: true, reason: 'ok' });
    if (isStaffRole(user.role)) {
        await audit.record(req, {
            actor: { id: user._id, name: user.name, role: user.role },
            action: 'auth.login',
            resource: 'users',
            resourceId: user._id,
            summary: twoFactor ? 'Signed in with two-factor' : 'Signed in'
        });
    }
    res.json({ message: 'Login successful.', user: publicUser(user) });
}

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }
        const normalizedEmail = email.trim().toLowerCase();

        if (await sessions.isLocked(normalizedEmail)) {
            await sessions.logAttempt(req, { email: normalizedEmail, success: false, reason: 'locked' });
            return res.status(429).json({ message: LOCKED_MESSAGE, code: 'LOCKED' });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            await sessions.logAttempt(req, { email: normalizedEmail, success: false, reason: 'unknown_email' });
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            await sessions.logAttempt(req, { email: normalizedEmail, user, success: false, reason: 'bad_password' });
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        if (user.status === 'disabled') {
            await sessions.logAttempt(req, { email: normalizedEmail, user, success: false, reason: 'disabled' });
            return res.status(403).json({ message: 'هذا الحساب معطل. يرجى التواصل مع الإدارة. / This account is disabled.', code: 'DISABLED' });
        }

        const wrong = wrongPlace(req, user);
        if (wrong) {
            await sessions.logAttempt(req, { email: normalizedEmail, user, success: false, reason: 'wrong_portal' });
            return res.status(wrong.status).json(wrong.body);
        }

        if (user.twoFactor && user.twoFactor.enabled) {
            sessions.setChallenge(res, user);
            await sessions.logAttempt(req, { email: normalizedEmail, user, success: false, reason: '2fa_pending' });
            return res.json({
                twoFactorRequired: true,
                message: 'أدخل رمز التحقق من تطبيق المصادقة. / Enter the code from your authenticator app.'
            });
        }

        await finishLogin(req, res, user, { twoFactor: false });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

// Second step of a two-factor sign-in: the password step left a 5-minute challenge cookie
exports.loginTwoFactor = async (req, res) => {
    try {
        const challenge = sessions.readChallenge(req);
        if (!challenge) {
            return res.status(401).json({
                message: 'انتهت مهلة التحقق، سجل الدخول مرة أخرى. / The sign-in expired, please start again.',
                code: 'CHALLENGE_EXPIRED'
            });
        }
        const user = await User.findById(challenge.id);
        if (!user || (user.tokenVersion || 0) !== (challenge.tv || 0) || user.status === 'disabled') {
            sessions.clearChallenge(res);
            return res.status(401).json({ message: 'Unauthorized.' });
        }
        if (await sessions.isLocked(user.email)) {
            sessions.clearChallenge(res);
            return res.status(429).json({ message: LOCKED_MESSAGE, code: 'LOCKED' });
        }

        const method = checkSecondFactor(user, req.body.code);
        if (!method) {
            await sessions.logAttempt(req, { email: user.email, user, success: false, reason: '2fa_failed' });
            return res.status(401).json({ message: 'رمز التحقق غير صحيح. / The code is not correct.', code: 'BAD_CODE' });
        }

        sessions.clearChallenge(res);
        if (method === 'recovery') {
            await audit.record(req, {
                actor: { id: user._id, name: user.name, role: user.role },
                action: 'auth.recovery_code_used',
                resource: 'users',
                resourceId: user._id,
                summary: `Recovery code used, ${user.twoFactor.recoveryCodes.length} left`
            });
        }
        await finishLogin(req, res, user, { twoFactor: true });
    } catch (error) {
        console.error('Two-factor login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

exports.logout = async (req, res) => {
    try {
        const { userFromToken } = require('../middleware/auth');
        const token = sessions.readAuthToken(req);
        const current = token ? await userFromToken(token).catch(() => null) : null;
        if (current && current.sid) await sessions.endSession(current.sid, 'signed_out');
    } catch (e) {
        // Signing out always succeeds for the browser
    }
    sessions.clearAuthCookie(req, res);
    sessions.clearChallenge(res);
    res.json({ message: 'Logged out.' });
};

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select(PRIVATE_FIELDS);
        if (!user) return res.status(401).json({ message: 'Unauthorized.' });
        res.json({ user, isStaff: req.user.isStaff, zone: zones.zoneOf(req), urls: zones.urls(req) });
    } catch (error) {
        console.error('GetMe error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select(PRIVATE_FIELDS).sort({ createdAt: -1 });
        res.json({ users });
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching users.' });
    }
};

exports.forgotPassword = async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const lang = req.body.lang === 'en' ? 'en' : 'ar';
    const isEN = lang === 'en';
    // Same reply whether or not the account exists, so emails cannot be enumerated
    const sentMessage = isEN
        ? 'If this email is registered, a reset link has been sent to it.'
        : 'إذا كان البريد مسجلاً لدينا، فسيصلك رابط إعادة تعيين كلمة المرور.';

    if (!EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ message: isEN ? 'Please enter a valid email address.' : 'يرجى إدخال بريد إلكتروني صحيح.' });
    }

    let user = null;
    try {
        user = await User.findOne({ email });
        if (!user) return res.json({ message: sentMessage });

        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save();

        // Staff reset on the staff address, so the page's "sign in" link takes them to the right place
        const resetBase = isStaffRole(user.role) ? zones.urls(req).staff : siteUrl(req);
        const resetUrl = `${resetBase}/pages/${lang}/reset-password.html?token=${resetToken}`;
        const sent = await accountEmails.resetPassword(user, resetUrl);
        if (!mail.delivered(sent)) throw new Error(`Reset email not sent: ${sent.reason}`);

        res.json({ message: sentMessage });
    } catch (error) {
        console.error('Forgot password error:', error);
        if (user && user.resetPasswordToken) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save().catch(() => {});
        }
        res.status(500).json({ message: isEN ? 'Could not send the email. Please contact support.' : 'حدث خطأ أثناء إرسال الإيميل. يرجى التواصل مع الدعم.' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (typeof token !== 'string' || typeof password !== 'string' || !token) {
            return res.status(400).json({ message: 'الرابط غير صالح أو انتهت صلاحيته.' });
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
        }

        const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ message: 'الرابط غير صالح أو انتهت صلاحيته.' });

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        // The link reached this inbox, so the address is confirmed too
        if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
        // Sign out every session that existed before the reset
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();
        await sessions.revokeAllSessions(user._id, { reason: 'password_reset' });
        await audit.record(req, {
            actor: { id: user._id, name: user.name, role: user.role },
            action: 'auth.password_reset',
            resource: 'users',
            resourceId: user._id,
            summary: 'Password reset by email link'
        });
        await tellPasswordChanged(req, user, req.body.lang);

        res.json({ message: 'تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في السيرفر.' });
    }
};

// The link from the confirmation email. Works without signing in (it may open on another device).
exports.verifyEmail = async (req, res) => {
    const token = typeof req.body.token === 'string' ? req.body.token : '';
    const invalid = { message: 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً من صفحتك. / The link is not valid or has expired. Ask for a new one from your profile.', code: 'INVALID_LINK' };
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json(invalid);
    try {
        const user = await User.findOne({ emailVerifyToken: sha(token), emailVerifyExpire: { $gt: new Date() } });
        if (!user) return res.status(400).json(invalid);
        user.emailVerifiedAt = new Date();
        user.emailVerifyToken = undefined;
        user.emailVerifyExpire = undefined;
        await user.save();
        await audit.record(req, { actor: { id: user._id, name: user.name, role: user.role }, action: 'auth.email_verified', resource: 'users', resourceId: user._id, summary: 'Email confirmed' });
        await accountEmails.welcome(user, pageUrl(req, user, 'profile.html', req.body.lang)).catch(() => {});
        res.json({ message: 'تم تأكيد الإيميل. / Email confirmed.', verified: true });
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

// A new confirmation link for the signed-in account
exports.resendVerification = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(401).json({ message: 'Unauthorized.' });
        if (user.emailVerifiedAt) return res.status(400).json({ message: 'الإيميل مؤكد بالفعل. / The email is already confirmed.', code: 'ALREADY_VERIFIED' });
        const sent = await sendVerification(req, user, req.body.lang);
        if (!mail.delivered(sent)) return res.status(503).json({ message: 'تعذر إرسال الإيميل الآن، حاول لاحقاً. / The email could not be sent now; try again later.', code: 'MAIL_FAILED' });
        res.json({ message: 'أرسلنا رابط التأكيد إلى إيميلك. / We sent the link to your email.' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.getSingleUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select(PRIVATE_FIELDS);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user data.' });
    }
};

const ADMIN_ROLES = ['super_admin'];

exports.updateUser = async (req, res) => {
    try {
        const { name, email, phone, role, enrolledCourses } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        const snapshot = () => ({
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            enrolledCourses: [...(user.enrolledCourses || [])]
        });
        const before = snapshot();

        const actorIsSuper = req.user.role === 'super_admin';
        // The primary owner: only the owner edits their own name and phone; role and email never change here
        if (owner.isPrimaryOwner(user)) {
            const self = String(user._id) === String(req.user.id);
            const emailChanging = email !== undefined && String(email).trim().toLowerCase() !== user.email;
            const roleTouched = role !== undefined && role !== user.role;
            if (!self || emailChanging || roleTouched) {
                await audit.record(req, { action: 'security.primary_owner_change_refused', resource: 'users', resourceId: user._id, summary: `Refused a change to the primary owner account` });
                return res.status(403).json({ message: owner.MESSAGE, code: 'PRIMARY_OWNER' });
            }
        }
        if (normalizeRole(user.role) === 'super_admin' && !actorIsSuper) {
            return res.status(403).json({ message: 'فقط مدير النظام يمكنه تعديل حساب مدير النظام.' });
        }

        const roleChanging = role !== undefined && role !== user.role;
        if (roleChanging) {
            // Staff accounts belong to the employee files of the management system: their role is changed
            // there (with the team and job history), and staff roles are not handed out from this panel
            const Employee = require('../models/Employee');
            if (await Employee.exists({ user: user._id })) {
                return res.status(400).json({ message: 'هذا الحساب لموظف. غيّر دوره من نظام الإدارة ← الموظفون.' });
            }
            if (isStaffRole(role) && !ADMIN_ROLES.includes(role)) {
                return res.status(400).json({ message: 'لإضافة موظف استخدم نظام الإدارة ← الموظفون ← موظف جديد (يُنشئ ملفه وفريقه).' });
            }
            if (![...ROLES, ...Object.keys(LEGACY_ROLES)].includes(role)) {
                return res.status(400).json({ message: 'صلاحية غير معروفة.' });
            }
            if (String(user._id) === String(req.user.id)) {
                return res.status(400).json({ message: 'لا يمكنك تغيير صلاحية حسابك الحالي.' });
            }
            // Only the super admin hands out or takes away the two admin roles
            if (!actorIsSuper && (ADMIN_ROLES.includes(role) || ADMIN_ROLES.includes(normalizeRole(user.role)))) {
                return res.status(403).json({ message: 'فقط مدير النظام يمكنه منح أو سحب صلاحية المدير.' });
            }
        }

        if (email !== undefined) {
            const normalizedEmail = String(email).trim().toLowerCase();
            if (!EMAIL_PATTERN.test(normalizedEmail)) {
                return res.status(400).json({ message: 'صيغة البريد الإلكتروني غير صحيحة.' });
            }
            user.email = normalizedEmail;
        }
        if (name) user.name = String(name).trim().slice(0, 120);
        if (phone !== undefined) user.phone = String(phone).trim().slice(0, 30);
        if (roleChanging) {
            user.role = role;
            // A changed role must not keep working through tokens issued before it
            user.tokenVersion = (user.tokenVersion || 0) + 1;
        }
        // The old free-text program list is read-only: programs are managed as enrollments in the management system

        await user.save();
        if (roleChanging) await sessions.revokeAllSessions(user._id, { reason: 'role_changed' });

        const changes = audit.diff(before, snapshot());
        if (Object.keys(changes).length) {
            await audit.record(req, {
                action: changes.role ? 'user.role_changed' : 'user.updated',
                resource: 'users',
                resourceId: user._id,
                summary: `Updated account ${user.email}`,
                changes
            });
        }
        const saved = await User.findById(user._id).select(PRIVATE_FIELDS);
        res.json({ message: 'User updated successfully.', user: saved });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'هذا البريد الإلكتروني مستخدم لحساب آخر.' });
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Error updating user.' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        if (String(req.params.id) === String(req.user.id)) {
            return res.status(400).json({ message: 'لا يمكنك حذف حسابك الحالي.' });
        }
        const target = await User.findById(req.params.id).select('name email role isPrimaryOwner');
        if (!target) return res.status(404).json({ message: 'User not found.' });
        if (owner.isPrimaryOwner(target)) {
            await audit.record(req, { action: 'security.primary_owner_change_refused', resource: 'users', resourceId: target._id, summary: 'Refused deleting the primary owner account' });
            return res.status(403).json({ message: owner.MESSAGE, code: 'PRIMARY_OWNER' });
        }
        // Accounts with history in the management system are never deleted (their records point to them)
        const Employee = require('../models/Employee');
        const Customer = require('../models/Customer');
        if (await Employee.exists({ user: target._id })) {
            return res.status(400).json({ message: 'هذا الحساب لموظف. استخدم نظام الإدارة ← الموظفون ← إنهاء الخدمة (يحفظ السجل وينقل العملاء).' });
        }
        const file = await Customer.findOne({ user: target._id }).select('_id customerNo');
        if (file) {
            const Enrollment = require('../models/Enrollment');
            const Certificate = require('../models/Certificate');
            const { Payment } = require('../models/finance');
            const used = (await Enrollment.exists({ customer: file._id })) || (await Payment.exists({ customer: file._id })) || (await Certificate.exists({ $or: [{ customer: file._id }, { userId: target._id }] }));
            if (used) return res.status(400).json({ message: `للعميل ${file.customerNo} تسجيلات أو مدفوعات أو شهادات؛ لا يمكن حذف حسابه. يمكن أرشفة ملفه من نظام الإدارة.` });
            await Customer.updateOne({ _id: file._id }, { $set: { user: null } });
        }
        if (ADMIN_ROLES.includes(normalizeRole(target.role)) && req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'فقط مدير النظام يمكنه حذف حساب مدير.' });
        }
        await User.deleteOne({ _id: target._id });
        await sessions.revokeAllSessions(target._id, { reason: 'account_deleted' });
        await audit.record(req, {
            action: 'user.deleted',
            resource: 'users',
            resourceId: target._id,
            summary: `Deleted account ${target.email}`,
            meta: { name: target.name, email: target.email, role: target.role }
        });
        res.json({ message: 'User deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user.' });
    }
};

exports.getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select(PRIVATE_FIELDS);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Fetch certificates linked to this user
        const Certificate = require('../models/Certificate');
        const certificates = await Certificate.find({ userId: user._id }).select('-pdf_data');

        res.json({ user, certificates });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching profile.' });
    }
};

// Public: which place this address is, and the links to the others (the sign-in page needs it)
exports.getZone = (req, res) => {
    res.json({ zone: zones.zoneOf(req), urls: zones.urls(req) });
};
