const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articleController');
const { authRequired, adminRequired, attachUser } = require('../middleware/auth');

// Public routes
router.get('/', attachUser, articleController.getAllArticles);
router.get('/:slug', attachUser, articleController.getArticleBySlug);

// Admin routes
router.post('/', authRequired, adminRequired, articleController.createArticle);
router.put('/:id', authRequired, adminRequired, articleController.updateArticle);
router.delete('/:id', authRequired, adminRequired, articleController.deleteArticle);

module.exports = router;
