const Article = require('../models/Article');

exports.getAllArticles = async (req, res) => {
    try {
        const { category, status, search, limit } = req.query;
        const query = {};

        if (category) query.category = category;
        
        if (status) {
            query.status = status;
        } else if (!req.user || req.user.role !== 'admin') {
            query.status = 'published';
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { titleAr: regex },
                { titleEn: regex },
                { summaryAr: regex },
                { mediaSource: regex }
            ];
        }

        const lim = parseInt(limit, 10) || 50;
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
        const article = await Article.findOne({ slug });
        if (!article) return res.status(404).json({ message: 'Article not found.' });
        res.json({ article });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.createArticle = async (req, res) => {
    try {
        const data = { ...req.body };
        if (!data.slug && data.titleAr) {
            data.slug = data.titleAr
                .toLowerCase()
                .replace(/[^\u0621-\u064A0-9a-zA-Z]+/g, '-')
                .replace(/^-|-$/g, '') || ('art-' + Date.now());
        }
        const article = new Article(data);
        await article.save();
        res.status(201).json({ message: 'Article created successfully.', article });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Server error creating article.' });
    }
};

exports.updateArticle = async (req, res) => {
    try {
        const article = await Article.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!article) return res.status(404).json({ message: 'Article not found.' });
        res.json({ message: 'Article updated successfully.', article });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Server error updating article.' });
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
