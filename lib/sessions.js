const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const LoginAttempt = require('../models/LoginAttempt');
const { getJwtSecret } = require('../middleware/auth');
const { clientIp, clientAgent } = require('./http');

const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;

// Too many wrong passwords for one email within the window locks that email for the rest of it
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_AFTER_FAILURES = 10;

function cookieOptions() {
    return {
        httpOnly: true,
        // Site and API share one origin, so lax works and blocks cross-site form posts
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        path: '/'
    };
}

async function startSession(req, res, user, { twoFactor = false } = {}) {
    const session = await Session.create({
        user: user._id,
        ip: clientIp(req),
        userAgent: clientAgent(req),
        twoFactor,
        expiresAt: new Date(Date.now() + SESSION_MS)
    });
    const token = jwt.sign(
        { id: String(user._id), tv: user.tokenVersion || 0, sid: String(session._id) },
        getJwtSecret(),
        { expiresIn: `${SESSION_DAYS}d` }
    );
    res.cookie('nibras_token', token, { ...cookieOptions(), maxAge: SESSION_MS });
    return session;
}

async function endSession(sid, reason = 'signed_out') {
    if (!sid) return;
    await Session.updateOne({ _id: sid, revokedAt: null }, { revokedAt: new Date(), revokedReason: reason });
}

async function revokeAllSessions(userId, { except, reason = 'revoked' } = {}) {
    const filter = { user: userId, revokedAt: null };
    if (except) filter._id = { $ne: except };
    const r = await Session.updateMany(filter, { revokedAt: new Date(), revokedReason: reason });
    return r.modifiedCount || 0;
}

// A short-lived proof that the password was right, exchanged for a session with a 2FA code
function setChallenge(res, user) {
    const token = jwt.sign(
        { id: String(user._id), tv: user.tokenVersion || 0, purpose: '2fa' },
        getJwtSecret(),
        { expiresIn: Math.floor(CHALLENGE_MS / 1000) }
    );
    res.cookie('nibras_2fa', token, { ...cookieOptions(), maxAge: CHALLENGE_MS });
}

function readChallenge(req) {
    const token = req.cookies.nibras_2fa;
    if (!token) return null;
    try {
        const payload = jwt.verify(token, getJwtSecret());
        return payload.purpose === '2fa' ? payload : null;
    } catch (e) {
        return null;
    }
}

function clearChallenge(res) {
    res.clearCookie('nibras_2fa', cookieOptions());
}

function clearAuthCookie(res) {
    res.clearCookie('nibras_token', cookieOptions());
}

async function logAttempt(req, { email, user, success, reason }) {
    try {
        await LoginAttempt.create({
            email: email || '',
            user: user ? user._id || user : null,
            success,
            reason,
            ip: clientIp(req),
            userAgent: clientAgent(req)
        });
    } catch (err) {
        console.error('Login attempt log failed:', err.message);
    }
}

async function isLocked(email) {
    if (!email) return false;
    const failures = await LoginAttempt.countDocuments({
        email,
        success: false,
        reason: { $in: ['bad_password', '2fa_failed'] },
        at: { $gt: new Date(Date.now() - LOCK_WINDOW_MS) }
    });
    return failures >= LOCK_AFTER_FAILURES;
}

module.exports = {
    cookieOptions,
    startSession,
    endSession,
    revokeAllSessions,
    setChallenge,
    readChallenge,
    clearChallenge,
    clearAuthCookie,
    logAttempt,
    isLocked,
    LOCK_AFTER_FAILURES
};
