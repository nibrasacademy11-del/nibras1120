const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Session = require('../../models/Session');
const LoginAttempt = require('../../models/LoginAttempt');
const fieldCrypto = require('../../lib/fieldCrypto');
const totp = require('../../lib/totp');
const sessions = require('../../lib/sessions');
const audit = require('../../lib/audit');
const { checkSecondFactor } = require('../../lib/twoFactor');
const { HttpError } = require('../../lib/http');
const { ROLE_LABELS, isStaffRole, roleLevel } = require('../../lib/permissions');
const { twoFactorRequiredFor } = require('../../middleware/auth');
const zones = require('../../lib/zones');
const { assertNotPrimaryOwner } = require('../../lib/owner');

// The signed-in user's own account security: profile, two-factor sign-in, devices, sign-in history

async function loadSelf(req) {
    const user = await User.findById(req.user.id);
    if (!user) throw new HttpError(401, 'Unauthorized.');
    return user;
}

async function confirmPassword(user, password) {
    if (typeof password !== 'string' || !(await bcrypt.compare(password, user.password))) {
        throw new HttpError(401, 'كلمة المرور غير صحيحة. / The password is not correct.', 'BAD_PASSWORD');
    }
}

exports.me = async (req, res) => {
    const user = await User.findById(req.user.id).select('name email phone role status createdAt lastLoginAt isPrimaryOwner twoFactor.enabled twoFactor.recoveryCodes');
    if (!user) throw new HttpError(401, 'Unauthorized.');
    res.json({
        user: {
            id: String(user._id),
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: req.user.role,
            roleLabel: ROLE_LABELS[req.user.role],
            isStaff: isStaffRole(req.user.role),
            // owner / admin / manager / employee / customer: decides the home page
            level: roleLevel(req.user.role),
            isPrimaryOwner: !!user.isPrimaryOwner,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt
        },
        security: {
            twoFactorEnabled: !!user.twoFactor?.enabled,
            twoFactorRequired: twoFactorRequiredFor(req.user.role),
            mustEnrollTwoFactor: req.user.mustEnrollTwoFactor,
            mustChangePassword: req.user.mustChangePassword,
            recoveryCodesLeft: user.twoFactor?.enabled ? (user.twoFactor.recoveryCodes || []).length : 0
        },
        sessionId: req.user.sid,
        grants: req.user.grants,
        // www / staff / cms, and the links between them
        zone: zones.zoneOf(req),
        urls: zones.urls(req)
    });
};

// Other devices are signed out; this one gets a fresh session with the new token version
exports.changePassword = async (req, res) => {
    const user = await loadSelf(req);
    await confirmPassword(user, req.body.currentPassword);
    const next = req.body.newPassword;
    if (typeof next !== 'string' || next.length < 8) {
        throw new HttpError(400, 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف. / The new password must be at least 8 characters.', 'WEAK_PASSWORD');
    }
    if (await bcrypt.compare(next, user.password)) {
        throw new HttpError(400, 'اختر كلمة مرور مختلفة عن الحالية. / Choose a password different from the current one.', 'SAME_PASSWORD');
    }
    user.password = await bcrypt.hash(next, 10);
    user.mustChangePassword = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await sessions.revokeAllSessions(user._id, { reason: 'password_changed' });
    await sessions.startSession(req, res, user, { twoFactor: !!user.twoFactor?.enabled });
    await audit.record(req, { action: 'security.password_changed', resource: 'users', resourceId: user._id, summary: 'Password changed' });
    await require('../../controllers/authController')._tellPasswordChanged(req, user, req.body.lang);
    res.json({ message: 'تم تغيير كلمة المرور. / Password changed.' });
};

// Step 1: a new secret, kept pending until the user proves the app shows the right codes
exports.twoFactorSetup = async (req, res) => {
    const user = await loadSelf(req);
    await confirmPassword(user, req.body.password);
    const secret = totp.generateSecret();
    user.twoFactor = user.twoFactor || {};
    user.twoFactor.pendingSecretEnc = fieldCrypto.encrypt(secret);
    await user.save();
    res.json({ secret, otpauthUrl: totp.otpauthUrl({ secret, account: user.email }) });
};

// Step 2: the first code from the app turns it on and hands out recovery codes, once
exports.twoFactorEnable = async (req, res) => {
    const user = await loadSelf(req);
    const pending = user.twoFactor && user.twoFactor.pendingSecretEnc;
    if (!pending) throw new HttpError(400, 'ابدأ إعداد التحقق بخطوتين أولاً. / Start the setup first.', 'NO_PENDING_SETUP');
    const secret = fieldCrypto.decrypt(pending);
    const step = totp.verifyTotp(secret, req.body.code);
    if (step === null) throw new HttpError(400, 'رمز التحقق غير صحيح. / The code is not correct.', 'BAD_CODE');

    const codes = totp.generateRecoveryCodes();
    user.twoFactor.enabled = true;
    user.twoFactor.secretEnc = pending;
    user.twoFactor.pendingSecretEnc = '';
    user.twoFactor.lastStep = step;
    user.twoFactor.recoveryCodes = codes.map(totp.hashRecoveryCode);
    user.twoFactor.enabledAt = new Date();
    await user.save();
    // Other devices signed in before 2FA existed are signed out; this one stays
    await sessions.revokeAllSessions(user._id, { except: req.user.sid, reason: 'two_factor_enabled' });
    await audit.record(req, { action: 'security.2fa_enabled', resource: 'users', resourceId: user._id, summary: 'Two-factor sign-in turned on' });
    res.json({ message: 'تم تفعيل التحقق بخطوتين. / Two-factor sign-in is on.', recoveryCodes: codes });
};

exports.twoFactorDisable = async (req, res) => {
    const user = await loadSelf(req);
    if (!user.twoFactor?.enabled) throw new HttpError(400, 'التحقق بخطوتين غير مفعل. / Two-factor sign-in is off.');
    if (twoFactorRequiredFor(req.user.role)) {
        throw new HttpError(403, 'التحقق بخطوتين إجباري لهذا الدور. / Two-factor sign-in is required for your role.', 'REQUIRED_BY_POLICY');
    }
    await confirmPassword(user, req.body.password);
    if (!checkSecondFactor(user, req.body.code)) throw new HttpError(400, 'رمز التحقق غير صحيح. / The code is not correct.', 'BAD_CODE');
    user.twoFactor = { enabled: false, secretEnc: '', pendingSecretEnc: '', lastStep: -1, recoveryCodes: [] };
    await user.save();
    await audit.record(req, { action: 'security.2fa_disabled', resource: 'users', resourceId: user._id, summary: 'Two-factor sign-in turned off' });
    res.json({ message: 'تم إيقاف التحقق بخطوتين. / Two-factor sign-in is off.' });
};

exports.regenerateRecoveryCodes = async (req, res) => {
    const user = await loadSelf(req);
    if (!user.twoFactor?.enabled) throw new HttpError(400, 'التحقق بخطوتين غير مفعل. / Two-factor sign-in is off.');
    await confirmPassword(user, req.body.password);
    if (checkSecondFactor(user, req.body.code) !== 'totp') {
        throw new HttpError(400, 'أدخل رمزاً من التطبيق. / Enter a code from the app.', 'BAD_CODE');
    }
    const codes = totp.generateRecoveryCodes();
    user.twoFactor.recoveryCodes = codes.map(totp.hashRecoveryCode);
    await user.save();
    await audit.record(req, { action: 'security.recovery_codes_regenerated', resource: 'users', resourceId: user._id, summary: 'New recovery codes' });
    res.json({ recoveryCodes: codes });
};

function sessionView(s, currentSid) {
    return {
        id: String(s._id),
        ip: s.ip,
        userAgent: s.userAgent,
        twoFactor: s.twoFactor,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        current: String(s._id) === String(currentSid)
    };
}

const activeFilter = (userId) => ({ user: userId, revokedAt: null, expiresAt: { $gt: new Date() } });

exports.listSessions = async (req, res) => {
    const list = await Session.find(activeFilter(req.user.id)).sort({ lastSeenAt: -1 }).lean();
    res.json({ sessions: list.map((s) => sessionView(s, req.user.sid)) });
};

exports.revokeSession = async (req, res) => {
    const s = await Session.findOne({ _id: req.params.id, user: req.user.id, revokedAt: null });
    if (!s) throw new HttpError(404, 'Not found.');
    await sessions.endSession(s._id, 'revoked_by_user');
    await audit.record(req, { action: 'security.session_revoked', resource: 'users', resourceId: req.user.id, summary: 'Signed out a device', meta: { session: String(s._id), ip: s.ip } });
    if (String(s._id) === String(req.user.sid)) sessions.clearAuthCookie(req, res);
    res.json({ message: 'تم تسجيل خروج الجهاز. / The device was signed out.' });
};

exports.revokeOtherSessions = async (req, res) => {
    const count = await sessions.revokeAllSessions(req.user.id, { except: req.user.sid, reason: 'revoked_by_user' });
    await audit.record(req, { action: 'security.sessions_revoked', resource: 'users', resourceId: req.user.id, summary: `Signed out ${count} other devices` });
    res.json({ revoked: count });
};

exports.loginHistory = async (req, res) => {
    const list = await LoginAttempt.find({ user: req.user.id }).sort({ at: -1 }).limit(50).lean();
    res.json({ attempts: list.map(({ at, success, reason, ip, userAgent }) => ({ at, success, reason, ip, userAgent })) });
};

// Admin side: devices of any account, and a 2FA reset for someone who lost their phone

exports.adminListSessions = async (req, res) => {
    const list = await Session.find(activeFilter(req.params.id)).sort({ lastSeenAt: -1 }).lean();
    res.json({ sessions: list.map((s) => sessionView(s, null)) });
};

exports.adminRevokeSessions = async (req, res) => {
    const target = await User.findById(req.params.id).select('email role isPrimaryOwner');
    if (!target) throw new HttpError(404, 'Not found.');
    if (String(target._id) !== String(req.user.id)) assertNotPrimaryOwner(target);
    if (target.role === 'super_admin' && req.user.role !== 'super_admin') throw new HttpError(403, 'Forbidden.');
    const count = await sessions.revokeAllSessions(target._id, { reason: 'revoked_by_admin' });
    await audit.record(req, { action: 'security.sessions_revoked_by_admin', resource: 'users', resourceId: target._id, summary: `Signed out ${count} devices of ${target.email}`, reason: req.body.reason });
    res.json({ revoked: count });
};

exports.adminResetTwoFactor = async (req, res) => {
    const reason = String(req.body.reason || '').trim();
    if (!reason) throw new HttpError(400, 'سبب إعادة التعيين مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const target = await User.findById(req.params.id);
    if (!target) throw new HttpError(404, 'Not found.');
    if (String(target._id) === String(req.user.id)) throw new HttpError(400, 'Use your own security page.');
    assertNotPrimaryOwner(target);
    if (target.role === 'super_admin' && req.user.role !== 'super_admin') throw new HttpError(403, 'Forbidden.');
    target.twoFactor = { enabled: false, secretEnc: '', pendingSecretEnc: '', lastStep: -1, recoveryCodes: [] };
    target.tokenVersion = (target.tokenVersion || 0) + 1;
    await target.save();
    await sessions.revokeAllSessions(target._id, { reason: 'two_factor_reset' });
    await audit.record(req, { action: 'security.2fa_reset_by_admin', resource: 'users', resourceId: target._id, summary: `Two-factor reset for ${target.email}`, reason });
    res.json({ message: 'تمت إعادة تعيين التحقق بخطوتين. / Two-factor sign-in was reset.' });
};

exports.adminLoginAttempts = async (req, res) => {
    const filter = {};
    if (req.query.email) filter.email = String(req.query.email).trim().toLowerCase();
    if (req.query.success === 'true') filter.success = true;
    if (req.query.success === 'false') filter.success = false;
    const list = await LoginAttempt.find(filter).sort({ at: -1 }).limit(200).lean();
    res.json({ attempts: list });
};
