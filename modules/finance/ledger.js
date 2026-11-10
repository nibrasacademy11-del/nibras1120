const mongoose = require('mongoose');
const F = require('../../models/finance');
const M = require('../../lib/money');
const { HttpError } = require('../../lib/http');
const { getSetting } = require('../crm/service');

// Shared finance services: base currency, rates, period checks, ledger movements, balances

async function baseCurrency() {
    return (await getSetting('finance.baseCurrency')) || 'SAR';
}

let currencyCache = null;
let currencyAt = 0;
async function currencies() {
    if (currencyCache && Date.now() - currencyAt < 30000) return currencyCache;
    const list = await F.Currency.find().lean();
    currencyCache = list.length ? list : M.DEFAULT_CURRENCIES.map((c) => ({ ...c, active: true }));
    currencyAt = Date.now();
    return currencyCache;
}
const invalidateCurrencies = () => { currencyCache = null; };

async function decimals(code) {
    return M.decimalsOf(code, await currencies());
}

async function assertActiveCurrency(code) {
    const c = (await currencies()).find((x) => x.code === code);
    if (!c || c.active === false) throw new HttpError(400, `العملة ${code} غير مفعلة. / Currency ${code} is not enabled.`, 'CURRENCY_INACTIVE');
    return c;
}

// The rate in effect at a moment. The base currency is always 1.
async function rateAt(code, at = new Date()) {
    if (code === (await baseCurrency())) return 1;
    const r = await F.ExchangeRate.findOne({ currency: code, effectiveAt: { $lte: at } }).sort({ effectiveAt: -1 }).lean();
    if (!r) throw new HttpError(400, `لا يوجد سعر صرف للعملة ${code} في هذا التاريخ. / No exchange rate for ${code} at that date.`, 'NO_RATE');
    return r.rate;
}

async function assertOpenPeriod(date) {
    const key = M.periodKey(date);
    const p = await F.Period.findOne({ key }).lean();
    if (p && p.status === 'closed') {
        throw new HttpError(409, `الفترة المالية ${key} مقفلة. / The financial period ${key} is closed.`, 'PERIOD_CLOSED');
    }
    return key;
}

// Transactions can be dated up to now and back into open periods, never in the future
function checkDate(date) {
    const d = date ? new Date(date) : new Date();
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Invalid date.');
    if (d.getTime() > Date.now() + 5 * 60 * 1000) throw new HttpError(400, 'لا يمكن تسجيل عملية بتاريخ مستقبلي. / The date cannot be in the future.');
    return d;
}

async function post({ account, date, direction, amount, currency, rate, source, description, by, session }) {
    const baseDec = await decimals(await baseCurrency());
    const [m] = await F.Movement.create([{
        account, date, period: M.periodKey(date), direction, amount, currency, rate,
        baseAmount: M.toBase(amount, rate, baseDec), source, description, by
    }], { session });
    return m;
}

// Runs fn inside a MongoDB transaction where the server supports it (Atlas does), so a payment and its
// ledger movement are saved together or not at all
async function inTransaction(fn) {
    const session = await mongoose.startSession();
    try {
        let out;
        await session.withTransaction(async () => {
            out = await fn(session);
        });
        return out;
    } catch (err) {
        if (/Transaction numbers are only allowed|replica set/i.test(err.message || '')) return fn(undefined);
        throw err;
    } finally {
        await session.endSession();
    }
}

async function accountBalances(accountIds) {
    const match = accountIds ? { account: { $in: accountIds } } : {};
    const rows = await F.Movement.aggregate([
        { $match: match },
        { $group: {
            _id: '$account',
            in: { $sum: { $cond: [{ $eq: ['$direction', 'in'] }, '$amount', 0] } },
            out: { $sum: { $cond: [{ $eq: ['$direction', 'out'] }, '$amount', 0] } },
            baseIn: { $sum: { $cond: [{ $eq: ['$direction', 'in'] }, '$baseAmount', 0] } },
            baseOut: { $sum: { $cond: [{ $eq: ['$direction', 'out'] }, '$baseAmount', 0] } }
        } }
    ]);
    return Object.fromEntries(rows.map((r) => [String(r._id), { in: r.in, out: r.out, balance: r.in - r.out, baseBalance: r.baseIn - r.baseOut }]));
}

// What has been paid toward each charge, in the charge's currency
async function chargeTotals(chargeIds) {
    const [pays, refunds] = await Promise.all([
        F.Payment.aggregate([{ $match: { charge: { $in: chargeIds }, status: 'confirmed' } }, { $group: { _id: '$charge', applied: { $sum: '$chargeAmount' } } }]),
        F.Refund.aggregate([
            { $match: { status: 'paid' } },
            { $lookup: { from: 'payments', localField: 'payment', foreignField: '_id', as: 'p' } },
            { $unwind: '$p' },
            { $match: { 'p.charge': { $in: chargeIds } } },
            { $group: { _id: '$p.charge', refunded: { $sum: '$chargeAmount' } } }
        ])
    ]);
    const out = {};
    for (const p of pays) out[String(p._id)] = { applied: p.applied, refunded: 0 };
    for (const r of refunds) {
        out[String(r._id)] = out[String(r._id)] || { applied: 0, refunded: 0 };
        out[String(r._id)].refunded = r.refunded;
    }
    return out;
}

module.exports = {
    baseCurrency, currencies, invalidateCurrencies, decimals, assertActiveCurrency, rateAt,
    assertOpenPeriod, checkDate, post, inTransaction, accountBalances, chargeTotals
};
