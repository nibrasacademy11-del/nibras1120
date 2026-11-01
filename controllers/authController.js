const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getJwtSecret } = require('../middleware/auth');
const { isMailConfigured, createTransporter } = require('../config/mailer');

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
    return jwt.sign(
        { id: user._id || user.id, email: user.email, role: user.role, name: user.name },
        getJwtSecret(),
        { expiresIn: '7d' }
    );
}

function authCookieOptions() {
    return {
        httpOnly: true,
        // Site and API share one origin, so lax works and blocks cross-site form posts
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    };
}

function setAuthCookie(res, token) {
    res.cookie('nibras_token', token, { ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
}

// Reset links must point at our own domain, never at a client-supplied Origin header
function siteUrl(req) {
    return process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
}

exports.register = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string'
            || !name.trim() || !email.trim() || !password) {
            return res.status(400).json({ message: 'Name, email and password are required.' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            return res.status(400).json({ message: 'Please enter a valid email address.' });
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
        }

        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) return res.status(400).json({ message: 'This email is already registered.' });

        const passwordHash = await bcrypt.hash(password, 10);

        const user = new User({
            name: name.trim().slice(0, 120),
            email: normalizedEmail,
            phone: typeof phone === 'string' ? phone.trim().slice(0, 30) : '',
            password: passwordHash,
            role: 'student'
        });
        await user.save();

        const payload = { id: user._id, name: user.name, email: user.email, role: user.role };
        setAuthCookie(res, signToken(payload));
        res.status(201).json({ message: 'Account created successfully.', user: payload });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }
        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(401).json({ message: 'Invalid email or password.' });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ message: 'Invalid email or password.' });

        const payload = { id: user._id, name: user.name, email: user.email, role: user.role };
        setAuthCookie(res, signToken(payload));
        res.json({ message: 'Login successful.', user: payload });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

exports.logout = (req, res) => {
    res.clearCookie('nibras_token', authCookieOptions());
    res.json({ message: 'Logged out.' });
};

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -resetPasswordToken -resetPasswordExpire');
        if (!user) return res.status(401).json({ message: 'Unauthorized.' });
        res.json({ user });
    } catch (error) {
        console.error('GetMe error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password -resetPasswordToken -resetPasswordExpire').sort({ createdAt: -1 });
        res.json({ users });
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching users.' });
    }
};

exports.forgotPassword = async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const lang = req.body.lang === 'en' ? 'en' : 'ar';
    const isEN = lang === 'en';
    // Same reply whether or not the account exists, so emails cannot be enumerated
    const sentMessage = isEN
        ? 'If this email is registered, a reset link has been sent to it.'
        : 'إذا كان البريد مسجلاً لدينا، فسيصلك رابط إعادة تعيين كلمة المرور.';

    if (!EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ message: isEN ? 'Please enter a valid email address.' : 'يرجى إدخال بريد إلكتروني صحيح.' });
    }

    let user = null;
    try {
        user = await User.findOne({ email });
        if (!user) return res.json({ message: sentMessage });

        if (!isMailConfigured()) throw new Error('SMTP is not configured.');

        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save();

        const resetUrl = `${siteUrl(req)}/pages/${lang}/reset-password.html?token=${resetToken}`;
        const message = isEN
            ? `Hello,\n\nYou requested a password reset for your Nibras Academy account.\n\nOpen this link to choose a new password:\n\n${resetUrl}\n\nThis link is valid for 10 minutes only.`
            : `مرحباً،\n\nلقد طلبت إعادة تعيين كلمة المرور لحسابك في أكاديمية نبراس.\n\nمن فضلك اضغط على الرابط التالي لتغيير كلمة المرور:\n\n${resetUrl}\n\nهذا الرابط صالح لمدة 10 دقائق فقط.`;

        await createTransporter().sendMail({
            from: `"أكاديمية نبراس" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: isEN ? 'Reset your password - Nibras Academy' : 'إعادة تعيين كلمة المرور - أكاديمية نبراس',
            text: message
        });

        res.json({ message: sentMessage });
    } catch (error) {
        console.error('Forgot password error:', error);
        if (user && user.resetPasswordToken) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save().catch(() => {});
        }
        res.status(500).json({ message: isEN ? 'Could not send the email. Please contact support.' : 'حدث خطأ أثناء إرسال الإيميل. يرجى التواصل مع الدعم.' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (typeof token !== 'string' || typeof password !== 'string' || !token) {
            return res.status(400).json({ message: 'الرابط غير صالح أو انتهت صلاحيته.' });
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
        }

        const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ message: 'الرابط غير صالح أو انتهت صلاحيته.' });

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        res.json({ message: 'تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.' });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في السيرفر.' });
    }
};

exports.getSingleUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password -resetPasswordToken -resetPasswordExpire');
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user data.' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { name, email, phone, role, enrolledCourses } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        if (role && role !== 'admin' && user.role === 'admin' && String(user._id) === String(req.user.id)) {
            return res.status(400).json({ message: 'لا يمكنك إلغاء صلاحية المدير عن حسابك الحالي.' });
        }

        if (name) user.name = String(name).trim();
        if (email) user.email = String(email).trim().toLowerCase();
        if (phone !== undefined) user.phone = String(phone);
        if (role) user.role = role;
        if (Array.isArray(enrolledCourses)) user.enrolledCourses = enrolledCourses.map(String);

        await user.save();
        const { password, resetPasswordToken, resetPasswordExpire, ...safeUser } = user.toObject();
        res.json({ message: 'User updated successfully.', user: safeUser });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'هذا البريد الإلكتروني مستخدم لحساب آخر.' });
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Error updating user.' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        if (String(req.params.id) === String(req.user.id)) {
            return res.status(400).json({ message: 'لا يمكنك حذف حسابك الحالي.' });
        }
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.json({ message: 'User deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user.' });
    }
};

exports.getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -resetPasswordToken -resetPasswordExpire');
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Fetch certificates linked to this user
        const Certificate = require('../models/Certificate');
        const certificates = await Certificate.find({ userId: user._id }).select('-pdf_data');

        res.json({ user, certificates });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching profile.' });
    }
};
