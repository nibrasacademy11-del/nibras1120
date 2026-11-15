const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    nameAr: { type: String, required: true, trim: true, maxlength: 120 },
    nameEn: { type: String, default: '', trim: true, maxlength: 120 },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    active: { type: Boolean, default: true }
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('Department', departmentSchema);
