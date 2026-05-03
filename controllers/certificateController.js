const Certificate = require('../models/Certificate');
const path = require('path');
const fs = require('fs');

exports.getCertificate = async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        const cert = await Certificate.findOne({ cert_num: code });
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        res.json({ certificate: cert });
    } catch (error) {
        res.status(500).json({ message: 'Server error while checking certificate.' });
    }
};

exports.getAllCertificates = async (req, res) => {
    try {
        const certificates = await Certificate.find().sort({ createdAt: -1 }).limit(100);
        res.json({ certificates });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.addCertificate = async (req, res) => {
    try {
        const { certNum, traineeName, programName, field, issueDate } = req.body;
        if (!certNum || !traineeName || !programName || !issueDate) {
            return res.status(400).json({ message: 'Please complete required fields.' });
        }
        const existing = await Certificate.findOne({ cert_num: certNum.trim() });
        if (existing) return res.status(400).json({ message: 'Certificate number already exists.' });
        
        // Store just the filename, the download route will find it
        const pdfFilename = req.file ? req.file.filename : null;
        const pdfUrl = pdfFilename ? `/api/certificates/download/${pdfFilename}` : null;
        
        const cert = new Certificate({
            cert_num: certNum.trim(),
            trainee_name: traineeName.trim(),
            program_name: programName.trim(),
            field: (field || '').trim(),
            issue_date: issueDate,
            pdf_url: pdfUrl
        });
        await cert.save();
        res.status(201).json({ id: cert._id, message: 'Certificate added successfully.' });
    } catch (error) {
        console.error('Error adding certificate:', error);
        res.status(500).json({ message: 'Server error while saving certificate.' });
    }
};

exports.downloadPdf = async (req, res) => {
    try {
        const filename = req.params.filename;
        if (!filename || filename.includes('..')) {
            return res.status(400).json({ message: 'Invalid filename.' });
        }
        
        // Check /tmp first (Vercel), then local uploads
        const isVercel = !!process.env.VERCEL;
        const tmpPath = `/tmp/certificates/${filename}`;
        const localPath = path.join(__dirname, '..', 'uploads', 'certificates', filename);
        
        let filePath = null;
        if (isVercel && fs.existsSync(tmpPath)) {
            filePath = tmpPath;
        } else if (fs.existsSync(localPath)) {
            filePath = localPath;
        }
        
        if (!filePath) {
            return res.status(404).json({ message: 'PDF file not found.' });
        }
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    } catch (error) {
        res.status(500).json({ message: 'Error downloading PDF.' });
    }
};

exports.deleteCertificate = async (req, res) => {
    try {
        const cert = await Certificate.findById(req.params.id);
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        
        await Certificate.findByIdAndDelete(req.params.id);
        
        // Try to delete from both locations
        if (cert.pdf_url) {
            const filename = cert.pdf_url.split('/').pop();
            const isVercel = !!process.env.VERCEL;
            const tmpPath = `/tmp/certificates/${filename}`;
            const localPath = path.join(__dirname, '..', 'uploads', 'certificates', filename);
            
            if (isVercel && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        }
        res.json({ message: 'Certificate deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting certificate.' });
    }
};
