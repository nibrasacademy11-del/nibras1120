const mongoose = require('mongoose');

// In-app notifications. Read ones are removed after 120 days.
const notificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },   // access_request, access_decision, task_assigned, follow_up_due, customer_assigned...
    titleAr: { type: String, required: true, maxlength: 200 },
    titleEn: { type: String, default: '', maxlength: 200 },
    bodyAr: { type: String, default: '', maxlength: 500 },
    bodyEn: { type: String, default: '', maxlength: 500 },
    link: { type: String, default: '' },        // portal path, e.g. /customers/<id>
    readAt: { type: Date, default: null },
    // Keeps one notification per event (for example one "due" reminder per task)
    dedupeKey: { type: String, default: undefined }
}, { timestamps: true });

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
notificationSchema.index({ readAt: 1 }, { expireAfterSeconds: 120 * 24 * 60 * 60, partialFilterExpression: { readAt: { $type: 'date' } } });

module.exports = mongoose.model('Notification', notificationSchema);
