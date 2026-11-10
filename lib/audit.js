const AuditLog = require('../models/AuditLog');
const { clientIp, clientAgent } = require('./http');

// Never written to the log, whatever the caller passes
const SECRET_KEYS = /password|secret|token|recovery|otp|pdf_data/i;

const plain = (v) => (v && typeof v.toObject === 'function' ? v.toObject() : v);

function sameValue(a, b) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// { field: { from, to } } for the fields that changed, without secrets
function diff(before = {}, after = {}, fields) {
    const b = plain(before) || {};
    const a = plain(after) || {};
    const keys = fields || [...new Set([...Object.keys(b), ...Object.keys(a)])];
    const out = {};
    for (const k of keys) {
        if (SECRET_KEYS.test(k) || k === '_id' || k === '__v' || k === 'updatedAt' || k === 'createdAt') continue;
        if (!sameValue(b[k], a[k])) out[k] = { from: b[k] ?? null, to: a[k] ?? null };
    }
    return out;
}

function scrub(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
        if (SECRET_KEYS.test(k)) continue;
        out[k] = v && typeof v === 'object' && !(v instanceof Date) ? scrub(v) : v;
    }
    return out;
}

// Records one event. A logging failure is reported but never breaks the request that caused it.
// actor defaults to req.user; pass actor explicitly for events before sign-in.
async function record(req, { action, resource, resourceId, summary = '', reason = '', changes, meta, actor }) {
    try {
        const who = actor || (req && req.user) || null;
        await AuditLog.create({
            actor: who ? { id: who.id || who._id, name: who.name, role: who.role } : undefined,
            action,
            resource,
            resourceId: resourceId != null ? String(resourceId) : undefined,
            summary: String(summary).slice(0, 500),
            reason: String(reason || '').slice(0, 1000),
            changes: changes && Object.keys(changes).length ? scrub(changes) : undefined,
            meta: meta ? scrub(meta) : undefined,
            ip: req ? clientIp(req) : undefined,
            userAgent: req ? clientAgent(req) : undefined
        });
    } catch (err) {
        console.error('Audit log write failed:', action, err.message);
    }
}

module.exports = { record, diff, scrub };
