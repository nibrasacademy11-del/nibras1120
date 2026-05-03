const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

function signToken(user) {
    return jwt.sign(
        { id: user._id || user.id, email: user.email, role: user.role, name: user.name },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function setAuthCookie(res, token) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('nibras_token', token, {
        httpOnly: true,
        // In production (Vercel), must be 'none' for cross-origin cookie delivery
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd, // Secure must be true when sameSite=none
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
}

exports.register = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email and password are required.' });
        }
        const normalizedEmail = String(email).trim().toLowerCase();
        
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) return res.status(400).json({ message: 'This email is already registered.' });
        
        const passwordHash = await bcrypt.hash(password, 10);
        
        const user = new User({
            name: name.trim(),
            email: normalizedEmail,
            phone: phone || '',
            password: passwordHash,
            role: 'student'
        });
        await user.save();
        
        const payload = { id: user._id, name: user.name, email: user.email, role: user.role };
        setAuthCookie(res, signToken(payload));
        res.status(201).json({ message: 'Account created successfully.', user: payload });
    } catch (error) {
        res.status(500).json({ message: 'Server error during registration.' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }
        const normalizedEmail = String(email).trim().toLowerCase();
        
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(401).json({ message: 'Invalid email or password.' });
        
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ message: 'Invalid email or password.' });
        
        const payload = { id: user._id, name: user.name, email: user.email, role: user.role };
        setAuthCookie(res, signToken(payload));
        res.json({ message: 'Login successful.', user: payload });
    } catch (error) {
        res.status(500).json({ message: 'Server error during login.' });
    }
};

exports.logout = (req, res) => {
    res.clearCookie('nibras_token');
    res.json({ message: 'Logged out.' });
};

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(401).json({ message: 'Unauthorized.' });
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ users });
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching users.' });
    }
};

const crypto = require('crypto');
const nodemailer = require('nodemailer');

exports.forgotPassword = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email.toLowerCase() });
        if (!user) return res.status(404).json({ message: 'لا يوجد حساب مسجل بهذا البريد الإلكتروني.' });

        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save();

        // Check if origin is available from headers for the correct URL
        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        const resetUrl = `${origin}/pages/ar/reset-password.html?token=${resetToken}`;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER || 'nibras8883@gmail.com',
                pass: process.env.EMAIL_PASS || 'your-app-password-here' // The user MUST set this in Vercel
            }
        });

        const message = `مرحباً،\n\nلقد طلبت إعادة تعيين كلمة المرور لحسابك في أكاديمية نبراس.\n\nمن فضلك اضغط على الرابط التالي لتغيير كلمة المرور:\n\n${resetUrl}\n\nهذا الرابط صالح لمدة 10 دقائق فقط.`;

        await transporter.sendMail({
            from: 'أكاديمية نبراس <noreply@nibras.com>',
            to: user.email,
            subject: 'إعادة تعيين كلمة المرور - أكاديمية نبراس',
            text: message
        });

        res.json({ message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.' });
    } catch (error) {
        if (req.body.email) {
            const user = await User.findOne({ email: req.body.email.toLowerCase() });
            if (user) {
                user.resetPasswordToken = undefined;
                user.resetPasswordExpire = undefined;
                await user.save();
            }
        }
        console.error(error);
        res.status(500).json({ message: 'حدث خطأ أثناء إرسال الإيميل. تأكد من إعدادات البريد.' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const resetPasswordToken = crypto.createHash('sha256').update(req.body.token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ message: 'الرابط غير صالح أو انتهت صلاحيته.' });

        user.password = await bcrypt.hash(req.body.password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        res.json({ message: 'تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في السيرفر.' });
    }
};
