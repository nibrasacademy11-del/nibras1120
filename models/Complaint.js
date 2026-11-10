const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const CATEGORIES = ['service', 'program', 'trainer', 'finance', 'certificate', 'technical', 'other'];

// A complaint from a customer, recorded by staff or sent from the customer portal
const complaintSchema = new mongoose.Schema({
    complaintNo: { type: String, required: true, unique: true },
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    enrollment: { type: ObjectId, ref: 'Enrollment', default: null },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 5000 },
    category: { type: String, enum: CATEGORIES, default: 'other', index: true },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    channel: { type: String, enum: ['portal', 'phone', 'whatsapp', 'email', 'visit', 'other'], default: 'other' },
    status: { type: String, enum: STATUSES, default: 'open', index: true },
    assignee: { type: ObjectId, ref: 'User', default: null, index: true },   // owner for permission scopes
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    resolution: { type: String, default: '', maxlength: 3000 },
    resolvedAt: { type: Date, default: null },
    dueAt: { type: Date, default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
    updates: [{ _id: false, at: Date, by: { type: ObjectId, ref: 'User' }, byName: String, status: String, note: String, internal: Boolean }]
}, { timestamps: true, optimisticConcurrency: true });

complaintSchema.statics.STATUSES = STATUSES;
complaintSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model('Complaint', complaintSchema);
