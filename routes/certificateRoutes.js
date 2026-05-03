const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { authRequired, adminRequired } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Use /tmp on Vercel (read-only filesystem), otherwise use local uploads
const isVercel = !!process.env.VERCEL;
const uploadsDir = isVercel
    ? '/tmp/certificates'
    : path.join(__dirname, '..', 'uploads', 'certificates');

// Ensure directory exists
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '.pdf').toLowerCase();
        cb(null, `cert-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext || '.pdf'}`);
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') return cb(new Error('Only PDF files are allowed.'));
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 }
});

// Download must come BEFORE :code to prevent 'download' matching as a certificate code
router.get('/certificates/download/:filename', certificateController.downloadPdf);
router.get('/certificates/:code', certificateController.getCertificate);
router.get('/admin/certificates', authRequired, adminRequired, certificateController.getAllCertificates);
router.post('/admin/certificates', authRequired, adminRequired, upload.single('pdf'), certificateController.addCertificate);
router.delete('/admin/certificates/:id', authRequired, adminRequired, certificateController.deleteCertificate);

module.exports = router;
