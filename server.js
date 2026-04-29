require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'nibras8883@gmail.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Aa01515416972';

const dbDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads', 'certificates');
fs.mkdirSync(dbDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const db = new sqlite3.Database(path.join(dbDir, 'nibras.db'));

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS certificates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cert_num TEXT UNIQUE NOT NULL,
            trainee_name TEXT NOT NULL,
            program_name TEXT NOT NULL,
            field TEXT,
            issue_date TEXT NOT NULL,
            pdf_url TEXT,
            created_at TEXT NOT NULL
        )
    `);
});

function run(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function onRun(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function get(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function all(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

async function ensureAdmin() {
    const existing = await get('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
    if (existing) return;
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await run(
        'INSERT INTO users (name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['Admin', ADMIN_EMAIL, '', passwordHash, 'admin', new Date().toISOString()]
    );
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '.pdf').toLowerCase();
        cb(null, `cert-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext || '.pdf'}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') return cb(new Error('Only PDF files are allowed.'));
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(__dirname));

function signToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
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

function authRequired(req, res, next) {
    try {
        const token = req.cookies.nibras_token;
        if (!token) return res.status(401).json({ message: 'Unauthorized.' });
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        res.status(401).json({ message: 'Unauthorized.' });
    }
}

function adminRequired(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden.' });
    }
    next();
}

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email and password are required.' });
        }
        const normalizedEmail = String(email).trim().toLowerCase();
        const existing = await get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing) return res.status(400).json({ message: 'This email is already registered.' });
        const passwordHash = await bcrypt.hash(password, 10);
        const result = await run(
            'INSERT INTO users (name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [name.trim(), normalizedEmail, phone || '', passwordHash, 'user', new Date().toISOString()]
        );
        const user = { id: result.lastID, name: name.trim(), email: normalizedEmail, role: 'user' };
        setAuthCookie(res, signToken(user));
        res.json({ message: 'Account created successfully.', user });
    } catch (error) {
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }
        const normalizedEmail = String(email).trim().toLowerCase();
        const user = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
        if (!user) return res.status(401).json({ message: 'Invalid email or password.' });
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ message: 'Invalid email or password.' });
        const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
        setAuthCookie(res, signToken(payload));
        res.json({ message: 'Login successful.', user: payload });
    } catch (error) {
        res.status(500).json({ message: 'Server error during login.' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('nibras_token');
    res.json({ message: 'Logged out.' });
});

app.get('/api/auth/me', authRequired, async (req, res) => {
    const user = await get('SELECT id, name, email, role FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(401).json({ message: 'Unauthorized.' });
    res.json({ user });
});

app.get('/api/certificates/:code', async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        const cert = await get('SELECT * FROM certificates WHERE cert_num = ?', [code]);
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        res.json({ certificate: cert });
    } catch (error) {
        res.status(500).json({ message: 'Server error while checking certificate.' });
    }
});

app.get('/api/admin/certificates', authRequired, adminRequired, async (req, res) => {
    const certificates = await all('SELECT * FROM certificates ORDER BY id DESC LIMIT 100');
    res.json({ certificates });
});

app.post('/api/admin/certificates', authRequired, adminRequired, upload.single('pdf'), async (req, res) => {
    try {
        const { certNum, traineeName, programName, field, issueDate } = req.body;
        if (!certNum || !traineeName || !programName || !issueDate) {
            return res.status(400).json({ message: 'Please complete required fields.' });
        }
        const existing = await get('SELECT id FROM certificates WHERE cert_num = ?', [certNum.trim()]);
        if (existing) return res.status(400).json({ message: 'Certificate number already exists.' });
        const pdfUrl = req.file ? `/uploads/certificates/${req.file.filename}` : null;
        const result = await run(
            `INSERT INTO certificates
            (cert_num, trainee_name, program_name, field, issue_date, pdf_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [certNum.trim(), traineeName.trim(), programName.trim(), (field || '').trim(), issueDate, pdfUrl, new Date().toISOString()]
        );
        res.json({ id: result.lastID, message: 'Certificate added successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while saving certificate.' });
    }
});

app.delete('/api/admin/certificates/:id', authRequired, adminRequired, async (req, res) => {
    try {
        const cert = await get('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
        if (!cert) return res.status(404).json({ message: 'Certificate not found.' });
        await run('DELETE FROM certificates WHERE id = ?', [req.params.id]);
        if (cert.pdf_url) {
            const filePath = path.join(__dirname, cert.pdf_url.replace(/^\//, ''));
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        res.json({ message: 'Certificate deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting certificate.' });
    }
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: err.message });
    }
    if (err) return res.status(400).json({ message: err.message || 'Bad request.' });
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

ensureAdmin().then(() => {
    app.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`Nibras server running on http://localhost:${PORT}`);
    });
});
