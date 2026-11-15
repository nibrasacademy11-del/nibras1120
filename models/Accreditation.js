const mongoose = require('mongoose');

// An accreditation or partnership (اعتماد) shown on the certificates of the programs it covers
const accreditationSchema = new mongoose.Schema({
    nameAr: { type: String, required: true, trim: true, maxlength: 160 },
    nameEn: { type: String, default: '', trim: true, maxlength: 160 },
    body: { type: String, default: '', trim: true, maxlength: 160 },     // the accrediting organization
    number: { type: String, default: '', trim: true, maxlength: 80 },    // accreditation or license number
    logo: { type: String, default: '' },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    programs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course', index: true }],
    allPrograms: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('Accreditation', accreditationSchema);
