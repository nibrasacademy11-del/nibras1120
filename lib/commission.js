// Commission rules. Pure functions so they can be unit tested.
//
// Commissions are earned on money actually collected: the base-currency value of a confirmed payment.
// The payment is split between beneficiaries (100% to the collector unless the admin set a split
// for the enrollment); each beneficiary earns their own rate on their share. The team leader of
// the collecting team earns an extra rate on the whole payment, paid by the academy (it does not
// reduce the employees' share). Rates are frozen on each line when it is created.

const { round } = require('./money');

// beneficiaries: [{ user, share (percent), rate (percent), team }]
// leader: { user, rate } or null
function computeLines({ baseAmount, beneficiaries, leader, decimals = 2 }) {
    const lines = [];
    const shares = normalizeShares(beneficiaries);
    for (const b of shares) {
        const commissionable = round((baseAmount * b.share) / 100, decimals);
        const amount = round((commissionable * b.rate) / 100, decimals);
        if (amount !== 0) lines.push({ beneficiary: b.user, role: 'employee', share: b.share, rate: b.rate, commissionable, amount, team: b.team || null });
    }
    if (leader && leader.user && leader.rate > 0) {
        // A leader who is also a beneficiary still earns the leader extra on top
        const amount = round((baseAmount * leader.rate) / 100, decimals);
        if (amount !== 0) lines.push({ beneficiary: leader.user, role: 'team_leader', share: 100, rate: leader.rate, commissionable: round(baseAmount, decimals), amount, team: leader.team || null });
    }
    return lines;
}

// Shares must total 100; anything else is scaled, and an empty list gives nothing
function normalizeShares(list) {
    const valid = (list || []).filter((b) => b && b.user && Number(b.share) > 0);
    const total = valid.reduce((a, b) => a + Number(b.share), 0);
    if (!total) return [];
    return valid.map((b) => ({ ...b, share: round((Number(b.share) * 100) / total, 4), rate: Number(b.rate) || 0 }));
}

function validateSplit(list) {
    const errors = [];
    const users = new Set();
    let total = 0;
    for (const b of list || []) {
        if (!b.user) errors.push('missing_user');
        if (users.has(String(b.user))) errors.push('duplicate_user');
        users.add(String(b.user));
        const s = Number(b.share);
        if (!(s > 0 && s <= 100)) errors.push('bad_share');
        total += s;
    }
    if (!list || !list.length) errors.push('empty');
    if (Math.abs(total - 100) > 0.001) errors.push('total_not_100');
    return [...new Set(errors)];
}

// Lines that cancel part of earlier lines: a refund of a fraction of the payment, or a full void.
// Each reversal mirrors the original line with a negative amount and the same frozen rate.
function reverseLines(lines, fraction, decimals = 2) {
    const f = Math.max(0, Math.min(1, Number(fraction) || 0));
    return lines
        .map((l) => ({
            beneficiary: l.beneficiary, role: l.role, share: l.share, rate: l.rate, team: l.team || null,
            commissionable: -round(l.commissionable * f, decimals),
            amount: -round(l.amount * f, decimals),
            reversalOf: l._id || null
        }))
        .filter((l) => l.amount !== 0);
}

// The rate in effect at a moment from a history of { rate, effectiveFrom }, newest wins
function rateAt(history, at, fallback = 0) {
    const t = new Date(at).getTime();
    const applicable = (history || []).filter((h) => new Date(h.effectiveFrom).getTime() <= t)
        .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
    return applicable.length ? applicable[0].rate : fallback;
}

// Totals of a statement by status
function summarize(lines, decimals = 2) {
    const out = { earned: 0, reversed: 0, net: 0, due: 0, approved: 0, paid: 0 };
    for (const l of lines) {
        if (l.status === 'cancelled') continue;
        if (l.amount >= 0) out.earned = round(out.earned + l.amount, decimals);
        else out.reversed = round(out.reversed + l.amount, decimals);
        out.net = round(out.net + l.amount, decimals);
        if (out[l.status] !== undefined) out[l.status] = round(out[l.status] + l.amount, decimals);
    }
    return out;
}

module.exports = { computeLines, normalizeShares, validateSplit, reverseLines, rateAt, summarize };
