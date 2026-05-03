const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authRequired, adminRequired } = require('../middleware/auth');

router.get('/', courseController.getAllCourses);
router.get('/:id', courseController.getCourseById);

// Admin only
router.post('/', authRequired, adminRequired, courseController.createCourse);
router.put('/:id', authRequired, adminRequired, courseController.updateCourse);
router.delete('/:id', authRequired, adminRequired, courseController.deleteCourse);

module.exports = router;
