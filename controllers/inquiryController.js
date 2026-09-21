const Inquiry = require('../models/Inquiry');
const nodemailer = require('nodemailer');

exports.createInquiry = async (req, res) => {
    try {
        const { name, email, phone, inquiryType, programOrService, subject, message } = req.body;
        
        if (!name || !phone || !message) {
            return res.status(400).json({ message: 'الاسم ورقم الجوال والرسالة حقول مطلوبة.' });
        }

        const inquiry = new Inquiry({ 
            name: name.trim(), 
            email: (email || '').trim().toLowerCase(), 
            phone: phone.trim(), 
            inquiryType: inquiryType || 'استفسار عام',
            programOrService: programOrService || '',
            subject: subject || (inquiryType ? `استفسار: ${inquiryType}` : 'استفسار من الموقع'), 
            message: message.trim(),
            status: 'New'
        });
        await inquiry.save();

        // Send Email Notification if SMTP configured
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
                const transporter = nodemailer.createTransport({
                    host: process.env.EMAIL_HOST || 'smtp.hostinger.com',
                    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
                    secure: process.env.EMAIL_SECURE === 'true',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS
                    },
                    tls: {
                        rejectUnauthorized: process.env.NODE_ENV === 'production'
                    }
                });

                const mailOptions = {
                    from: `"Nibras Contact Form" <${process.env.EMAIL_USER}>`,
                    to: process.env.ADMIN_EMAIL || 'info@nibras-ac.com',
                    subject: `استفسار جديد: ${inquiry.subject}`,
                    text: `استفسار جديد عبر موقع أكاديمية نبراس:

الاسم: ${name}
الجوال: ${phone}
البريد: ${email || 'غير مدخل'}
نوع الاستفسار: ${inquiry.inquiryType}
البرنامج/الخدمة: ${inquiry.programOrService || 'غير محدد'}

الرسالة:
${message}`,
                    replyTo: email || undefined
                };

                await transporter.sendMail(mailOptions);
            } catch (err) {
                console.error('Email transporter notice:', err.message);
            }
        }

        res.status(201).json({ message: 'تم إرسال رسالتك بنجاح! سنتواصل معك قريباً.' });
    } catch (error) {
        console.error('Critical Inquiry error:', error);
        res.status(500).json({ message: 'حدث خطأ في السيرفر أثناء إرسال الرسالة.' });
    }
};

exports.getAllInquiries = async (req, res) => {
    try {
        const { status, search } = req.query;
        const query = {};
        if (status) query.status = status;
        if (search) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [{ name: regex }, { phone: regex }, { email: regex }, { message: regex }];
        }
        const inquiries = await Inquiry.find(query).sort({ createdAt: -1 });
        res.json({ inquiries });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.updateInquiryStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!inquiry) return res.status(404).json({ message: 'Inquiry not found.' });
        res.json({ message: 'Inquiry status updated successfully.', inquiry });
    } catch (error) {
        res.status(500).json({ message: 'Server error updating inquiry status.' });
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
