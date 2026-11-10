const mongoose = require('mongoose');

// One document per numbering series (customer IDs, receipts, certificates...).
// $inc is atomic, so two requests at the same moment never get the same number.
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
}, { versionKey: false });

module.exports = mongoose.model('Counter', counterSchema);
