// Cloudflare R2 (S3-compatible) for uploaded files: put, get and delete objects, signed with AWS
// Signature V4. No SDK: three requests are all the system needs.
// Settings come from the environment:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

const crypto = require('crypto');

const TIMEOUT_MS = 15000;

function config() {
    return {
        accountId: (process.env.R2_ACCOUNT_ID || '').trim(),
        accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
        secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
        bucket: (process.env.R2_BUCKET || '').trim()
    };
}

const isConfigured = () => {
    const c = config();
    return !!(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket);
};

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const encodeKey = (key) => String(key).split('/').map((p) => encodeURIComponent(p)).join('/');

// The signed request for one object. Pure, so it can be tested.
function sign({ method, key, body = '', cfg = config(), now = new Date() }) {
    const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
    const path = `/${cfg.bucket}/${encodeKey(key)}`;
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = amzDate.slice(0, 8);
    const payloadHash = sha256(body);
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonical = [method, path, '', `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`, signedHeaders, payloadHash].join('\n');
    const scope = `${day}/auto/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
    const kSigning = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, day), 'auto'), 's3'), 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
    return {
        url: `https://${host}${path}`,
        headers: {
            'x-amz-date': amzDate,
            'x-amz-content-sha256': payloadHash,
            Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
        }
    };
}

async function send(method, key, body, contentType, fetchImpl = fetch) {
    if (!isConfigured()) throw new Error('R2 is not configured.');
    const { url, headers } = sign({ method, key, body: body || '' });
    if (contentType) headers['Content-Type'] = contentType;
    return fetchImpl(url, { method, headers, body: body || undefined, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function put(key, buffer, contentType, fetchImpl) {
    const res = await send('PUT', key, buffer, contentType, fetchImpl);
    if (!res.ok) throw new Error(`R2 upload failed (${res.status})`);
}

// The object's bytes, or null when it does not exist
async function get(key, fetchImpl) {
    const res = await send('GET', key, null, null, fetchImpl);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 read failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}

async function del(key, fetchImpl) {
    const res = await send('DELETE', key, null, null, fetchImpl);
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed (${res.status})`);
}

// A new, unguessable object name
const newKey = (prefix, sha) => `${prefix}/${String(sha || '').slice(0, 2) || 'xx'}/${crypto.randomUUID()}`;

module.exports = { isConfigured, sign, put, get, del, newKey, config };
