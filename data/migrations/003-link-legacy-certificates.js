// Phase 5 migration: links certificates entered before the management system to customer files,
// so they appear in the customer's file and in "My certificates". Run after migration 001.
// Matching: the certificate's linked account (userId), otherwise an exact customer name match
// (only when exactly one customer has that name). Nothing else on the certificate changes.
//
//   node data/migrations/003-link-legacy-certificates.js              dry run, .env.development
//   node data/migrations/003-link-legacy-certificates.js --apply
//   node data/migrations/003-link-legacy-certificates.js --production [--apply]   (back up first)

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..', '..');
const useProd = process.argv.includes('--production');
const envFile = path.join(root, useProd ? '.env' : '.env.development');
if (!fs.existsSync(envFile)) {
    console.error(`${path.basename(envFile)} not found.`);
    process.exit(1);
}
require('dotenv').config({ path: envFile, quiet: true });

const mongoose = require('mongoose');
const Certificate = require('../../models/Certificate');
const Customer = require('../../models/Customer');
const AuditLog = require('../../models/AuditLog');

async function main() {
    const apply = process.argv.includes('--apply');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name} (${useProd ? 'LIVE' : 'test'})`);
    console.log(apply ? 'Mode: APPLY\n' : 'Mode: dry run\n');

    const tally = { byAccount: 0, byName: 0, ambiguous: 0, none: 0 };
    const certs = await Certificate.find({ $or: [{ kind: 'legacy' }, { kind: { $exists: false } }], customer: null }).select('cert_num trainee_name userId');
    for (const c of certs) {
        let customer = null;
        if (c.userId) {
            customer = await Customer.findOne({ user: c.userId, status: { $ne: 'merged' } }).select('_id owner team');
            if (customer) tally.byAccount++;
        }
        if (!customer) {
            const same = await Customer.find({ nameAr: String(c.trainee_name).trim(), status: { $ne: 'merged' } }).select('_id owner team').limit(2);
            if (same.length === 1) {
                customer = same[0];
                tally.byName++;
            } else if (same.length > 1) tally.ambiguous++;
            else tally.none++;
        }
        if (customer && apply) {
            await Certificate.updateOne({ _id: c._id }, { $set: { customer: customer._id, owner: customer.owner || null, team: customer.team || null, kind: 'legacy' } });
        }
    }
    console.log(`Legacy certificates: ${certs.length}`);
    console.log(tally);
    if (apply) await AuditLog.create({ action: 'migration.link_legacy_certificates', resource: 'certificates', summary: `${tally.byAccount + tally.byName} certificates linked`, meta: tally });
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
