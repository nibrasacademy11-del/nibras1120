const mongoose = require('mongoose');
const C = require('../../models/commission');
const F = require('../../models/finance');
const Enrollment = require('../../models/Enrollment');
const User = require('../../models/User');
const M = require('../../lib/money');
const P = require('../../lib/permissions');
const rules = require('../../lib/commission');
const audit = require('../../lib/audit');
const { teamOf } = require('../../lib/teams');
const { nextNumber } = require('../../lib/sequence');
const { HttpError, assertVersion, paging, parseDate } = require('../../lib/http');
const { notify } = require('../crm/service');
const L = require('../finance/ledger');
const engine = require('./engine');

// Commission rates, splits, statements, approval, payouts and adjustments

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const FIELDS = { owner: 'beneficiary', team: 'team' };
const LINE_POP = [
    { path: 'beneficiary', select: 'name role' },
    { path: 'customer', select: 'customerNo nameAr' },
    { path: 'enrollment', select: 'enrollmentNo programTitleAr' },
    { path: 'approvedBy', select: 'name' }
];

function scopeOf(req) {
    return P.scopeFilter(req.scope, req.user, FIELDS);
}

// ---- rates ----

exports.listRates = async (req, res) => {
    const filter = {};
    if (oid(req.query.user)) filter.user = oid(req.query.user);
    if (req.scope !== 'all') filter.user = oid(req.user.id);
    const items = await C.CommissionRate.find(filter).populate('user', 'name role').populate('setBy', 'name').sort({ effectiveFrom: -1, createdAt: -1 }).limit(500).lean();
    // The current rate of each person, for the overview table
    const now = new Date();
    const current = {};
    for (const r of items) {
        const k = `${r.user?._id}:${r.kind}`;
        if (new Date(r.effectiveFrom) <= now && !current[k]) current[k] = r;
    }
    res.json({ items, current: Object.values(current) });
};

// A new rate applies to payments from its start date on; lines already created keep their rate
exports.setRate = async (req, res) => {
    const user = await User.findById(oid(req.body.user)).select('name role status');
    if (!user || !P.isStaffRole(user.role)) throw new HttpError(400, 'اختر الموظف. / Choose the employee.');
    const kind = req.body.kind === 'team_leader' ? 'team_leader' : 'employee';
    const rate = Number(req.body.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new HttpError(400, 'النسبة بين 0 و100. / The rate is between 0 and 100.');
    const reason = str(req.body.reason, 300);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const effectiveFrom = parseDate(req.body.effectiveFrom) || new Date();
    const before = await engine.rateFor(user._id, kind, effectiveFrom);
    const r = await C.CommissionRate.create({ user: user._id, kind, rate: M.round(rate, 3), effectiveFrom, reason, setBy: req.user.id });
    await audit.record(req, { action: 'commission.rate_set', resource: 'commissions', resourceId: user._id, summary: `${user.name} ${kind}: ${before}% → ${r.rate}% from ${effectiveFrom.toISOString().slice(0, 10)}`, reason, changes: { rate: { from: before, to: r.rate } } });
    res.status(201).json({ item: r });
};

// ---- splits ----

exports.getSplit = async (req, res) => {
    const e = await Enrollment.findById(req.params.id).select('enrollmentNo owner team').populate('owner', 'name');
    if (!e) throw new HttpError(404, 'Not found.');
    const split = await C.CommissionSplit.findOne({ enrollment: e._id }).populate('beneficiaries.user', 'name').lean();
    res.json({ item: split, default: e.owner ? [{ user: e.owner, share: 100 }] : [] });
};

// Applies to payments confirmed after the change; earlier lines stay as they were
exports.setSplit = async (req, res) => {
    const e = await Enrollment.findById(req.params.id).select('enrollmentNo');
    if (!e) throw new HttpError(404, 'Not found.');
    const list = (Array.isArray(req.body.beneficiaries) ? req.body.beneficiaries : []).map((b) => ({ user: oid(b.user), share: Number(b.share) }));
    const errors = rules.validateSplit(list);
    if (errors.length) throw new HttpError(400, 'مجموع النسب يجب أن يساوي 100 بدون تكرار. / Shares must total 100 with no repeats.', errors[0].toUpperCase());
    const staff = await User.countDocuments({ _id: { $in: list.map((b) => b.user) }, status: 'active' });
    if (staff !== list.length) throw new HttpError(400, 'كل المستفيدين يجب أن يكونوا موظفين نشطين. / Every beneficiary must be an active employee.');
    const reason = str(req.body.reason, 300);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    let split = await C.CommissionSplit.findOne({ enrollment: e._id });
    const before = split ? split.beneficiaries.map((b) => `${b.user}:${b.share}`).join(', ') : 'owner 100%';
    if (split) {
        assertVersion(split, req.body.__v);
        split.history.push({ beneficiaries: split.beneficiaries, reason: split.reason, setBy: split.setBy, at: split.updatedAt });
        split.beneficiaries = list;
        split.reason = reason;
        split.setBy = req.user.id;
        await split.save();
    } else {
        split = await C.CommissionSplit.create({ enrollment: e._id, beneficiaries: list, reason, setBy: req.user.id });
    }
    await audit.record(req, { action: 'commission.split_set', resource: 'commissions', resourceId: e._id, summary: e.enrollmentNo, reason, changes: { split: { from: before, to: list.map((b) => `${b.user}:${b.share}`).join(', ') } } });
    res.json({ item: split });
};

// ---- lines and statements ----

exports.listLines = async (req, res) => {
    const { limit, page, skip } = paging(req.query, { defaultLimit: 100, maxLimit: 500 });
    const and = [scopeOf(req)];
    const q = req.query;
    if (oid(q.beneficiary)) and.push({ beneficiary: oid(q.beneficiary) });
    if (q.period) and.push({ period: String(q.period) });
    if (q.status) and.push({ status: String(q.status) });
    if (q.kind) and.push({ kind: String(q.kind) });
    const filter = { $and: and };
    const [items, total] = await Promise.all([
        C.CommissionLine.find(filter).populate(LINE_POP).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
        C.CommissionLine.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit, base: await L.baseCurrency() });
};

// One person's month: every line, the totals by status, and the payouts of that month
exports.statement = async (req, res) => {
    const userId = oid(req.query.user) || oid(req.user.id);
    const period = /^\d{4}-\d{2}$/.test(String(req.query.period || '')) ? String(req.query.period) : M.periodKey(new Date());
    const team = await teamOf(userId);
    if (!P.recordInScope(req.scope, req.user, { beneficiary: userId, team }, FIELDS)) throw new HttpError(404, 'Not found.');
    const [user, lines, payouts, before] = await Promise.all([
        User.findById(userId).select('name role').lean(),
        C.CommissionLine.find({ beneficiary: userId, period }).populate(LINE_POP).sort({ date: 1 }).lean(),
        C.CommissionPayout.find({ beneficiary: userId, period }).populate('account', 'nameAr currency').lean(),
        C.CommissionLine.aggregate([{ $match: { beneficiary: userId, period: { $lt: period }, status: { $in: ['due', 'approved'] } } }, { $group: { _id: null, v: { $sum: '$amount' } } }])
    ]);
    if (!user) throw new HttpError(404, 'Not found.');
    const base = await L.baseCurrency();
    res.json({ user, period, base, lines, payouts, totals: rules.summarize(lines), unpaidFromEarlier: M.round(before[0]?.v || 0, 2) });
};

// Totals per person for a month (finance and team leaders)
exports.overview = async (req, res) => {
    const period = /^\d{4}-\d{2}$/.test(String(req.query.period || '')) ? String(req.query.period) : M.periodKey(new Date());
    const match = { ...(await asAggregate(scopeOf(req))), status: { $ne: 'cancelled' } };
    const rows = await C.CommissionLine.aggregate([
        { $match: { ...match, period } },
        { $group: {
            _id: '$beneficiary',
            earned: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
            reversed: { $sum: { $cond: [{ $lt: ['$amount', 0] }, '$amount', 0] } },
            due: { $sum: { $cond: [{ $eq: ['$status', 'due'] }, '$amount', 0] } },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } },
            paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
            collected: { $sum: { $cond: [{ $and: [{ $eq: ['$kind', 'earned'] }, { $eq: ['$role', 'employee'] }] }, '$commissionable', 0] } },
            lines: { $sum: 1 }
        } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $addFields: { name: { $arrayElemAt: ['$u.name', 0] }, role: { $arrayElemAt: ['$u.role', 0] } } },
        { $project: { u: 0 } },
        { $sort: { earned: -1 } }
    ]);
    // Approved amounts from every month that are still unpaid, ready for payout
    const payable = await C.CommissionLine.aggregate([{ $match: { ...match, status: 'approved' } }, { $group: { _id: '$beneficiary', v: { $sum: '$amount' } } }]);
    const byUser = Object.fromEntries(payable.map((p) => [String(p._id), M.round(p.v, 2)]));
    res.json({ period, base: await L.baseCurrency(), items: rows.map((r) => ({ ...r, payable: byUser[String(r._id)] || 0 })) });
};

async function asAggregate(filter) {
    return JSON.parse(JSON.stringify(filter), (k, v) => (typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v) ? new mongoose.Types.ObjectId(v) : v));
}

// ---- approval, cancellation, adjustments ----

exports.approve = async (req, res) => {
    const filter = { status: 'due' };
    if (Array.isArray(req.body.ids) && req.body.ids.length) filter._id = { $in: req.body.ids.map(oid).filter(Boolean) };
    else {
        if (!/^\d{4}-\d{2}$/.test(String(req.body.period || ''))) throw new HttpError(400, 'اختر الشهر أو السطور. / Choose the month or the lines.');
        filter.period = String(req.body.period);
        if (oid(req.body.beneficiary)) filter.beneficiary = oid(req.body.beneficiary);
    }
    // Nobody approves their own commission, except the super admin
    if (req.user.role !== 'super_admin') filter.beneficiary = filter.beneficiary && String(filter.beneficiary) === req.user.id ? null : (filter.beneficiary || { $ne: oid(req.user.id) });
    if (filter.beneficiary === null) throw new HttpError(403, 'لا يمكنك اعتماد عمولتك. / You cannot approve your own commission.', 'SELF_APPROVAL');
    const r = await C.CommissionLine.updateMany(filter, { $set: { status: 'approved', approvedBy: req.user.id, approvedAt: new Date() } });
    await audit.record(req, { action: 'commission.approved', resource: 'commissions', summary: `${r.modifiedCount} lines approved`, meta: { period: filter.period, beneficiary: filter.beneficiary && String(filter.beneficiary) } });
    res.json({ approved: r.modifiedCount });
};

exports.cancelLine = async (req, res) => {
    const line = await C.CommissionLine.findById(req.params.id);
    if (!line) throw new HttpError(404, 'Not found.');
    if (!['due', 'approved'].includes(line.status)) throw new HttpError(400, 'لا يمكن إلغاء سطر مصروف. / A paid line cannot be cancelled; add an adjustment.');
    const reason = str(req.body.reason, 300);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    line.status = 'cancelled';
    line.cancelReason = reason;
    await line.save();
    await audit.record(req, { action: 'commission.line_cancelled', resource: 'commissions', resourceId: line._id, summary: `${line.amount} ${line.currency}`, reason });
    res.json({ item: line });
};

// A manual correction (positive or negative), recorded with its reason, approved like any line
exports.addAdjustment = async (req, res) => {
    const user = await User.findById(oid(req.body.beneficiary)).select('name role');
    if (!user || !P.isStaffRole(user.role)) throw new HttpError(400, 'اختر الموظف. / Choose the employee.');
    const base = await L.baseCurrency();
    const dec = await L.decimals(base);
    const amount = M.round(Number(req.body.amount), dec);
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e8) throw new HttpError(400, 'المبلغ غير صالح. / Invalid amount.');
    const reason = str(req.body.reason, 500);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const date = L.checkDate(req.body.date);
    const line = await C.CommissionLine.create({
        beneficiary: user._id, team: await teamOf(user._id), role: 'adjustment', kind: 'adjustment',
        commissionable: 0, amount, currency: base, date, period: M.periodKey(date), note: reason, createdBy: req.user.id
    });
    await audit.record(req, { action: 'commission.adjustment', resource: 'commissions', resourceId: line._id, summary: `${user.name}: ${amount} ${base}`, reason });
    res.status(201).json({ item: line });
};

// ---- payouts ----

exports.listPayouts = async (req, res) => {
    const filter = req.scope === 'all' ? {} : { beneficiary: oid(req.user.id) };
    if (oid(req.query.beneficiary) && req.scope === 'all') filter.beneficiary = oid(req.query.beneficiary);
    const items = await C.CommissionPayout.find(filter).populate('beneficiary', 'name').populate('account', 'nameAr currency').populate('paidBy', 'name').sort({ paidAt: -1 }).limit(300).lean();
    res.json({ items });
};

// Pays every approved line of one person (negative reversals included) from an account
exports.createPayout = async (req, res) => {
    const beneficiary = oid(req.body.beneficiary);
    if (!beneficiary) throw new HttpError(400, 'اختر الموظف. / Choose the employee.');
    if (String(beneficiary) === req.user.id && req.user.role !== 'super_admin') throw new HttpError(403, 'لا يمكنك صرف عمولتك. / You cannot pay out your own commission.', 'SELF_APPROVAL');
    const account = await F.FinanceAccount.findById(oid(req.body.account));
    if (!account || !account.active) throw new HttpError(400, 'اختر الحساب. / Choose the account.');
    const paidAt = L.checkDate(req.body.paidAt);
    const period = await L.assertOpenPeriod(paidAt);
    const base = await L.baseCurrency();
    const baseDec = await L.decimals(base);

    const payout = await L.inTransaction(async (session) => {
        const lines = await C.CommissionLine.find({ beneficiary, status: 'approved' }).session(session || null);
        const total = M.round(lines.reduce((a, l) => a + l.amount, 0), baseDec);
        if (!lines.length || total <= 0) throw new HttpError(400, 'لا يوجد مبلغ معتمد للصرف. / There is no approved amount to pay.', 'NOTHING_TO_PAY');
        const rate = await L.rateAt(account.currency, paidAt);
        const accountAmount = M.fromBase(total, rate, await L.decimals(account.currency));
        const { number } = await nextNumber('payout');
        const [p] = await C.CommissionPayout.create([{
            payoutNo: number, beneficiary, lines: lines.map((l) => l._id), amount: total, currency: base,
            account: account._id, accountAmount, rate, paidAt, period, note: str(req.body.note, 300), paidBy: req.user.id
        }], { session });
        await C.CommissionLine.updateMany({ _id: { $in: lines.map((l) => l._id) } }, { $set: { status: 'paid', payout: p._id } }, { session });
        await L.post({ account: account._id, date: paidAt, direction: 'out', amount: accountAmount, currency: account.currency, rate, source: { kind: 'commission', id: p._id, no: p.payoutNo }, description: `Commission payout ${p.payoutNo}`, by: req.user.id, session });
        return p;
    });
    await audit.record(req, { action: 'commission.paid', resource: 'commissions', resourceId: payout._id, summary: `${payout.payoutNo}: ${payout.amount} ${base}`, meta: { lines: payout.lines.length } });
    await notify(beneficiary, { type: 'commission_paid', titleAr: `تم صرف عمولة ${payout.amount} ${base}`, titleEn: `Commission of ${payout.amount} ${base} was paid`, link: '/commissions' });
    res.status(201).json({ item: payout });
};

// Creates lines for confirmed payments that have none yet (payments recorded before commissions
// were set up, or after a rate was added for an earlier date). Existing lines are never changed.
exports.generateMissing = async (req, res) => {
    const from = parseDate(req.body.from) || new Date(0);
    const to = parseDate(req.body.to) || new Date();
    const withLines = await C.CommissionLine.distinct('payment', { kind: 'earned', payment: { $ne: null } });
    const payments = await F.Payment.find({ status: 'confirmed', paidAt: { $gte: from, $lte: to }, _id: { $nin: withLines } }).limit(5000);
    let created = 0;
    for (const p of payments) created += (await engine.onPaymentConfirmed(p, { by: req.user.id })).length;
    await audit.record(req, { action: 'commission.generated', resource: 'commissions', summary: `${created} lines for ${payments.length} payments`, meta: { from, to } });
    res.json({ payments: payments.length, lines: created });
};
