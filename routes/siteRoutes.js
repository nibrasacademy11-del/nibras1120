const express = require('express');
const multer = require('multer');
const router = express.Router();
const siteController = require('../controllers/siteController');
const { authRequired, requirePermission } = require('../middleware/auth');
const validId = require('../middleware/validId');

// The admin panel shrinks images before upload; 4MB stays under Vercel's 4.5MB body limit
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 5 }
});

function uploadImage(req, res, next) {
    upload.single('image')(req, res, (err) => (err ? next(err) : next()));
}

// Editing the website needs the website permission (admins and the owner have it; others when granted)
const admin = [authRequired, requirePermission('website.manage', 'all')];

router.get('/site', siteController.getSite);
router.get('/media/:id', validId(), siteController.getMedia);

router.get('/admin/site', admin, siteController.getAdminSite);
router.put('/admin/site/:section', admin, siteController.updateSection);
router.post('/admin/media', admin, uploadImage, siteController.uploadMedia);

router.get('/admin/testimonials', admin, siteController.listTestimonials);
router.post('/admin/testimonials', admin, siteController.createTestimonial);
router.put('/admin/testimonials/:id', admin, validId(), siteController.updateTestimonial);
router.delete('/admin/testimonials/:id', admin, validId(), siteController.deleteTestimonial);

module.exports = router;
