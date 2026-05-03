const express = require('express');
const router = express.Router();
const inquiryController = require('../controllers/inquiryController');
const { authRequired, adminRequired } = require('../middleware/auth');

router.post('/', inquiryController.createInquiry);

// Admin only
router.get('/', authRequired, adminRequired, inquiryController.getAllInquiries);
router.delete('/:id', authRequired, adminRequired, inquiryController.deleteInquiry);

module.exports = router;
