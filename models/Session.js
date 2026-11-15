const mongoose = require('mongoose');

// One signed-in device. The token carries the session id, so revoking it here signs that device out.
const sessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ip: String,
    userAgent: String,
    twoFactor: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: '' },
    // MongoDB removes the session document once it has expired
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
