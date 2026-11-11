const mongoose = require('mongoose');
const Certificate = require('../models/Certificate');
const User = require('../models/User');
const { isAdmin } = require('../middleware/auth');
const { publicView } = require('../lib/certificateDesign');
const audit = require('../lib/audit');

const text = (value) => (typeof value === 'string' ? value.trim() : '');

// The linked account is optional; anything that is not a real id is a mistake in the form
function parseUserId(value) {
    if (value === undefined) return undefined;
    if (!value) return null;
    return mongoose.Types.ObjectId.isValid(value) ? value : false;
}

// Adds the program to the linked trainee's profile, once
async function linkProgramToUser(userId, programName) {
    if (!userId || !programName) return;
    const user = await User.findById(userId);
    if (user && !user.enrolledCourses.includes(programName)) {
        user.enrolledCourses.push(programName);
        await user.save();
    }
}

exports.getCertificate = async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        // The public answer carries what a verifier needs, never the PDF bytes or the linked account
        const cert = await Certificate.findOne({ cert_num: code }).select('-pdf_data -userId -design').populate('replacedBy', 'cert_num').lean();
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        if (cert.replacedBy) cert.replacedByNumber = cert.replacedBy.cert_num;
        res.json({ certificate: publicView(cert) });
    } catch (error) {
        res.status(500).json({ message: 'Server error while checking certificate.' });
    }
};

exports.getAllCertificates = async (req, res) => {
    try {
        // Don't return pdf_data in listings (it's huge binary)
        const certificates = await Certificate.find().select('-pdf_data').sort({ createdAt: -1 }).limit(1000);
        res.json({ certificates });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.addCertificate = async (req, res) => {
    try {
        const certNum = text(req.body.certNum);
        if (/^NC-/i.test(certNum)) return res.status(400).json({ message: 'الأرقام التي تبدأ بـ NC- محجوزة للشهادات الصادرة من نظام الإدارة.' });
        const traineeName = text(req.body.traineeName);
        const programName = text(req.body.programName);
        const issueDate = text(req.body.issueDate);
        const userId = parseUserId(req.body.userId);
        if (!certNum || !traineeName || !programName || !issueDate) {
            return res.status(400).json({ message: 'Please complete required fields.' });
        }
        if (userId === false) return res.status(400).json({ message: 'الحساب المرتبط غير صحيح.' });

        const existing = await Certificate.findOne({ cert_num: certNum });
        if (existing) return res.status(400).json({ message: 'Certificate number already exists.' });

        const cert = new Certificate({
            cert_num: certNum,
            trainee_name: traineeName,
            program_name: programName,
            program_type: text(req.body.programType) || 'برنامج مهني',
            field: text(req.body.field),
            issue_date: issueDate,
            status: req.body.status || 'Valid',
            userId: userId || null
        });

        // If a PDF was uploaded, store it in MongoDB as binary
        if (req.file && req.file.buffer) {
            cert.pdf_data = req.file.buffer;
            cert.pdf_mimetype = req.file.mimetype || 'application/pdf';
            cert.pdf_url = `/api/certificates/download/${cert._id}`;
        }

        await cert.save();
        await linkProgramToUser(cert.userId, programName);

        res.status(201).json({ id: cert._id, message: 'Certificate added successfully.' });
    } catch (error) {
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        console.error('Error adding certificate:', error);
        res.status(500).json({ message: 'Server error while saving certificate.' });
    }
};

exports.updateCertificate = async (req, res) => {
    try {
        const { certNum, traineeName, programName, programType, field, issueDate, status } = req.body;
        const userId = parseUserId(req.body.userId);
        if (userId === false) return res.status(400).json({ message: 'الحساب المرتبط غير صحيح.' });

        const current = await Certificate.findById(req.params.id).select('kind');
        if (!current) return res.status(404).json({ message: 'Certificate not found.' });
        // Certificates issued by the management system are changed by reissuing them, from the portal
        if (current.kind && current.kind !== 'legacy') return res.status(400).json({ message: 'هذه الشهادة صادرة من نظام الإدارة؛ عدّلها بإعادة الإصدار من البوابة.' });

        const updateData = {};
        if (/^NC-/i.test(text(certNum))) return res.status(400).json({ message: 'الأرقام التي تبدأ بـ NC- محجوزة للشهادات الصادرة من نظام الإدارة.' });
        if (text(certNum)) updateData.cert_num = text(certNum);
        if (text(traineeName)) updateData.trainee_name = text(traineeName);
        if (text(programName)) updateData.program_name = text(programName);
        if (text(programType)) updateData.program_type = text(programType);
        if (field !== undefined) updateData.field = text(field);
        if (text(issueDate)) updateData.issue_date = text(issueDate);
        if (status) updateData.status = status;
        if (userId !== undefined) updateData.userId = userId;

        if (req.file && req.file.buffer) {
            updateData.pdf_data = req.file.buffer;
            updateData.pdf_mimetype = req.file.mimetype || 'application/pdf';
            updateData.pdf_url = `/api/certificates/download/${req.params.id}`;
        }

        const cert = await Certificate.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true }).select('-pdf_data');
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        await linkProgramToUser(cert.userId, cert.program_name);
        res.json({ message: 'Certificate updated successfully.', certificate: cert });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'Certificate number already exists.' });
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Error updating certificate.' });
    }
};

exports.downloadPdf = async (req, res) => {
    try {
        const cert = await Certificate.findById(req.params.id);
        // Suspended, cancelled or expired certificates are not handed out, except to an admin
        if (!cert || !cert.pdf_data || (cert.status !== 'Valid' && !isAdmin(req))) {
            return res.status(404).json({ message: 'PDF file not found.' });
        }

        const filename = `certificate-${cert.cert_num.replace(/[^\w.-]+/g, '_')}.pdf`;
        res.setHeader('Content-Type', cert.pdf_mimetype || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', cert.pdf_data.length);
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(cert.pdf_data);
    } catch (error) {
        res.status(500).json({ message: 'Error downloading PDF.' });
    }
};

exports.deleteCertificate = async (req, res) => {
    try {
        // Certificates are never deleted: "delete" cancels the certificate and keeps the record
        const cert = await Certificate.findById(req.params.id);
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        const from = cert.status;
        cert.status = 'Cancelled';
        cert.statusReason = 'Cancelled from the content panel';
        cert.statusHistory = [...(cert.statusHistory || []), { status: 'Cancelled', reason: cert.statusReason, by: req.user.id, byName: req.user.name, at: new Date() }];
        await cert.save();
        await audit.record(req, { action: 'certificate.status_changed', resource: 'certificates', resourceId: cert._id, summary: cert.cert_num, changes: { status: { from, to: 'Cancelled' } } });
        res.json({ message: 'تم إلغاء الشهادة (السجل محفوظ). / The certificate was cancelled and its record kept.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting certificate.' });
    }
};
