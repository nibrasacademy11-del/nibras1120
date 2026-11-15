const mongoose = require('mongoose');

// One uploaded file (lib/storage.js), its bytes in data (4MB at most).
const storedFileSchema = new mongoose.Schema({
    data: { type: Buffer, default: undefined },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('StoredFile', storedFileSchema);
