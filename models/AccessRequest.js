const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// The parts of a customer file that a request can open
const SECTIONS = ['contact', 'identity', 'financial', 'documents', 'notes'];

// An employee asks to see more of a customer who is not theirs. The file owner (or an admin)
// decides; an approval opens only the requested sections, only until it expires or is revoked.
const accessRequestSchema = new mongoose.Schema({
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    requester: { type: ObjectId, ref: 'User', required: true, index: true },
    approver: { type: ObjectId, ref: 'User', default: null, index: true },   // the file owner when the request was made
    sections: [{ type: String, enum: SECTIONS }],
    purpose: { type: String, required: true, trim: true, maxlength: 500 },
    durationHours: { type: Number, required: true, min: 1, max: 24 * 30 },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'revoked', 'cancelled'], default: 'pending', index: true },
    decidedBy: { type: ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '', maxlength: 500 },
    adminDecision: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null, index: true },
    revokedBy: { type: ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null }
}, { timestamps: true, optimisticConcurrency: true });

accessRequestSchema.index({ requester: 1, customer: 1, status: 1, expiresAt: 1 });
accessRequestSchema.statics.SECTIONS = SECTIONS;

module.exports = mongoose.model('AccessRequest', accessRequestSchema);
