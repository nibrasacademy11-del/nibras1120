const mongoose = require('mongoose');

const ObjectId = mongoose.Schema.Types.ObjectId;

// Payroll: a monthly sheet per month, salary advances repaid in installments, and the basic salary
// kept on each employee's file (models/Employee.js). The sheet is a statement only: paying it is
// done outside the system, so it posts nothing to the cash and bank accounts.

// An advance (سلفة) repaid over a number of monthly installments, from startMonth on
const advanceSchema = new mongoose.Schema({
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, default: 'EGP' },
    installments: { type: Number, required: true, min: 1, max: 60 },
    startMonth: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    repaid: { type: Number, default: 0 },
    // the months already taken from, so an approved sheet never takes twice
    repayments: [{ month: String, amount: Number, run: { type: ObjectId, ref: 'PayrollRun' } }],
    status: { type: String, enum: ['active', 'repaid', 'cancelled'], default: 'active', index: true },
    reason: { type: String, default: '', maxlength: 500 },
    cancelReason: { type: String, default: '' },
    createdBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true, optimisticConcurrency: true });

const lineSchema = new mongoose.Schema({
    user: { type: ObjectId, ref: 'User', required: true },
    employeeNo: String,
    name: String,
    jobTitle: String,
    team: { type: ObjectId, ref: 'Team', default: null },
    teamName: String,
    currency: { type: String, default: 'EGP' },
    basic: { type: Number, default: 0 },
    // approved or paid commission lines of the month, in the salary currency
    commission: { type: Number, default: 0 },
    // commissions in other currencies are listed, not added to the net
    otherCommissions: [{ currency: String, amount: Number, _id: false }],
    bonus: { type: Number, default: 0 },
    bonusNote: { type: String, default: '', maxlength: 300 },
    advanceDeduction: { type: Number, default: 0 },
    advances: [{ advance: { type: ObjectId, ref: 'Advance' }, amount: Number, _id: false }],
    // typed by hand by HR or the owner, after looking at the attendance summary next to it
    deduction: { type: Number, default: 0 },
    deductionNote: { type: String, default: '', maxlength: 300 },
    attendance: {
        workingDays: { type: Number, default: 0 },
        present: { type: Number, default: 0 },
        absent: { type: Number, default: 0 },
        late: { type: Number, default: 0 },
        leave: { type: Number, default: 0 },
        lateMinutes: { type: Number, default: 0 },
        earlyLeaveMinutes: { type: Number, default: 0 }
    },
    net: { type: Number, default: 0 },
    acknowledgedAt: { type: Date, default: null }
}, { _id: false });

const runSchema = new mongoose.Schema({
    month: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
    status: { type: String, enum: ['draft', 'approved'], default: 'draft', index: true },
    lines: [lineSchema],
    notes: { type: String, default: '', maxlength: 1000 },
    createdBy: { type: ObjectId, ref: 'User' },
    approvedBy: { type: ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null }
}, { timestamps: true, optimisticConcurrency: true });

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
    Advance: model('Advance', advanceSchema),
    PayrollRun: model('PayrollRun', runSchema)
};
