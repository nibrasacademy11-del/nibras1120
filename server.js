// Local runs use .env.development (the test database) when it exists, so nothing written while
// developing reaches the live data in .env. Vercel sets its variables itself and loads neither file.
const devEnv = require('path').join(__dirname, '.env.development');
if (!process.env.VERCEL && require('fs').existsSync(devEnv)) {
    require('dotenv').config({ path: devEnv, quiet: true });
    console.log('Environment: .env.development');
} else {
    require('dotenv').config({ quiet: true });
}
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
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const SITE_URL = (process.env.SITE_URL || 'https://www.nibras-ac.com').replace(/\/$/, '');

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
    if (origin && (allowedOrigins.includes(origin) || !isProd)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Security headers. Pages still use inline scripts and handlers, so scripts allow 'unsafe-inline';
// the policy still blocks foreign script hosts, plugins, framing and form posts to other sites.
const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
].join('; ');
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP);
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

// The articles section was replaced by the corporate solutions page
app.get(['/pages/ar/articles.html', '/pages/en/articles.html'], (req, res) => {
    res.redirect(301, req.path.replace('articles.html', 'corporate.html'));
});

// Static Files (Explicit paths help Vercel include them in the build)
// Only public folders are served: never expose the project root, it holds the server code.
const staticOptions = { maxAge: '1h' };
app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOptions));
app.use('/pages', express.static(path.join(__dirname, 'pages')));
app.use('/en', express.static(path.join(__dirname, 'en')));

// Management portals (React build in portal/dist). Hashed assets are cached, index.html never is,
// and every portal path returns index.html so the app's own router can show the page.
const portalDist = path.join(__dirname, 'portal', 'dist');
app.use('/portal/assets', express.static(path.join(portalDist, 'assets'), { maxAge: '365d', immutable: true }));
app.get(['/portal', '/portal/{*rest}'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(portalDist, 'index.html'), (err) => {
        if (err) res.status(503).type('text').send('The portal has not been built yet. Run: npm run build:portal');
    });
});

// Ensure Database is connected for all API requests
app.use('/api', async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error('API Database Connection Error:', err.message);
        return res.status(503).json({
            message: 'Database connection failed. Please try again shortly.',
            error: isProd ? undefined : err.message
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
app.use('/api', require('./routes/siteRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/inquiries', require('./routes/inquiryRoutes'));
app.use('/api/v2', require('./routes/v2'));

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
    res.type('text/plain').send(`User-agent: *\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

// Public pages plus every visible program, in both languages
const SITEMAP_PAGES = ['about', 'programs', 'pro_courses', 'diploma', 'masters', 'phd', 'corporate', 'contact', 'verify', 'privacy', 'terms', 'refund', 'accessibility'];
app.get('/sitemap.xml', async (req, res) => {
    const Course = require('./models/Course');
    const urls = ['/', '/en/index.html', ...SITEMAP_PAGES.flatMap((p) => [`/pages/ar/${p}.html`, `/pages/en/${p}.html`])];
    try {
        await connectDB();
        const courses = await Course.find({ status: { $ne: 'hidden' } }).select('slug').lean();
        for (const c of courses) {
            const slug = encodeURIComponent(c.slug);
            urls.push(`/pages/ar/program-detail.html?slug=${slug}`, `/pages/en/program-detail.html?slug=${slug}`);
        }
    } catch (err) {
        console.error('Sitemap programs skipped:', err.message);
    }
    const xmlEscape = (s) => s.replace(/&/g, '&amp;');
    res.type('application/xml').setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${xmlEscape(SITE_URL + u)}</loc></url>`).join('\n')}\n</urlset>\n`);
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
    if (err.name === 'MulterError') {
        return res.status(400).json({ message: 'Invalid upload.' });
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
