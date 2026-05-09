const Inquiry = require('../models/Inquiry');
const nodemailer = require('nodemailer');

exports.createInquiry = async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        const inquiry = new Inquiry({ name, email, phone, subject, message });
        await inquiry.save();

        // Send Email Notification
        const transporter = nodemailer.createTransport({
            host: 'smtp.hostinger.com',
            port: 465,
            secure: true, // Use SSL
            auth: {
                user: process.env.EMAIL_USER || 'info@nibras-ac.com',
                pass: process.env.EMAIL_PASS || '921019Aa@'
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        const mailOptions = {
            from: `"Nibras Contact Form" <info@nibras-ac.com>`,
            to: 'info@nibras-ac.com',
            subject: `New Inquiry: ${subject || 'Nibras Academy'}`,
            text: `You have received a new message from the Contact Us form:

Name: ${name}
Email: ${email}
Phone: ${phone || 'N/A'}
Subject: ${subject || 'N/A'}

Message:
${message}`,
            replyTo: email
        };

        transporter.sendMail(mailOptions).catch(err => console.error('Email sending failed:', err));

        res.status(201).json({ message: 'Inquiry submitted successfully.' });
    } catch (error) {
        console.error('Inquiry submission error:', error);
        res.status(500).json({ message: 'Server error while submitting inquiry.' });
    }
};

exports.getAllInquiries = async (req, res) => {
    try {
        const inquiries = await Inquiry.find().sort({ createdAt: -1 });
        res.json({ inquiries });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.deleteInquiry = async (req, res) => {
    try {
        const inquiry = await Inquiry.findByIdAndDelete(req.params.id);
        if (!inquiry) return res.status(404).json({ message: 'Inquiry not found.' });
        res.json({ message: 'Inquiry deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting inquiry.' });
    }
};
