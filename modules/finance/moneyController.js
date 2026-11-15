const mongoose = require('mongoose');
const F = require('../../models/finance');
const Customer = require('../../models/Customer');
const Enrollment = require('../../models/Enrollment');
const User = require('../../models/User');
const M = require('../../lib/money');
const P = require('../../lib/permissions');
const audit = require('../../lib/audit');
const { teamOf } = require('../../lib/teams');
const { nextNumber } = require('../../lib/sequence');
const { customerAccess } = require('../../lib/customerAccess');
const { HttpError, assertVersion, paging, parseDate } = require('../../lib/http');
const { addEvent, notify, getSetting } = require('../crm/service');
const L = require('./ledger');
const commissions = require('../commission/engine');

// Customer charges and installments, payments and receipts, refunds, discounts, voids,
// expenses, transfers and the approvals that guard them. Nothing financial is edited or deleted:
// every correction is a new record with its own ledger movement.

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isFinanceStaff = (req) => P.scopeFor(req.user.grants, 'payments.update') === 'all';
const canApprove = (req) => P.scopeFor(req.user.grants, 'payments.approve') === 'all';

async function customerFor(req, id, { edit = false } = {}) {
    const customer = await Customer.findById(id).select('customerNo nameAr owner team status user country');
    if (!customer || customer.status === 'merged') throw new HttpError(404, 'Not found.');
    const access = customerAccess({ actor: req.user, grants: req.user.grants, customer });
    const ok = edit ? access.canEditSection.financial || isFinanceStaff(req) : access.sections.financial;
    if (!ok) throw new HttpError(404, 'Not found.');
    return customer;
}

async function amountFor(currency, raw) {
    const dec = await L.decimals(currency);
    const amount = M.round(Number(raw), dec);
    if (!M.isValidAmount(amount, dec)) throw new HttpError(400, 'المبلغ غير صالح. / Invalid amount.', 'BAD_AMOUNT');
    return { amount, dec };
}

async function notifyApprovers(message) {
    const users = await User.find({ role: 'super_admin', status: 'active' }).select('_id').lean();
    for (const u of users) await notify(u._id, message);
}

async function requestApproval(req, { type, target, customer, summary, amount, currency, reason }) {
    const a = await F.Approval.create({ type, target, customer, summary, amount, currency, reason, requestedBy: req.user.id });
    await notifyApprovers({ type: 'finance_approval', titleAr: `موافقة مالية مطلوبة: ${summary}`, titleEn: `Finance approval needed: ${summary}`, bodyAr: reason, bodyEn: reason, link: '/approvals' });
    await audit.record(req, { action: `approval.requested.${type}`, resource: 'payments', resourceId: a._id, summary, reason, meta: { amount, currency } });
    return a;
}

// ---- charges ----

function installmentsFrom(body, net, dec) {
    const count = Math.max(1, Math.min(parseInt(body.installments?.count, 10) || 1, 60));
    const first = parseDate(body.installments?.firstDue) || new Date();
    const every = Math.max(1, Math.min(parseInt(body.installments?.everyMonths, 10) || 1, 12));
    return M.splitInstallments(net, count, first, every, dec);
}

exports.createCharge = async (req, res) => {
    const customer = await customerFor(req, oid(req.body.customer), { edit: true });
    const currency = String(req.body.currency || '').toUpperCase();
    await L.assertActiveCurrency(currency);
    const { amount, dec } = await amountFor(currency, req.body.listAmount);
    const description = str(req.body.description, 300);
    let enrollment = null;
    if (req.body.enrollment) {
        enrollment = await Enrollment.findOne({ _id: oid(req.body.enrollment), customer: customer._id }).select('enrollmentNo programTitleAr');
        if (!enrollment) throw new HttpError(400, 'التسجيل لا يخص هذا العميل. / The enrollment is not this customer’s.');
    }
    if (!description && !enrollment) throw new HttpError(400, 'الوصف مطلوب. / A description is required.');
    const rate = await L.rateAt(currency);
    const baseDec = await L.decimals(await L.baseCurrency());
    const { number } = await nextNumber('charge');
    const charge = await F.Charge.create({
        chargeNo: number,
        customer: customer._id,
        enrollment: enrollment ? enrollment._id : null,
        description: description || `${enrollment.programTitleAr} (${enrollment.enrollmentNo})`,
        currency,
        listAmount: amount,
        netAmount: amount,
        rate,
        baseNet: M.baseOf(amount, rate, baseDec),
        installments: installmentsFrom(req.body, amount, dec),
        owner: customer.owner,
        team: customer.team,
        createdBy: req.user.id
    });
    await addEvent(req, customer._id, 'charge', `${charge.chargeNo}: ${charge.description} — ${amount} ${currency}`, { section: 'financial' });
    await audit.record(req, { action: 'charge.created', resource: 'customer_financial', resourceId: charge._id, summary: `${charge.chargeNo} ${customer.customerNo} ${amount} ${currency}` });

    const discount = Number(req.body.discount) || 0;
    if (discount > 0) await requestDiscount(req, charge, discount, str(req.body.discountReason) || 'Discount on enrollment');
    res.status(201).json({ item: await F.Charge.findById(charge._id) });
};

async function requestDiscount(req, charge, raw, reason) {
    const { amount } = await amountFor(charge.currency, raw);
    if (amount >= charge.listAmount) throw new HttpError(400, 'الخصم أكبر من المبلغ. / The discount is larger than the amount.');
    if (charge.discount.status === 'pending') throw new HttpError(409, 'يوجد طلب خصم قيد الانتظار. / A discount is already waiting for approval.');
    const a = await requestApproval(req, {
        type: 'discount', target: { kind: 'charge', id: charge._id, no: charge.chargeNo }, customer: charge.customer,
        summary: `${charge.chargeNo}: ${amount} ${charge.currency}`, amount, currency: charge.currency, reason
    });
    charge.discount = { amount, status: 'pending', reason, approval: a._id };
    await charge.save();
    return a;
}

exports.requestDiscount = async (req, res) => {
    const charge = await F.Charge.findById(req.params.id);
    if (!charge || charge.status !== 'active') throw new HttpError(404, 'Not found.');
    await customerFor(req, charge.customer, { edit: true });
    const reason = str(req.body.reason);
    if (!reason) throw new HttpError(400, 'سبب الخصم مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const a = await requestDiscount(req, charge, req.body.amount, reason);
    res.status(201).json({ approval: a });
};

exports.cancelCharge = async (req, res) => {
    const charge = await F.Charge.findById(req.params.id);
    if (!charge || charge.status !== 'active') throw new HttpError(404, 'Not found.');
    if (!canApprove(req)) throw new HttpError(403, 'Forbidden.');
    const reason = str(req.body.reason);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    if (await F.Payment.exists({ charge: charge._id, status: { $in: ['pending', 'confirmed'] } })) {
        throw new HttpError(409, 'على هذا المستحق دفعات؛ استردها أو ألغها أولاً. / This charge has payments; refund or void them first.', 'HAS_PAYMENTS');
    }
    charge.status = 'cancelled';
    charge.cancelReason = reason;
    await charge.save();
    await addEvent(req, charge.customer, 'charge', `${charge.chargeNo} cancelled: ${reason}`, { section: 'financial' });
    await audit.record(req, { action: 'charge.cancelled', resource: 'customer_financial', resourceId: charge._id, summary: charge.chargeNo, reason });
    res.json({ item: charge });
};

// ---- payments ----

const PAY_FIELDS = { owner: 'collectedBy', team: 'team' };
const PAY_POP = [
    { path: 'customer', select: 'customerNo nameAr nameEn country' },
    { path: 'account', select: 'code nameAr nameEn type currency' },
    { path: 'collectedBy', select: 'name' },
    { path: 'recordedBy', select: 'name' },
    { path: 'confirmedBy', select: 'name' },
    { path: 'charge', select: 'chargeNo description currency' },
    { path: 'enrollment', select: 'enrollmentNo programTitleAr' }
];

async function postPayment(payment, by, session) {
    await L.post({
        account: payment.account, date: payment.paidAt, direction: 'in', amount: payment.amount, currency: payment.currency, rate: payment.rate,
        source: { kind: 'payment', id: payment._id, no: payment.receiptNo }, description: `Receipt ${payment.receiptNo}`, by, session
    });
}

exports.createPayment = async (req, res) => {
    const customer = await customerFor(req, oid(req.body.customer), { edit: true });
    const account = await F.FinanceAccount.findById(oid(req.body.account));
    if (!account || !account.active) throw new HttpError(400, 'اختر الخزينة أو الحساب. / Choose the account.');
    if (!isFinanceStaff(req) && !account.allowEmployees) throw new HttpError(403, 'لا يمكنك التحصيل في هذا الحساب. / You cannot collect into this account.');
    const method = F.METHODS.includes(req.body.method) ? req.body.method : null;
    if (!method) throw new HttpError(400, 'اختر طريقة الدفع. / Choose the payment method.');
    // Money is kept in the currency it was paid in: an account holds one currency
    const currency = account.currency;
    if (req.body.currency && String(req.body.currency).toUpperCase() !== currency) {
        throw new HttpError(400, `هذا الحساب بعملة ${currency}. اختر حساباً بعملة الدفع. / This account holds ${currency}; choose an account in the payment currency.`, 'CURRENCY_MISMATCH');
    }
    const { amount } = await amountFor(currency, req.body.amount);
    const paidAt = L.checkDate(req.body.paidAt);
    const period = await L.assertOpenPeriod(paidAt);
    const rate = await L.rateAt(currency, paidAt);
    const baseDec = await L.decimals(await L.baseCurrency());

    let charge = null;
    let chargeAmount = 0;
    if (req.body.charge) {
        charge = await F.Charge.findOne({ _id: oid(req.body.charge), customer: customer._id, status: 'active' });
        if (!charge) throw new HttpError(400, 'المستحق غير موجود. / The charge was not found.');
        const chargeDec = await L.decimals(charge.currency);
        if (charge.currency === currency) chargeAmount = amount;
        else if (req.body.chargeAmount !== undefined && req.body.chargeAmount !== null && req.body.chargeAmount !== '') {
            // Paid in another currency: the staff member says how much of the charge this covers
            chargeAmount = (await amountFor(charge.currency, req.body.chargeAmount)).amount;
        } else {
            const chargeRate = await L.rateAt(charge.currency, paidAt);
            if (!rate || !chargeRate) {
                throw new HttpError(400, `الدفع بعملة ${currency} والمستحق بعملة ${charge.currency}: اكتب كم يغطي من المستحق بـ${charge.currency}. / Paid in ${currency} for a charge in ${charge.currency}: enter how much of the charge it covers, in ${charge.currency}.`, 'CHARGE_AMOUNT_REQUIRED');
            }
            chargeAmount = M.convert(amount, rate, chargeRate, chargeDec);
        }
    }

    // The collector earns the commission: the customer's responsible employee, or the employee who
    // recorded the money. Finance staff recording a payment for an unassigned customer are not collectors.
    const collectedBy = oid(req.body.collectedBy) && isFinanceStaff(req)
        ? oid(req.body.collectedBy)
        : customer.owner || (isFinanceStaff(req) ? null : oid(req.user.id));
    const confirmed = isFinanceStaff(req);
    const { number } = await nextNumber('receipt');
    const payment = await L.inTransaction(async (session) => {
        const [p] = await F.Payment.create([{
            receiptNo: number,
            customer: customer._id,
            charge: charge ? charge._id : null,
            enrollment: charge ? charge.enrollment : oid(req.body.enrollment),
            account: account._id,
            method,
            reference: str(req.body.reference, 120),
            amount, currency, rate,
            baseAmount: M.baseOf(amount, rate, baseDec),
            chargeAmount,
            paidAt, period,
            collectedBy,
            team: await teamOf(collectedBy),
            recordedBy: req.user.id,
            status: confirmed ? 'confirmed' : 'pending',
            confirmedBy: confirmed ? req.user.id : null,
            confirmedAt: confirmed ? new Date() : null,
            note: str(req.body.note)
        }], { session });
        if (confirmed) {
            await postPayment(p, req.user.id, session);
            await commissions.onPaymentConfirmed(p, { session, by: req.user.id });
        }
        return p;
    });

    await addEvent(req, customer._id, 'payment', `${payment.receiptNo}: ${amount} ${currency} (${method})${confirmed ? '' : ' — pending confirmation'}`, { section: 'financial' });
    // Paid in full now: certificates that waited for the payment are issued
    if (confirmed) {
        await emailReceipt(payment);
        await require('../learning/autoCertificates').afterPayment(customer._id);
    }
    await audit.record(req, { action: confirmed ? 'payment.recorded' : 'payment.recorded_pending', resource: 'payments', resourceId: payment._id, summary: `${payment.receiptNo} ${customer.customerNo} ${amount} ${currency}` });
    res.status(201).json({ item: await F.Payment.findById(payment._id).populate(PAY_POP) });
};

exports.listPayments = async (req, res) => {
    const { limit, page, skip } = paging(req.query);
    const and = [P.scopeFilter(req.scope, req.user, PAY_FIELDS)];
    const q = req.query;
    if (q.status) and.push({ status: String(q.status) });
    if (oid(q.customer)) and.push({ customer: oid(q.customer) });
    if (oid(q.account)) and.push({ account: oid(q.account) });
    if (q.currency) and.push({ currency: String(q.currency).toUpperCase() });
    if (q.method) and.push({ method: String(q.method) });
    if (q.mine === '1') and.push({ collectedBy: req.user.id });
    const from = parseDate(q.from);
    const to = parseDate(q.to);
    if (from || to) and.push({ paidAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: new Date(to.getTime() + 864e5 - 1) } : {}) } });
    if (q.q) and.push({ receiptNo: String(q.q).toUpperCase().trim() });
    const filter = { $and: and };
    const [items, total, totals] = await Promise.all([
        F.Payment.find(filter).populate(PAY_POP).sort({ paidAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
        F.Payment.countDocuments(filter),
        F.Payment.aggregate([{ $match: { ...(await mongoFilter(filter)), status: 'confirmed' } }, { $group: { _id: '$currency', amount: { $sum: '$amount' }, n: { $sum: 1 } } }, { $sort: { amount: -1 } }])
    ]);
    res.json({ items, total, page, limit, totals });
};

// Aggregations do not cast types like find() does
async function mongoFilter(filter) {
    return JSON.parse(JSON.stringify(filter), (k, v) => {
        if (typeof v !== 'string') return v;
        if (/^[0-9a-f]{24}$/i.test(v)) return new mongoose.Types.ObjectId(v);
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)) return new Date(v);
        return v;
    });
}

async function loadPayment(req, id) {
    const p = await F.Payment.findById(id).populate(PAY_POP);
    if (!p) throw new HttpError(404, 'Not found.');
    if (req.user.role === 'customer') {
        if (!(await Customer.exists({ _id: p.customer._id, user: req.user.id })) || p.status !== 'confirmed') throw new HttpError(404, 'Not found.');
        return p;
    }
    const scope = P.scopeFor(req.user.grants, 'payments.view');
    if (!scope || !P.recordInScope(scope, req.user, { collectedBy: p.collectedBy?._id, team: p.team }, PAY_FIELDS)) {
        const c = await Customer.findById(p.customer._id).select('owner team');
        if (!customerAccess({ actor: req.user, grants: req.user.grants, customer: c }).sections.financial) throw new HttpError(404, 'Not found.');
    }
    return p;
}

exports.getPayment = async (req, res) => {
    const p = await loadPayment(req, req.params.id);
    const refunds = await F.Refund.find({ payment: p._id }).populate('requestedBy', 'name').sort({ createdAt: -1 }).lean();
    const A = require('../../lib/academy');
    const profile = { ...A.PROFILE_DEFAULT, ...(await getSetting('academy.profile')) };
    const site = (process.env.SITE_URL || 'https://www.nibras-ac.com').replace(/\/$/, '');
    res.json({
        item: p, refunds, base: await L.baseCurrency(),
        // VAT inside the amount, when the academy is tax registered
        vat: profile.taxNumber && profile.vatRate > 0 ? A.vatSplit(p.amount, profile.vatRate, profile.pricesIncludeVat, await L.decimals(p.currency)) : null,
        verifyUrl: `${site}/pages/ar/receipt.html?no=${encodeURIComponent(p.receiptNo)}&k=${A.receiptKey(p.receiptNo)}`
    });
};

// Public check of a printed receipt (from its QR code): only what the paper already shows
exports.verifyReceipt = async (req, res) => {
    const A = require('../../lib/academy');
    const no = String(req.params.no || '').toUpperCase().slice(0, 30);
    if (String(req.query.k || '') !== A.receiptKey(no)) return res.status(404).json({ message: 'Not found.' });
    const p = await F.Payment.findOne({ receiptNo: no }).populate('customer', 'nameAr').lean();
    if (!p) return res.status(404).json({ message: 'Not found.' });
    const profile = { ...A.PROFILE_DEFAULT, ...(await getSetting('academy.profile')) };
    const { partialName } = require('../../lib/customerAccess');
    res.json({
        receiptNo: p.receiptNo, date: p.paidAt, amount: p.amount, currency: p.currency, refunded: p.refundedAmount || 0,
        status: p.status, customer: partialName(p.customer ? p.customer.nameAr : ''),
        academy: { nameAr: profile.nameAr, nameEn: profile.nameEn, taxNumber: profile.taxNumber }
    });
};

// The receipt by email once a payment is confirmed: its number, its verification link and what
// the customer still owes (PLAN-V2 §6 #6). Never fails the payment.
async function emailReceipt(payment) {
    try {
        const customerEmails = require('../../lib/customerEmails');
        const A = require('../../lib/academy');
        const customer = await Customer.findById(payment.customer._id || payment.customer).select('nameAr contact.email user').lean();
        const to = await customerEmails.emailOf(customer);
        if (!to) return null;
        const rows = await require('./hubController')._unpaidRows({ customer: customer._id });
        const owed = {};
        for (const r of rows) owed[r.currency] = (owed[r.currency] || 0) + r.remaining;
        const site = (process.env.SITE_URL || 'https://www.nibras-ac.com').replace(/\/$/, '');
        return customerEmails.receipt(to, {
            name: customer.nameAr, receiptNo: payment.receiptNo, amount: payment.amount, currency: payment.currency, method: payment.method, paidAt: payment.paidAt,
            remaining: Object.entries(owed).map(([currency, remaining]) => ({ currency, remaining })),
            verifyLink: `${site}/pages/ar/receipt.html?no=${encodeURIComponent(payment.receiptNo)}&k=${A.receiptKey(payment.receiptNo)}`
        });
    } catch (err) {
        console.error('Receipt email failed:', payment.receiptNo, err.message);
        return null;
    }
}
exports._emailReceipt = emailReceipt;

// Finance confirms that money recorded by an employee actually arrived (or rejects it)
exports.confirmPayment = async (req, res) => {
    const p = await F.Payment.findById(req.params.id);
    if (!p) throw new HttpError(404, 'Not found.');
    if (p.status !== 'pending') throw new HttpError(400, 'الدفعة ليست بانتظار التأكيد. / The payment is not waiting for confirmation.');
    assertVersion(p, req.body.__v);
    if (req.body.decision === 'reject') {
        const reason = str(req.body.reason);
        if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
        p.status = 'rejected';
        p.voidReason = reason;
        p.voidedBy = req.user.id;
        p.voidedAt = new Date();
        await p.save();
        await addEvent(req, p.customer, 'payment', `${p.receiptNo} rejected: ${reason}`, { section: 'financial' });
        await audit.record(req, { action: 'payment.rejected', resource: 'payments', resourceId: p._id, summary: p.receiptNo, reason });
        if (p.recordedBy) await notify(p.recordedBy, { type: 'payment_rejected', titleAr: `رفضت المالية الدفعة ${p.receiptNo}`, titleEn: `Finance rejected payment ${p.receiptNo}`, bodyAr: reason, bodyEn: reason, link: `/payments/${p._id}` });
        return res.json({ item: p });
    }
    await L.assertOpenPeriod(p.paidAt);
    await L.inTransaction(async (session) => {
        p.status = 'confirmed';
        p.confirmedBy = req.user.id;
        p.confirmedAt = new Date();
        await p.save({ session });
        await postPayment(p, req.user.id, session);
        await commissions.onPaymentConfirmed(p, { session, by: req.user.id });
    });
    await addEvent(req, p.customer, 'payment', `${p.receiptNo} confirmed`, { section: 'financial' });
    await emailReceipt(p);
    await require('../learning/autoCertificates').afterPayment(p.customer);
    await audit.record(req, { action: 'payment.confirmed', resource: 'payments', resourceId: p._id, summary: `${p.receiptNo} ${p.amount} ${p.currency}` });
    res.json({ item: p });
};

exports.requestVoid = async (req, res) => {
    const p = await loadPayment(req, req.params.id);
    if (p.status !== 'confirmed') throw new HttpError(400, 'يمكن إلغاء الدفعات المؤكدة فقط. / Only confirmed payments can be voided.');
    if (p.refundedAmount > 0) throw new HttpError(409, 'على الدفعة استرداد؛ لا يمكن إلغاؤها. / The payment has refunds and cannot be voided.');
    if (await F.Approval.exists({ 'target.id': p._id, type: 'void_payment', status: 'pending' })) throw new HttpError(409, 'يوجد طلب إلغاء قيد الانتظار. / A void request is already pending.');
    const reason = str(req.body.reason);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const a = await requestApproval(req, { type: 'void_payment', target: { kind: 'payment', id: p._id, no: p.receiptNo }, customer: p.customer._id, summary: `${p.receiptNo}: ${p.amount} ${p.currency}`, amount: p.amount, currency: p.currency, reason });
    res.status(201).json({ approval: a });
};

// ---- refunds ----

exports.requestRefund = async (req, res) => {
    const p = await loadPayment(req, req.params.id);
    if (p.status !== 'confirmed') throw new HttpError(400, 'يمكن الاسترداد من الدفعات المؤكدة فقط. / Only confirmed payments can be refunded.');
    const { amount, dec } = await amountFor(p.currency, req.body.amount);
    const pending = await F.Refund.aggregate([{ $match: { payment: p._id, status: 'pending' } }, { $group: { _id: null, v: { $sum: '$amount' } } }]);
    const available = M.round(p.amount - p.refundedAmount - (pending[0]?.v || 0), dec);
    if (amount > available) throw new HttpError(400, `الحد الأقصى المتاح للاسترداد ${available} ${p.currency}. / At most ${available} ${p.currency} can be refunded.`, 'TOO_MUCH');
    const reason = str(req.body.reason);
    if (!reason) throw new HttpError(400, 'سبب الاسترداد مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const baseDec = await L.decimals(await L.baseCurrency());
    const { number } = await nextNumber('refund');
    const refund = await F.Refund.create({
        refundNo: number, payment: p._id, customer: p.customer._id, account: p.account._id,
        amount, currency: p.currency, rate: p.rate, baseAmount: M.baseOf(amount, p.rate, baseDec),
        chargeAmount: p.chargeAmount ? M.round((p.chargeAmount * amount) / p.amount, 3) : 0,
        reason, requestedBy: req.user.id
    });
    const a = await requestApproval(req, { type: 'refund', target: { kind: 'refund', id: refund._id, no: refund.refundNo }, customer: p.customer._id, summary: `${refund.refundNo} (${p.receiptNo}): ${amount} ${p.currency}`, amount, currency: p.currency, reason });
    refund.approval = a._id;
    await refund.save();
    await addEvent(req, p.customer._id, 'refund', `${refund.refundNo} requested: ${amount} ${p.currency}`, { section: 'financial' });
    res.status(201).json({ item: refund, approval: a });
};

// ---- approvals ----

exports.listApprovals = async (req, res) => {
    const filter = canApprove(req) ? {} : { requestedBy: req.user.id };
    if (req.query.status) filter.status = String(req.query.status);
    const items = await F.Approval.find(filter).populate('requestedBy', 'name').populate('decidedBy', 'name').populate('customer', 'customerNo nameAr').sort({ createdAt: -1 }).limit(300).lean();
    res.json({ items });
};

exports.decideApproval = async (req, res) => {
    if (!canApprove(req)) throw new HttpError(403, 'Forbidden.');
    const a = await F.Approval.findById(req.params.id);
    if (!a) throw new HttpError(404, 'Not found.');
    if (a.status !== 'pending') throw new HttpError(400, 'تم البت في هذا الطلب. / Already decided.');
    if (String(a.requestedBy) === req.user.id && req.user.role !== 'super_admin') {
        throw new HttpError(403, 'لا يمكنك اعتماد طلب قدمته بنفسك. / You cannot approve your own request.', 'SELF_APPROVAL');
    }
    assertVersion(a, req.body.__v);
    const approve = req.body.decision === 'approve';
    const note = str(req.body.note);
    if (!approve && !note) throw new HttpError(400, 'سبب الرفض مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const today = new Date();

    await L.inTransaction(async (session) => {
        if (a.type === 'discount') {
            const charge = await F.Charge.findById(a.target.id).session(session);
            charge.discount.status = approve ? 'approved' : 'rejected';
            if (approve) {
                const dec = await L.decimals(charge.currency);
                const baseDec = await L.decimals(await L.baseCurrency());
                charge.netAmount = M.round(charge.listAmount - charge.discount.amount, dec);
                charge.baseNet = M.baseOf(charge.netAmount, charge.rate, baseDec);
                const first = charge.installments[0]?.dueDate || today;
                const months = charge.installments.length > 1 ? Math.max(1, Math.round((new Date(charge.installments[1].dueDate) - new Date(first)) / (30 * 864e5))) : 1;
                charge.installments = M.splitInstallments(charge.netAmount, charge.installments.length || 1, first, months, dec);
            }
            charge.markModified('discount');
            await charge.save({ session });
        }
        if (a.type === 'refund') {
            const refund = await F.Refund.findById(a.target.id).session(session);
            if (approve) {
                await L.assertOpenPeriod(today);
                const payment = await F.Payment.findById(refund.payment).session(session);
                refund.status = 'paid';
                refund.paidAt = today;
                refund.period = M.periodKey(today);
                await refund.save({ session });
                payment.refundedAmount = M.round(payment.refundedAmount + refund.amount, 3);
                await payment.save({ session });
                await L.post({ account: refund.account, date: today, direction: 'out', amount: refund.amount, currency: refund.currency, rate: refund.rate, source: { kind: 'refund', id: refund._id, no: refund.refundNo }, description: `Refund ${refund.refundNo} of ${payment.receiptNo}`, by: req.user.id, session });
                await commissions.onRefundPaid(payment, refund, { session, by: req.user.id });
            } else {
                refund.status = 'rejected';
                await refund.save({ session });
            }
        }
        if (a.type === 'void_payment' && approve) {
            await L.assertOpenPeriod(today);
            const payment = await F.Payment.findById(a.target.id).session(session);
            if (payment.status !== 'confirmed' || payment.refundedAmount > 0) throw new HttpError(409, 'لا يمكن إلغاء الدفعة الآن. / The payment can no longer be voided.');
            payment.status = 'voided';
            payment.voidReason = a.reason;
            payment.voidedBy = req.user.id;
            payment.voidedAt = today;
            await payment.save({ session });
            // The reversal is dated today, so a closed month is never changed
            await L.post({ account: payment.account, date: today, direction: 'out', amount: payment.amount, currency: payment.currency, rate: payment.rate, source: { kind: 'void', id: payment._id, no: payment.receiptNo }, description: `Void of ${payment.receiptNo}`, by: req.user.id, session });
            await commissions.onPaymentVoided(payment, { session, by: req.user.id });
        }
        if (a.type === 'void_expense' && approve) {
            await L.assertOpenPeriod(today);
            const expense = await F.Expense.findById(a.target.id).session(session);
            if (expense.status !== 'posted') throw new HttpError(409, 'Already voided.');
            expense.status = 'voided';
            expense.voidReason = a.reason;
            expense.voidedBy = req.user.id;
            await expense.save({ session });
            await L.post({ account: expense.account, date: today, direction: 'in', amount: expense.amount, currency: expense.currency, rate: expense.rate, source: { kind: 'void', id: expense._id, no: expense.expenseNo }, description: `Void of ${expense.expenseNo}`, by: req.user.id, session });
        }
        a.status = approve ? 'approved' : 'rejected';
        a.decidedBy = req.user.id;
        a.decidedAt = today;
        a.decisionNote = note;
        await a.save({ session });
    });

    if (a.customer) await addEvent(req, a.customer, 'finance_approval', `${a.type} ${a.status}: ${a.summary}${note ? ` — ${note}` : ''}`, { section: 'financial' });
    await audit.record(req, { action: `approval.${a.status}.${a.type}`, resource: 'payments', resourceId: a._id, summary: a.summary, reason: note || a.reason });
    await notify(a.requestedBy, { type: 'finance_decision', titleAr: `${approve ? 'تمت الموافقة على' : 'تم رفض'}: ${a.summary}`, titleEn: `${approve ? 'Approved' : 'Rejected'}: ${a.summary}`, bodyAr: note, bodyEn: note, link: '/approvals' });
    res.json({ item: a });
};

// ---- expenses and transfers ----

exports.createExpense = async (req, res) => {
    const account = await F.FinanceAccount.findById(oid(req.body.account));
    if (!account || !account.active) throw new HttpError(400, 'اختر الحساب. / Choose the account.');
    const { amount } = await amountFor(account.currency, req.body.amount);
    const category = str(req.body.category, 80);
    if (!category) throw new HttpError(400, 'التصنيف مطلوب. / A category is required.');
    const date = L.checkDate(req.body.date);
    const period = await L.assertOpenPeriod(date);
    const rate = await L.rateAt(account.currency, date);
    const baseDec = await L.decimals(await L.baseCurrency());
    const { number } = await nextNumber('expense');
    const e = await L.inTransaction(async (session) => {
        const [x] = await F.Expense.create([{ expenseNo: number, category, account: account._id, amount, currency: account.currency, rate, baseAmount: M.baseOf(amount, rate, baseDec), date, period, payee: str(req.body.payee, 160), description: str(req.body.description), program: oid(req.body.program), recordedBy: req.user.id }], { session });
        await L.post({ account: account._id, date, direction: 'out', amount, currency: account.currency, rate, source: { kind: 'expense', id: x._id, no: x.expenseNo }, description: `${category}: ${x.description}`.slice(0, 300), by: req.user.id, session });
        return x;
    });
    await audit.record(req, { action: 'expense.recorded', resource: 'expenses', resourceId: e._id, summary: `${e.expenseNo} ${category} ${amount} ${account.currency}` });
    res.status(201).json({ item: e });
};

exports.listExpenses = async (req, res) => {
    const { limit, page, skip } = paging(req.query);
    const filter = {};
    if (req.query.category) filter.category = String(req.query.category);
    if (oid(req.query.account)) filter.account = oid(req.query.account);
    if (req.query.status) filter.status = String(req.query.status);
    if (oid(req.query.program)) filter.program = oid(req.query.program);
    if (req.query.receipt === 'missing') filter['attachment.storageKey'] = { $in: ['', null] };
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: new Date(to.getTime() + 864e5 - 1) } : {}) };
    const [items, total, categories] = await Promise.all([
        F.Expense.find(filter).select('-attachment.storageKey').populate('account', 'code nameAr currency').populate('recordedBy', 'name').populate('program', 'titleAr titleEn').sort({ date: -1 }).skip(skip).limit(limit).lean(),
        F.Expense.countDocuments(filter),
        F.Expense.distinct('category')
    ]);
    res.json({ items, total, page, limit, categories });
};

exports.requestExpenseVoid = async (req, res) => {
    const e = await F.Expense.findById(req.params.id);
    if (!e || e.status !== 'posted') throw new HttpError(404, 'Not found.');
    const reason = str(req.body.reason);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    if (await F.Approval.exists({ 'target.id': e._id, status: 'pending' })) throw new HttpError(409, 'يوجد طلب قيد الانتظار. / A request is already pending.');
    const a = await requestApproval(req, { type: 'void_expense', target: { kind: 'expense', id: e._id, no: e.expenseNo }, summary: `${e.expenseNo}: ${e.amount} ${e.currency}`, amount: e.amount, currency: e.currency, reason });
    res.status(201).json({ approval: a });
};

exports.createTransfer = async (req, res) => {
    const from = await F.FinanceAccount.findById(oid(req.body.from));
    const to = await F.FinanceAccount.findById(oid(req.body.to));
    if (!from || !to || !from.active || !to.active || String(from._id) === String(to._id)) throw new HttpError(400, 'اختر حسابين مختلفين. / Choose two different accounts.');
    const date = L.checkDate(req.body.date);
    const period = await L.assertOpenPeriod(date);
    const { amount: amountOut } = await amountFor(from.currency, req.body.amountOut);
    const amountIn = from.currency === to.currency ? amountOut : (await amountFor(to.currency, req.body.amountIn)).amount;
    const [rateOut, rateIn] = [await L.rateAt(from.currency, date), await L.rateAt(to.currency, date)];
    const { number } = await nextNumber('transfer');
    const t = await L.inTransaction(async (session) => {
        const [x] = await F.Transfer.create([{ transferNo: number, from: from._id, to: to._id, amountOut, amountIn, rateOut, rateIn, date, period, note: str(req.body.note, 300), recordedBy: req.user.id }], { session });
        const source = { kind: 'transfer', id: x._id, no: x.transferNo };
        await L.post({ account: from._id, date, direction: 'out', amount: amountOut, currency: from.currency, rate: rateOut, source, description: `Transfer to ${to.code}`, by: req.user.id, session });
        await L.post({ account: to._id, date, direction: 'in', amount: amountIn, currency: to.currency, rate: rateIn, source, description: `Transfer from ${from.code}`, by: req.user.id, session });
        return x;
    });
    await audit.record(req, { action: 'transfer.recorded', resource: 'accounts', resourceId: t._id, summary: `${t.transferNo} ${from.code} → ${to.code}: ${amountOut} ${from.currency}` });
    res.status(201).json({ item: t });
};

// ---- statements ----

async function customerStatement(customerId) {
    const [charges, payments, refunds, base] = await Promise.all([
        F.Charge.find({ customer: customerId }).populate('enrollment', 'enrollmentNo programTitleAr').sort({ createdAt: 1 }).lean(),
        F.Payment.find({ customer: customerId }).populate(PAY_POP).sort({ paidAt: 1 }).lean(),
        F.Refund.find({ customer: customerId }).sort({ createdAt: 1 }).lean(),
        L.baseCurrency()
    ]);
    const totals = await L.chargeTotals(charges.map((c) => c._id));
    const now = new Date();
    const byCurrency = {};
    const outCharges = [];
    for (const c of charges) {
        const dec = await L.decimals(c.currency);
        const t = totals[String(c._id)] || { applied: 0, refunded: 0 };
        const balance = M.chargeBalance({ net: c.status === 'active' ? c.netAmount : 0, applied: t.applied, refunded: t.refunded }, dec);
        outCharges.push({ ...c, balance, installmentStatus: M.installmentStatus(c.installments || [], balance.paid, now, dec) });
        if (c.status !== 'active') continue;
        const cur = (byCurrency[c.currency] = byCurrency[c.currency] || { currency: c.currency, charged: 0, paid: 0, remaining: 0 });
        cur.charged = M.round(cur.charged + balance.net, dec);
        cur.paid = M.round(cur.paid + balance.paid, dec);
        cur.remaining = M.round(cur.remaining + balance.remaining, dec);
    }
    // Payments not tied to a charge (advance payments) are listed per currency on their own
    const unallocated = {};
    for (const p of payments) {
        if (p.status !== 'confirmed' || p.charge) continue;
        unallocated[p.currency] = M.round((unallocated[p.currency] || 0) + p.amount - p.refundedAmount, 3);
    }
    // Each currency is reported on its own; nothing is converted
    return { base, charges: outCharges, payments, refunds, byCurrency: Object.values(byCurrency), unallocated };
}

exports.customerFinance = async (req, res) => {
    const customer = await customerFor(req, req.params.id);
    res.json(await customerStatement(customer._id));
};

exports.myFinance = async (req, res) => {
    const files = await Customer.find({ user: req.user.id }).select('_id').lean();
    const out = { charges: [], payments: [], byCurrency: [] };
    for (const f of files) {
        const s = await customerStatement(f._id);
        out.base = s.base;
        out.charges.push(...s.charges.filter((c) => c.status === 'active').map((c) => ({ ...c, createdBy: undefined, owner: undefined, team: undefined })));
        out.payments.push(...s.payments.filter((p) => p.status === 'confirmed').map((p) => ({ _id: p._id, receiptNo: p.receiptNo, amount: p.amount, currency: p.currency, method: p.method, paidAt: p.paidAt, refundedAmount: p.refundedAmount, charge: p.charge })));
        out.byCurrency.push(...s.byCurrency);
    }
    res.json(out);
};

// Collections, refunds and expenses for a period, each currency on its own (nothing is converted)
exports.summary = async (req, res) => {
    const from = parseDate(req.query.from) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = parseDate(req.query.to) || new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || ''))) to.setHours(23, 59, 59, 999);
    const paid = { status: 'confirmed', paidAt: { $gte: from, $lte: to } };
    const byKeyCur = (key) => [{ $match: paid }, { $group: { _id: { k: key, c: '$currency' }, amount: { $sum: '$amount' }, n: { $sum: 1 } } }];
    const named = (from, field) => [{ $lookup: { from, localField: '_id.k', foreignField: '_id', as: 'x' } }, { $addFields: { name: { $arrayElemAt: [`$x.${field}`, 0] } } }, { $project: { x: 0 } }];
    const [byCurrency, byMethod, byAccount, byCollector, byProgram, byCountry, refunds, expensesByCur, expensesByCat, commissionsPaid, pending] = await Promise.all([
        F.Payment.aggregate([{ $match: paid }, { $group: { _id: '$currency', amount: { $sum: '$amount' }, n: { $sum: 1 } } }, { $sort: { amount: -1 } }]),
        F.Payment.aggregate(byKeyCur('$method')),
        F.Payment.aggregate([...byKeyCur('$account'), ...named('financeaccounts', 'nameAr')]),
        F.Payment.aggregate([...byKeyCur('$collectedBy'), ...named('users', 'name')]),
        F.Payment.aggregate([{ $match: paid }, { $lookup: { from: 'enrollments', localField: 'enrollment', foreignField: '_id', as: 'e' } }, { $group: { _id: { k: { $ifNull: [{ $arrayElemAt: ['$e.programTitleAr', 0] }, '—'] }, c: '$currency' }, amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
        F.Payment.aggregate([{ $match: paid }, { $lookup: { from: 'customers', localField: 'customer', foreignField: '_id', as: 'cu' } }, { $group: { _id: { k: { $ifNull: [{ $arrayElemAt: ['$cu.country', 0] }, ''] }, c: '$currency' }, amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
        F.Refund.aggregate([{ $match: { status: 'paid', paidAt: { $gte: from, $lte: to } } }, { $group: { _id: '$currency', amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
        F.Expense.aggregate([{ $match: { status: 'posted', date: { $gte: from, $lte: to } } }, { $group: { _id: '$currency', amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
        F.Expense.aggregate([{ $match: { status: 'posted', date: { $gte: from, $lte: to } } }, { $group: { _id: { k: '$category', c: '$currency' }, amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
        require('../../models/commission').CommissionPayout.aggregate([{ $match: { paidAt: { $gte: from, $lte: to } } }, { $lookup: { from: 'financeaccounts', localField: 'account', foreignField: '_id', as: 'a' } }, { $group: { _id: { $arrayElemAt: ['$a.currency', 0] }, amount: { $sum: '$accountAmount' } } }]),
        F.Payment.countDocuments({ status: 'pending' })
    ]);
    const cut = (rows, n = 20) => M.pivotByCurrency(rows).slice(0, n);
    res.json({
        main: await L.baseCurrency(), from, to,
        totals: M.currencyTotals({ collected: byCurrency, refunded: refunds, expenses: expensesByCur, commissions: commissionsPaid }),
        pendingPayments: pending,
        byMethod: cut(byMethod), byAccount: cut(byAccount), byCollector: cut(byCollector), byProgram: cut(byProgram), byCountry: cut(byCountry), expenses: cut(expensesByCat)
    });
};
