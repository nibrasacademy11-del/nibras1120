const mongoose = require('mongoose');
const Inquiry = require('../models/Inquiry');
const Course = require('../models/Course');
const { isMailConfigured, createTransporter } = require('../config/mailer');
const intake = require('../modules/crm/intake');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (value, maxLength) => (typeof value === 'string' ? value.trim().slice(0, maxLength) : '');
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENROLLMENT_TYPE = 'طلب تسجيل';
const STATUSES = ['New', 'In Progress', 'Replied', 'Closed'];
const money = (amount) => `${Number(amount).toFixed(2)} US$`;

// Name, phone and message are required everywhere; the email is optional but must be valid
function readContact(body) {
    const contact = {
        name: clean(body.name, 120),
        email: clean(body.email, 160).toLowerCase(),
        phone: clean(body.phone, 30),
        country: clean(body.country, 80)
    };
    if (!contact.name || !contact.phone) return { error: 'الاسم ورقم الجوال حقول مطلوبة.' };
    if (contact.email && !EMAIL_PATTERN.test(contact.email)) return { error: 'صيغة البريد الإلكتروني غير صحيحة.' };
    return { contact };
}

// Mail failures are logged but never fail the request: the inquiry is already saved
async function notifyAdmin(inquiry) {
    if (!isMailConfigured()) return;
    try {
        await createTransporter().sendMail({
            from: `"Nibras Contact Form" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL || 'info@nibras-ac.com',
            subject: `${inquiry.inquiryType}: ${inquiry.subject}`,
            text: `رسالة جديدة عبر موقع أكاديمية نبراس:

الاسم: ${inquiry.name}
الجوال: ${inquiry.phone}
البريد: ${inquiry.email || 'غير مدخل'}
النوع: ${inquiry.inquiryType}
البرنامج/الخدمة: ${inquiry.programOrService || 'غير محدد'}

${inquiry.message}`,
            replyTo: inquiry.email || undefined
        });
    } catch (err) {
        console.error('Email transporter notice:', err.message);
    }
}

exports.createInquiry = async (req, res) => {
    try {
        const { contact, error } = readContact(req.body);
        const message = clean(req.body.message, 4000);
        if (error || !message) {
            return res.status(400).json({ message: error || 'الاسم ورقم الجوال والرسالة حقول مطلوبة.' });
        }
        const inquiryType = clean(req.body.inquiryType, 80);

        const inquiry = await Inquiry.create({
            ...contact,
            inquiryType: inquiryType || 'استفسار عام',
            programOrService: clean(req.body.programOrService, 200),
            subject: clean(req.body.subject, 200) || (inquiryType ? `استفسار: ${inquiryType}` : 'استفسار من الموقع'),
            message,
            status: 'New'
        });
        await notifyAdmin(inquiry);
        // The message joins the sender's customer file, or opens a new lead
        await intake.safely(() => intake.ingestInquiry(inquiry), 'inquiry');

        res.status(201).json({ message: 'تم إرسال رسالتك بنجاح! سنتواصل معك قريباً.' });
    } catch (error) {
        console.error('Critical Inquiry error:', error);
        res.status(500).json({ message: 'حدث خطأ في السيرفر أثناء إرسال الرسالة.' });
    }
};

// Checkout sends program ids only. Titles, prices and the total come from the database,
// so an edited cart in the browser cannot change what the order says.
exports.createEnrollment = async (req, res) => {
    const isEN = req.body.lang === 'en';
    try {
        const { contact, error } = readContact(req.body);
        if (error) return res.status(400).json({ message: error });

        const ids = [...new Set((Array.isArray(req.body.courseIds) ? req.body.courseIds : []).map(String))]
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .slice(0, 20);
        if (!ids.length) {
            return res.status(400).json({ message: isEN ? 'Your cart is empty.' : 'السلة فارغة.' });
        }

        const courses = await Course.find({ _id: { $in: ids }, status: 'available' });
        if (courses.length !== ids.length) {
            return res.status(409).json({
                message: isEN
                    ? 'Some programs in your cart are no longer available. Please review your cart.'
                    : 'بعض البرامج في السلة لم تعد متاحة. يرجى مراجعة السلة.',
                available: courses.map((c) => String(c._id))
            });
        }

        const items = courses.map((c) => ({
            course: c._id,
            title: (isEN && c.titleEn) || c.titleAr,
            price: c.price,
            finalPrice: c.finalPrice
        }));
        const total = Math.round(items.reduce((sum, item) => sum + item.finalPrice, 0) * 100) / 100;
        const lines = items.map((item, i) => `${i + 1}- ${item.title} (${money(item.finalPrice)})`).join('\n');
        const message = isEN
            ? `New enrollment request:\n\n*Trainee details:*\n- Name: ${contact.name}\n- Email: ${contact.email || '-'}\n- Phone: ${contact.phone}\n- Country: ${contact.country || '-'}\n\n*Selected programs:*\n${lines}\n\n*Total: ${money(total)}*`
            : `طلب اشتراك جديد من الأكاديمية:\n\n*بيانات المتدرب:*\n- الاسم: ${contact.name}\n- البريد: ${contact.email || '-'}\n- الهاتف: ${contact.phone}\n- الدولة: ${contact.country || '-'}\n\n*البرامج المختارة:*\n${lines}\n\n*الإجمالي الكلي: ${money(total)}*`;

        const inquiry = await Inquiry.create({
            ...contact,
            inquiryType: ENROLLMENT_TYPE,
            programOrService: items.map((item) => item.title).join('، ').slice(0, 200),
            subject: 'طلب تسجيل من صفحة الدفع',
            message,
            items,
            total,
            status: 'New'
        });
        await notifyAdmin(inquiry);
        // The message joins the sender's customer file, or opens a new lead
        await intake.safely(() => intake.ingestInquiry(inquiry), 'inquiry');

        res.status(201).json({ message: isEN ? 'Request saved.' : 'تم حفظ طلبك.', whatsappText: message, total });
    } catch (error) {
        console.error('Enrollment error:', error);
        res.status(500).json({ message: isEN ? 'Could not save your request. Please try again.' : 'تعذر حفظ طلبك. يرجى المحاولة مرة أخرى.' });
    }
};

exports.getAllInquiries = async (req, res) => {
    try {
        const { status, type, search } = req.query;
        const query = {};
        if (STATUSES.includes(status)) query.status = status;
        if (type === 'enrollment') query.inquiryType = ENROLLMENT_TYPE;
        if (type === 'message') query.inquiryType = { $ne: ENROLLMENT_TYPE };
        if (search) {
            const regex = new RegExp(escapeRegex(String(search).trim()), 'i');
            query.$or = [{ name: regex }, { phone: regex }, { email: regex }, { message: regex }];
        }
        const inquiries = await Inquiry.find(query).sort({ createdAt: -1 }).limit(1000);
        res.json({ inquiries });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.updateInquiryStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status.' });
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
