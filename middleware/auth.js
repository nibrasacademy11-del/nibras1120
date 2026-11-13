const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');
const { normalizeRole, isStaffRole, isAdminRole, scopeFor, hasScope, withExtras } = require('../lib/permissions');
const policyStore = require('../lib/policyStore');
const { teamIdsFor, departmentTeamIdsFor } = require('../lib/teams');
const zones = require('../lib/zones');

// The session cookie for the place this request came in on (staff and customers never share one)
const readAuthToken = (req) => (req.cookies ? req.cookies[zones.cookieName(zones.zoneOf(req))] : undefined);

const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const WEAK_SECRETS = ['change-this-secret', 'replace-with-strong-secret'];
const devSecret = crypto.randomBytes(32).toString('hex');

// Never sign tokens with a publicly known value. Local dev gets a per-process random secret.
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (secret && !WEAK_SECRETS.includes(secret)) return secret;
    if (isProd) throw new Error('JWT_SECRET is missing or uses a default value.');
    return devSecret;
}

// Which accounts must turn on two-factor sign-in: off (default), admins, or staff
function twoFactorPolicy() {
    const v = String(process.env.REQUIRE_2FA || 'off').toLowerCase();
    return ['admins', 'staff'].includes(v) ? v : 'off';
}

function twoFactorRequiredFor(role) {
    const policy = twoFactorPolicy();
    if (policy === 'staff') return isStaffRole(role);
    if (policy === 'admins') return isAdminRole(role);
    return false;
}

const SESSION_TOUCH_MS = 5 * 60 * 1000;

// The user and session are re-read on every request: a changed password, a new role, a disabled
// account or a revoked device takes effect at once instead of when the 7-day token expires.
async function userFromToken(token) {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.purpose) return null; // a 2FA challenge token is not a sign-in
    const user = await User.findById(payload.id).select('name email role status tokenVersion twoFactor.enabled mustChangePassword extraGrants');
    if (!user || (user.tokenVersion || 0) !== (payload.tv || 0)) return null;
    if (user.status === 'disabled') return null;

    const role = normalizeRole(user.role);
    let session = null;
    if (payload.sid) {
        session = await Session.findOne({ _id: payload.sid, user: user._id, revokedAt: null, expiresAt: { $gt: new Date() } })
            .select('lastSeenAt twoFactor');
        if (!session) return null;
        if (Date.now() - new Date(session.lastSeenAt).getTime() > SESSION_TOUCH_MS) {
            Session.updateOne({ _id: session._id }, { lastSeenAt: new Date() }).catch(() => {});
        }
    } else if (isStaffRole(role)) {
        // Tokens issued before sessions existed keep working for customers only;
        // staff sign in again so their device shows up and can be revoked.
        return null;
    }

    return {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role,
        storedRole: user.role,
        isStaff: isStaffRole(role),
        sid: session ? String(session._id) : null,
        twoFactorEnabled: !!(user.twoFactor && user.twoFactor.enabled),
        mustEnrollTwoFactor: twoFactorRequiredFor(role) && !(user.twoFactor && user.twoFactor.enabled),
        mustChangePassword: !!user.mustChangePassword,
        // Teams the user belongs to or leads: team-scoped permissions cover their records
        teamIds: isStaffRole(role) ? await teamIdsFor(user._id) : [],
        departmentTeamIds: isStaffRole(role) ? await departmentTeamIdsFor(user._id) : [],
        // the role's permissions plus any the owner gave this person (re-read on every request)
        grants: withExtras(await policyStore.grantsForRole(role), Object.fromEntries((user.extraGrants || []).map((g) => [g.key, g.scope])))
    };
}

// Paths a user who still has to change a temporary password, or turn on two-factor sign-in, may reach
const PASSWORD_PATHS = [/^\/api\/v2\/me(\/password)?$/, /^\/api\/auth\/(me|logout)$/];
const ENROLLMENT_PATHS = [/^\/api\/v2\/me(\/2fa(\/.*)?|\/password)?$/, /^\/api\/auth\/(me|logout)$/];

const authRequired = async (req, res, next) => {
    try {
        const token = readAuthToken(req);
        req.user = token ? await userFromToken(token) : null;
        if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
        const path = req.originalUrl.split('?')[0];
        if (req.user.mustChangePassword && !PASSWORD_PATHS.some((re) => re.test(path))) {
            return res.status(403).json({
                message: 'يجب تغيير كلمة المرور المؤقتة أولاً. / Change your temporary password first.',
                code: 'PASSWORD_CHANGE_REQUIRED'
            });
        }
        if (req.user.mustEnrollTwoFactor && !ENROLLMENT_PATHS.some((re) => re.test(path))) {
            return res.status(403).json({
                message: 'يجب تفعيل التحقق بخطوتين أولاً. / Two-factor sign-in must be turned on first.',
                code: 'TWO_FACTOR_ENROLLMENT_REQUIRED'
            });
        }
        next();
    } catch (e) {
        if (e && e.name !== 'JsonWebTokenError' && e.name !== 'TokenExpiredError') console.error('Auth check failed:', e.message);
        res.status(401).json({ message: 'Unauthorized.' });
    }
};

// For public routes that show more to a signed-in admin. Never rejects the request.
const attachUser = async (req, res, next) => {
    try {
        const token = readAuthToken(req);
        req.user = token ? (await userFromToken(token)) || undefined : undefined;
    } catch (e) {
        req.user = undefined;
    }
    next();
};

// Runs after authRequired, which already loaded the current role from the database
const adminRequired = (req, res, next) => {
    if (!req.user || !isAdminRole(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden.' });
    }
    next();
};

const isAdmin = (req) => !!req.user && isAdminRole(req.user.role);

// Runs after authRequired. Puts the granted scope on req.scope for the handler to filter by.
function requirePermission(permission, minScope = 'own') {
    return (req, res, next) => {
        const scope = scopeFor(req.user && req.user.grants, permission);
        if (!hasScope(scope, minScope)) {
            return res.status(403).json({ message: 'ليس لديك صلاحية لهذا الإجراء. / You do not have permission for this action.', code: 'FORBIDDEN', permission });
        }
        req.scope = scope;
        next();
    };
}

module.exports = {
    authRequired,
    adminRequired,
    attachUser,
    isAdmin,
    requirePermission,
    getJwtSecret,
    twoFactorRequiredFor,
    userFromToken
};
