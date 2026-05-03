require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

// Connect Database
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Init middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Files (Explicit paths help Vercel include them in the build)
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/pages', express.static(path.join(__dirname, 'pages')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(__dirname));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/certificates', require('./routes/certificateRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/inquiries', require('./routes/inquiryRoutes'));

// SPA Fallback or specific frontend routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin Initializer
const User = require('./models/User');
const bcrypt = require('bcryptjs');
async function ensureAdmin() {
    try {
        if (!process.env.MONGO_URI) return; // DB might not be connected if no URI
        const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'nibras8883@gmail.com').toLowerCase();
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Aa01515416972';
        
        const existing = await User.findOne({ email: ADMIN_EMAIL });
        if (existing) return;
        
        const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
        const adminUser = new User({
            name: 'Admin',
            email: ADMIN_EMAIL,
            password: passwordHash,
            role: 'admin'
        });
        await adminUser.save();
        console.log('Default Admin created.');
    } catch (err) {
        console.error('Error creating default admin:', err);
    }
}
// Wait slightly for DB connection to establish before ensuring admin
setTimeout(ensureAdmin, 3000);

// Export for Vercel Serverless
module.exports = app;

// Listen locally if not in Vercel environment
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Nibras server running on http://localhost:${PORT}`);
    });
}
