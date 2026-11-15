const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const { diff, scrub } = require('../lib/audit');
const { formatNumber } = require('../lib/sequence');
const { assertVersion, HttpError, paging } = require('../lib/http');
const { checkSecondFactor } = require('../lib/twoFactor');
const fc = require('../lib/fieldCrypto');
const totp = require('../lib/totp');

test('audit diff lists only changed fields and never secrets', () => {
    const changes = diff(
        { name: 'A', role: 'student', password: 'x', phone: '1', updatedAt: 1 },
        { name: 'A', role: 'employee', password: 'y', phone: '2', updatedAt: 2 }
    );
    assert.deepEqual(changes, { role: { from: 'student', to: 'employee' }, phone: { from: '1', to: '2' } });
});

test('scrub removes secrets at any depth', () => {
    assert.deepEqual(scrub({ a: 1, token: 't', nested: { secretEnc: 's', ok: true }, list: [{ password: 'p', b: 2 }] }),
        { a: 1, nested: { ok: true }, list: [{ b: 2 }] });
});

test('numbers are formatted per series', () => {
    assert.equal(formatNumber('customer', 1), 'NB-000001');
    assert.equal(formatNumber('customer', 1234567), 'NB-1234567');
    assert.equal(formatNumber('receipt', 42), 'RC-0000042');
    assert.throws(() => formatNumber('nope', 1));
});

test('assertVersion rejects stale and missing versions', () => {
    assert.doesNotThrow(() => assertVersion({ __v: 3 }, 3));
    assert.doesNotThrow(() => assertVersion({ __v: 3 }, '3'));
    assert.throws(() => assertVersion({ __v: 3 }, 2), (e) => e instanceof HttpError && e.status === 409);
    assert.throws(() => assertVersion({ __v: 3 }, undefined), (e) => e.status === 428);
});

test('paging clamps limits', () => {
    assert.deepEqual(paging({}), { limit: 50, page: 1, skip: 0 });
    assert.deepEqual(paging({ limit: '9999', page: '3' }), { limit: 200, page: 3, skip: 400 });
    assert.deepEqual(paging({ limit: '-5', page: 'x' }), { limit: 1, page: 1, skip: 0 });
});

test('second factor: app code once, recovery code once', () => {
    const secret = totp.generateSecret();
    const recovery = totp.generateRecoveryCodes(2);
    const user = {
        twoFactor: {
            enabled: true,
            secretEnc: fc.encrypt(secret),
            lastStep: -1,
            recoveryCodes: recovery.map(totp.hashRecoveryCode)
        }
    };
    const code = totp.totp(secret);
    assert.equal(checkSecondFactor(user, code), 'totp');
    assert.equal(checkSecondFactor(user, code), null, 'the same code cannot be used twice');
    assert.equal(checkSecondFactor(user, recovery[0]), 'recovery');
    assert.equal(user.twoFactor.recoveryCodes.length, 1);
    assert.equal(checkSecondFactor(user, recovery[0]), null);
    assert.equal(checkSecondFactor(user, 'WRONG-CODE'), null);
    assert.equal(checkSecondFactor({ twoFactor: { enabled: false } }, code), null);
});
