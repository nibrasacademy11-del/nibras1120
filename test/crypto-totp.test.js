const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const fc = require('../lib/fieldCrypto');
const totp = require('../lib/totp');

test('encrypt and decrypt round trip, with a fresh IV each time', () => {
    const a = fc.encrypt('29801011234567');
    const b = fc.encrypt('29801011234567');
    assert.notEqual(a, b);
    assert.ok(a.startsWith('v1.'));
    assert.equal(fc.decrypt(a), '29801011234567');
    assert.equal(fc.decrypt(b), '29801011234567');
    assert.equal(fc.encrypt(''), '');
    assert.equal(fc.decrypt(''), '');
    assert.equal(fc.decrypt(fc.encrypt('جواز A12345')), 'جواز A12345');
});

test('a tampered value is rejected', () => {
    const token = fc.encrypt('secret value');
    const buf = Buffer.from(token.slice(3), 'base64url');
    buf[buf.length - 1] ^= 1;
    assert.throws(() => fc.decrypt('v1.' + buf.toString('base64url')));
    assert.throws(() => fc.decrypt('plain-text'));
});

test('blind index ignores formatting and Arabic digits, and separates kinds', () => {
    const a = fc.blindIndex('298-0101 1234567', 'national_id');
    const b = fc.blindIndex('٢٩٨٠١٠١١٢٣٤٥٦٧', 'national_id');
    const c = fc.blindIndex('29801011234567', 'passport');
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(fc.blindIndex('', 'national_id'), '');
    assert.equal(fc.normalizeIdentifier(' a12-34 '), 'A1234');
});

test('a different key cannot read the data', () => {
    const token = fc.encrypt('hello');
    const saved = process.env.DATA_ENCRYPTION_KEY;
    process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    assert.throws(() => fc.decrypt(token));
    process.env.DATA_ENCRYPTION_KEY = saved;
    assert.equal(fc.decrypt(token), 'hello');
});

test('base32 round trip', () => {
    const buf = crypto.randomBytes(20);
    assert.deepEqual(totp.base32Decode(totp.base32Encode(buf)), buf);
    assert.equal(totp.generateSecret().length, 32);
});

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890" (last 6 digits of the 8-digit values)
test('TOTP matches the RFC 6238 test vectors', () => {
    const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
    assert.equal(totp.totp(secret, 59 * 1000), '287082');
    assert.equal(totp.totp(secret, 1111111109 * 1000), '081804');
    assert.equal(totp.totp(secret, 1234567890 * 1000), '005924');
    assert.equal(totp.totp(secret, 2000000000 * 1000), '279037');
});

test('verifyTotp allows one step of drift and blocks replays', () => {
    const secret = totp.generateSecret();
    const now = Date.now();
    const code = totp.totp(secret, now);
    const step = totp.verifyTotp(secret, code, { timeMs: now });
    assert.equal(typeof step, 'number');
    assert.equal(totp.verifyTotp(secret, code, { timeMs: now, lastStep: step }), null);
    assert.notEqual(totp.verifyTotp(secret, totp.totp(secret, now - 30000), { timeMs: now }), null);
    assert.equal(totp.verifyTotp(secret, totp.totp(secret, now - 120000), { timeMs: now }), null);
    assert.equal(totp.verifyTotp(secret, 'abc123', { timeMs: now }), null);
    assert.equal(totp.verifyTotp(secret, '', { timeMs: now }), null);
});

test('recovery codes are unique and hash the same with any formatting', () => {
    const codes = totp.generateRecoveryCodes();
    assert.equal(codes.length, 8);
    assert.equal(new Set(codes).size, 8);
    assert.match(codes[0], /^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    assert.equal(totp.hashRecoveryCode(codes[0]), totp.hashRecoveryCode(codes[0].toLowerCase().replace('-', ' ')));
});

test('otpauth URL carries the issuer and secret', () => {
    const url = totp.otpauthUrl({ secret: 'ABC', account: 'a@b.com' });
    assert.ok(url.startsWith('otpauth://totp/Nibras%20Academy%3Aa%40b.com?secret=ABC'));
});
