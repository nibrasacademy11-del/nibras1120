const mongoose = require('mongoose');

// The customer's timeline: one entry for everything that happens to the file.
// Entries are only added; a merge moves them to the surviving file and says so.
const customerEventSchema = new mongoose.Schema({
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    at: { type: Date, default: Date.now },
    type: { type: String, required: true },   // created, updated, status_changed, transferred, note, communication, task, document, access, merged...
    summary: { type: String, default: '', maxlength: 500 },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: String,
    // Which section of the file the entry belongs to, so it is shown only to those who may see that section
    section: { type: String, enum: ['general', 'contact', 'identity', 'financial', 'documents', 'notes'], default: 'general' },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    movedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null }
}, { versionKey: false });

customerEventSchema.index({ customer: 1, at: -1 });

module.exports = mongoose.model('CustomerEvent', customerEventSchema);
