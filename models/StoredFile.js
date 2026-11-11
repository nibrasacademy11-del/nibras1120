const mongoose = require('mongoose');

// One uploaded file (lib/storage.js). The bytes are either here (data) or in the Cloudflare R2
// bucket (r2Key), so files keep the same key when they move to R2. Vercel keeps each under 4MB.
const storedFileSchema = new mongoose.Schema({
    data: { type: Buffer, default: undefined },
    r2Key: { type: String, default: '' },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('StoredFile', storedFileSchema);
