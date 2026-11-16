// 16 Nov 2026: customer service became the assistant. The system already reads every
// "customer_support" account as the assistant; this writes the new name into the accounts, so the
// data says what the system does. The accounts are not signed out (their access only grows).
// Safe to run again.
//
//   node data/migrations/007-assistant.js                       dry run, .env.development
//   node data/migrations/007-assistant.js --apply
//   node data/migrations/007-assistant.js --production [--apply]     on the server

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..', '..');
const useProd = process.argv.includes('--production');
const apply = process.argv.includes('--apply');
const envFile = path.join(root, useProd ? '.env' : '.env.development');
if (!fs.existsSync(envFile)) {
    console.error(`${path.basename(envFile)} not found.`);
    process.exit(1);
}
require('dotenv').config({ path: envFile, quiet: true });

const mongoose = require('mongoose');
const User = require('../../models/User');
const RolePolicy = require('../../models/RolePolicy');

async function main() {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    const users = await User.find({ role: 'customer_support' }).select('email').lean();
    console.log(`${users.length} customer service account(s) → assistant${apply ? '' : ' (dry run)'}`);
    for (const u of users) console.log(`  ${u.email}`);
    if (apply) {
        await User.updateMany({ role: 'customer_support' }, { $set: { role: 'assistant' } });
        // saved permission edits for the old role no longer apply
        await RolePolicy.deleteMany({ role: 'customer_support' });
        console.log('Done.');
    } else {
        console.log('Run again with --apply to write.');
    }
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
