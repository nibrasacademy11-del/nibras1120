const crypto = require('crypto');
const StoredFile = require('../models/StoredFile');
const r2 = require('./r2');

// Where uploaded documents live. Every file has a record in the database (key "mongo:<id>");
// its bytes are in the Cloudflare R2 bucket when R2 is set up (lib/r2.js), otherwise in the record.
// Files moved to R2 later (tools/move-files-to-r2.js) keep their key, so nothing else changes.

const ALLOWED = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};
const MAX_BYTES = 4 * 1024 * 1024;

// File signatures, so a renamed file cannot pass as a PDF or image
function sniff(buf) {
    if (buf.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
    if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return null;
}

function validate(buffer, declaredType) {
    if (!buffer || !buffer.length) return 'The file is empty.';
    if (buffer.length > MAX_BYTES) return 'The file is larger than 4MB.';
    const actual = sniff(buffer);
    if (!actual || !ALLOWED[actual]) return 'Only PDF, JPG, PNG, WEBP and DOCX files are allowed.';
    if (declaredType && ALLOWED[declaredType] && declaredType !== actual) return 'The file type does not match its content.';
    return null;
}

async function put(buffer) {
    const mimetype = sniff(buffer);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    let doc;
    if (r2.isConfigured()) {
        const r2Key = r2.newKey('files', sha256);
        await r2.put(r2Key, buffer, mimetype);
        doc = await StoredFile.create({ r2Key, mimetype, size: buffer.length, sha256 });
    } else {
        doc = await StoredFile.create({ data: buffer, mimetype, size: buffer.length, sha256 });
    }
    return { key: `mongo:${doc._id}`, mimetype, size: buffer.length, sha256 };
}

async function get(key) {
    const [driver, id] = String(key).split(':');
    if (driver === 'mongo') {
        const doc = await StoredFile.findById(id).lean();
        if (!doc) return null;
        if (doc.r2Key) {
            const data = await r2.get(doc.r2Key);
            return data ? { data, mimetype: doc.mimetype, size: data.length } : null;
        }
        if (!doc.data) return null;
        return { data: Buffer.from(doc.data.buffer || doc.data), mimetype: doc.mimetype, size: doc.size };
    }
    throw new Error(`Unknown storage driver: ${driver}`);
}

module.exports = { put, get, validate, sniff, ALLOWED, MAX_BYTES };
