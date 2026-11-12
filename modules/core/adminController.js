const RolePolicy = require('../../models/RolePolicy');
const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');
const policyStore = require('../../lib/policyStore');
const audit = require('../../lib/audit');
const { HttpError, paging, parseDate } = require('../../lib/http');
const P = require('../../lib/permissions');

// Roles and permissions matrix, and the audit log viewer

exports.listRoles = async (req, res) => {
    const overrides = await policyStore.loadOverrides();
    const counts = await User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]);
    const userCount = {};
    for (const c of counts) {
        const r = P.normalizeRole(c._id);
        userCount[r] = (userCount[r] || 0) + c.n;
    }
    res.json({
        catalog: { resources: P.RESOURCES, actions: P.ACTIONS, actionLabels: P.ACTION_LABELS, scopes: P.SCOPES },
        roles: P.ROLES.map((role) => ({
            role,
            label: P.ROLE_LABELS[role],
            editable: role !== 'super_admin',
            customized: !!overrides[role],
            users: userCount[role] || 0,
            grants: P.effectiveGrants(role, overrides),
            defaults: role === 'super_admin' ? P.effectiveGrants(role) : P.DEFAULT_GRANTS[role]
        }))
    });
};

exports.updateRole = async (req, res) => {
    const role = req.params.role;
    if (!P.ROLES.includes(role)) throw new HttpError(404, 'Not found.');
    if (role === 'super_admin') throw new HttpError(400, 'صلاحيات مدير النظام ثابتة. / Super admin permissions are fixed.');
    const reason = String(req.body.reason || '').trim();
    if (!reason) throw new HttpError(400, 'سبب التعديل مطلوب. / A reason is required.', 'REASON_REQUIRED');

    const before = P.effectiveGrants(role, await policyStore.loadOverrides());
    let after;
    if (req.body.reset === true) {
        await RolePolicy.deleteOne({ role });
        after = P.effectiveGrants(role);
    } else {
        after = P.sanitizeGrants(req.body.grants);
        await RolePolicy.findOneAndUpdate(
            { role },
            { $set: { role, entries: RolePolicy.toEntries(after), updatedBy: req.user.id }, $unset: { grants: 1 } },
            { upsert: true, new: true, runValidators: true }
        );
    }
    policyStore.invalidate();

    const changes = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (before[key] !== after[key]) changes[key] = { from: before[key] || null, to: after[key] || null };
    }
    await audit.record(req, {
        action: req.body.reset === true ? 'roles.reset' : 'roles.updated',
        resource: 'roles',
        resourceId: role,
        summary: `${Object.keys(changes).length} permission changes for ${role}`,
        reason,
        changes
    });
    res.json({ role, grants: after });
};

exports.listAudit = async (req, res) => {
    const { limit, page, skip } = paging(req.query);
    const filter = {};
    if (req.query.resource) filter.resource = String(req.query.resource);
    if (req.query.resourceId) filter.resourceId = String(req.query.resourceId);
    if (req.query.action) filter.action = String(req.query.action);
    if (req.query.actor && /^[0-9a-f]{24}$/i.test(req.query.actor)) filter['actor.id'] = req.query.actor;
    const from = parseDate(req.query.from);
    let to = parseDate(req.query.to);
    // A plain date means the whole of that day
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
    if (from || to) {
        filter.at = {};
        if (from) filter.at.$gte = from;
        if (to) filter.at.$lte = to;
    }
    const [items, total] = await Promise.all([
        AuditLog.find(filter).sort({ at: -1 }).skip(skip).limit(limit).lean(),
        AuditLog.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit });
};
