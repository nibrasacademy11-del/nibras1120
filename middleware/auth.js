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

const authRequired = (req, res, next) => {
    try {
        const token = req.cookies.nibras_token;
        if (!token) return res.status(401).json({ message: 'Unauthorized.' });
        req.user = jwt.verify(token, getJwtSecret());
        next();
    } catch (e) {
        res.status(401).json({ message: 'Unauthorized.' });
    }
};

// For public routes that show more to a signed-in admin. Never rejects the request.
const attachUser = (req, res, next) => {
    try {
        const token = req.cookies.nibras_token;
        if (token) req.user = jwt.verify(token, getJwtSecret());
    } catch (e) {
        req.user = undefined;
    }
    next();
};

// The role is re-read from the database so a demoted admin loses access immediately.
const adminRequired = async (req, res, next) => {
    try {
        if (!req.user) return res.status(403).json({ message: 'Forbidden.' });
        const user = await User.findById(req.user.id).select('role');
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden.' });
        }
        next();
    } catch (e) {
        res.status(403).json({ message: 'Forbidden.' });
    }
};

module.exports = { authRequired, adminRequired, attachUser, getJwtSecret };
