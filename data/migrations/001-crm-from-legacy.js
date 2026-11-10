// Phase 1 migration: builds customer files from the data the site already has.
//
//   - every account with role student/user becomes a customer file linked to the account
//     (or is linked to an existing file with the same phone/email)
//   - every contact message and enrollment request joins its sender's file, or opens a lead
//   - certificates are not changed (they are linked to files in phase 5)
//
// Nothing is deleted or changed in the old records except a link from each inquiry to its file.
// Safe to run again: records that are already linked are skipped.
//
// Usage:
//   node data/migrations/001-crm-from-legacy.js              dry run against .env.development
//   node data/migrations/001-crm-from-legacy.js --apply      writes to .env.development's database
//   node data/migrations/001-crm-from-legacy.js --production [--apply]
//                                                            uses .env (the live database). Take a
//                                                            database backup first.

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..', '..');
const useProd = process.argv.includes('--production');
const envFile = useProd ? path.join(root, '.env') : path.join(root, '.env.development');
if (!fs.existsSync(envFile)) {
    console.error(`${path.basename(envFile)} not found.`);
    process.exit(1);
}
require('dotenv').config({ path: envFile, quiet: true });

const mongoose = require('mongoose');
const User = require('../../models/User');
const Inquiry = require('../../models/Inquiry');
const AuditLog = require('../../models/AuditLog');
const intake = require('../../modules/crm/intake');

async function main() {
    const apply = process.argv.includes('--apply');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name} (${useProd ? 'LIVE' : 'test'})`);
    console.log(apply ? 'Mode: APPLY (writing)\n' : 'Mode: dry run (nothing is written)\n');

    const tally = {};
    const count = (group, action) => {
        tally[group] = tally[group] || {};
        tally[group][action] = (tally[group][action] || 0) + 1;
    };

    // Accounts first, oldest first, so a file's registration date is the account's
    const users = await User.find({ role: { $in: ['student', 'user', 'customer'] } }).sort({ createdAt: 1 });
    for (const u of users) {
        const r = await intake.ingestUser(u, { dryRun: !apply });
        count('accounts', r.action);
    }

    const inquiries = await Inquiry.find({ customer: null }).sort({ createdAt: 1 });
    for (const q of inquiries) {
        const r = await intake.ingestInquiry(q, { dryRun: !apply });
        count('inquiries', r.action);
    }

    console.log(`Accounts (${users.length}):`, tally.accounts || {});
    console.log(`Inquiries (${inquiries.length}):`, tally.inquiries || {});
    if (!apply) {
        console.log('\nDry run counts treat each record on its own; when applied, messages from the same');
        console.log('phone or email as an account created above join that file instead of opening a new one.');
        console.log('Run again with --apply to write.');
    } else {
        await AuditLog.create({ action: 'migration.crm_from_legacy', resource: 'customers', summary: 'Customer files built from accounts and inquiries', meta: tally });
        console.log('\nDone.');
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
