const mongoose = require('mongoose');
const F = require('../../models/finance');
const SystemSetting = require('../../models/SystemSetting');
const M = require('../../lib/money');
const audit = require('../../lib/audit');
const { HttpError, assertVersion, paging, parseDate } = require('../../lib/http');
const L = require('./ledger');

// Currencies, exchange rates, cash and bank accounts, financial periods

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);

// ---- currencies and rates ----

exports.listCurrencies = async (req, res) => {
    const base = await L.baseCurrency();
    const list = await L.currencies();
    const latest = await F.ExchangeRate.aggregate([
        { $sort: { effectiveAt: -1 } },
        { $match: { effectiveAt: { $lte: new Date() } } },
        { $group: { _id: '$currency', rate: { $first: '$rate' }, effectiveAt: { $first: '$effectiveAt' } } }
    ]);
    const rates = Object.fromEntries(latest.map((r) => [r._id, r]));
    res.json({
        base,
        items: list.map((c) => ({ ...c, isBase: c.code === base, rate: c.code === base ? 1 : rates[c.code]?.rate ?? null, rateAt: rates[c.code]?.effectiveAt ?? null }))
    });
};

// Adds a currency or turns one on/off. The defaults are written on first use.
exports.saveCurrency = async (req, res) => {
    const code = String(req.body.code || '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw new HttpError(400, 'رمز العملة من 3 أحرف. / The currency code has 3 letters.');
    if (!(await F.Currency.countDocuments())) await F.Currency.insertMany(M.DEFAULT_CURRENCIES.map((c) => ({ ...c, active: true })));
    const base = await L.baseCurrency();
    if (code === base && req.body.active === false) throw new HttpError(400, 'لا يمكن تعطيل العملة الأساسية. / The base currency cannot be disabled.');
    const existing = await F.Currency.findOne({ code });
    const data = {
        code,
        nameAr: str(req.body.nameAr, 60) || existing?.nameAr || code,
        nameEn: str(req.body.nameEn, 60) || existing?.nameEn || code,
        symbol: str(req.body.symbol, 8) || existing?.symbol || code,
        decimals: [0, 1, 2, 3].includes(Number(req.body.decimals)) ? Number(req.body.decimals) : existing?.decimals ?? 2,
        active: req.body.active !== false
    };
    // Changing decimals after money was recorded in the currency would make old amounts inconsistent
    if (existing && data.decimals !== existing.decimals && (await F.Movement.exists({ currency: code }))) {
        throw new HttpError(400, 'لا يمكن تغيير عدد الخانات العشرية بعد تسجيل عمليات. / Decimals cannot change after transactions exist.');
    }
    const doc = await F.Currency.findOneAndUpdate({ code }, data, { upsert: true, new: true });
    L.invalidateCurrencies();
    await audit.record(req, { action: existing ? 'currency.updated' : 'currency.created', resource: 'currencies', resourceId: code, summary: `${code} ${data.active ? 'active' : 'inactive'}`, changes: existing ? audit.diff(existing.toObject(), doc.toObject(), ['nameAr', 'nameEn', 'symbol', 'decimals', 'active']) : undefined });
    res.json({ item: doc });
};

exports.listRates = async (req, res) => {
    const { limit, skip } = paging(req.query, { defaultLimit: 100, maxLimit: 500 });
    const filter = req.query.currency ? { currency: String(req.query.currency).toUpperCase() } : {};
    const items = await F.ExchangeRate.find(filter).populate('setBy', 'name').sort({ effectiveAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean();
    res.json({ items });
};

// A new rate never changes old transactions: each one keeps the rate it was recorded with
exports.addRate = async (req, res) => {
    const code = String(req.body.currency || '').toUpperCase();
    const base = await L.baseCurrency();
    if (code === base) throw new HttpError(400, 'سعر العملة الأساسية دائماً 1. / The base currency rate is always 1.');
    await L.assertActiveCurrency(code);
    const rate = Number(req.body.rate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1e6) throw new HttpError(400, 'سعر غير صالح. / Invalid rate.');
    const effectiveAt = parseDate(req.body.effectiveAt) || new Date();
    const r = await F.ExchangeRate.create({ currency: code, rate: M.round(rate, 6), effectiveAt, setBy: req.user.id, note: str(req.body.note, 200) });
    const previous = await F.ExchangeRate.findOne({ currency: code, _id: { $ne: r._id }, effectiveAt: { $lte: effectiveAt } }).sort({ effectiveAt: -1 }).lean();
    await audit.record(req, { action: 'rate.added', resource: 'currencies', resourceId: code, summary: `1 ${code} = ${r.rate} ${base} from ${effectiveAt.toISOString()}`, changes: { rate: { from: previous ? previous.rate : null, to: r.rate } } });
    res.status(201).json({ item: r });
};

// The base currency can only change while there are no transactions
exports.setBaseCurrency = async (req, res) => {
    const code = String(req.body.code || '').toUpperCase();
    await L.assertActiveCurrency(code);
    if (await F.Movement.exists({})) throw new HttpError(409, 'لا يمكن تغيير العملة الأساسية بعد تسجيل عمليات مالية. / The base currency cannot change once transactions exist.', 'HAS_TRANSACTIONS');
    const before = await L.baseCurrency();
    await SystemSetting.findOneAndUpdate({ key: 'finance.baseCurrency' }, { key: 'finance.baseCurrency', value: code, updatedBy: req.user.id }, { upsert: true });
    await audit.record(req, { action: 'finance.base_currency_changed', resource: 'currencies', summary: `${before} → ${code}`, reason: str(req.body.reason, 300), changes: { baseCurrency: { from: before, to: code } } });
    res.json({ base: code });
};

// ---- accounts ----

exports.listAccounts = async (req, res) => {
    const finance = !!req.user.grants['accounts.view'];
    const filter = finance ? {} : { active: true, allowEmployees: true };
    const accounts = await F.FinanceAccount.find(filter).sort({ active: -1, currency: 1, nameAr: 1 }).lean();
    if (!finance) return res.json({ items: accounts.map(({ _id, code, nameAr, nameEn, type, currency }) => ({ _id, code, nameAr, nameEn, type, currency })) });
    const balances = await L.accountBalances(accounts.map((a) => a._id));
    res.json({ items: accounts.map((a) => ({ ...a, ...(balances[String(a._id)] || { in: 0, out: 0, balance: 0, baseBalance: 0 }) })) });
};

exports.saveAccount = async (req, res) => {
    const data = {
        code: str(req.body.code, 30).toUpperCase(),
        nameAr: str(req.body.nameAr, 120),
        nameEn: str(req.body.nameEn, 120),
        type: F.ACCOUNT_TYPES.includes(req.body.type) ? req.body.type : null,
        details: str(req.body.details, 300),
        allowEmployees: req.body.allowEmployees === true,
        active: req.body.active !== false
    };
    if (!data.code || !data.nameAr || !data.type) throw new HttpError(400, 'الكود والاسم والنوع مطلوبة. / Code, name and type are required.');
    let doc;
    if (req.params.id) {
        doc = await F.FinanceAccount.findById(req.params.id);
        if (!doc) throw new HttpError(404, 'Not found.');
        assertVersion(doc, req.body.__v);
        const before = doc.toObject();
        doc.set(data);   // the currency of an account never changes
        await doc.save();
        await audit.record(req, { action: 'account.updated', resource: 'accounts', resourceId: doc._id, summary: doc.nameAr, changes: audit.diff(before, doc.toObject(), Object.keys(data)) });
    } else {
        const currency = String(req.body.currency || '').toUpperCase();
        await L.assertActiveCurrency(currency);
        doc = await F.FinanceAccount.create({ ...data, currency });
        await audit.record(req, { action: 'account.created', resource: 'accounts', resourceId: doc._id, summary: `${doc.code} ${doc.nameAr} (${currency})` });
    }
    res.json({ item: doc });
};

// Account statement: movements with a running balance, between two dates
exports.accountStatement = async (req, res) => {
    const account = await F.FinanceAccount.findById(req.params.id).lean();
    if (!account) throw new HttpError(404, 'Not found.');
    const from = parseDate(req.query.from) || new Date(Date.now() - 30 * 864e5);
    const to = parseDate(req.query.to) || new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || ''))) to.setUTCHours(23, 59, 59, 999);
    const opening = await F.Movement.aggregate([
        { $match: { account: account._id, date: { $lt: from } } },
        { $group: { _id: null, v: { $sum: { $cond: [{ $eq: ['$direction', 'in'] }, '$amount', { $multiply: ['$amount', -1] }] } } } }
    ]);
    const dec = await L.decimals(account.currency);
    let running = M.round(opening[0]?.v || 0, dec);
    const openingBalance = running;
    const moves = await F.Movement.find({ account: account._id, date: { $gte: from, $lte: to } }).sort({ date: 1, createdAt: 1 }).populate('by', 'name').lean();
    const items = moves.map((m) => {
        running = M.round(running + (m.direction === 'in' ? m.amount : -m.amount), dec);
        return { ...m, balance: running };
    });
    res.json({ account, from, to, openingBalance, closingBalance: running, items });
};

// ---- periods ----

exports.listPeriods = async (req, res) => {
    const saved = await F.Period.find().lean();
    const byKey = Object.fromEntries(saved.map((p) => [p.key, p]));
    const keys = [];
    const d = new Date();
    for (let i = 0; i < 24; i++) {
        keys.push(M.periodKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 15))));
    }
    res.json({ items: keys.map((key) => byKey[key] || { key, status: 'open', history: [] }) });
};

exports.setPeriod = async (req, res) => {
    const key = String(req.params.key);
    if (!/^\d{4}-\d{2}$/.test(key)) throw new HttpError(400, 'Invalid period.');
    const status = req.body.status === 'closed' ? 'closed' : 'open';
    const reason = str(req.body.reason, 300);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    if (status === 'closed' && key >= M.periodKey(new Date())) throw new HttpError(400, 'لا يمكن إقفال الشهر الحالي أو شهر قادم. / The current or a future month cannot be closed.');
    // Reopening a closed month is rare and sensitive: super admin only
    if (status === 'open' && req.user.role !== 'super_admin') throw new HttpError(403, 'إعادة فتح فترة مقفلة لمدير النظام فقط. / Only the super admin can reopen a closed period.');
    if (status === 'closed') {
        const pending = await F.Payment.countDocuments({ period: key, status: 'pending' });
        if (pending) throw new HttpError(409, `يوجد ${pending} دفعة بانتظار التأكيد في هذا الشهر. / ${pending} payments in this month are still waiting for confirmation.`, 'PENDING_PAYMENTS');
    }
    const p = await F.Period.findOneAndUpdate(
        { key },
        { $set: { status }, $push: { history: { status, by: req.user.id, byName: req.user.name, at: new Date(), reason } } },
        { upsert: true, new: true }
    );
    await audit.record(req, { action: status === 'closed' ? 'period.closed' : 'period.reopened', resource: 'accounts', resourceId: key, summary: key, reason });
    res.json({ item: p });
};

exports._oid = oid;
