const mongoose = require('mongoose');

// Errors from the server and from the portal in people's browsers. The same error on the same day
// is counted on one entry instead of filling the log. Entries are removed after 30 days.
const errorLogSchema = new mongoose.Schema({
    fingerprint: { type: String, required: true },
    day: { type: String, required: true },
    source: { type: String, enum: ['server', 'client'], required: true },
    message: { type: String, maxlength: 1000 },
    stack: { type: String, maxlength: 4000 },
    route: { type: String, maxlength: 300 },
    status: Number,
    count: { type: Number, default: 1 },
    firstAt: { type: Date, default: Date.now },
    lastAt: { type: Date, default: Date.now, index: true },
    lastUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userAgent: { type: String, maxlength: 300 }
}, { versionKey: false });

errorLogSchema.index({ fingerprint: 1, day: 1 }, { unique: true });
errorLogSchema.index({ lastAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ErrorLog', errorLogSchema);
