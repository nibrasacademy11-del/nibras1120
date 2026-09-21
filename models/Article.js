const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    titleAr: { type: String, required: true },
    titleEn: { type: String, default: '' },
    slug: { type: String, required: true, unique: true, index: true },
    category: { 
        type: String, 
        enum: ['article', 'media_coverage'], 
        default: 'article',
        index: true 
    },
    mediaSource: { type: String, default: '' },
    sourceUrl: { type: String, default: '' },
    author: { type: String, default: 'أكاديمية نبراس' },
    image: { type: String, default: '' },
    summaryAr: { type: String, default: '' },
    summaryEn: { type: String, default: '' },
    contentAr: { type: String, default: '' },
    contentEn: { type: String, default: '' },
    status: { 
        type: String, 
        enum: ['published', 'draft', 'archived'], 
        default: 'published',
        index: true 
    },
    publishDate: { type: Date, default: Date.now },
    seoTitleAr: { type: String, default: '' },
    seoDescriptionAr: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Article', articleSchema);
