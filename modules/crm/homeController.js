const Customer = require('../../models/Customer');
const Task = require('../../models/Task');
const Notification = require('../../models/Notification');
const AccessRequest = require('../../models/AccessRequest');
const SystemSetting = require('../../models/SystemSetting');
const Employee = require('../../models/Employee');
const audit = require('../../lib/audit');
const P = require('../../lib/permissions');
const { HttpError } = require('../../lib/http');
const { notify, SETTING_DEFAULTS, getSetting } = require('./service');

// Dashboard numbers, notifications, the reminder job and CRM settings

const startOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
};
const endOfToday = () => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
};

async function statusCounts(filter) {
    const rows = await Customer.aggregate([{ $match: { ...filter, archived: false, status: { $ne: 'merged' } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

// Every block is computed only when the user's permissions cover it
exports.dashboard = async (req, res) => {
    const me = req.user;
    const g = me.grants;
    const out = { blocks: [] };
    const now = new Date();
    const mongoose = require('mongoose');
    const myId = new mongoose.Types.ObjectId(me.id);

    if (me.isStaff) {
        const [mine, overdue, today, pendingAccess] = await Promise.all([
            statusCounts({ owner: myId }),
            Task.countDocuments({ assignee: me.id, status: 'open', dueAt: { $lt: now } }),
            Task.countDocuments({ assignee: me.id, status: 'open', dueAt: { $gte: now, $lte: endOfToday() } }),
            (async () => {
                const owned = await Customer.find({ owner: me.id }).select('_id').lean();
                return AccessRequest.countDocuments({ customer: { $in: owned.map((c) => c._id) }, status: 'pending' });
            })()
        ]);
        out.mine = { customers: mine, tasksOverdue: overdue, tasksToday: today, accessPending: pendingAccess };
        const stale = await Customer.countDocuments({ owner: me.id, archived: false, status: { $in: ['lead', 'interested'] }, $or: [{ lastContactAt: null }, { lastContactAt: { $lt: new Date(Date.now() - 7 * 864e5) } }] });
        out.mine.noContact7Days = stale;
    }

    const custScope = P.scopeFor(g, 'customers.view');
    if (custScope === 'team' && me.teamIds.length) {
        const teamIds = me.teamIds.map((t) => new mongoose.Types.ObjectId(t));
        const [counts, members, byOwner] = await Promise.all([
            statusCounts({ team: { $in: teamIds } }),
            Employee.countDocuments({ team: { $in: teamIds }, status: 'active' }),
            Customer.aggregate([
                { $match: { team: { $in: teamIds }, archived: false, status: { $ne: 'merged' } } },
                { $group: { _id: '$owner', total: { $sum: 1 }, customers: { $sum: { $cond: [{ $eq: ['$status', 'customer'] }, 1, 0] } }, newThisMonth: { $sum: { $cond: [{ $gte: ['$registeredAt', startOfMonth()] }, 1, 0] } } } },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
                { $project: { total: 1, customers: 1, newThisMonth: 1, name: { $arrayElemAt: ['$u.name', 0] } } },
                { $sort: { total: -1 } }
            ])
        ]);
        out.team = { customers: counts, members, byOwner };
    }

    if (custScope === 'all') {
        const [counts, newThisMonth, unassigned, bySource, byCountry] = await Promise.all([
            statusCounts({}),
            Customer.countDocuments({ registeredAt: { $gte: startOfMonth() }, status: { $ne: 'merged' } }),
            Customer.countDocuments({ owner: null, archived: false, status: { $in: ['lead', 'interested'] } }),
            Customer.aggregate([{ $match: { status: { $ne: 'merged' } } }, { $group: { _id: '$source', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
            Customer.aggregate([{ $match: { status: { $ne: 'merged' }, country: { $ne: '' } } }, { $group: { _id: '$country', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }])
        ]);
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        out.academy = { customers: counts, total, newThisMonth, unassigned, bySource, byCountry, conversionRate: total ? Math.round(((counts.customer || 0) / total) * 1000) / 10 : 0 };
    }
    res.json(out);
};

exports.notifications = async (req, res) => {
    const [items, unread] = await Promise.all([
        Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50).lean(),
        Notification.countDocuments({ user: req.user.id, readAt: null })
    ]);
    res.json({ items, unread });
};

exports.markRead = async (req, res) => {
    const filter = { user: req.user.id, readAt: null };
    if (Array.isArray(req.body.ids)) filter._id = { $in: req.body.ids.filter((id) => /^[0-9a-f]{24}$/i.test(id)) };
    const r = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
    res.json({ updated: r.modifiedCount });
};

// Called by Vercel Cron (see vercel.json). Notifies assignees of follow-ups due today or overdue, once each.
exports.cronReminders = async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.get('authorization') !== `Bearer ${secret}`) return res.status(401).json({ message: 'Unauthorized.' });
    const due = await Task.find({ status: 'open', dueAt: { $ne: null, $lte: endOfToday() }, remindedAt: null }).populate('customer', 'customerNo nameAr').limit(2000);
    for (const t of due) {
        const late = t.dueAt < new Date();
        await notify(t.assignee, {
            type: 'follow_up_due',
            titleAr: `${late ? 'متأخرة' : 'مستحقة اليوم'}: ${t.title}`,
            titleEn: `${late ? 'Overdue' : 'Due today'}: ${t.title}`,
            bodyAr: t.customer ? `${t.customer.customerNo} ${t.customer.nameAr}` : '',
            bodyEn: t.customer ? `${t.customer.customerNo} ${t.customer.nameAr}` : '',
            link: t.customer ? `/customers/${t.customer._id}` : '/tasks',
            dedupeKey: `due:${t._id}:${t.dueAt.toISOString().slice(0, 10)}`
        });
        t.remindedAt = new Date();
        await t.save();
    }
    res.json({ reminded: due.length });
};

exports.getSettings = async (req, res) => {
    const out = {};
    for (const key of Object.keys(SETTING_DEFAULTS)) out[key] = await getSetting(key);
    res.json({ settings: out });
};

const VALIDATORS = {
    'customers.lookupNamePolicy': (v) => ['full', 'partial'].includes(v)
};

exports.updateSettings = async (req, res) => {
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (!reason) throw new HttpError(400, 'سبب التعديل مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const changes = {};
    for (const [key, value] of Object.entries(req.body.settings || {})) {
        if (!VALIDATORS[key] || !VALIDATORS[key](value)) throw new HttpError(400, `Invalid setting: ${key}`);
        const before = await getSetting(key);
        if (before === value) continue;
        await SystemSetting.findOneAndUpdate({ key }, { key, value, updatedBy: req.user.id }, { upsert: true });
        changes[key] = { from: before, to: value };
    }
    if (Object.keys(changes).length) await audit.record(req, { action: 'settings.updated', resource: 'settings', summary: Object.keys(changes).join(', '), reason, changes });
    res.json({ changes });
};
