const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { authRequired, adminRequired } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const uploadsDir = path.join(__dirname, '..', 'uploads', 'certificates');
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

router.get('/public/:code', certificateController.getCertificate);
router.get('/', authRequired, adminRequired, certificateController.getAllCertificates);
router.post('/', authRequired, adminRequired, upload.single('pdf'), certificateController.addCertificate);
router.delete('/:id', authRequired, adminRequired, certificateController.deleteCertificate);

module.exports = router;
