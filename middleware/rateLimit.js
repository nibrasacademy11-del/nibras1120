const RateHit = require('../models/RateHit');

// Counts are kept in MongoDB, so every serverless instance shares them.
// If the counter itself fails the request goes through: a database hiccup must not lock people out.
//
// keyBy: what one counter covers. By default the client IP, but everyone inside the academy shares
// one internet address, so routes used by many staff count per account (or per email for sign-in).
const KEYS = {
    ip: (req) => req.ip,
    user: (req) => (req.user ? `u:${req.user.id}` : req.ip),
    email: (req) => {
        const e = req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 200) : '';
        return e ? `e:${e}|${req.ip}` : req.ip;
    }
};

function rateLimit({ windowMs, max, message, keyBy = 'ip' }) {
    const keyOf = typeof keyBy === 'function' ? keyBy : KEYS[keyBy] || KEYS.ip;
    return async (req, res, next) => {
        const now = Date.now();
        const windowStart = now - (now % windowMs);
        const key = `${req.baseUrl}${req.route ? req.route.path : req.path}|${keyOf(req)}|${windowStart}`;
        try {
            const hit = await RateHit.findOneAndUpdate(
                { key },
                { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs) } },
                { upsert: true, new: true }
            );
            if (hit.count > max) {
                res.setHeader('Retry-After', Math.ceil((windowStart + windowMs - now) / 1000));
                return res.status(429).json({ message });
            }
        } catch (err) {
            console.error('Rate limit check failed:', err.message);
        }
        next();
    };
}

module.exports = rateLimit;
