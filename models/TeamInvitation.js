const mongoose = require('mongoose');

const ObjectId = mongoose.Schema.Types.ObjectId;

// An invitation from a team leader (or HR / the owner) to join a team.
// The link carries a random token; only its SHA-256 is stored, it expires, and it works once.
// pending -> accepted (waiting for the owner or HR, by default) -> active (account and team set)
//         -> rejected / expired / cancelled / declined (the owner or HR said no after acceptance)
const STATUSES = ['pending', 'accepted', 'active', 'rejected', 'expired', 'cancelled', 'declined'];

const invitationSchema = new mongoose.Schema({
    team: { type: ObjectId, ref: 'Team', required: true, index: true },
    invitedBy: { type: ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    phoneKey: { type: String, required: true, index: true },     // normalized, for duplicate checks
    email: { type: String, default: '', trim: true, lowercase: true, maxlength: 200, index: true },
    jobTitle: { type: String, default: '', trim: true, maxlength: 120 },
    tokenHash: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    // set when the recipient accepts
    acceptedAt: { type: Date, default: null },
    acceptedEmail: { type: String, default: '' },
    existingUser: { type: ObjectId, ref: 'User', default: null },
    // a new account's password, chosen by the recipient and kept hashed until the account is made
    pendingPasswordHash: { type: String, default: null, select: false },
    // the owner's or HR's decision after acceptance
    decidedBy: { type: ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '', maxlength: 500 },
    user: { type: ObjectId, ref: 'User', default: null },
    employee: { type: ObjectId, ref: 'Employee', default: null },
    emailedAt: { type: Date, default: null },
    history: [{ _id: false, status: String, at: Date, by: { type: ObjectId, ref: 'User', default: null }, note: String }]
}, { timestamps: true, optimisticConcurrency: true });

invitationSchema.index({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } });
invitationSchema.statics.STATUSES = STATUSES;
invitationSchema.statics.OPEN = ['pending', 'accepted'];

module.exports = mongoose.models.TeamInvitation || mongoose.model('TeamInvitation', invitationSchema);
