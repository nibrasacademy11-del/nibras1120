// Restores a backup made by tools/backup-now.js.
//
//   node tools/restore-backup.js <file.nbk> --check        decrypts and lists what is inside, writes nothing
//   node tools/restore-backup.js <file.nbk> --to-test      restores into the database in .env.development
//
// Restoring into the live database is deliberately not offered here: restore into the test database,
// check it, and switch the connection string only after the academy agrees.

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const devEnv = path.join(root, '.env.development');
if (fs.existsSync(devEnv)) require('dotenv').config({ path: devEnv, quiet: true });

const { EJSON } = require('bson');

function decrypt(buf, passphrase) {
    if (buf.subarray(0, 9).toString() !== 'NIBRASBK1') throw new Error('Not a Nibras backup file.');
    const salt = buf.subarray(9, 25);
    const iv = buf.subarray(25, 37);
    const tag = buf.subarray(37, 53);
    const key = crypto.scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(buf.subarray(53)), decipher.final()]);
}

function parse(buf, passphrase) {
    const lines = zlib.gunzipSync(decrypt(buf, passphrase)).toString('utf8').split('\n');
    const meta = JSON.parse(lines.shift()).meta;
    return { meta, docs: lines.filter(Boolean).map((l) => EJSON.parse(l, { relaxed: false })) };
}

async function main() {
    const file = process.argv[2];
    const mode = process.argv.includes('--to-test') ? 'restore' : 'check';
    if (!file || !fs.existsSync(file)) throw new Error('Usage: node tools/restore-backup.js <file.nbk> --check | --to-test');
    const passphrase = process.env.BACKUP_PASSPHRASE;
    if (!passphrase) throw new Error('Set BACKUP_PASSPHRASE.');
    const { meta, docs } = parse(fs.readFileSync(file), passphrase);
    console.log(`Backup of ${meta.db} taken ${meta.at}`);
    console.log(meta.counts);
    if (mode === 'check') return;

    const live = (() => {
        try {
            return (fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^MONGO_URI=(.*)$/m) || [])[1]?.trim();
        } catch {
            return '';
        }
    })();
    if (!process.env.MONGO_URI || process.env.MONGO_URI === live) throw new Error('.env.development must point at a TEST database.');
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    const db = mongoose.connection.db;
    const byCol = {};
    for (const { c, d } of docs) (byCol[c] = byCol[c] || []).push(d);
    for (const [name, list] of Object.entries(byCol)) {
        await db.collection(name).deleteMany({});
        for (let i = 0; i < list.length; i += 1000) await db.collection(name).insertMany(list.slice(i, i + 1000), { ordered: false });
        const n = await db.collection(name).countDocuments();
        console.log(`${name}: ${n}${n === meta.counts[name] ? '' : `  (expected ${meta.counts[name]})`}`);
    }
    await mongoose.disconnect();
    console.log('Restored into the test database.');
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    });
}

module.exports = { decrypt, parse };
