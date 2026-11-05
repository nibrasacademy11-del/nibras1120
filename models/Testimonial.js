const mongoose = require('mongoose');

// Client and learner feedback, shown on the home and corporate pages when visible
const testimonialSchema = new mongoose.Schema({
    nameAr: { type: String, required: true, trim: true, maxlength: 120 },
    nameEn: { type: String, default: '', trim: true, maxlength: 120 },
    roleAr: { type: String, default: '', trim: true, maxlength: 160 },
    roleEn: { type: String, default: '', trim: true, maxlength: 160 },
    quoteAr: { type: String, required: true, trim: true, maxlength: 1200 },
    quoteEn: { type: String, default: '', trim: true, maxlength: 1200 },
    image: { type: String, default: '' },
    order: { type: Number, default: 0 },
    visible: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Testimonial', testimonialSchema);
