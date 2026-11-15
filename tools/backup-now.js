// A manual backup without installing MongoDB tools: every collection is exported to one
// compressed, encrypted file. Use it before a migration or any large change.
//
//   node tools/backup-now.js                 backs up the database in .env.development
//   node tools/backup-now.js --production    backs up the live database in .env
//
// The passphrase comes from BACKUP_PASSPHRASE (in the env file or the shell).
// Restore with: node tools/restore-backup.js <file> --to-test   (see docs/BACKUP-RESTORE.md)

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const useProd = process.argv.includes('--production');
const envFile = path.join(root, useProd ? '.env' : '.env.development');
if (fs.existsSync(envFile)) require('dotenv').config({ path: envFile, quiet: true });

const mongoose = require('mongoose');
const { EJSON } = require('bson');

// Format: "NIBRASBK1" | salt(16) | iv(12) | tag(16) | AES-256-GCM(gzip(EJSON lines))
function encrypt(buf, passphrase) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
    return Buffer.concat([Buffer.from('NIBRASBK1'), salt, iv, cipher.getAuthTag(), ct]);
}

async function main() {
    const passphrase = process.env.BACKUP_PASSPHRASE;
    if (!passphrase || passphrase.length < 16) throw new Error('Set BACKUP_PASSPHRASE (16+ characters).');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    const db = mongoose.connection.db;
    console.log(`Database: ${mongoose.connection.host}/${db.databaseName} (${useProd ? 'LIVE' : 'test'})`);
    const lines = [];
    const counts = {};
    for (const { name } of await db.listCollections().toArray()) {
        if (name.startsWith('system.')) continue;
        counts[name] = 0;
        for await (const doc of db.collection(name).find()) {
            lines.push(EJSON.stringify({ c: name, d: doc }, { relaxed: false }));
            counts[name] += 1;
        }
    }
    lines.unshift(JSON.stringify({ meta: { db: db.databaseName, at: new Date().toISOString(), counts } }));
    const out = encrypt(zlib.gzipSync(Buffer.from(lines.join('\n'))), passphrase);
    const dir = path.join(root, '..', 'Nibras-backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `db-${db.databaseName}-${new Date().toISOString().replace(/[:.]/g, '-')}.nbk`);
    fs.writeFileSync(file, out);
    console.log(counts);
    console.log(`Saved ${(out.length / 1024 / 1024).toFixed(2)} MB to ${file}`);
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    }).finally(() => mongoose.disconnect());
}

module.exports = { encrypt };
