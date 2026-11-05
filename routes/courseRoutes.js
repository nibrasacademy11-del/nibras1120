const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authRequired, adminRequired, attachUser } = require('../middleware/auth');
const validId = require('../middleware/validId');

// GET /:id also accepts a slug, so it is not limited to ObjectIds
router.get('/', attachUser, courseController.getAllCourses);
router.get('/:id', attachUser, courseController.getCourseById);

// Admin only
router.post('/', authRequired, adminRequired, courseController.createCourse);
router.put('/:id', authRequired, adminRequired, validId(), courseController.updateCourse);
router.delete('/:id', authRequired, adminRequired, validId(), courseController.deleteCourse);

module.exports = router;
