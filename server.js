require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { getJwtSecret } = require('./middleware/auth');

// Global error handlers - prevent server crashes
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err?.message || err);
});
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err?.message || err);
});

// Connect Database
connectDB().catch((err) => console.error('Initial MongoDB connection error:', err.message));

const app = express();
const PORT = process.env.PORT || 3000;

// Vercel sits in front of the app, so req.ip and req.protocol come from its headers
app.set('trust proxy', 1);
app.disable('x-powered-by');

// CORS - the site and API share an origin; only known origins may call with credentials
const allowedOrigins = [
    'http://localhost:3000',
    'https://nibras-ac.com',
    'https://www.nibras-ac.com',
    process.env.FRONTEND_URL || 'https://nibras1120.vercel.app'
];
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production')) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Init middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use((req, res, next) => {
    // Express 5 leaves req.body undefined when a request has no body
    if (req.body === undefined) req.body = {};
    next();
});
app.use(cookieParser());

// Static Files (Explicit paths help Vercel include them in the build)
// Only public folders are served: never expose the project root, it holds the server code.
const staticOptions = { maxAge: '1h' };
app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOptions));
app.use('/pages', express.static(path.join(__dirname, 'pages')));
app.use('/en', express.static(path.join(__dirname, 'en')));

// Ensure Database is connected for all API requests
app.use('/api', async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error('API Database Connection Error:', err.message);
        return res.status(503).json({
            message: 'Database connection failed. Please try again shortly.',
            error: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
});

// Health check endpoint for diagnostics and monitoring
app.get('/api/health', (req, res) => {
    const readyState = mongoose.connection.readyState;
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    let authConfigured = true;
    try {
        getJwtSecret();
    } catch (e) {
        authConfigured = false;
    }
    res.json({
        status: readyState === 1 && authConfigured ? 'ok' : 'degraded',
        database: states[readyState] || 'unknown',
        authConfigured
    });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/certificateRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/inquiries', require('./routes/inquiryRoutes'));
app.use('/api/articles', require('./routes/articleRoutes'));

// Public Settings route
const SiteSettings = require('./models/SiteSettings');
app.get('/api/settings', async (req, res) => {
    try {
        let settings = await SiteSettings.findOne();
        if (!settings) {
            settings = await SiteSettings.create({});
        }
        res.json({ settings });
    } catch (e) {
        res.status(500).json({ message: 'Error fetching settings' });
    }
});

// Unknown API paths answer in JSON
app.use('/api', (req, res) => {
    res.status(404).json({ message: 'Not found.' });
});

// Frontend entry points
app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get(['/logo.png', '/favicon.ico'], (req, res) => {
    res.sendFile(path.join(__dirname, 'assets/img/logo.png'));
});
app.get('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, 'assets/robots.txt'));
});

// Admin Initializer: creates the first admin only when credentials are provided by the environment
const User = require('./models/User');
const bcrypt = require('bcryptjs');
async function ensureAdmin() {
    try {
        const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

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
        console.error('Error creating default admin:', err.message);
    }
}
// Ensure admin is created once database connection is established
mongoose.connection.once('open', ensureAdmin);

// Everything else is a missing page
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'pages/404.html'));
});

// Global Error Handler - prevents crashes from uncaught errors in routes
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err?.message || err);
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File too large. Max 4MB allowed.' });
    }
    if (err.message === 'Only PDF files are allowed.') {
        return res.status(400).json({ message: 'Only PDF files are allowed.' });
    }
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
        return res.status(400).json({ message: 'Invalid request.' });
    }
    res.status(500).json({ message: 'Internal server error.' });
});

// Export for Vercel Serverless
module.exports = app;

// Listen when started directly (npm start). Vercel imports the app instead.
if (require.main === module && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Nibras server running on http://localhost:${PORT}`);
    });
}
