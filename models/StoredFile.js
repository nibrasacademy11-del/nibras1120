const mongoose = require('mongoose');

// File bytes for the "mongo" storage driver (lib/storage.js). Used until a cloud bucket
// (Cloudflare R2) is set up; Vercel's request limit keeps each file under 4MB.
const storedFileSchema = new mongoose.Schema({
    data: { type: Buffer, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('StoredFile', storedFileSchema);
