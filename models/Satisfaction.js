const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// A satisfaction rating (1–5) from a customer about a program, the service, or a closed complaint.
// One rating per customer per subject; a later rating replaces the score and keeps the earlier one.
const satisfactionSchema = new mongoose.Schema({
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    kind: { type: String, enum: ['program', 'service', 'complaint'], required: true, index: true },
    enrollment: { type: ObjectId, ref: 'Enrollment', default: null },
    complaint: { type: ObjectId, ref: 'Complaint', default: null },
    program: { type: ObjectId, ref: 'Course', default: null, index: true },
    owner: { type: ObjectId, ref: 'User', default: null, index: true },   // the employee responsible, for performance reports
    team: { type: ObjectId, ref: 'Team', default: null },
    score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', trim: true, maxlength: 2000 },
    previous: [{ _id: false, score: Number, comment: String, at: Date }]
}, { timestamps: true });

satisfactionSchema.index({ customer: 1, kind: 1, enrollment: 1, complaint: 1 }, { unique: true });

module.exports = mongoose.model('Satisfaction', satisfactionSchema);
