const test = require('node:test');
const assert = require('node:assert/strict');
const { redact, fingerprint } = require('../lib/errorLog');

test('secrets never reach the error log', () => {
    const s = redact('connect failed mongodb+srv://admin:Secr3t@cluster0.x.mongodb.net/nibras password=hunter2 token: abc.def eyJhbGciOiJIUzI1NiIsInR5cCI6.eyJpZCI6IjY0YjAwMDAwMDAwMDAwMDAwMDAwMDAwMSJ9.abcdefghijklmnopqrstuvwxyz');
    assert.ok(!s.includes('Secr3t'));
    assert.ok(!s.includes('hunter2'));
    assert.ok(!s.includes('eyJhbGci'));
    assert.match(s, /\[redacted\]/);
});

test('the same error in the same place groups together', () => {
    const a = fingerprint('server', 'Cast to ObjectId failed for 64b000000000000000000001 at 12', 'GET /api/v2/customers/64b000000000000000000001');
    const b = fingerprint('server', 'Cast to ObjectId failed for 64b0000000000000000000ff at 99', 'GET /api/v2/customers/64b0000000000000000000ff');
    const c = fingerprint('client', 'Cast to ObjectId failed for 64b000000000000000000001 at 12', 'GET /api/v2/customers/x');
    assert.equal(a, b);
    assert.notEqual(a, c);
});
