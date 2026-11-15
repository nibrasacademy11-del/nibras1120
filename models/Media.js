const mongoose = require('mongoose');

// Images uploaded from the admin panel: the bytes live here and are served from /api/media/:id
// with a long browser cache.
const mediaSchema = new mongoose.Schema({
    data: { type: Buffer, default: undefined },
    mimetype: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
    size: { type: Number, required: true }
}, { timestamps: true });

mediaSchema.methods.url = function () {
    return `/api/media/${this._id}`;
};

module.exports = mongoose.model('Media', mediaSchema);
