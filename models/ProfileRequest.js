const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// A customer's request to change their locked personal data (the data printed on certificates).
// The owner or customer service approves or rejects it; an approval applies the change and
// reissues the customer's certificates when the name changed. One open request per customer.
const changeSchema = new mongoose.Schema({
    field: { type: String, required: true },
    from: { type: String, default: '' },   // identity numbers: the last four digits only
    to: { type: String, default: '' },     // identity numbers: the last four digits only
    toEnc: { type: String, default: '' }   // identity numbers: the new number, encrypted (lib/fieldCrypto)
}, { _id: false });

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

const profileRequestSchema = new mongoose.Schema({
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    changes: { type: [changeSchema], validate: (v) => v.length > 0 },
    reason: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    decidedBy: { type: ObjectId, ref: 'User', default: null },
    decidedByName: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '', maxlength: 500 },
    reissued: [{ type: String }]          // certificate numbers issued again with the new data
}, { timestamps: true, optimisticConcurrency: true });

profileRequestSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('ProfileRequest', profileRequestSchema);
