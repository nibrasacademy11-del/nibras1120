const C = require('../../models/commission');
const Team = require('../../models/Team');
const M = require('../../lib/money');
const rules = require('../../lib/commission');
const { teamOf } = require('../../lib/teams');
const { getSetting } = require('../crm/service');
const L = require('../finance/ledger');

// Creates commission lines when money moves: a confirmed payment earns, a paid refund or a void
// reverses. Called inside the same database transaction as the payment change.

async function rateFor(userId, kind, at, session) {
    const history = await C.CommissionRate.find({ user: userId, kind, effectiveFrom: { $lte: at } }).sort({ effectiveFrom: -1 }).limit(1).session(session || null).lean();
    if (history.length) return history[0].rate;
    const fallback = await getSetting(kind === 'team_leader' ? 'commissions.defaultLeaderRate' : 'commissions.defaultEmployeeRate');
    return Number(fallback) || 0;
}

async function beneficiariesFor(payment, session) {
    if (payment.enrollment) {
        const split = await C.CommissionSplit.findOne({ enrollment: payment.enrollment }).session(session || null).lean();
        if (split && split.beneficiaries.length) return split.beneficiaries.map((b) => ({ user: b.user, share: b.share }));
    }
    return payment.collectedBy ? [{ user: payment.collectedBy, share: 100 }] : [];
}

async function onPaymentConfirmed(payment, { session, by } = {}) {
    const at = payment.paidAt;
    const base = await L.baseCurrency();
    const dec = await L.decimals(base);
    const people = await beneficiariesFor(payment, session);
    const beneficiaries = [];
    for (const p of people) {
        beneficiaries.push({ user: p.user, share: p.share, rate: await rateFor(p.user, 'employee', at, session), team: await teamOf(p.user) });
    }
    // The extra goes to the leader of the team that collected, at the time of the payment
    let leader = null;
    if (payment.team) {
        const team = await Team.findById(payment.team).select('leader').session(session || null).lean();
        if (team && team.leader) leader = { user: team.leader, rate: await rateFor(team.leader, 'team_leader', at, session), team: payment.team };
    }
    const lines = rules.computeLines({ baseAmount: payment.baseAmount, beneficiaries, leader, decimals: dec });
    if (!lines.length) return [];
    const docs = lines.map((l) => ({
        ...l, kind: 'earned', payment: payment._id, enrollment: payment.enrollment || null, customer: payment.customer?._id || payment.customer,
        receiptNo: payment.receiptNo, currency: base, date: at, period: M.periodKey(at), createdBy: by || null
    }));
    try {
        return await C.CommissionLine.insertMany(docs, { session, ordered: false });
    } catch (err) {
        if (err.code === 11000 || (err.writeErrors && err.writeErrors.every((e) => e.code === 11000))) return [];
        throw err;
    }
}

// fraction: the part of the payment that was refunded (1 for a void)
async function reverseFor(payment, { kind, refund = null, fraction, date, session, by }) {
    const earned = await C.CommissionLine.find({ payment: payment._id, kind: 'earned', status: { $ne: 'cancelled' } }).session(session || null).lean();
    if (!earned.length) return [];
    const base = await L.baseCurrency();
    const dec = await L.decimals(base);
    const reversals = rules.reverseLines(earned, fraction, dec);
    // A line that was never approved is simply cancelled on a full void instead of being netted
    const docs = reversals.map((l) => ({
        ...l, kind, payment: payment._id, refund: refund ? refund._id : null, enrollment: payment.enrollment || null,
        customer: payment.customer?._id || payment.customer, receiptNo: payment.receiptNo, currency: base,
        date, period: M.periodKey(date), createdBy: by || null,
        note: kind === 'refund' ? `Refund ${refund.refundNo}` : `Void of ${payment.receiptNo}`
    }));
    try {
        return await C.CommissionLine.insertMany(docs, { session, ordered: false });
    } catch (err) {
        if (err.code === 11000 || (err.writeErrors && err.writeErrors.every((e) => e.code === 11000))) return [];
        throw err;
    }
}

const onRefundPaid = (payment, refund, opts) => reverseFor(payment, { ...opts, kind: 'refund', refund, fraction: refund.amount / payment.amount, date: refund.paidAt || new Date() });
const onPaymentVoided = (payment, opts) => reverseFor(payment, { ...opts, kind: 'void', fraction: 1, date: payment.voidedAt || new Date() });

module.exports = { onPaymentConfirmed, onRefundPaid, onPaymentVoided, rateFor };
