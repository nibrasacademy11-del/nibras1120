const crypto = require('crypto');

// Encrypts sensitive fields (national ID, passport, 2FA secrets) before they reach the database,
// and builds a keyed hash (blind index) so an exact value can still be searched without decrypting.
// DATA_ENCRYPTION_KEY: 32 random bytes as hex or base64. Losing it makes the encrypted data unreadable.

const isProd = process.env.NODE_ENV === 'production';
// Local development only. Production refuses to run without a real key.
const DEV_KEY = crypto.createHash('sha256').update('nibras-local-development-key').digest();

let cached = null;
let warned = false;

function masterKey() {
    const raw = (process.env.DATA_ENCRYPTION_KEY || '').trim();
    if (raw) {
        const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
        if (buf.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (64 hex characters).');
        return buf;
    }
    if (isProd) throw new Error('DATA_ENCRYPTION_KEY is not set.');
    if (!warned) {
        console.warn('DATA_ENCRYPTION_KEY is not set: using the local development key.');
        warned = true;
    }
    return DEV_KEY;
}

function keys() {
    const master = masterKey();
    if (cached && cached.master.equals(master)) return cached;
    const derive = (info) => Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
    cached = { master, enc: derive('nibras:field-encryption:v1'), idx: derive('nibras:blind-index:v1') };
    return cached;
}

const PREFIX = 'v1.';

function encrypt(plain) {
    if (plain === undefined || plain === null || plain === '') return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keys().enc, iv);
    const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

function decrypt(token) {
    if (!token) return '';
    if (!String(token).startsWith(PREFIX)) throw new Error('Unknown encrypted value format.');
    const buf = Buffer.from(String(token).slice(PREFIX.length), 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keys().enc, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

// Arabic and Persian digits become ASCII, spaces and dashes go, letters become upper case,
// so "٢٩٨ 0101" and "2980101" find the same record
function normalizeIdentifier(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
        .replace(/[\s\-_.\/]/g, '')
        .toUpperCase();
}

// kind keeps indexes of different fields apart (a passport number never matches a national ID)
function blindIndex(value, kind) {
    const v = normalizeIdentifier(value);
    if (!v) return '';
    return crypto.createHmac('sha256', keys().idx).update(`${kind}:${v}`).digest('hex');
}

module.exports = { encrypt, decrypt, blindIndex, normalizeIdentifier };
