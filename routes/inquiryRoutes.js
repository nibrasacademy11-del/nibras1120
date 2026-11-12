const express = require('express');
const router = express.Router();
const inquiryController = require('../controllers/inquiryController');
const { authRequired, requirePermission } = require('../middleware/auth');
const cms = [authRequired, requirePermission('website.manage', 'all')];
const rateLimit = require('../middleware/rateLimit');
const validId = require('../middleware/validId');

const inquiryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: 'عدد كبير من الرسائل، يرجى المحاولة لاحقاً. / Too many messages, please try again later.'
});

router.post('/', inquiryLimiter, inquiryController.createInquiry);
router.post('/enrollment', inquiryLimiter, inquiryController.createEnrollment);

// Admin only
router.get('/', ...cms, inquiryController.getAllInquiries);
router.put('/:id', ...cms, validId(), inquiryController.updateInquiryStatus);
router.delete('/:id', ...cms, validId(), inquiryController.deleteInquiry);

module.exports = router;
