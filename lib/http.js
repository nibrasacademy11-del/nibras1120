// Small helpers shared by the v2 API controllers

class HttpError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// Lets async handlers throw: HttpError becomes its status, anything else a logged 500
const handle = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next);
    } catch (err) {
        if (err instanceof HttpError) {
            return res.status(err.status).json({ message: err.message, code: err.code });
        }
        if (err && err.name === 'VersionError') {
            return res.status(409).json({
                message: 'تم تعديل هذا السجل من مستخدم آخر. أعد تحميله ثم حاول مرة أخرى. / This record was changed by someone else. Reload and try again.',
                code: 'EDIT_CONFLICT'
            });
        }
        if (err && err.name === 'ValidationError') {
            return res.status(400).json({ message: err.message, code: 'VALIDATION' });
        }
        if (err && err.code === 11000) {
            return res.status(409).json({ message: 'Duplicate value.', code: 'DUPLICATE' });
        }
        console.error(`${req.method} ${req.originalUrl} failed:`, err);
        require('./errorLog').logError({ source: 'server', error: err, route: `${req.method} ${req.route ? req.baseUrl + req.route.path : req.originalUrl.split('?')[0]}`, status: 500, user: req.user ? req.user.id : null, userAgent: req.get('user-agent') });
        res.status(500).json({ message: 'Server error.' });
    }
};

// Rejects a save when the client edited an older version of the record
function assertVersion(doc, clientVersion) {
    if (clientVersion === undefined || clientVersion === null) {
        throw new HttpError(428, 'The record version (__v) is required for this change.', 'VERSION_REQUIRED');
    }
    if (Number(clientVersion) !== Number(doc.__v)) {
        throw new HttpError(
            409,
            'تم تعديل هذا السجل من مستخدم آخر. أعد تحميله ثم حاول مرة أخرى. / This record was changed by someone else. Reload and try again.',
            'EDIT_CONFLICT'
        );
    }
}

function paging(query, { defaultLimit = 50, maxLimit = 200 } = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    return { limit, page, skip: (page - 1) * limit };
}

function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

const clientIp = (req) => String(req.ip || '').slice(0, 64);
const clientAgent = (req) => String(req.get('user-agent') || '').slice(0, 300);

module.exports = { HttpError, handle, assertVersion, paging, parseDate, clientIp, clientAgent };
