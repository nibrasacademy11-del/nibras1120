const mongoose = require('mongoose');

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
    price: { type: Number, required: true, default: 0 },
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
    
    // SEO
    seoTitleAr: { type: String, default: '' },
    seoTitleEn: { type: String, default: '' },
    seoDescriptionAr: { type: String, default: '' },
    seoDescriptionEn: { type: String, default: '' },

    // Backward Compatibility Fields
    title: { type: String },
    description: { type: String },
    content: { type: String }
}, { timestamps: true });

// Auto-fill legacy fields if missing
courseSchema.pre('save', function() {
    if (!this.title && this.titleAr) this.title = this.titleAr;
    if (!this.description && this.descriptionAr) this.description = this.descriptionAr;
    if (!this.content && this.topicsAr) this.content = this.topicsAr.join(', ');
});

module.exports = mongoose.model('Course', courseSchema);
