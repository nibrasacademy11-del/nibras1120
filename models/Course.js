const mongoose = require('mongoose');
const specialties = require('../assets/js/specialties');

const courseSchema = new mongoose.Schema({
    // Core Bilingual Titles
    titleAr: { type: String, required: true },
    titleEn: { type: String, default: '' },
    slug: { type: String, required: true, unique: true, index: true },
    
    // Categorization
    type: { 
        type: String, 
        enum: ['course', 'diploma', 'master', 'phd'], 
        required: true,
        index: true 
    },
    specialty: { type: String, required: true, index: true },
    specialtyKey: { type: String, index: true },

    // Descriptions
    descriptionAr: { type: String, default: '' },
    descriptionEn: { type: String, default: '' },
    
    // Details Arrays
    objectivesAr: [{ type: String }],
    objectivesEn: [{ type: String }],
    topicsAr: [{ type: String }],
    topicsEn: [{ type: String }],
    audienceAr: [{ type: String }],
    audienceEn: [{ type: String }],
    outcomesAr: [{ type: String }],
    outcomesEn: [{ type: String }],
    
    // Meta & Delivery
    duration: { type: String, default: '' },
    deliveryMethod: { type: String, default: 'عن بُعد (أونلاين)' },
    price: { type: Number, required: true, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 90 },
    currency: { type: String, default: 'US$' },
    image: { type: String, default: '' },
    
    // Status & Visibility
    status: { 
        type: String, 
        enum: ['available', 'unavailable', 'coming_soon', 'hidden'], 
        default: 'available',
        index: true
    },
    featured: { type: Boolean, default: false },
    certificateType: { type: String, default: 'شهادة مهنية معتمدة' },
    // Management system: how many required modules complete the program (0 = all of them)
    modulesRequired: { type: Number, default: 0, min: 0 },
    
    // SEO
    seoTitleAr: { type: String, default: '' },
    seoTitleEn: { type: String, default: '' },
    seoDescriptionAr: { type: String, default: '' },
    seoDescriptionEn: { type: String, default: '' },

    // Backward Compatibility Fields
    title: { type: String },
    description: { type: String },
    content: { type: String }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// The price a learner pays. Every total is computed from this on the server, never taken from the browser.
courseSchema.virtual('finalPrice').get(function () {
    const discount = Math.min(Math.max(this.discountPercent || 0, 0), 90);
    return Math.round((this.price || 0) * (100 - discount)) / 100;
});

// Auto-fill legacy fields if missing
courseSchema.pre('save', function() {
    this.specialtyKey = specialties.keyFor(this.titleAr, this.specialty);
    if (!this.title && this.titleAr) this.title = this.titleAr;
    if (!this.description && this.descriptionAr) this.description = this.descriptionAr;
    if (!this.content && this.topicsAr) this.content = this.topicsAr.join(', ');
});

module.exports = mongoose.model('Course', courseSchema);
