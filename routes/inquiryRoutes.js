const express = require('express');
const router = express.Router();
const inquiryController = require('../controllers/inquiryController');
const { authRequired, adminRequired } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

const inquiryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: 'عدد كبير من الرسائل، يرجى المحاولة لاحقاً. / Too many messages, please try again later.'
});

router.post('/', inquiryLimiter, inquiryController.createInquiry);

// Admin only
router.get('/', authRequired, adminRequired, inquiryController.getAllInquiries);
router.put('/:id', authRequired, adminRequired, inquiryController.updateInquiryStatus);
router.delete('/:id', authRequired, adminRequired, inquiryController.deleteInquiry);

module.exports = router;
