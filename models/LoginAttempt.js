const mongoose = require('mongoose');

// Every sign-in attempt, successful or not. Kept for 180 days.
const loginAttemptSchema = new mongoose.Schema({
    at: { type: Date, default: Date.now },
    email: { type: String, lowercase: true, trim: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    success: { type: Boolean, required: true },
    // bad_password, unknown_email, disabled, locked, 2fa_pending, 2fa_failed, ok
    reason: { type: String, default: '' },
    ip: String,
    userAgent: String
}, { versionKey: false });

loginAttemptSchema.index({ at: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
loginAttemptSchema.index({ email: 1, success: 1, at: -1 });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
