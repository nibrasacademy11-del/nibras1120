const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

// The user is re-read on every request: a changed password, a new role or a deleted
// account takes effect at once instead of when the 7-day token expires.
async function userFromToken(token) {
    const payload = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.id).select('name email role tokenVersion');
    if (!user || (user.tokenVersion || 0) !== (payload.tv || 0)) return null;
    return { id: String(user._id), name: user.name, email: user.email, role: user.role };
}

const authRequired = async (req, res, next) => {
    try {
        const token = req.cookies.nibras_token;
        req.user = token ? await userFromToken(token) : null;
        if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
        next();
    } catch (e) {
        res.status(401).json({ message: 'Unauthorized.' });
    }
};

// For public routes that show more to a signed-in admin. Never rejects the request.
const attachUser = async (req, res, next) => {
    try {
        const token = req.cookies.nibras_token;
        req.user = token ? (await userFromToken(token)) || undefined : undefined;
    } catch (e) {
        req.user = undefined;
    }
    next();
};

// Runs after authRequired, which already loaded the current role from the database
const adminRequired = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden.' });
    }
    next();
};

const isAdmin = (req) => !!req.user && req.user.role === 'admin';

module.exports = { authRequired, adminRequired, attachUser, isAdmin, getJwtSecret };
