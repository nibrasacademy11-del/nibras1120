const mongoose = require('mongoose');

// The design of issued certificates. Text may use placeholders:
// {name} {nameEn} {program} {programEn} {module} {moduleEn} {date} {number} {hours}
const signatureSchema = new mongoose.Schema({
    nameAr: String, nameEn: String, titleAr: String, titleEn: String, image: String
}, { _id: false });

const certificateTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    kind: { type: String, enum: ['module', 'program'], required: true, index: true },
    // The template used when none is chosen at issue time (one per kind)
    isDefault: { type: Boolean, default: false },
    language: { type: String, enum: ['ar', 'en', 'both'], default: 'both' },
    titleAr: { type: String, default: 'شهادة إتمام' },
    titleEn: { type: String, default: 'Certificate of Completion' },
    introAr: { type: String, default: 'تشهد أكاديمية نبراس للتدريب والتأهيل المهني بأن' },
    introEn: { type: String, default: 'Nibras Academy for Training & Professional Qualification certifies that' },
    bodyAr: { type: String, default: 'قد أتم بنجاح متطلبات {module} ضمن برنامج {program}' },
    bodyEn: { type: String, default: 'has successfully completed {moduleEn} of the {programEn} program' },
    footerAr: { type: String, default: '' },
    footerEn: { type: String, default: '' },
    logo: { type: String, default: '/assets/img/logo.png' },
    background: { type: String, default: '' },
    primaryColor: { type: String, default: '#5a020e', match: /^#[0-9a-fA-F]{6}$/ },
    accentColor: { type: String, default: '#b98a35', match: /^#[0-9a-fA-F]{6}$/ },
    showHours: { type: Boolean, default: true },
    showAccreditations: { type: Boolean, default: true },
    signatures: [signatureSchema],
    active: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('CertificateTemplate', certificateTemplateSchema);
