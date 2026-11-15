const Course = require('../models/Course');
const mongoose = require('mongoose');
const specialties = require('../assets/js/specialties');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Only these fields can be written through the API
const EDITABLE_FIELDS = [
    'titleAr', 'titleEn', 'slug', 'type', 'specialty', 'descriptionAr', 'descriptionEn',
    'objectivesAr', 'objectivesEn', 'topicsAr', 'topicsEn', 'audienceAr', 'audienceEn',
    'outcomesAr', 'outcomesEn', 'duration', 'deliveryMethod', 'price', 'discountPercent', 'currency', 'image',
    'status', 'featured', 'certificateType', 'seoTitleAr', 'seoTitleEn', 'seoDescriptionAr',
    'seoDescriptionEn'
];

function pickEditable(body) {
    const data = {};
    for (const field of EDITABLE_FIELDS) {
        if (body[field] !== undefined) data[field] = body[field];
    }
    return data;
}

function makeSlug(text) {
    return String(text)
        .toLowerCase()
        .replace(/[^ء-ي0-9a-zA-Z]+/g, '-')
        .replace(/^-|-$/g, '');
}

// The admin panel is Arabic, so failures are explained in Arabic
const FIELD_NAMES = {
    titleAr: 'اسم البرنامج', slug: 'رابط الصفحة', type: 'المسار', specialty: 'التخصص',
    price: 'السعر', discountPercent: 'نسبة الخصم (من 0 إلى 90)', status: 'الحالة'
};

function saveError(res, error, fallback) {
    if (error.code === 11000) {
        return res.status(409).json({ message: 'يوجد برنامج آخر بنفس الاسم أو الرابط.' });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        const fields = error.errors ? Object.keys(error.errors) : [error.path];
        const names = fields.map((f) => FIELD_NAMES[f] || f).join('، ');
        return res.status(400).json({ message: `راجع الحقول التالية: ${names}` });
    }
    console.error(fallback, error);
    res.status(500).json({ message: fallback });
}

exports.getAllCourses = async (req, res) => {
    try {
        const { type, specialty, status, search, featured, ids, limit, page } = req.query;
        const isAdmin = !!req.user && req.user.role === 'super_admin';
        const query = {};

        // The cart and checkout ask for the programs they hold, to show current prices
        if (ids) {
            const list = String(ids).split(',').map((s) => s.trim()).filter((s) => mongoose.Types.ObjectId.isValid(s)).slice(0, 50);
            query._id = { $in: list };
        }

        if (type) {
            const t = String(type).toLowerCase().trim();
            if (t === 'masters' || t === 'master') {
                query.type = 'master';
            } else if (t === 'courses' || t === 'course') {
                query.type = 'course';
            } else if (t === 'diplomas' || t === 'diploma') {
                query.type = 'diploma';
            } else if (t === 'phd' || t === 'doctorate') {
                query.type = 'phd';
            } else {
                return res.json({ courses: [], total: 0, page: 1, totalPages: 0 });
            }
        }
        if (specialty) {
            const key = String(specialty).trim();
            const spec = specialties.byKey(specialties.some((s) => s.key === key) ? key : specialties.keyFor('', key));
            // Programs saved before specialtyKey existed are matched by name and title
            query.$and = [{
                $or: [
                    { specialtyKey: spec.key },
                    { specialty: spec.ar },
                    ...spec.match.map((term) => ({ titleAr: new RegExp(escapeRegex(term)) }))
                ]
            }];
        }

        // Hidden programs are visible to admins only
        if (status && (isAdmin || String(status) !== 'hidden')) {
            query.status = String(status);
        } else if (!isAdmin) {
            query.status = { $ne: 'hidden' };
        }

        if (featured === 'true') query.featured = true;

        if (search && String(search).trim()) {
            const regex = new RegExp(escapeRegex(String(search).trim()), 'i');
            query.$or = [
                { titleAr: regex },
                { titleEn: regex },
                { title: regex },
                { specialty: regex },
                { descriptionAr: regex },
                { descriptionEn: regex }
            ];
        }

        const lim = Math.min(parseInt(limit, 10) || 100, 500);
        const p = Math.max(parseInt(page, 10) || 1, 1);
        const skip = (p - 1) * lim;

        const total = await Course.countDocuments(query);
        const courses = await Course.find(query)
            .sort({ featured: -1, createdAt: -1 })
            .skip(skip)
            .limit(lim);

        res.json({ courses, total, page: p, totalPages: Math.ceil(total / lim) });
    } catch (error) {
        console.error('Error in getAllCourses:', error);
        res.status(500).json({ message: 'Server error while fetching programs.' });
    }
};

exports.getCourseById = async (req, res) => {
    try {
        const identifier = req.params.id;
        let course = null;

        if (mongoose.Types.ObjectId.isValid(identifier)) {
            course = await Course.findById(identifier);
        }

        if (!course) {
            course = await Course.findOne({ slug: identifier });
        }

        const isAdmin = !!req.user && req.user.role === 'super_admin';
        if (!course || (course.status === 'hidden' && !isAdmin)) {
            return res.status(404).json({ message: 'Program not found.' });
        }
        res.json({ course });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.createCourse = async (req, res) => {
    try {
        const data = pickEditable(req.body);
        if (!data.slug && data.titleAr) {
            data.slug = makeSlug(data.titleAr) || ('prog-' + Date.now());
        }
        const course = new Course(data);
        await course.save();
        res.status(201).json({ message: 'Program created successfully.', course });
    } catch (error) {
        saveError(res, error, 'تعذر إضافة البرنامج. حاول مرة أخرى.');
    }
};

exports.updateCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ message: 'Program not found.' });
        course.set(pickEditable(req.body));
        await course.save();
        res.json({ message: 'Program updated successfully.', course });
    } catch (error) {
        saveError(res, error, 'تعذر حفظ البرنامج. حاول مرة أخرى.');
    }
};

exports.deleteCourse = async (req, res) => {
    try {
        // A program with modules, enrollments, charges or certificates is part of people's records
        const id = req.params.id;
        const used = (await require('../models/Enrollment').exists({ program: id }))
            || (await require('../models/ProgramModule').exists({ program: id }))
            || (await require('../models/Certificate').exists({ program: id }));
        if (used) return res.status(409).json({ message: 'البرنامج مستخدم في تسجيلات أو محاور أو شهادات، فلا يمكن حذفه. غيّر حالته إلى «مخفي» بدلاً من الحذف.' });
        const course = await Course.findByIdAndDelete(id);
        if (!course) return res.status(404).json({ message: 'Program not found.' });
        res.json({ message: 'Program deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'تعذر حذف البرنامج. حاول مرة أخرى.' });
    }
};
