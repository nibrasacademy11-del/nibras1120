const Article = require('../models/Article');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const EDITABLE_FIELDS = [
    'titleAr', 'titleEn', 'slug', 'category', 'mediaSource', 'sourceUrl', 'author', 'image',
    'summaryAr', 'summaryEn', 'contentAr', 'contentEn', 'status', 'publishDate',
    'seoTitleAr', 'seoDescriptionAr'
];

function pickEditable(body) {
    const data = {};
    for (const field of EDITABLE_FIELDS) {
        if (body[field] !== undefined) data[field] = body[field];
    }
    return data;
}

function saveError(res, error, fallback) {
    if (error.code === 11000) {
        return res.status(409).json({ message: 'يوجد مقال آخر بنفس العنوان أو الرابط.' });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return res.status(400).json({ message: error.message });
    }
    console.error(fallback, error);
    res.status(500).json({ message: fallback });
}

exports.getAllArticles = async (req, res) => {
    try {
        const { category, status, search, limit } = req.query;
        const isAdmin = !!req.user && req.user.role === 'admin';
        const query = {};

        if (category) query.category = String(category);

        // Drafts and archived articles are visible to admins only
        if (!isAdmin) {
            query.status = 'published';
        } else if (status) {
            query.status = String(status);
        }

        if (search && String(search).trim()) {
            const regex = new RegExp(escapeRegex(String(search).trim()), 'i');
            query.$or = [
                { titleAr: regex },
                { titleEn: regex },
                { summaryAr: regex },
                { mediaSource: regex }
            ];
        }

        const lim = Math.min(parseInt(limit, 10) || 50, 200);
        const articles = await Article.find(query)
            .sort({ publishDate: -1, createdAt: -1 })
            .limit(lim);

        res.json({ articles });
    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({ message: 'Server error fetching articles.' });
    }
};

exports.getArticleBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const isAdmin = !!req.user && req.user.role === 'admin';
        const article = await Article.findOne({ slug });
        if (!article || (article.status !== 'published' && !isAdmin)) {
            return res.status(404).json({ message: 'Article not found.' });
        }
        res.json({ article });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.createArticle = async (req, res) => {
    try {
        const data = pickEditable(req.body);
        if (!data.slug && data.titleAr) {
            data.slug = data.titleAr
                .toLowerCase()
                .replace(/[^ء-ي0-9a-zA-Z]+/g, '-')
                .replace(/^-|-$/g, '') || ('art-' + Date.now());
        }
        const article = new Article(data);
        await article.save();
        res.status(201).json({ message: 'Article created successfully.', article });
    } catch (error) {
        saveError(res, error, 'Server error creating article.');
    }
};

exports.updateArticle = async (req, res) => {
    try {
        const article = await Article.findByIdAndUpdate(req.params.id, pickEditable(req.body), { new: true, runValidators: true });
        if (!article) return res.status(404).json({ message: 'Article not found.' });
        res.json({ message: 'Article updated successfully.', article });
    } catch (error) {
        saveError(res, error, 'Server error updating article.');
    }
};

exports.deleteArticle = async (req, res) => {
    try {
        const article = await Article.findByIdAndDelete(req.params.id);
        if (!article) return res.status(404).json({ message: 'Article not found.' });
        res.json({ message: 'Article deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error deleting article.' });
    }
};
