const mongoose = require('mongoose');
const F = require('../../models/finance');
const C = require('../../models/commission');
const Customer = require('../../models/Customer');
const Communication = require('../../models/Communication');
const User = require('../../models/User');
const M = require('../../lib/money');
const P = require('../../lib/permissions');
const R = require('../../lib/receivables');
const A = require('../../lib/academy');
const audit = require('../../lib/audit');
const storage = require('../../lib/storage');
const { customerAccess } = require('../../lib/customerAccess');
const { brandedEmail } = require('../../lib/brandEmail');
const { isMailConfigured, createTransporter } = require('../../config/mailer');
const { HttpError } = require('../../lib/http');
const { addEvent, notify, getSetting } = require('../crm/service');
const L = require('./ledger');

// The finance section for an academy without an accountant: what customers owe and reminding
// them, today's numbers, receipts on expenses, and the month-end checklist.

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (o) => Object.entries(o).map(([currency, amount]) => ({ currency, amount: M.round(amount, 3) })).sort((a, b) => b.amount - a.amount);

// Every unpaid installment (or whole charge without installments), newest data, in the scope given
async function unpaidRows(filter = {}, now = new Date()) {
    const charges = await F.Charge.find({ status: 'active', ...filter }).select('customer chargeNo description currency netAmount installments owner team').limit(20000).lean();
    const totals = await L.chargeTotals(charges.map((c) => c._id));
    const rows = [];
    for (const c of charges) {
        const dec = await L.decimals(c.currency);
        const t = totals[String(c._id)] || { applied: 0, refunded: 0 };
        const bal = M.chargeBalance({ net: c.netAmount, applied: t.applied, refunded: t.refunded }, dec);
        if (bal.remaining <= 0) continue;
        const base = { customerId: c.customer, chargeId: c._id, chargeNo: c.chargeNo, description: c.description, currency: c.currency, owner: c.owner, team: c.team };
        if (c.installments && c.installments.length) {
            for (const i of M.installmentStatus(c.installments, bal.paid, now, dec)) {
                if (i.status === 'paid') continue;
                const late = new Date(i.dueDate) < now;
                rows.push({ ...base, no: i.no, dueDate: i.dueDate, remaining: i.remaining, status: i.status, late, daysLate: late ? R.daysLate(i.dueDate, now) : 0 });
            }
        } else {
            rows.push({ ...base, no: null, dueDate: null, remaining: bal.remaining, status: 'due', late: false, daysLate: 0 });
        }
    }
    return rows;
}
exports._unpaidRows = unpaidRows;

function scopeFilter(req) {
    const scope = req.scope;
    if (scope === 'all') return {};
    if (scope === 'team') return { team: { $in: req.user.teamIds.map((t) => new mongoose.Types.ObjectId(t)) } };
    return { owner: new mongoose.Types.ObjectId(req.user.id) };
}

// ---- receivables ----

exports.receivables = async (req, res) => {
    const now = new Date();
    const state = String(req.query.state || 'all');
    let rows = await unpaidRows(scopeFilter(req), now);
    const weekAhead = new Date(now.getTime() + 7 * 864e5);
    if (state === 'overdue') rows = rows.filter((r) => r.late);
    if (state === 'week') rows = rows.filter((r) => r.late || (r.dueDate && new Date(r.dueDate) <= weekAhead));
    const groups = R.groupByCustomer(rows).slice(0, 500);
    const customers = await Customer.find({ _id: { $in: groups.map((g) => g.customerId) } }).select('customerNo nameAr owner team contact.phone contact.whatsapp contact.email user').populate('owner', 'name').lean();
    const byId = Object.fromEntries(customers.map((c) => [String(c._id), c]));
    const owed = {};
    const overdue = {};
    for (const r of rows) {
        owed[r.currency] = (owed[r.currency] || 0) + r.remaining;
        if (r.late) overdue[r.currency] = (overdue[r.currency] || 0) + r.remaining;
    }
    const remindedRows = await Communication.aggregate([
        { $match: { customer: { $in: groups.map((g) => g.customerId) }, kind: 'payment_reminder' } },
        { $group: { _id: '$customer', at: { $max: '$at' } } }
    ]);
    const lastReminder = Object.fromEntries(remindedRows.map((r) => [String(r._id), r.at]));
    res.json({
        totals: { owed: list(owed), overdue: list(overdue), customers: groups.length },
        items: groups.map((g) => {
            const c = byId[String(g.customerId)];
            if (!c) return null;
            const access = customerAccess({ actor: req.user, grants: req.user.grants, customer: { ...c, owner: c.owner?._id || c.owner } });
            const phone = access.sections.contact ? (c.contact?.whatsapp || c.contact?.phone || '') : '';
            return {
                customer: { _id: c._id, customerNo: c.customerNo, nameAr: c.nameAr, owner: c.owner?.name || '', canOpen: access.inFile },
                phone, hasEmail: !!(access.sections.contact && c.contact?.email), hasPortal: !!c.user,
                owed: g.owed, overdue: g.overdue, maxDaysLate: g.maxDaysLate, nextDue: g.nextDue,
                lastReminderAt: lastReminder[String(g.customerId)] || null,
                installments: g.installments.map((i) => ({ chargeNo: i.chargeNo, description: i.description, no: i.no, dueDate: i.dueDate, remaining: i.remaining, currency: i.currency, late: i.late, daysLate: i.daysLate }))
            };
        }).filter(Boolean)
    });
};

async function sendEmail(to, subject, heading, lines, profile) {
    await createTransporter().sendMail({
        from: `"${profile.nameAr}" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html: brandedEmail({ heading, lines, footer: [profile.phone, profile.website].filter(Boolean).join(' · ') }),
        text: [heading, ...lines].join('\n')
    });
}
exports._sendEmail = sendEmail;

// A reminder to one customer about what they owe: WhatsApp (the employee sends it), email or the portal
exports.remind = async (req, res) => {
    const customer = await Customer.findById(req.params.customerId).select('customerNo nameAr owner team contact user');
    if (!customer) throw new HttpError(404, 'Not found.');
    const access = customerAccess({ actor: req.user, grants: req.user.grants, customer });
    if (!access.inFile || !access.sections.financial) throw new HttpError(404, 'Not found.');
    const channel = ['whatsapp', 'email', 'portal'].includes(req.body.channel) ? req.body.channel : 'whatsapp';
    const rows = (await unpaidRows({ customer: customer._id })).sort((a, b) => (a.dueDate ? new Date(a.dueDate) : Infinity) - (b.dueDate ? new Date(b.dueDate) : Infinity));
    if (!rows.length) throw new HttpError(400, 'لا يوجد مبلغ مستحق على هذا العميل. / This customer owes nothing.', 'NOTHING_OWED');
    // The late ones and the next week; otherwise everything still open
    const soon = rows.filter((r) => r.late || (r.dueDate && new Date(r.dueDate) <= new Date(Date.now() + 7 * 864e5)));
    const items = (soon.length ? soon : rows).slice(0, 10);
    const profile = { ...A.PROFILE_DEFAULT, ...(await getSetting('academy.profile')) };
    const text = R.reminderText({ name: customer.nameAr, items, academy: profile.nameAr });
    const out = { channel };
    if (channel === 'whatsapp') {
        if (!access.sections.contact) throw new HttpError(403, 'Forbidden.');
        out.link = R.waLink(customer.contact.whatsapp || customer.contact.phone, text);
        if (!out.link) throw new HttpError(400, 'لا يوجد رقم صالح للعميل. / The customer has no valid number.', 'NO_PHONE');
    } else if (channel === 'email') {
        let to = customer.contact.email;
        if (!to && customer.user) to = (await User.findById(customer.user).select('email').lean() || {}).email;
        if (!to) throw new HttpError(400, 'لا يوجد إيميل لهذا العميل. / This customer has no email.', 'NO_EMAIL');
        if (!isMailConfigured()) throw new HttpError(400, 'إعدادات البريد غير مكتملة. / Email is not set up.', 'NO_MAIL');
        await sendEmail(to, `تذكير بالمستحقات - ${profile.nameAr}`, `مرحباً ${customer.nameAr}`, text.split('\n').slice(1), profile);
        out.to = to;
    } else {
        if (!customer.user) throw new HttpError(400, 'العميل ليس له حساب على البوابة. / The customer has no portal account.', 'NO_PORTAL');
        await notify(customer.user, { type: 'payment_reminder', titleAr: 'تذكير بالمبالغ المستحقة', titleEn: 'Payment reminder', bodyAr: items.map((i) => `${i.remaining} ${i.currency}`).join(' + '), link: '/my-payments' });
    }
    await Communication.create({ customer: customer._id, channel: channel === 'portal' ? 'other' : channel, direction: 'outbound', kind: 'payment_reminder', summary: text.slice(0, 3000), at: new Date(), by: req.user.id });
    await addEvent(req, customer._id, 'communication', `Payment reminder (${channel})`, { section: 'financial' });
    await audit.record(req, { action: 'finance.reminder', resource: 'customer_financial', resourceId: customer._id, summary: `${customer.customerNo} via ${channel}` });
    res.json(out);
};

// ---- today ----

exports.today = async (req, res) => {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sumBy = (match) => F.Payment.aggregate([{ $match: match }, { $group: { _id: '$currency', amount: { $sum: '$amount' } } }]);
    const [today, month, expensesMonth, pendingPayments, pendingApprovals, pendingRefunds, rows] = await Promise.all([
        sumBy({ status: 'confirmed', paidAt: { $gte: dayStart } }),
        sumBy({ status: 'confirmed', paidAt: { $gte: monthStart } }),
        F.Expense.aggregate([{ $match: { status: 'posted', date: { $gte: monthStart } } }, { $group: { _id: '$currency', amount: { $sum: '$amount' } } }]),
        F.Payment.countDocuments({ status: 'pending' }),
        F.Approval.countDocuments({ status: 'pending' }),
        F.Refund.countDocuments({ status: 'pending' }),
        unpaidRows({}, now)
    ]);
    const weekAhead = new Date(now.getTime() + 7 * 864e5);
    const overdue = {};
    const dueWeek = {};
    const lateCustomers = new Set();
    const weekCustomers = new Set();
    for (const r of rows) {
        if (r.late) { overdue[r.currency] = (overdue[r.currency] || 0) + r.remaining; lateCustomers.add(String(r.customerId)); }
        else if (r.dueDate && new Date(r.dueDate) <= weekAhead) { dueWeek[r.currency] = (dueWeek[r.currency] || 0) + r.remaining; weekCustomers.add(String(r.customerId)); }
    }
    const pick = (rowsIn) => rowsIn.map((r) => ({ currency: r._id, amount: M.round(r.amount, 3) })).sort((a, b) => b.amount - a.amount);
    res.json({
        main: await L.baseCurrency(),
        today: pick(today), month: pick(month), expensesMonth: pick(expensesMonth),
        pending: { payments: pendingPayments, approvals: pendingApprovals, refunds: pendingRefunds },
        overdue: { customers: lateCustomers.size, amounts: list(overdue) },
        dueWeek: { customers: weekCustomers.size, amounts: list(dueWeek) }
    });
};

// ---- month end ----

exports.closeCheck = async (req, res) => {
    const key = String(req.params.key);
    if (!/^\d{4}-\d{2}$/.test(key)) throw new HttpError(400, 'Invalid month.');
    const [y, m] = key.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));
    const sumBy = (model, match, dateField) => model.aggregate([{ $match: { ...match, [dateField]: { $gte: from, $lt: to } } }, { $group: { _id: '$currency', amount: { $sum: '$amount' } } }]);
    const [period, pendingPayments, pendingApprovals, pendingRefunds, commissionsDue, noReceipt, collected, refunded, expenses, commissions] = await Promise.all([
        F.Period.findOne({ key }).lean(),
        F.Payment.countDocuments({ status: 'pending', period: key }),
        F.Approval.countDocuments({ status: 'pending' }),
        F.Refund.countDocuments({ status: 'pending' }),
        C.CommissionLine.countDocuments({ period: key, status: 'due' }),
        F.Expense.countDocuments({ status: 'posted', period: key, 'attachment.storageKey': { $in: ['', null] } }),
        sumBy(F.Payment, { status: 'confirmed' }, 'paidAt'),
        sumBy(F.Refund, { status: 'paid' }, 'paidAt'),
        sumBy(F.Expense, { status: 'posted' }, 'date'),
        C.CommissionPayout.aggregate([{ $match: { period: key } }, { $lookup: { from: 'financeaccounts', localField: 'account', foreignField: '_id', as: 'a' } }, { $group: { _id: { $arrayElemAt: ['$a.currency', 0] }, amount: { $sum: '$accountAmount' } } }])
    ]);
    const accounts = await F.FinanceAccount.find({ active: true }).select('code nameAr currency').lean();
    const balances = await L.accountBalances(accounts.map((a) => a._id));
    res.json({
        key, status: period ? period.status : 'open',
        checks: [
            { id: 'pendingPayments', count: pendingPayments, blocking: true, link: '/payments?status=pending' },
            { id: 'pendingApprovals', count: pendingApprovals, blocking: true, link: '/approvals' },
            { id: 'pendingRefunds', count: pendingRefunds, blocking: false, link: '/approvals' },
            { id: 'commissionsDue', count: commissionsDue, blocking: false, link: '/commissions' },
            { id: 'expensesNoReceipt', count: noReceipt, blocking: false, link: '/expenses' }
        ],
        totals: M.currencyTotals({ collected, refunded, expenses, commissions }),
        accounts: accounts.map((a) => ({ ...a, balance: M.round((balances[String(a._id)] || { balance: 0 }).balance, 3) }))
    });
};

// ---- expense receipts ----

exports.uploadExpenseReceipt = async (req, res) => {
    const e = await F.Expense.findById(req.params.id);
    if (!e) throw new HttpError(404, 'Not found.');
    if (!req.file) throw new HttpError(400, 'اختر ملفاً. / Choose a file.');
    const problem = storage.validate(req.file.buffer, req.file.mimetype);
    if (problem) throw new HttpError(400, problem);
    const stored = await storage.put(req.file.buffer);
    e.attachment = { storageKey: stored.key, filename: String(req.file.originalname || 'receipt').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 150), mimetype: stored.mimetype, size: stored.size, uploadedBy: req.user.id, uploadedAt: new Date() };
    await e.save();
    await audit.record(req, { action: 'expense.receipt_added', resource: 'expenses', resourceId: e._id, summary: e.expenseNo });
    res.json({ ok: true, attachment: { filename: e.attachment.filename, mimetype: e.attachment.mimetype, size: e.attachment.size } });
};

exports.expenseReceipt = async (req, res) => {
    const e = await F.Expense.findById(req.params.id).lean();
    if (!e || !e.attachment || !e.attachment.storageKey) throw new HttpError(404, 'Not found.');
    const file = await storage.get(e.attachment.storageKey);
    if (!file) throw new HttpError(404, 'Not found.');
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(e.attachment.filename)}`);
    res.send(file.data);
};

exports._scopeFilter = scopeFilter;
exports._oid = oid;
exports._str = str;
exports._P = P;
