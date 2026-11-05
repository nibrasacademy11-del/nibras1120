const RateHit = require('../models/RateHit');

// Counts are kept in MongoDB, so every serverless instance shares them.
// If the counter itself fails the request goes through: a database hiccup must not lock people out.
function rateLimit({ windowMs, max, message }) {
    return async (req, res, next) => {
        const now = Date.now();
        const windowStart = now - (now % windowMs);
        const key = `${req.baseUrl}${req.route ? req.route.path : req.path}|${req.ip}|${windowStart}`;
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
