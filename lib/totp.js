const crypto = require('crypto');

// Time-based one-time passwords (RFC 6238), compatible with Google Authenticator,
// Microsoft Authenticator and similar apps. 6 digits, 30-second steps, SHA-1.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buf) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

function base32Decode(str) {
    const clean = String(str).toUpperCase().replace(/[\s=]/g, '');
    let bits = 0;
    let value = 0;
    const out = [];
    for (const ch of clean) {
        const idx = ALPHABET.indexOf(ch);
        if (idx === -1) throw new Error('Invalid base32 secret.');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

function generateSecret() {
    return base32Encode(crypto.randomBytes(20));
}

function hotp(secret, counter) {
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
    const offset = hmac[hmac.length - 1] & 15;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
    return String(code).padStart(DIGITS, '0');
}

const stepAt = (timeMs = Date.now()) => Math.floor(timeMs / 1000 / STEP_SECONDS);

function totp(secret, timeMs = Date.now()) {
    return hotp(secret, stepAt(timeMs));
}

// Returns the matching time step, or null. One step either side allows for clock drift.
// Passing lastStep rejects a code that was already used, so a seen code cannot be replayed.
function verifyTotp(secret, code, { timeMs = Date.now(), window = 1, lastStep = -1 } = {}) {
    const c = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(c)) return null;
    const now = stepAt(timeMs);
    for (let i = -window; i <= window; i++) {
        const step = now + i;
        if (step <= lastStep) continue;
        const expected = hotp(secret, step);
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return step;
    }
    return null;
}

function otpauthUrl({ secret, account, issuer = 'Nibras Academy' }) {
    const label = encodeURIComponent(`${issuer}:${account}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// One-time recovery codes, shown once and stored only as hashes
function generateRecoveryCodes(count = 8) {
    return Array.from({ length: count }, () => {
        const raw = base32Encode(crypto.randomBytes(5)); // 8 characters
        return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    });
}

const hashRecoveryCode = (code) =>
    crypto.createHash('sha256').update(String(code).toUpperCase().replace(/[\s-]/g, '')).digest('hex');

module.exports = {
    base32Encode,
    base32Decode,
    generateSecret,
    hotp,
    totp,
    verifyTotp,
    otpauthUrl,
    generateRecoveryCodes,
    hashRecoveryCode
};
