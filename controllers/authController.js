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
    res.cookie('nibras_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
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
