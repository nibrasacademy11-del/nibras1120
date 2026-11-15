// Phase 2 migration: turns the old free-text program lists on accounts (User.enrolledCourses)
// into enrollments, for customer files created by migration 001.
//
// A program name is matched to the catalog by its Arabic or English title. Names that match
// nothing are listed and left alone. The old list on the account is not changed.
// Safe to run again: a customer already enrolled in a program is skipped.
//
//   node data/migrations/002-enrollments-from-legacy.js              dry run, .env.development
//   node data/migrations/002-enrollments-from-legacy.js --apply
//   node data/migrations/002-enrollments-from-legacy.js --production [--apply]   (back up first)

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
const Customer = require('../../models/Customer');
const User = require('../../models/User');
const Course = require('../../models/Course');
const ProgramModule = require('../../models/ProgramModule');
const Enrollment = require('../../models/Enrollment');
const AuditLog = require('../../models/AuditLog');
const { nextNumber } = require('../../lib/sequence');
const { teamOf } = require('../../lib/teams');

const norm = (s) => String(s || '').normalize('NFKC').replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();

async function main() {
    const apply = process.argv.includes('--apply');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name} (${useProd ? 'LIVE' : 'test'})`);
    console.log(apply ? 'Mode: APPLY\n' : 'Mode: dry run\n');

    const courses = await Course.find().select('titleAr titleEn title modulesRequired').lean();
    const byTitle = new Map();
    for (const c of courses) for (const t of [c.titleAr, c.titleEn, c.title]) if (t) byTitle.set(norm(t), c);

    const tally = { enrollments: 0, skippedExisting: 0, unmatched: {} };
    const files = await Customer.find({ user: { $ne: null }, status: { $ne: 'merged' } }).select('customerNo user owner registeredAt status');
    for (const file of files) {
        const u = await User.findById(file.user).select('enrolledCourses createdAt').lean();
        for (const name of (u && u.enrolledCourses) || []) {
            const course = byTitle.get(norm(name));
            if (!course) {
                tally.unmatched[name] = (tally.unmatched[name] || 0) + 1;
                continue;
            }
            if (await Enrollment.exists({ customer: file._id, program: course._id })) {
                tally.skippedExisting++;
                continue;
            }
            tally.enrollments++;
            if (!apply) continue;
            const modules = await ProgramModule.find({ program: course._id, active: true }).sort({ order: 1 }).lean();
            const team = await teamOf(file.owner);
            const { number } = await nextNumber('enrollment');
            await Enrollment.create({
                enrollmentNo: number,
                customer: file._id,
                customerUser: file.user,
                program: course._id,
                programTitleAr: course.titleAr,
                programTitleEn: course.titleEn || '',
                owner: file.owner || null,
                team,
                enrolledAt: (u && u.createdAt) || file.registeredAt,
                modules: modules.map((m) => ({ module: m._id, order: m.order, titleAr: m.titleAr, titleEn: m.titleEn, required: m.required, certificate: m.certificate, status: 'not_started' })),
                modulesRequired: course.modulesRequired || 0,
                notes: 'Imported from the account’s program list',
                legacy: { from: 'user.enrolledCourses', name }
            });
            if (file.status !== 'customer') await Customer.updateOne({ _id: file._id }, { $set: { status: 'customer' } });
        }
    }

    console.log(`Enrollments ${apply ? 'created' : 'to create'}: ${tally.enrollments}`);
    console.log(`Already enrolled (skipped): ${tally.skippedExisting}`);
    const unmatched = Object.entries(tally.unmatched);
    console.log(`Program names with no catalog match: ${unmatched.length}`);
    for (const [name, n] of unmatched) console.log(`  - ${name} (${n})`);
    if (apply) await AuditLog.create({ action: 'migration.enrollments_from_legacy', resource: 'enrollments', summary: `${tally.enrollments} enrollments imported`, meta: { skipped: tally.skippedExisting, unmatched: unmatched.length } });
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
