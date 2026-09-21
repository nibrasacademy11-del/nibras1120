const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema({
    academyNameAr: { type: String, default: 'أكاديمية نبراس للتدريب والتأهيل المهني' },
    academyNameEn: { type: String, default: 'Nibras Academy for Training & Professional Qualification' },
    sloganAr: { type: String, default: 'نبني الكفاءات... ونصنع أثراً يمتد إلى المستقبل' },
    sloganEn: { type: String, default: 'Building competencies... and making an impact that extends to the future' },
    phone: { type: String, default: '01112220796' },
    email: { type: String, default: 'info@nibras-ac.com' },
    whatsapp: { type: String, default: '201112220796' },
    addressAr: { type: String, default: 'الشيخ زايد، القاهرة، مصر' },
    addressEn: { type: String, default: 'Sheikh Zayed, Cairo, Egypt' },
    mapUrl: { type: String, default: 'https://maps.google.com/?q=Sheikh+Zayed+City+Giza' },
    socialLinks: {
        facebook: { type: String, default: 'https://www.facebook.com/nibars8883' },
        instagram: { type: String, default: 'https://www.instagram.com/nibars8883' },
        twitter: { type: String, default: 'https://x.com/nibras8883' },
        linkedin: { type: String, default: 'https://www.linkedin.com/in/nibras-academy-5803a239b' },
        whatsapp: { type: String, default: 'https://wa.me/201112220796' }
    },
    defaultSeo: {
        titleAr: { type: String, default: 'أكاديمية نبراس للتدريب والتأهيل المهني' },
        titleEn: { type: String, default: 'Nibras Academy for Training & Professional Qualification' },
        descAr: { type: String, default: 'نبني الكفاءات... ونصنع أثراً يمتد إلى المستقبل. برامج تدريبية وتأهيلية معتمدة تواكب سوق العمل.' },
        descEn: { type: String, default: 'Professional training and qualification programs designed for future career growth.' }
    }
}, { timestamps: true });

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
