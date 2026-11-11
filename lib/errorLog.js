const crypto = require('crypto');

// Records an error once per kind per day (with a counter). Never throws: logging must not
// turn one error into two. Secrets that may appear in messages are cut out first.

const SECRET_PATTERNS = [
    /mongodb(\+srv)?:\/\/[^\s'"]+/gi,
    /(password|passwd|secret|token|apikey|api_key)["'\s:=]+[^\s'",}]+/gi,
    /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g   // JWTs
];

function redact(text) {
    let s = String(text || '');
    for (const re of SECRET_PATTERNS) s = s.replace(re, '[redacted]');
    return s;
}

// The same error in the same place has the same fingerprint, whatever ids or numbers it mentions
function fingerprint(source, message, route) {
    const norm = String(message || '').replace(/[0-9a-f]{24}/gi, ':id').replace(/\d+/g, 'N').slice(0, 300);
    return crypto.createHash('sha1').update(`${source}|${norm}|${String(route || '').replace(/[0-9a-f]{24}/gi, ':id')}`).digest('hex');
}

async function logError({ source = 'server', error, message, route, status, user, userAgent }) {
    try {
        const ErrorLog = require('../models/ErrorLog');
        const msg = redact(message || (error && error.message) || 'Unknown error').slice(0, 1000);
        const stack = redact((error && error.stack) || '').slice(0, 4000);
        const now = new Date();
        await ErrorLog.updateOne(
            { fingerprint: fingerprint(source, msg, route), day: now.toISOString().slice(0, 10) },
            {
                $inc: { count: 1 },
                $set: { lastAt: now, message: msg, stack, route: String(route || '').slice(0, 300), status, lastUser: user || null, userAgent: String(userAgent || '').slice(0, 300), source },
                $setOnInsert: { firstAt: now }
            },
            { upsert: true }
        );
    } catch (e) {
        console.error('Error log write failed:', e.message);
    }
}

module.exports = { logError, redact, fingerprint };
