const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Who belongs to a training group. A customer can be in several groups (one per module, say);
// the group's lectures and recordings are shown only to its active members.
// Removed members stay with the date and reason, so attendance history keeps its context.
const cohortMemberSchema = new mongoose.Schema({
    cohort: { type: ObjectId, ref: 'Cohort', required: true, index: true },
    program: { type: ObjectId, ref: 'Course', required: true, index: true },
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    customerUser: { type: ObjectId, ref: 'User', default: null, index: true },   // the customer's portal account
    enrollment: { type: ObjectId, ref: 'Enrollment', default: null },
    status: { type: String, enum: ['active', 'removed'], default: 'active', index: true },
    addedVia: { type: String, enum: ['bulk', 'enrollment', 'manual'], default: 'manual' },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: ObjectId, ref: 'User', default: null },
    removedAt: { type: Date, default: null },
    removedBy: { type: ObjectId, ref: 'User', default: null },
    removeReason: { type: String, default: '', maxlength: 300 }
}, { timestamps: true });

cohortMemberSchema.index({ cohort: 1, customer: 1 }, { unique: true });

module.exports = mongoose.model('CohortMember', cohortMemberSchema);
