const mongoose = require('mongoose');

// Images uploaded from the admin panel. Vercel has no lasting disk, so the bytes live here
// and are served from /api/media/:id behind a long CDN cache.
const mediaSchema = new mongoose.Schema({
    data: { type: Buffer, required: true },
    mimetype: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
    size: { type: Number, required: true }
}, { timestamps: true });

mediaSchema.methods.url = function () {
    return `/api/media/${this._id}`;
};

module.exports = mongoose.model('Media', mediaSchema);
