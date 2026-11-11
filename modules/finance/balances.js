const F = require('../../models/finance');
const L = require('./ledger');
const R = require('../../lib/certificateRules');

// What a customer still owes, per currency: on all their charges, or on one enrollment's charges.
// Used before a certificate is issued.
async function outstandingFor({ customer, enrollment }) {
    const filter = { status: 'active', ...(enrollment ? { enrollment } : { customer }) };
    const charges = await F.Charge.find(filter).select('currency netAmount status').lean();
    if (!charges.length) return { clear: true, byCurrency: [] };
    const totals = await L.chargeTotals(charges.map((c) => c._id));
    const decs = {};
    for (const cur of new Set(charges.map((c) => c.currency))) decs[cur] = await L.decimals(cur);
    return R.outstanding(charges, totals, (c) => decs[c]);
}

module.exports = { outstandingFor };
