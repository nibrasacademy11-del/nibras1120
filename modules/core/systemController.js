const mongoose = require('mongoose');
const ErrorLog = require('../../models/ErrorLog');
const User = require('../../models/User');
const { logError } = require('../../lib/errorLog');
const { HttpError } = require('../../lib/http');

// System health for the super admin: database, configuration, waiting work and recent errors

const isSet = (name, min = 1) => !!process.env[name] && String(process.env[name]).length >= min;

function configChecks() {
    const prod = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    return [
        { key: 'MONGO_URI', ok: isSet('MONGO_URI'), required: true },
        { key: 'JWT_SECRET', ok: isSet('JWT_SECRET', 32), required: true },
        { key: 'DATA_ENCRYPTION_KEY', ok: isSet('DATA_ENCRYPTION_KEY', 32), required: true, note: 'identity numbers and 2FA' },
        { key: 'SITE_URL', ok: isSet('SITE_URL'), required: true },
        { key: 'EMAIL_USER / EMAIL_PASS', ok: isSet('EMAIL_USER') && isSet('EMAIL_PASS'), required: true, note: 'password reset and notifications' },
        { key: 'CRON_SECRET', ok: isSet('CRON_SECRET', 16), required: false, note: 'daily follow-up reminders' },
        { key: 'ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET', ok: isSet('ZOOM_ACCOUNT_ID') && isSet('ZOOM_CLIENT_ID') && isSet('ZOOM_CLIENT_SECRET'), required: false, note: 'lectures created on Zoom, personal links, attendance' },
        { key: 'R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET', ok: require('../../lib/r2').isConfigured(), required: false, note: 'uploaded files in Cloudflare R2 instead of the database' },
        { key: 'ATTENDANCE_SYNC_SECRET', ok: isSet('ATTENDANCE_SYNC_SECRET', 32), required: false, note: 'offline attendance server' },
        { key: 'REQUIRE_2FA', ok: ['admins', 'staff'].includes(String(process.env.REQUIRE_2FA || '').toLowerCase()), required: false, note: 'recommended: admins' },
        { key: 'NODE_ENV=production', ok: prod, required: true }
    ];
}

exports.health = async (req, res) => {
    const t0 = Date.now();
    let dbOk = false;
    try {
        await mongoose.connection.db.admin().ping();
        dbOk = true;
    } catch (e) {
        dbOk = false;
    }
    const latency = Date.now() - t0;
    const F = require('../../models/finance');
    const C = require('../../models/commission');
    const [superAdmins, admins2fa, pendingPayments, pendingApprovals, dueCommissions, errors] = await Promise.all([
        User.countDocuments({ role: 'super_admin', status: 'active' }),
        User.aggregate([{ $match: { role: { $in: ['super_admin', 'admin'] }, status: 'active' } }, { $group: { _id: '$twoFactor.enabled', n: { $sum: 1 } } }]),
        F.Payment.countDocuments({ status: 'pending' }),
        F.Approval.countDocuments({ status: 'pending' }),
        C.CommissionLine.countDocuments({ status: 'due' }),
        ErrorLog.find().sort({ lastAt: -1 }).limit(50).lean()
    ]);
    const twoFa = Object.fromEntries(admins2fa.map((r) => [String(!!r._id), r.n]));
    res.json({
        version: { commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local', node: process.version, region: process.env.VERCEL_REGION || '' },
        database: { ok: dbOk, latencyMs: latency, name: mongoose.connection.name },
        config: configChecks(),
        security: { superAdmins, adminsWithout2fa: twoFa.false || 0 },
        waiting: { pendingPayments, pendingApprovals, dueCommissions },
        errors: errors.map(({ stack, ...e }) => ({ ...e, stack: req.query.stack === '1' ? stack : undefined }))
    });
};

// The portal reports errors that happen in people's browsers
exports.clientError = async (req, res) => {
    const message = typeof req.body.message === 'string' ? req.body.message : '';
    if (!message) throw new HttpError(400, 'Invalid request.');
    await logError({
        source: 'client',
        message,
        error: { stack: typeof req.body.stack === 'string' ? req.body.stack : '' },
        route: typeof req.body.route === 'string' ? req.body.route : '',
        user: req.user ? req.user.id : null,
        userAgent: req.get('user-agent')
    });
    res.json({ ok: true });
};
