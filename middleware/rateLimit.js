// Small in-memory rate limiter. On serverless each instance counts on its own,
// which still slows down password guessing and form spam from a single source.
const hits = new Map();

function rateLimit({ windowMs, max, message }) {
    return (req, res, next) => {
        const now = Date.now();
        const key = `${req.baseUrl}${req.path}|${req.ip}`;
        const entry = hits.get(key);

        if (!entry || entry.resetAt <= now) {
            hits.set(key, { count: 1, resetAt: now + windowMs });
        } else {
            entry.count += 1;
            if (entry.count > max) {
                res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
                return res.status(429).json({ message });
            }
        }

        if (hits.size > 5000) {
            for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        }
        next();
    };
}

module.exports = rateLimit;
