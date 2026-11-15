const mongoose = require('mongoose');

// Internal notes on a customer. Never shown to the customer.
const customerNoteSchema = new mongoose.Schema({
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    edits: [{ _id: false, at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, previous: String }]
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('CustomerNote', customerNoteSchema);
