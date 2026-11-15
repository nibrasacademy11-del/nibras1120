const mongoose = require('mongoose');
const protectRecords = require('../lib/protectRecords');

// All finance models in one place. Amounts are stored in their own currency, rounded to its decimals;
// rate = base units for one unit of the currency at the moment of the transaction; base* = amount × rate.

const { ObjectId } = mongoose.Schema.Types;
const money = { type: Number, required: true, min: 0 };
// Optional: filled only when an exchange rate to the main currency is known
const optRate = { type: Number, default: null };
const optBase = { type: Number, default: null, min: 0 };

// ---- setup ----

const currencySchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true, match: /^[A-Z]{3}$/ },
    nameAr: { type: String, required: true },
    nameEn: { type: String, default: '' },
    symbol: { type: String, default: '' },
    decimals: { type: Number, default: 2, min: 0, max: 3 },
    active: { type: Boolean, default: true }
}, { timestamps: true });

// Every rate ever set is kept; the rate of a moment is the latest one effective at that moment
const exchangeRateSchema = new mongoose.Schema({
    currency: { type: String, required: true, index: true },
    rate: { type: Number, required: true, min: 0 },
    effectiveAt: { type: Date, required: true, index: true },
    setBy: { type: ObjectId, ref: 'User' },
    note: { type: String, default: '' }
}, { timestamps: true });
exchangeRateSchema.index({ currency: 1, effectiveAt: -1 });
exchangeRateSchema.plugin(protectRecords);

const ACCOUNT_TYPES = ['cash', 'bank', 'wallet', 'gateway'];
const financeAccountSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, trim: true, maxlength: 30 },
    nameAr: { type: String, required: true, trim: true, maxlength: 120 },
    nameEn: { type: String, default: '', trim: true, maxlength: 120 },
    type: { type: String, enum: ACCOUNT_TYPES, required: true },
    currency: { type: String, required: true },
    details: { type: String, default: '', maxlength: 300 },     // bank name, last digits of the IBAN, wallet number
    // Employees may record collections into this account (otherwise finance staff only)
    allowEmployees: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
}, { timestamps: true, optimisticConcurrency: true });

// Closing a month blocks any new transaction dated in it; corrections are dated in an open month
const periodSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    history: [{ _id: false, status: String, by: { type: ObjectId, ref: 'User' }, byName: String, at: Date, reason: String }]
}, { timestamps: true });

// ---- the ledger ----

// One movement per account per transaction. Balances are the sum of movements; nothing is edited.
const movementSchema = new mongoose.Schema({
    account: { type: ObjectId, ref: 'FinanceAccount', required: true, index: true },
    date: { type: Date, required: true, index: true },
    period: { type: String, required: true, index: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    amount: money,
    currency: { type: String, required: true },
    rate: optRate,
    baseAmount: optBase,
    source: {
        kind: { type: String, enum: ['payment', 'refund', 'expense', 'transfer', 'opening', 'void', 'commission'], required: true },
        id: { type: ObjectId, required: true },
        no: String
    },
    description: { type: String, default: '' },
    by: { type: ObjectId, ref: 'User' }
}, { timestamps: true });
movementSchema.plugin(protectRecords);

// ---- customer money ----

const CHARGE_STATUSES = ['active', 'cancelled'];
const installmentSchema = new mongoose.Schema({ no: Number, dueDate: Date, amount: Number }, { _id: false });
const chargeSchema = new mongoose.Schema({
    chargeNo: { type: String, required: true, unique: true },
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    enrollment: { type: ObjectId, ref: 'Enrollment', default: null, index: true },
    description: { type: String, required: true, maxlength: 300 },
    currency: { type: String, required: true },
    listAmount: money,
    // A discount is applied only after approval; until then it is "requested"
    discount: {
        amount: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
        reason: { type: String, default: '' },
        approval: { type: ObjectId, ref: 'Approval', default: null }
    },
    netAmount: money,
    rate: optRate,            // rate to the main currency when the charge was created, if one was set
    baseNet: optBase,
    installments: [installmentSchema],
    status: { type: String, enum: CHARGE_STATUSES, default: 'active', index: true },
    cancelReason: { type: String, default: '' },
    owner: { type: ObjectId, ref: 'User', default: null, index: true },   // the customer's responsible employee
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    createdBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true, optimisticConcurrency: true });
chargeSchema.plugin(protectRecords, { mutable: ['discount', 'netAmount', 'baseNet', 'installments', 'status', 'cancelReason', 'owner', 'team'] });

const METHODS = ['cash', 'bank_transfer', 'card', 'wallet', 'gateway', 'cheque', 'other'];
const paymentSchema = new mongoose.Schema({
    receiptNo: { type: String, required: true, unique: true },
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    charge: { type: ObjectId, ref: 'Charge', default: null, index: true },
    enrollment: { type: ObjectId, ref: 'Enrollment', default: null, index: true },
    account: { type: ObjectId, ref: 'FinanceAccount', required: true, index: true },
    method: { type: String, enum: METHODS, required: true },
    reference: { type: String, default: '', maxlength: 120 },   // transfer number, card slip, cheque number
    amount: money,
    currency: { type: String, required: true },
    rate: optRate,
    baseAmount: optBase,
    // The part of the charge this payment covers, in the charge's currency (when currencies differ)
    chargeAmount: { type: Number, default: 0, min: 0 },
    paidAt: { type: Date, required: true, index: true },
    period: { type: String, required: true, index: true },
    // Who brought the money in: the basis for commissions (phase 4)
    collectedBy: { type: ObjectId, ref: 'User', default: null, index: true },
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    recordedBy: { type: ObjectId, ref: 'User', required: true },
    // Payments recorded by employees wait for finance to confirm the money arrived
    status: { type: String, enum: ['pending', 'confirmed', 'voided', 'rejected'], default: 'pending', index: true },
    confirmedBy: { type: ObjectId, ref: 'User', default: null },
    confirmedAt: { type: Date, default: null },
    refundedAmount: { type: Number, default: 0, min: 0 },
    voidReason: { type: String, default: '' },
    voidedBy: { type: ObjectId, ref: 'User', default: null },
    voidedAt: { type: Date, default: null },
    note: { type: String, default: '', maxlength: 500 }
}, { timestamps: true, optimisticConcurrency: true });
paymentSchema.plugin(protectRecords, { mutable: ['status', 'confirmedBy', 'confirmedAt', 'refundedAmount', 'voidReason', 'voidedBy', 'voidedAt', 'period'] });

const refundSchema = new mongoose.Schema({
    refundNo: { type: String, required: true, unique: true },
    payment: { type: ObjectId, ref: 'Payment', required: true, index: true },
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    account: { type: ObjectId, ref: 'FinanceAccount', required: true },
    amount: money,                                   // in the payment's currency
    currency: { type: String, required: true },
    rate: optRate,          // the payment's rate, so revenue reverses at the value it was booked at
    baseAmount: optBase,
    chargeAmount: { type: Number, default: 0 },
    reason: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending', index: true },
    requestedBy: { type: ObjectId, ref: 'User', required: true },
    approval: { type: ObjectId, ref: 'Approval', default: null },
    paidAt: { type: Date, default: null },
    period: { type: String, default: '' }
}, { timestamps: true, optimisticConcurrency: true });
refundSchema.plugin(protectRecords, { mutable: ['status', 'approval', 'paidAt', 'period', 'account'] });

// ---- academy money ----

const expenseSchema = new mongoose.Schema({
    expenseNo: { type: String, required: true, unique: true },
    category: { type: String, required: true, maxlength: 80, index: true },
    account: { type: ObjectId, ref: 'FinanceAccount', required: true, index: true },
    amount: money,
    currency: { type: String, required: true },
    rate: optRate,
    baseAmount: optBase,
    date: { type: Date, required: true, index: true },
    period: { type: String, required: true },
    payee: { type: String, default: '', maxlength: 160 },
    description: { type: String, default: '', maxlength: 500 },
    recordedBy: { type: ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['posted', 'voided'], default: 'posted', index: true },
    voidReason: { type: String, default: '' },
    voidedBy: { type: ObjectId, ref: 'User', default: null },
    // A direct cost of one program (instructor fee, materials), so its profit can be reported
    program: { type: ObjectId, ref: 'Course', default: null, index: true },
    // A photo or PDF of the receipt; can be added after the expense is recorded
    attachment: {
        storageKey: { type: String, default: '' },
        filename: { type: String, default: '' },
        mimetype: { type: String, default: '' },
        size: { type: Number, default: 0 },
        uploadedBy: { type: ObjectId, ref: 'User', default: null },
        uploadedAt: { type: Date, default: null }
    }
}, { timestamps: true, optimisticConcurrency: true });
expenseSchema.plugin(protectRecords, { mutable: ['status', 'voidReason', 'voidedBy', 'attachment'] });

const transferSchema = new mongoose.Schema({
    transferNo: { type: String, required: true, unique: true },
    from: { type: ObjectId, ref: 'FinanceAccount', required: true },
    to: { type: ObjectId, ref: 'FinanceAccount', required: true },
    amountOut: money,
    amountIn: money,
    rateOut: { type: Number, default: null },
    rateIn: { type: Number, default: null },
    date: { type: Date, required: true },
    period: { type: String, required: true },
    note: { type: String, default: '', maxlength: 300 },
    recordedBy: { type: ObjectId, ref: 'User', required: true }
}, { timestamps: true });
transferSchema.plugin(protectRecords);

// ---- approvals ----

// Discounts, refunds and voids wait here for the finance manager or an admin
const approvalSchema = new mongoose.Schema({
    type: { type: String, enum: ['discount', 'refund', 'void_payment', 'void_expense'], required: true, index: true },
    target: { kind: String, id: { type: ObjectId, required: true }, no: String },
    customer: { type: ObjectId, ref: 'Customer', default: null, index: true },
    summary: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: '' },
    reason: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    requestedBy: { type: ObjectId, ref: 'User', required: true },
    decidedBy: { type: ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '' }
}, { timestamps: true, optimisticConcurrency: true });
approvalSchema.plugin(protectRecords, { mutable: ['status', 'decidedBy', 'decidedAt', 'decisionNote'] });

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
    Currency: model('Currency', currencySchema),
    ExchangeRate: model('ExchangeRate', exchangeRateSchema),
    FinanceAccount: model('FinanceAccount', financeAccountSchema),
    Period: model('FinancePeriod', periodSchema),
    Movement: model('Movement', movementSchema),
    Charge: model('Charge', chargeSchema),
    Payment: model('Payment', paymentSchema),
    Refund: model('Refund', refundSchema),
    Expense: model('Expense', expenseSchema),
    Transfer: model('Transfer', transferSchema),
    Approval: model('Approval', approvalSchema),
    ACCOUNT_TYPES,
    METHODS
};
