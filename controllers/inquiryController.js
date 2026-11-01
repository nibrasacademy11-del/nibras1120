const Inquiry = require('../models/Inquiry');
const { isMailConfigured, createTransporter } = require('../config/mailer');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (value, maxLength) => (typeof value === 'string' ? value.trim().slice(0, maxLength) : '');

exports.createInquiry = async (req, res) => {
    try {
        const name = clean(req.body.name, 120);
        const email = clean(req.body.email, 160).toLowerCase();
        const phone = clean(req.body.phone, 30);
        const inquiryType = clean(req.body.inquiryType, 80);
        const programOrService = clean(req.body.programOrService, 200);
        const subject = clean(req.body.subject, 200);
        const message = clean(req.body.message, 4000);

        if (!name || !phone || !message) {
            return res.status(400).json({ message: 'الاسم ورقم الجوال والرسالة حقول مطلوبة.' });
        }

        const inquiry = new Inquiry({
            name,
            email,
            phone,
            inquiryType: inquiryType || 'استفسار عام',
            programOrService,
            subject: subject || (inquiryType ? `استفسار: ${inquiryType}` : 'استفسار من الموقع'),
            message,
            status: 'New'
        });
        await inquiry.save();

        // Send Email Notification if SMTP configured
        if (isMailConfigured()) {
            try {
                const transporter = createTransporter();

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
            const regex = new RegExp(escapeRegex(String(search).trim()), 'i');
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
        const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
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
