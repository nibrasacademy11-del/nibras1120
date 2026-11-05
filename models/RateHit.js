const mongoose = require('mongoose');

// One counter per route and client, removed by MongoDB once its window ends
const rateHitSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true }
});

rateHitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RateHit', rateHitSchema);
