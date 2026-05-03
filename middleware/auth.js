const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

const authRequired = (req, res, next) => {
    try {
        const token = req.cookies.nibras_token;
        if (!token) return res.status(401).json({ message: 'Unauthorized.' });
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        res.status(401).json({ message: 'Unauthorized.' });
    }
};

const adminRequired = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden.' });
    }
    next();
};

module.exports = { authRequired, adminRequired };
