const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articleController');
const { authRequired, adminRequired } = require('../middleware/auth');

// Public routes
router.get('/', articleController.getAllArticles);
router.get('/:slug', articleController.getArticleBySlug);

// Admin routes
router.post('/', authRequired, adminRequired, articleController.createArticle);
router.put('/:id', authRequired, adminRequired, articleController.updateArticle);
router.delete('/:id', authRequired, adminRequired, articleController.deleteArticle);

module.exports = router;
