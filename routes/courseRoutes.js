const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authRequired, requirePermission, attachUser } = require('../middleware/auth');
const cms = [authRequired, requirePermission('website.manage', 'all')];
const validId = require('../middleware/validId');

// GET /:id also accepts a slug, so it is not limited to ObjectIds
router.get('/', attachUser, courseController.getAllCourses);
router.get('/:id', attachUser, courseController.getCourseById);

// Admin only
router.post('/', ...cms, courseController.createCourse);
router.put('/:id', ...cms, validId(), courseController.updateCourse);
router.delete('/:id', ...cms, validId(), courseController.deleteCourse);

module.exports = router;
