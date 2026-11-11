// Phase 9 migration: group membership now has its own records (a customer can be in several groups).
// Enrollments placed in a group before Phase 9 become members of that group, so the group's
// lectures show in the customer's "My lectures". Safe to run again: existing members are skipped.
//
//   node data/migrations/004-group-members-from-enrollments.js              dry run, .env.development
//   node data/migrations/004-group-members-from-enrollments.js --apply
//   node data/migrations/004-group-members-from-enrollments.js --production [--apply]   (back up first)

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
const Enrollment = require('../../models/Enrollment');
const Customer = require('../../models/Customer');
const CohortMember = require('../../models/CohortMember');
const AuditLog = require('../../models/AuditLog');

async function main() {
    const apply = process.argv.includes('--apply');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name} (${useProd ? 'LIVE' : 'test'})`);
    console.log(apply ? 'Mode: APPLY\n' : 'Mode: dry run\n');

    const tally = { members: 0, already: 0, noCustomer: 0 };
    const enrollments = await Enrollment.find({ cohort: { $ne: null }, status: { $in: Enrollment.OPEN_STATUSES } }).select('cohort program customer createdBy enrolledAt');
    for (const e of enrollments) {
        if (await CohortMember.exists({ cohort: e.cohort, customer: e.customer })) { tally.already++; continue; }
        const customer = await Customer.findById(e.customer).select('user');
        if (!customer) { tally.noCustomer++; continue; }
        tally.members++;
        if (apply) {
            await CohortMember.create({
                cohort: e.cohort, program: e.program, customer: e.customer, customerUser: customer.user || null, enrollment: e._id,
                status: 'active', addedVia: 'enrollment', addedAt: e.enrolledAt || new Date(), addedBy: e.createdBy || null
            });
        }
    }
    console.log(`Enrollments in a group (${enrollments.length}):`, tally);
    if (apply) {
        await AuditLog.create({ action: 'migration.group_members', resource: 'programs', summary: 'Group members created from enrollments', meta: tally });
        console.log('\nDone.');
    } else {
        console.log('\nRun again with --apply to write.');
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
