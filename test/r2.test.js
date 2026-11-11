const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const r2 = require('../lib/r2');

const cfg = { accountId: 'acc123', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret', bucket: 'nibras-files' };

test('requests are signed for the account, bucket and object, with AWS Signature V4', () => {
    const now = new Date('2026-11-12T08:30:00.000Z');
    const a = r2.sign({ method: 'PUT', key: 'files/ab/x y.pdf', body: Buffer.from('hello'), cfg, now });
    assert.equal(a.url, 'https://acc123.r2.cloudflarestorage.com/nibras-files/files/ab/x%20y.pdf');
    assert.equal(a.headers['x-amz-date'], '20261112T083000Z');
    assert.equal(a.headers['x-amz-content-sha256'], crypto.createHash('sha256').update('hello').digest('hex'));
    assert.match(a.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261112\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    const b = r2.sign({ method: 'PUT', key: 'files/ab/x y.pdf', body: Buffer.from('hello'), cfg, now });
    assert.equal(a.headers.Authorization, b.headers.Authorization, 'same request, same signature');
    const c = r2.sign({ method: 'GET', key: 'files/ab/x y.pdf', cfg, now });
    assert.notEqual(a.headers.Authorization, c.headers.Authorization);
    const d = r2.sign({ method: 'PUT', key: 'files/ab/x y.pdf', body: Buffer.from('hello'), cfg: { ...cfg, secretAccessKey: 'other' }, now });
    assert.notEqual(a.headers.Authorization, d.headers.Authorization, 'the secret changes the signature');
});

test('put, get and delete through the bucket; a missing object is null', async () => {
    const env = { ...process.env };
    Object.assign(process.env, { R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'b' });
    const store = new Map();
    const fake = async (url, init) => {
        const key = new URL(url).pathname;
        assert.ok(init.headers.Authorization.startsWith('AWS4-HMAC-SHA256'));
        const reply = (status, body) => ({ ok: status < 300, status, arrayBuffer: async () => (body ? body.buffer.slice(body.byteOffset, body.byteOffset + body.length) : new ArrayBuffer(0)) });
        if (init.method === 'PUT') { store.set(key, Buffer.from(init.body)); return reply(200); }
        if (init.method === 'GET') return store.has(key) ? reply(200, store.get(key)) : reply(404);
        if (init.method === 'DELETE') { store.delete(key); return reply(204); }
        return reply(400);
    };
    try {
        assert.equal(r2.isConfigured(), true);
        const key = r2.newKey('files', 'abcdef');
        assert.match(key, /^files\/ab\/[0-9a-f-]{36}$/);
        await r2.put(key, Buffer.from('%PDF-1.4 test'), 'application/pdf', fake);
        assert.equal((await r2.get(key, fake)).toString(), '%PDF-1.4 test');
        await r2.del(key, fake);
        assert.equal(await r2.get(key, fake), null);
        await r2.del(key, fake);   // deleting twice is fine
    } finally {
        process.env = env;
    }
    assert.equal(r2.isConfigured(), !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET));
});
