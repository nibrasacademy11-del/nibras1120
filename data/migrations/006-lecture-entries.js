// PLAN-V2 stage 3 migration: the learning path counts a lecture once the customer "entered" it.
// Attendance recorded before this field existed becomes an entry:
//   - marked present (by staff or by the Zoom report)       → entered (staff)
//   - a join click from the lecture's time onwards           → entered (live)
// A click days before the lecture is not an entry (lib/lectures.entryCounts).
// Modules are NOT completed here: progress is shown at once, and a module completes on the next
// entry in its group (or with --refresh, which completes them now and can start certificates).
// Safe to run again.
//
//   node data/migrations/006-lecture-entries.js                     dry run, .env.development
//   node data/migrations/006-lecture-entries.js --apply
//   node data/migrations/006-lecture-entries.js --production [--apply]     (back up first)
//   ... --uri "mongodb://..."                                       a specific database
//   ... --refresh                                                   complete finished modules now

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..', '..');
const useProd = process.argv.includes('--production');
const uriArg = (() => { const i = process.argv.indexOf('--uri'); return i > 0 ? process.argv[i + 1] : null; })();
if (!uriArg) {
    const envFile = path.join(root, useProd ? '.env' : '.env.development');
    if (!fs.existsSync(envFile)) {
        console.error(`${path.basename(envFile)} not found.`);
        process.exit(1);
    }
    require('dotenv').config({ path: envFile, quiet: true });
}

const mongoose = require('mongoose');
const Lecture = require('../../models/Lecture');
const LectureAttendance = require('../../models/LectureAttendance');
const L = require('../../lib/lectures');

async function main() {
    const apply = process.argv.includes('--apply');
    const refresh = process.argv.includes('--refresh');
    await mongoose.connect(uriArg || process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name} (${useProd ? 'LIVE' : 'test'})`);
    console.log(apply ? 'Mode: APPLY\n' : 'Mode: dry run\n');

    const seats = await LectureAttendance.find({ enteredAt: null, $or: [{ present: true }, { firstClickAt: { $ne: null } }] }).lean();
    const lectures = Object.fromEntries((await Lecture.find({ _id: { $in: seats.map((s) => s.lecture) } }).lean()).map((l) => [String(l._id), l]));
    let staff = 0;
    let live = 0;
    let early = 0;
    const touched = new Set();
    for (const s of seats) {
        const l = lectures[String(s.lecture)];
        if (!l || l.status === 'cancelled') continue;
        let via = '';
        let at = null;
        if (s.present) { via = 'staff'; at = s.joinedAt || s.updatedAt || new Date(); }
        else if (s.lastClickAt && L.entryCounts(l, new Date(s.lastClickAt))) { via = 'live'; at = s.lastClickAt; }
        if (!via) { early += 1; continue; }
        if (via === 'staff') staff += 1; else live += 1;
        touched.add(`${s.customer}|${s.cohort}`);
        if (apply) await LectureAttendance.updateOne({ _id: s._id, enteredAt: null }, { $set: { enteredAt: at, enteredVia: via } });
    }
    console.log(`Entries from attendance: ${staff}; from join clicks in the lecture's time: ${live}; early clicks left uncounted: ${early}`);

    if (apply && refresh) {
        const progress = require('../../modules/learning/progress');
        let completed = 0;
        for (const key of touched) {
            const [customerId, cohortId] = key.split('|');
            const out = await progress.refresh({ customerId, cohortId });
            completed += out.reduce((a, o) => a + o.completed.length, 0);
        }
        console.log(`Modules completed now: ${completed}`);
    } else if (refresh) {
        console.log('(--refresh runs only with --apply)');
    }
    if (!apply) console.log('\nDry run: nothing was changed. Run again with --apply.');
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
