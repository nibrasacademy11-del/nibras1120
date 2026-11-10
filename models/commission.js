const mongoose = require('mongoose');
const protectRecords = require('../lib/protectRecords');

const { ObjectId } = mongoose.Schema.Types;

// Commission rates. Each change is a new record with its start date, so every past payment keeps
// the rate that applied to it and the history of changes is complete.
const rateSchema = new mongoose.Schema({
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['employee', 'team_leader'], required: true },
    rate: { type: Number, required: true, min: 0, max: 100 },     // percent
    effectiveFrom: { type: Date, required: true },
    reason: { type: String, default: '', maxlength: 300 },
    setBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true });
rateSchema.index({ user: 1, kind: 1, effectiveFrom: -1 });
rateSchema.plugin(protectRecords);

// Who shares the commission of an enrollment's payments, set by the admin
const splitSchema = new mongoose.Schema({
    enrollment: { type: ObjectId, ref: 'Enrollment', required: true, unique: true },
    beneficiaries: [{ _id: false, user: { type: ObjectId, ref: 'User', required: true }, share: { type: Number, required: true, min: 0, max: 100 } }],
    reason: { type: String, default: '' },
    setBy: { type: ObjectId, ref: 'User' },
    history: [{ _id: false, beneficiaries: [{ _id: false, user: ObjectId, share: Number }], reason: String, setBy: ObjectId, at: Date }]
}, { timestamps: true, optimisticConcurrency: true });

// One line per beneficiary per payment (or per refund, void or adjustment). Amounts are in the
// base currency; reversals are negative. Lines are never edited, only moved through statuses.
const lineSchema = new mongoose.Schema({
    beneficiary: { type: ObjectId, ref: 'User', required: true, index: true },
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    role: { type: String, enum: ['employee', 'team_leader', 'adjustment'], required: true },
    kind: { type: String, enum: ['earned', 'refund', 'void', 'adjustment'], required: true },
    payment: { type: ObjectId, ref: 'Payment', default: null, index: true },
    refund: { type: ObjectId, ref: 'Refund', default: null },
    enrollment: { type: ObjectId, ref: 'Enrollment', default: null, index: true },
    customer: { type: ObjectId, ref: 'Customer', default: null, index: true },
    receiptNo: String,
    share: { type: Number, default: 100 },
    rate: { type: Number, default: 0 },
    commissionable: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    period: { type: String, required: true, index: true },
    reversalOf: { type: ObjectId, ref: 'CommissionLine', default: null },
    note: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['due', 'approved', 'paid', 'cancelled'], default: 'due', index: true },
    approvedBy: { type: ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    payout: { type: ObjectId, ref: 'CommissionPayout', default: null },
    cancelReason: { type: String, default: '' },
    createdBy: { type: ObjectId, ref: 'User', default: null }
}, { timestamps: true });
// A payment or refund creates each beneficiary's line once, even if the hook runs twice
lineSchema.index(
    { payment: 1, refund: 1, kind: 1, beneficiary: 1, role: 1 },
    { unique: true, partialFilterExpression: { payment: { $type: 'objectId' } } }
);
lineSchema.plugin(protectRecords, { mutable: ['status', 'approvedBy', 'approvedAt', 'payout', 'cancelReason'] });

// Paying out approved lines to one beneficiary from a cash or bank account
const payoutSchema = new mongoose.Schema({
    payoutNo: { type: String, required: true, unique: true },
    beneficiary: { type: ObjectId, ref: 'User', required: true, index: true },
    lines: [{ type: ObjectId, ref: 'CommissionLine' }],
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    account: { type: ObjectId, ref: 'FinanceAccount', required: true },
    accountAmount: { type: Number, required: true },
    rate: { type: Number, required: true },
    paidAt: { type: Date, required: true },
    period: { type: String, required: true },
    note: { type: String, default: '' },
    paidBy: { type: ObjectId, ref: 'User', required: true }
}, { timestamps: true });
payoutSchema.plugin(protectRecords);

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
    CommissionRate: model('CommissionRate', rateSchema),
    CommissionSplit: model('CommissionSplit', splitSchema),
    CommissionLine: model('CommissionLine', lineSchema),
    CommissionPayout: model('CommissionPayout', payoutSchema)
};
