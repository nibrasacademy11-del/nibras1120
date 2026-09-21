const Certificate = require('../models/Certificate');

exports.getCertificate = async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        // Don't return pdf_data in search results (it's huge)
        const cert = await Certificate.findOne({ cert_num: code }).select('-pdf_data');
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        res.json({ certificate: cert });
    } catch (error) {
        res.status(500).json({ message: 'Server error while checking certificate.' });
    }
};

exports.getAllCertificates = async (req, res) => {
    try {
        // Don't return pdf_data in listings (it's huge binary)
        const certificates = await Certificate.find().select('-pdf_data').sort({ createdAt: -1 }).limit(100);
        res.json({ certificates });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.addCertificate = async (req, res) => {
    try {
        const { certNum, traineeName, programName, programType, field, issueDate, status, userId } = req.body;
        if (!certNum || !traineeName || !programName || !issueDate) {
            return res.status(400).json({ message: 'Please complete required fields.' });
        }
        const existing = await Certificate.findOne({ cert_num: certNum.trim() });
        if (existing) return res.status(400).json({ message: 'Certificate number already exists.' });

        const certData = {
            cert_num: certNum.trim(),
            trainee_name: traineeName.trim(),
            program_name: programName.trim(),
            program_type: (programType || 'برنامج مهني').trim(),
            field: (field || '').trim(),
            issue_date: issueDate,
            status: status || 'Valid',
            userId: userId || null
        };

        // If PDF was uploaded, store it in MongoDB as binary
        if (req.file && req.file.buffer) {
            certData.pdf_data = req.file.buffer;
            certData.pdf_mimetype = req.file.mimetype || 'application/pdf';
            certData.pdf_url = 'pending';
        }

        const cert = new Certificate(certData);
        await cert.save();

        if (req.file && req.file.buffer) {
            cert.pdf_url = `/api/certificates/download/${cert._id}`;
            await cert.save();
        }

        // AUTO-ADD TO USER PROFILE: If a user is linked, add this program to their enrolledCourses
        if (userId) {
            const User = require('../models/User');
            const user = await User.findById(userId);
            if (user) {
                if (!user.enrolledCourses.includes(programName.trim())) {
                    user.enrolledCourses.push(programName.trim());
                    await user.save();
                }
            }
        }

        res.status(201).json({ id: cert._id, message: 'Certificate added successfully.' });
    } catch (error) {
        console.error('Error adding certificate:', error);
        res.status(500).json({ message: 'Server error while saving certificate.' });
    }
};

exports.updateCertificate = async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (updateData.certNum) updateData.cert_num = updateData.certNum.trim();
        if (updateData.traineeName) updateData.trainee_name = updateData.traineeName.trim();
        if (updateData.programName) updateData.program_name = updateData.programName.trim();
        if (updateData.programType) updateData.program_type = updateData.programType.trim();
        if (updateData.issueDate) updateData.issue_date = updateData.issueDate;

        if (req.file && req.file.buffer) {
            updateData.pdf_data = req.file.buffer;
            updateData.pdf_mimetype = req.file.mimetype || 'application/pdf';
            updateData.pdf_url = `/api/certificates/download/${req.params.id}`;
        }

        const cert = await Certificate.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        res.json({ message: 'Certificate updated successfully.', certificate: cert });
    } catch (error) {
        res.status(500).json({ message: 'Error updating certificate.' });
    }
};

exports.downloadPdf = async (req, res) => {
    try {
        const cert = await Certificate.findById(req.params.id);
        if (!cert || !cert.pdf_data) {
            return res.status(404).json({ message: 'PDF file not found.' });
        }

        const filename = `certificate-${cert.cert_num}.pdf`;
        res.setHeader('Content-Type', cert.pdf_mimetype || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', cert.pdf_data.length);
        res.send(cert.pdf_data);
    } catch (error) {
        res.status(500).json({ message: 'Error downloading PDF.' });
    }
};

exports.deleteCertificate = async (req, res) => {
    try {
        const cert = await Certificate.findById(req.params.id);
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        await Certificate.findByIdAndDelete(req.params.id);
        res.json({ message: 'Certificate deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting certificate.' });
    }
};
