// Normalizes the program catalog: one specialty name per field, English titles and
// descriptions, and a cover image per specialty. Fills gaps only, so it is safe to run again.
// Usage: node data/migrateCatalog.js [--dry-run]
try {
    require('dns').setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
require('dotenv').config();
const specialties = require('../assets/js/specialties');

const SUBJECTS = {
    'إدارة الابتكار والتطوير': 'Innovation & Development Management',
    'إدارة المشروعات': 'Project Management',
    'إدارة الأعمال (MBA)': 'Business Administration (MBA)',
    'إدارة الأعمال': 'Business Administration',
    'إدارة المخاطر': 'Risk Management',
    'المحاسبة والإدارة المالية': 'Accounting & Financial Management',
    'السلامة والصحة المهنية': 'Occupational Health & Safety',
    'إدارة الفنادق': 'Hotel Management',
    'الإدارة الصحية': 'Healthcare Management',
    'إدارة المستشفيات': 'Hospital Management',
    'سلاسل الإمداد': 'Supply Chain Management',
    'التسويق والمبيعات': 'Marketing & Sales',
    'الموارد البشرية': 'Human Resources',
    'تحليل البيانات': 'Data Analytics',
    'الأمن السيبراني': 'Cybersecurity',
    'الذكاء الاصطناعي': 'Artificial Intelligence',
    'التحول الرقمي وإدارة التكنولوجيا': 'Digital Transformation & Technology Management',
    'الإدارة التنفيذية': 'Executive Management',
    'التخطيط الاستراتيجي': 'Strategic Planning',
    'العلاقات العامة والإعلام': 'Public Relations & Media',
    'القيادة الإدارية': 'Administrative Leadership',
    'إدارة الجودة': 'Quality Management',
    'حوكمة الشركات': 'Corporate Governance'
};

const TITLES = {
    'دبلوم التخطيط الاستراتيجي التطبيقي': 'Diploma in Applied Strategic Planning',
    'دبلوم إدارة الموارد البشرية المتقدم': 'Advanced Diploma in Human Resources Management',
    'دبلوم إدارة الأعمال الاحترافي': 'Professional Diploma in Business Administration',
    'دبلوم السلامة والصحة المهنية': 'Diploma in Occupational Health & Safety',
    'دبلوم الأمن السيبراني الاحترافي': 'Professional Diploma in Cybersecurity',
    'دبلوم الذكاء الاصطناعي للأعمال': 'Diploma in Artificial Intelligence for Business',
    'دبلوم تحليل البيانات لدعم القرار': 'Diploma in Data Analytics for Decision Support',
    'دبلوم التحول الرقمي وإدارة التكنولوجيا': 'Diploma in Digital Transformation & Technology Management',
    'دبلوم إدارة المشروعات والتطوير المؤسسي': 'Diploma in Project Management & Organizational Development',
    'دبلوم العلاقات العامة والإعلام المؤسسي': 'Diploma in Public Relations & Corporate Media',
    'الدبلوم المهني في المحاسبة والإدارة المالية': 'Professional Diploma in Accounting & Financial Management',
    'الدبلوم المهني في التسويق والمبيعات': 'Professional Diploma in Marketing & Sales',
    'دبلوم إدارة المخاطر المؤسسية': 'Diploma in Enterprise Risk Management',
    'دبلوم القيادة الإدارية': 'Diploma in Administrative Leadership',
    'دبلوم إدارة الجودة المتقدمة': 'Advanced Diploma in Quality Management',
    'دورة خدمة العملاء': 'Customer Service Course',
    'دورة القيادة الإدارية': 'Administrative Leadership Course',
    'دورة إدارة المشاريع': 'Project Management Course',
    'دورة نظام العمل السعودي': 'Saudi Labor Law Course',
    'دورة إدارة الموارد البشرية': 'Human Resources Management Course',
    'دورة CAPM – أساسيات إدارة المشاريع': 'CAPM – Project Management Fundamentals',
    'دورة SHRM – إدارة الموارد البشرية الاحترافية': 'SHRM – Professional Human Resources Management',
    'دورة PMP – إدارة المشاريع الاحترافية': 'PMP – Professional Project Management',
    'دورة إعداد التقارير الإدارية': 'Management Report Writing Course',
    'دورة مهارات البيع': 'Sales Skills Course',
    'دورة إدارة الوقت وضغوط العمل': 'Time & Work Stress Management Course',
    'دورة إدارة الأداء الوظيفي (KPIs)': 'Performance Management Course (KPIs)',
    'دورة المحاسبة لغير المحاسبين': 'Accounting for Non-Accountants Course',
    'دورة Power BI – تحليل البيانات وعرضها': 'Power BI – Data Analysis & Visualization',
    'دورة Six Sigma – إدارة الجودة والتحسين المستمر': 'Six Sigma – Quality Management & Continuous Improvement',
    'دورة MOS – مهارات Microsoft Office الاحترافية': 'MOS – Professional Microsoft Office Skills',
    'دورة FMAA – التحليل المالي والتقييم': 'FMAA – Financial Analysis & Valuation',
    'دورة CMA – المحاسبة الإدارية الاحترافية': 'CMA – Professional Management Accounting',
    'دورة CCXP – تجربة وخدمة العملاء الاحترافية': 'CCXP – Professional Customer Experience'
};

function englishTitle(titleAr) {
    if (TITLES[titleAr]) return TITLES[titleAr];
    const master = titleAr.match(/^الماجستير المهني في (.+)$/);
    if (master && SUBJECTS[master[1]]) return `Professional Master in ${SUBJECTS[master[1]]}`;
    const phd = titleAr.match(/^الدكتوراه المهنية في (.+)$/);
    if (phd && SUBJECTS[phd[1]]) return `Professional Doctorate in ${SUBJECTS[phd[1]]}`;
    return '';
}

function englishDescription(type, titleEn) {
    const subject = titleEn.replace(/^Professional (Master|Doctorate) in /, '');
    switch (type) {
        case 'master':
            return `A professional master's program in ${subject} that combines specialized knowledge with applied practice to advance your career and leadership capabilities.`;
        case 'phd':
            return `An advanced professional doctorate in ${subject} for experts and leaders who want to deepen their knowledge, strategic thinking and decision-making.`;
        case 'diploma':
            return `${titleEn}: a specialized program that builds a broader foundation of knowledge and practical skills in the field.`;
        default:
            return `${titleEn}: a focused program that develops practical skills you can apply directly in the workplace.`;
    }
}

async function run() {
    const dryRun = process.argv.includes('--dry-run');
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI missing!');
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    console.log(`Connected to "${db.databaseName}"${dryRun ? ' (dry run)' : ''}`);

    const courses = await db.collection('courses').find({}).toArray();
    const unmatched = [];
    const perKey = {};
    let changed = 0;

    for (const course of courses) {
        // Old specialty values were guessed from keywords, so the title decides first
        const titleKey = specialties.keyFor(course.titleAr, '');
        const key = titleKey !== specialties.fallback ? titleKey : specialties.keyFor(course.titleAr, course.specialty);
        const titleEn = course.titleEn || englishTitle(course.titleAr);
        if (!titleEn) unmatched.push(course.titleAr);
        perKey[key] = (perKey[key] || 0) + 1;

        const set = {
            specialtyKey: key,
            specialty: specialties.byKey(key).ar
        };
        if (titleEn && !course.titleEn) set.titleEn = titleEn;
        if (titleEn && !course.descriptionEn) set.descriptionEn = englishDescription(course.type, titleEn);
        if (!course.image) set.image = `/assets/img/specialties/${key}.svg`;

        if (!dryRun) await db.collection('courses').updateOne({ _id: course._id }, { $set: set });
        changed += 1;
    }

    const inquiries = { status: { $exists: false } };
    const missingStatus = await db.collection('inquiries').countDocuments(inquiries);
    if (!dryRun) await db.collection('inquiries').updateMany(inquiries, { $set: { status: 'New' } });

    console.log('Programs per specialty:', perKey);
    console.log(`Programs processed: ${changed}. Without English title: ${unmatched.length}`, unmatched);
    console.log(`Inquiries given a status: ${missingStatus}`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
