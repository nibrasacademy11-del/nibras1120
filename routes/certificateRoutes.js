const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { authRequired, adminRequired } = require('../middleware/auth');
const multer = require('multer');

// Use memory storage — PDF will be saved to MongoDB, not filesystem
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') return cb(new Error('Only PDF files are allowed.'));
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Download must come BEFORE :code to prevent 'download' matching as a certificate code
router.get('/certificates/download/:id', certificateController.downloadPdf);
router.get('/certificates/:code', certificateController.getCertificate);
router.get('/admin/certificates', authRequired, adminRequired, certificateController.getAllCertificates);
router.post('/admin/certificates', authRequired, adminRequired, upload.single('pdf'), certificateController.addCertificate);
router.delete('/admin/certificates/:id', authRequired, adminRequired, certificateController.deleteCertificate);

module.exports = router;
