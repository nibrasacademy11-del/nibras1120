const SiteSettings = require('../models/SiteSettings');
const Testimonial = require('../models/Testimonial');
const Media = require('../models/Media');
const Course = require('../models/Course');
const defaults = require('../assets/js/site-content');

const MEDIA_URL = /^\/api\/media\/[0-9a-f]{24}$/;
const ICON = /^fa-[a-z0-9-]{1,40}$/;

const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const image = (value) => (typeof value === 'string' && MEDIA_URL.test(value) ? value : '');
const points = (value) => (Array.isArray(value) ? value : String(value || '').split('\n'))
    .map((p) => str(p, 200)).filter(Boolean).slice(0, 8);

// Reading never writes: until the admin saves something, an unsaved default document stands in
async function getSettings() {
    return (await SiteSettings.findOne()) || new SiteSettings();
}

// Sections with a fixed set of cards keep their keys; the admin edits the cards, not the set
function mergeByKey(defaultList, saved) {
    const byKey = new Map((saved || []).map((item) => [item.key, item]));
    return defaultList.map((item) => {
        const stored = byKey.get(item.key) || {};
        const merged = { ...item };
        for (const [field, value] of Object.entries(stored)) {
            if (field === 'image' || (value !== '' && value !== undefined && !(Array.isArray(value) && !value.length))) {
                merged[field] = value;
            }
        }
        return merged;
    });
}

function siteContent(settings) {
    const heroes = {};
    for (const page of defaults.heroPages) heroes[page.key] = (settings.heroes && settings.heroes.get(page.key)) || '';
    return {
        heroes,
        pathways: mergeByKey(defaults.pathways, settings.pathways),
        stats: settings.stats || defaults.stats,
        guideCards: mergeByKey(defaults.guideCards, settings.guideCards),
        serviceCards: mergeByKey(defaults.serviceCards, settings.serviceCards)
    };
}

// Each section accepts only its own fields, with lengths capped and images limited to our uploads
const SECTIONS = {
    heroes(input) {
        const out = new Map();
        for (const page of defaults.heroPages) {
            const url = image(input && input[page.key]);
            if (url) out.set(page.key, url);
        }
        return out;
    },
    pathways: (input) => defaults.pathways.map(({ key }) => {
        const item = (input || []).find((p) => p && p.key === key) || {};
        return {
            key, image: image(item.image),
            titleAr: str(item.titleAr, 80), titleEn: str(item.titleEn, 80),
            taglineAr: str(item.taglineAr, 120), taglineEn: str(item.taglineEn, 120),
            descAr: str(item.descAr, 400), descEn: str(item.descEn, 400)
        };
    }),
    stats: (input) => (Array.isArray(input) ? input : []).slice(0, defaults.limits.stats).map((item) => ({
        value: Math.max(0, Math.min(Math.round(Number(item.value) || 0), 10000000)),
        suffix: str(item.suffix, 4),
        icon: ICON.test(item.icon) ? item.icon : 'fa-star',
        labelAr: str(item.labelAr, 60),
        labelEn: str(item.labelEn, 60)
    })).filter((item) => item.labelAr),
    guideCards: (input) => defaults.guideCards.map(({ key }) => {
        const item = (input || []).find((c) => c && c.key === key) || {};
        return {
            key, image: image(item.image),
            titleAr: str(item.titleAr, 100), titleEn: str(item.titleEn, 100),
            textAr: str(item.textAr, 300), textEn: str(item.textEn, 300),
            linkAr: str(item.linkAr, 40), linkEn: str(item.linkEn, 40)
        };
    }),
    serviceCards: (input) => defaults.serviceCards.map(({ key }) => {
        const item = (input || []).find((c) => c && c.key === key) || {};
        return {
            key, image: image(item.image),
            titleAr: str(item.titleAr, 100), titleEn: str(item.titleEn, 100),
            subtitleAr: str(item.subtitleAr, 120), subtitleEn: str(item.subtitleEn, 120),
            textAr: str(item.textAr, 400), textEn: str(item.textEn, 400),
            pointsAr: points(item.pointsAr), pointsEn: points(item.pointsEn),
            linkAr: str(item.linkAr, 40), linkEn: str(item.linkEn, 40)
        };
    })
};

function publicTestimonial(t) {
    return { id: t._id, nameAr: t.nameAr, nameEn: t.nameEn, roleAr: t.roleAr, roleEn: t.roleEn, quoteAr: t.quoteAr, quoteEn: t.quoteEn, image: t.image };
}

// One request gives a page everything the admin controls. The CDN keeps it for 30 seconds.
exports.getSite = async (req, res) => {
    try {
        const [settings, testimonials] = await Promise.all([
            getSettings(),
            Testimonial.find({ visible: true }).sort({ order: 1, createdAt: -1 }).limit(defaults.limits.testimonials)
        ]);
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=120');
        res.json({ ...siteContent(settings), testimonials: testimonials.map(publicTestimonial) });
    } catch (error) {
        console.error('Site content error:', error);
        res.status(500).json({ message: 'Could not load site content.' });
    }
};

exports.getAdminSite = async (req, res) => {
    try {
        const settings = await getSettings();
        res.setHeader('Cache-Control', 'no-store');
        res.json({ ...siteContent(settings), heroPages: defaults.heroPages });
    } catch (error) {
        res.status(500).json({ message: 'Could not load site content.' });
    }
};

exports.updateSection = async (req, res) => {
    const clean = SECTIONS[req.params.section];
    if (!clean) return res.status(404).json({ message: 'Not found.' });
    try {
        const settings = await getSettings();
        settings.set(req.params.section, clean(req.body.value));
        await settings.save();
        res.json({ message: 'تم الحفظ.', ...siteContent(settings) });
    } catch (error) {
        console.error('Site section save error:', error);
        res.status(500).json({ message: 'تعذر حفظ التعديلات.' });
    }
};

// --- Testimonials ---
function readTestimonial(body) {
    return {
        nameAr: str(body.nameAr, 120), nameEn: str(body.nameEn, 120),
        roleAr: str(body.roleAr, 160), roleEn: str(body.roleEn, 160),
        quoteAr: str(body.quoteAr, 1200), quoteEn: str(body.quoteEn, 1200),
        image: image(body.image),
        order: Math.round(Number(body.order) || 0),
        visible: body.visible !== false
    };
}

exports.listTestimonials = async (req, res) => {
    try {
        res.json({ testimonials: await Testimonial.find().sort({ order: 1, createdAt: -1 }) });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.createTestimonial = async (req, res) => {
    try {
        const data = readTestimonial(req.body);
        if (!data.nameAr || !data.quoteAr) return res.status(400).json({ message: 'الاسم ونص الرأي بالعربي مطلوبان.' });
        res.status(201).json({ testimonial: await Testimonial.create(data) });
    } catch (error) {
        res.status(500).json({ message: 'تعذر حفظ الرأي.' });
    }
};

exports.updateTestimonial = async (req, res) => {
    try {
        const data = readTestimonial(req.body);
        if (!data.nameAr || !data.quoteAr) return res.status(400).json({ message: 'الاسم ونص الرأي بالعربي مطلوبان.' });
        const testimonial = await Testimonial.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!testimonial) return res.status(404).json({ message: 'Not found.' });
        res.json({ testimonial });
    } catch (error) {
        res.status(500).json({ message: 'تعذر حفظ الرأي.' });
    }
};

exports.deleteTestimonial = async (req, res) => {
    try {
        const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
        if (!testimonial) return res.status(404).json({ message: 'Not found.' });
        res.json({ message: 'تم الحذف.' });
    } catch (error) {
        res.status(500).json({ message: 'تعذر حذف الرأي.' });
    }
};

// --- Media ---
// The file must really be an image of the type it claims, judged by its first bytes
function sniffImage(buffer) {
    if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length > 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

// Uploads that nothing points to a day later (replaced or abandoned images) are removed
async function sweepOrphanMedia() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const old = await Media.find({ createdAt: { $lt: cutoff } }).select('_id').lean();
    if (!old.length) return;
    const [settings, courses, testimonials] = await Promise.all([
        SiteSettings.findOne().lean(),
        Course.find({ image: /^\/api\/media\// }).select('image').lean(),
        Testimonial.find({ image: /^\/api\/media\// }).select('image').lean()
    ]);
    const used = JSON.stringify([settings, courses, testimonials]);
    const orphans = old.filter((m) => !used.includes(String(m._id))).map((m) => m._id);
    if (!orphans.length) return;
    await Media.deleteMany({ _id: { $in: orphans } });
}

exports.uploadMedia = async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) return res.status(400).json({ message: 'لم يتم اختيار صورة.' });
        const mimetype = sniffImage(req.file.buffer);
        if (!mimetype) return res.status(400).json({ message: 'الملف ليس صورة صالحة (JPG أو PNG أو WebP).' });
        const media = await Media.create({ data: req.file.buffer, mimetype, size: req.file.size });
        sweepOrphanMedia().catch((err) => console.error('Media sweep failed:', err.message));
        res.status(201).json({ url: media.url() });
    } catch (error) {
        console.error('Media upload error:', error);
        res.status(500).json({ message: 'تعذر رفع الصورة.' });
    }
};

exports.getMedia = async (req, res) => {
    try {
        const media = await Media.findById(req.params.id);
        if (!media) return res.status(404).json({ message: 'Not found.' });
        const data = media.data;
        if (!data) return res.status(404).json({ message: 'Not found.' });
        // An id always names the same bytes, so browsers and the CDN may keep it for a year
        res.setHeader('Content-Type', media.mimetype);
        res.setHeader('Content-Length', data.length);
        res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
        res.setHeader('ETag', `"${media._id}"`);
        res.send(data);
    } catch (error) {
        res.status(500).json({ message: 'Could not load image.' });
    }
};
