const mongoose = require('mongoose');
const Customer = require('../../models/Customer');
const Enrollment = require('../../models/Enrollment');
const Complaint = require('../../models/Complaint');
const Satisfaction = require('../../models/Satisfaction');
const Certificate = require('../../models/Certificate');
const F = require('../../models/finance');
const C = require('../../models/commission');
const M = require('../../lib/money');
const L = require('../finance/ledger');
const { parseDate } = require('../../lib/http');

// Indicators for management decisions, for a period compared with the period before it.
// Team leaders (reports.view: team) see the same indicators limited to their teams.

function periodOf(q) {
    const to = parseDate(q.to) || new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.to || ''))) to.setUTCHours(23, 59, 59, 999);
    const from = parseDate(q.from) || new Date(to.getTime() - 30 * 864e5);
    const span = to.getTime() - from.getTime();
    return { from, to, prevFrom: new Date(from.getTime() - span), prevTo: new Date(from.getTime() - 1) };
}

const pct = (a, b) => (b ? M.round(((a - b) * 100) / b, 1) : null);

exports.overview = async (req, res) => {
    const { from, to, prevFrom, prevTo } = periodOf(req.query);
    const teams = req.scope === 'all' ? null : req.user.teamIds.map((t) => new mongoose.Types.ObjectId(t));
    const own = teams ? { team: { $in: teams } } : {};
    const payOwn = teams ? { team: { $in: teams } } : {};
    const between = (field, a, b) => ({ [field]: { $gte: a, $lte: b } });
    const base = await L.baseCurrency();

    const count = (model, match) => model.countDocuments(match);
    const sumBase = async (match) => (await F.Payment.aggregate([{ $match: match }, { $group: { _id: null, v: { $sum: '$baseAmount' } } }]))[0]?.v || 0;

    const [
        newNow, newPrev, enrNow, enrPrev, collectedNow, collectedPrev,
        convertedNow, byCountry, bySource, topPrograms, moduleStatus, byCurrency, refunds,
        commissions, stale, lostReasons, complaintsOpen, satisfaction, certificates, trend
    ] = await Promise.all([
        count(Customer, { ...own, status: { $ne: 'merged' }, ...between('registeredAt', from, to) }),
        count(Customer, { ...own, status: { $ne: 'merged' }, ...between('registeredAt', prevFrom, prevTo) }),
        count(Enrollment, { ...own, ...between('enrolledAt', from, to) }),
        count(Enrollment, { ...own, ...between('enrolledAt', prevFrom, prevTo) }),
        sumBase({ ...payOwn, status: 'confirmed', ...between('paidAt', from, to) }),
        sumBase({ ...payOwn, status: 'confirmed', ...between('paidAt', prevFrom, prevTo) }),
        count(Customer, { ...own, status: 'customer', ...between('registeredAt', from, to) }),
        Customer.aggregate([{ $match: { ...own, status: { $ne: 'merged' }, ...between('registeredAt', from, to) } }, { $group: { _id: '$country', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]),
        Customer.aggregate([{ $match: { ...own, status: { $ne: 'merged' }, ...between('registeredAt', from, to) } }, { $group: { _id: '$source', n: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'customer'] }, 1, 0] } } } }, { $sort: { n: -1 } }]),
        Enrollment.aggregate([{ $match: { ...own, ...between('enrolledAt', from, to) } }, { $group: { _id: '$programTitleAr', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]),
        Enrollment.aggregate([{ $match: { ...own, status: { $in: ['active', 'on_hold', 'completed'] } } }, { $unwind: '$modules' }, { $group: { _id: '$modules.status', n: { $sum: 1 } } }]),
        F.Payment.aggregate([{ $match: { ...payOwn, status: 'confirmed', ...between('paidAt', from, to) } }, { $group: { _id: '$currency', amount: { $sum: '$amount' }, base: { $sum: '$baseAmount' } } }, { $sort: { base: -1 } }]),
        F.Refund.aggregate([{ $match: { status: 'paid', ...between('paidAt', from, to) } }, { $group: { _id: null, v: { $sum: '$baseAmount' }, n: { $sum: 1 } } }]),
        C.CommissionLine.aggregate([{ $match: { ...own, status: { $ne: 'cancelled' }, ...between('date', from, to) } }, { $group: { _id: null, v: { $sum: '$amount' } } }]),
        count(Customer, { ...own, archived: false, status: { $in: ['lead', 'interested'] }, $or: [{ lastContactAt: null }, { lastContactAt: { $lt: new Date(Date.now() - 7 * 864e5) } }] }),
        Customer.aggregate([{ $match: { ...own, status: 'lost', ...between('updatedAt', from, to) } }, { $group: { _id: { $toLower: { $trim: { input: '$lostReason' } } }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
        count(Complaint, { ...own, status: { $in: ['open', 'in_progress'] } }),
        Satisfaction.aggregate([{ $match: { ...own, ...between('updatedAt', from, to) } }, { $group: { _id: null, avg: { $avg: '$score' }, n: { $sum: 1 } } }]),
        Certificate.aggregate([{ $match: { ...own, kind: { $in: ['module', 'program'] }, ...between('createdAt', from, to) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
        Customer.aggregate([
            { $match: { ...own, status: { $ne: 'merged' }, ...between('registeredAt', from, to) } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registeredAt' } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }
        ])
    ]);

    // What customers still owe, converted to the base currency at today's rates
    const charges = await F.Charge.find({ status: 'active', ...(teams ? { team: { $in: teams } } : {}) }).select('netAmount currency').limit(20000).lean();
    const totals = await L.chargeTotals(charges.map((c) => c._id));
    let outstanding = 0;
    const rates = {};
    for (const c of charges) {
        const t = totals[String(c._id)] || { applied: 0, refunded: 0 };
        const remaining = c.netAmount - (t.applied - t.refunded);
        if (remaining <= 0) continue;
        try {
            rates[c.currency] = rates[c.currency] ?? (await L.rateAt(c.currency));
            outstanding += remaining * rates[c.currency];
        } catch (e) {
            // a currency without a rate is left out of the total
        }
    }

    const modules = Object.fromEntries(moduleStatus.map((m) => [m._id, m.n]));
    res.json({
        base, from, to, scope: req.scope,
        kpis: {
            newCustomers: { value: newNow, previous: newPrev, change: pct(newNow, newPrev) },
            enrollments: { value: enrPrev === undefined ? enrNow : enrNow, previous: enrPrev, change: pct(enrNow, enrPrev) },
            collected: { value: M.round(collectedNow, 2), previous: M.round(collectedPrev, 2), change: pct(collectedNow, collectedPrev) },
            conversionRate: newNow ? M.round((convertedNow * 100) / newNow, 1) : 0,
            outstanding: M.round(outstanding, 2),
            refunds: M.round(refunds[0]?.v || 0, 2),
            commissions: M.round(commissions[0]?.v || 0, 2),
            staleLeads: stale,
            complaintsOpen,
            satisfaction: satisfaction[0] ? { avg: M.round(satisfaction[0].avg, 2), count: satisfaction[0].n } : null
        },
        byCountry, bySource, topPrograms, byCurrency, lostReasons, trend,
        modules: { done: (modules.approved || 0) + (modules.certificate_issued || 0), review: modules.ready_for_review || 0, inProgress: modules.in_progress || 0, notStarted: modules.not_started || 0, rejected: modules.rejected || 0 },
        certificates: Object.fromEntries(certificates.map((c) => [c._id, c.n]))
    });
};
