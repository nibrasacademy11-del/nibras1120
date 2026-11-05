const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { authRequired, adminRequired, attachUser } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const validId = require('../middleware/validId');
const multer = require('multer');

// Use memory storage — PDF will be saved to MongoDB, not filesystem
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') return cb(new Error('Only PDF files are allowed.'));
        cb(null, true);
    },
    limits: { fileSize: 4 * 1024 * 1024 } // 4MB max: Vercel rejects request bodies above 4.5MB
});

// Wrap multer to forward errors to Express error handler
function uploadPdf(req, res, next) {
    upload.single('pdf')(req, res, (err) => {
        if (err) return next(err);
        next();
    });
}

// Public lookups are limited so certificate numbers cannot be walked to harvest names
const lookupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'عدد كبير من محاولات التحقق، يرجى المحاولة لاحقاً. / Too many lookups, please try again later.'
});

// Download must come BEFORE :code to prevent 'download' matching as a certificate code
router.get('/certificates/download/:id', lookupLimiter, validId(), attachUser, certificateController.downloadPdf);
router.get('/certificates/:code', lookupLimiter, certificateController.getCertificate);
router.get('/admin/certificates', authRequired, adminRequired, certificateController.getAllCertificates);
router.post('/admin/certificates', authRequired, adminRequired, uploadPdf, certificateController.addCertificate);
router.put('/admin/certificates/:id', authRequired, adminRequired, validId(), uploadPdf, certificateController.updateCertificate);
router.delete('/admin/certificates/:id', authRequired, adminRequired, validId(), certificateController.deleteCertificate);

module.exports = router;
