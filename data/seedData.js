const fs = require('fs');
const path = require('path');
const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
require('dotenv').config();

const Course = require('../models/Course');
const SiteSettings = require('../models/SiteSettings');

// Helper to extract program details from HTML files
function extractProgramsFromHtml(filePath, type, defaultSpecialty) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const programs = [];

    // Match card blocks
    const cardRegex = /<div class="program-card[^"]*">([\s\S]*?)<\/div>\s*(?:<\/div>|\s*<div class="program-card)/g;
    
    // We can also parse by modal definitions
    const modalRegex = /<div id="([^"]+)" class="nibras-modal">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    const modalMap = {};
    let mMatch;
    while ((mMatch = modalRegex.exec(content)) !== null) {
        const modalId = mMatch[1];
        const modalHtml = mMatch[2];
        
        // Extract sections
        const titleMatch = modalHtml.match(/<h2>([^<]+)<\/h2>/);
        const priceMatch = modalHtml.match(/السعر:\s*(\d+(?:\.\d+)?)\s*US\$/);
        const descMatch = modalHtml.match(/<h4><i class="fas fa-info-circle"><\/i>[\s\S]*?<\/h4>\s*<p>([\s\S]*?)<\/p>/);
        
        function extractList(iconClass) {
            const secRegex = new RegExp(`<h4><i class="${iconClass}"><\\/i>[\\s\\S]*?<\\/h4>\\s*<ul class="modal-list">([\\s\\S]*?)<\\/ul>`);
            const secMatch = modalHtml.match(secRegex);
            if (!secMatch) return [];
            const items = [];
            const liRegex = /<li>(?:<i[^>]*><\/i>)?\s*([^<]+)<\/li>/g;
            let li;
            while ((li = liRegex.exec(secMatch[1])) !== null) {
                items.push(li[1].trim());
            }
            return items;
        }

        modalMap[modalId] = {
            title: titleMatch ? titleMatch[1].trim() : '',
            price: priceMatch ? parseFloat(priceMatch[1]) : 0,
            description: descMatch ? descMatch[1].trim() : '',
            objectives: extractList('fas fa-bullseye'),
            topics: extractList('fas fa-list-ul'),
            audience: extractList('fas fa-users'),
            outcomes: extractList('fas fa-gift')
        };
    }

    // Now extract card details
    const cardSimpleRegex = /<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?(\d+(?:\.\d+)?)\s*US\$[\s\S]*?openModal\('([^']+)'\)[\s\S]*?addToCart\('([^']+)',\s*'([^']+)',\s*(\d+)\)/g;
    let card;
    while ((card = cardSimpleRegex.exec(content)) !== null) {
        const titleAr = card[1].trim();
        const shortDesc = card[2].replace(/<[^>]+>/g, '').trim();
        const price = parseFloat(card[3]) || parseFloat(card[7]) || 0;
        const modalId = card[4];
        const cartId = card[5];

        const modalInfo = modalMap[modalId] || {};

        // Generate safe slug from title
        const slug = titleAr
            .toLowerCase()
            .replace(/[^\u0621-\u064A0-9a-zA-Z]+/g, '-')
            .replace(/^-|-$/g, '') || (type + '-' + Date.now());

        // Infer specialty from title
        let specialty = defaultSpecialty || 'إدارة الأعمال';
        const keywords = [
            'المشاريع', 'المشروعات', 'الموارد البشرية', 'التسويق', 'المبيعات', 
            'المالية', 'المحاسبة', 'المخاطر', 'الجودة', 'القيادة', 'العلاقات العامة', 
            'الإعلام', 'الصحية', 'المستشفيات', 'سلاسل الإمداد', 'الأمن السيبراني', 
            'الذكاء الاصطناعي', 'تحليل البيانات', 'التحول الرقمي', 'السلامة والصحة المهنية', 
            'الفنادق', 'التخطيط الاستراتيجي', 'الحوكمة'
        ];
        for (const kw of keywords) {
            if (titleAr.includes(kw)) {
                specialty = kw;
                break;
            }
        }

        programs.push({
            titleAr,
            titleEn: '',
            slug,
            type,
            specialty,
            descriptionAr: modalInfo.description || shortDesc,
            descriptionEn: '',
            objectivesAr: modalInfo.objectives || [],
            objectivesEn: [],
            topicsAr: modalInfo.topics || [],
            topicsEn: [],
            audienceAr: modalInfo.audience || [],
            audienceEn: [],
            outcomesAr: modalInfo.outcomes || [],
            outcomesEn: [],
            duration: type === 'master' ? 'سنة دراسية' : (type === 'phd' ? 'سنتان دراسيتان' : (type === 'diploma' ? '6 أشهر' : 'شهر واحد')),
            deliveryMethod: 'عن بُعد (محاضرات مباشرة ومسجلة)',
            price,
            currency: 'US$',
            image: '',
            status: 'available',
            featured: false,
            certificateType: type === 'master' ? 'شهادة ماجستير مهني' : (type === 'phd' ? 'شهادة دكتوراه مهنية' : (type === 'diploma' ? 'شهادة دبلوم مهني' : 'شهادة دورة مهنية'))
        });
    }

    return programs;
}

async function runSeed() {
    try {
        if (!process.env.MONGO_URI) {
            console.error('MONGO_URI missing!');
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB for non-destructive seeding...');

        // 1. Seed Site Settings
        const settingsCount = await SiteSettings.countDocuments();
        if (settingsCount === 0) {
            await SiteSettings.create({});
            console.log('SiteSettings initialized.');
        } else {
            console.log('SiteSettings already exists.');
        }

        // 2. Extract & Seed Programs from HTML
        const basePath = path.join(__dirname, '..');
        const masterPrograms = extractProgramsFromHtml(path.join(basePath, 'pages/ar/masters.html'), 'master', 'إدارة الأعمال');
        const phdPrograms = extractProgramsFromHtml(path.join(basePath, 'pages/ar/phd.html'), 'phd', 'إدارة الأعمال');
        const diplomaPrograms = extractProgramsFromHtml(path.join(basePath, 'pages/ar/diploma.html'), 'diploma', 'إدارة الأعمال');
        const proCoursePrograms = extractProgramsFromHtml(path.join(basePath, 'pages/ar/pro_courses.html'), 'course', 'تطوير مهني');

        const allParsed = [...masterPrograms, ...phdPrograms, ...diplomaPrograms, ...proCoursePrograms];
        console.log(`Total programs extracted from HTML files: ${allParsed.length}`);

        let insertedCount = 0;
        for (const prog of allParsed) {
            const exists = await Course.findOne({ 
                $or: [
                    { slug: prog.slug },
                    { titleAr: prog.titleAr }
                ] 
            });
            if (!exists) {
                await Course.create(prog);
                insertedCount++;
            }
        }
        console.log(`Successfully seeded ${insertedCount} new programs into MongoDB Course collection.`);

        const finalCourseCount = await Course.countDocuments();
        console.log(`Current total courses in DB: ${finalCourseCount}`);

        await mongoose.disconnect();
        console.log('Seed completed successfully.');
    } catch (err) {
        console.error('Seed error:', err);
    }
}

if (require.main === module) {
    runSeed();
}

module.exports = { runSeed, extractProgramsFromHtml };
