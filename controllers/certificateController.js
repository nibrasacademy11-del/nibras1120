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
        
        const pdfUrl = req.file ? `/uploads/certificates/${req.file.filename}` : null;
        
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
        res.status(500).json({ message: 'Server error while saving certificate.' });
    }
};

exports.deleteCertificate = async (req, res) => {
    try {
        const cert = await Certificate.findById(req.params.id);
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        
        await Certificate.findByIdAndDelete(req.params.id);
        
        if (cert.pdf_url) {
            const filePath = path.join(__dirname, '..', cert.pdf_url.replace(/^\//, ''));
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        res.json({ message: 'Certificate deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting certificate.' });
    }
};
