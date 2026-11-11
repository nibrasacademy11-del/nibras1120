// Moves uploaded files (customer documents, expense receipts, website images) out of the database
// into the Cloudflare R2 bucket. Each file keeps its record and key, so every link keeps working.
// The bytes are removed from the database only after the copy in R2 was read back and matches.
//
//   node tools/move-files-to-r2.js                    dry run, .env.development
//   node tools/move-files-to-r2.js --apply            moves, .env.development
//   node tools/move-files-to-r2.js --production [--apply]   uses .env (the live database)
//
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be in the same file.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const useProd = process.argv.includes('--production');
const envFile = path.join(root, useProd ? '.env' : '.env.development');
if (!fs.existsSync(envFile)) {
    console.error(`${path.basename(envFile)} not found.`);
    process.exit(1);
}
require('dotenv').config({ path: envFile, quiet: true });
// Some networks refuse the DNS lookups Atlas addresses need; public DNS avoids that
try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch { /* keep the system DNS */ }

const mongoose = require('mongoose');
const r2 = require('../lib/r2');
const StoredFile = require('../models/StoredFile');
const Media = require('../models/Media');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

async function move(Model, prefix, apply, tally) {
    const docs = await Model.find({ data: { $exists: true, $ne: null }, $or: [{ r2Key: '' }, { r2Key: { $exists: false } }] }).select('_id mimetype size').lean();
    tally[prefix] = { files: docs.length, bytes: 0, moved: 0, failed: 0 };
    for (const { _id } of docs) {
        const doc = await Model.findById(_id).lean();
        const data = Buffer.from(doc.data.buffer || doc.data);
        tally[prefix].bytes += data.length;
        if (!apply) continue;
        try {
            const key = r2.newKey(prefix, sha(data));
            await r2.put(key, data, doc.mimetype);
            const back = await r2.get(key);
            if (!back || sha(back) !== sha(data)) throw new Error('the copy in R2 does not match');
            await Model.updateOne({ _id }, { $set: { r2Key: key }, $unset: { data: 1 } });
            tally[prefix].moved++;
        } catch (err) {
            tally[prefix].failed++;
            console.error(`${prefix} ${_id}: ${err.message}`);
        }
    }
}

async function main() {
    const apply = process.argv.includes('--apply');
    if (apply && !r2.isConfigured()) {
        console.error('R2 is not configured in', path.basename(envFile));
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name} (${useProd ? 'LIVE' : 'test'})`);
    console.log(apply ? 'Mode: APPLY (moving files)\n' : 'Mode: dry run (nothing is changed)\n');
    const tally = {};
    await move(StoredFile, 'files', apply, tally);
    await move(Media, 'media', apply, tally);
    for (const [k, v] of Object.entries(tally)) console.log(`${k}: ${v.files} files, ${(v.bytes / 1048576).toFixed(2)} MB${apply ? `, moved ${v.moved}, failed ${v.failed}` : ''}`);
    if (!apply) console.log('\nRun again with --apply to move them.');
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
