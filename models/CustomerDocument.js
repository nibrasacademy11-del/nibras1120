const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const CATEGORIES = ['identity', 'contract', 'certificate', 'receipt', 'academic', 'other'];

// A customer document with every version kept. Uploading a new version never removes the old one.
const versionSchema = new mongoose.Schema({
    version: { type: Number, required: true },
    storageKey: { type: String, required: true },
    filename: { type: String, required: true, maxlength: 200 },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: String,
    uploadedBy: { type: ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
    note: { type: String, default: '', maxlength: 300 }
}, { _id: false });

const customerDocumentSchema = new mongoose.Schema({
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, enum: CATEGORIES, default: 'other' },
    versions: [versionSchema],
    // Shown to the customer in their portal when true
    visibleToCustomer: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    createdBy: { type: ObjectId, ref: 'User', required: true }
}, { timestamps: true, optimisticConcurrency: true });

customerDocumentSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model('CustomerDocument', customerDocumentSchema);
