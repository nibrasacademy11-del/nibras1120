const CohortMember = require('../../models/CohortMember');
const Cohort = require('../../models/Cohort');
const Customer = require('../../models/Customer');
const Lecture = require('../../models/Lecture');
const LectureAttendance = require('../../models/LectureAttendance');
const L = require('../../lib/lectures');

// Group membership shared by enrollments and the group pages

const activeCount = (cohortId) => CohortMember.countDocuments({ cohort: cohortId, status: 'active' });

// Adds (or brings back) a customer to a group. Returns 'added', 'restored' or 'already'.
async function addMember({ cohort, customer, enrollment = null, by = null, via = 'manual' }) {
    const existing = await CohortMember.findOne({ cohort: cohort._id, customer: customer._id });
    if (existing && existing.status === 'active') {
        if (enrollment && !existing.enrollment) {
            existing.enrollment = enrollment;
            await existing.save();
        }
        return 'already';
    }
    const fields = {
        program: cohort.program, customerUser: customer.user || null, enrollment: enrollment || (existing && existing.enrollment) || null,
        status: 'active', addedVia: via, addedAt: new Date(), addedBy: by, removedAt: null, removedBy: null, removeReason: ''
    };
    if (existing) {
        existing.set(fields);
        await existing.save();
        return 'restored';
    }
    await CohortMember.create({ cohort: cohort._id, customer: customer._id, ...fields });
    return 'added';
}

// The customer files linked to a portal account
async function customerIdsOfUser(userId) {
    const files = await Customer.find({ user: userId, status: { $ne: 'merged' } }).select('_id').lean();
    return files.map((f) => f._id);
}

// Held lectures (finished, not cancelled) and each member's presence in them
async function attendanceStats(cohortId) {
    const held = await Lecture.find({ cohort: cohortId, status: 'scheduled', startsAt: { $lt: new Date() } }).select('_id startsAt durationMin').lean();
    const heldIds = held.filter((l) => L.endOf(l) < new Date()).map((l) => l._id);
    const rows = await LectureAttendance.aggregate([
        { $match: { lecture: { $in: heldIds }, present: true } },
        { $group: { _id: '$customer', n: { $sum: 1 }, minutes: { $sum: '$minutes' } } }
    ]);
    return { held: heldIds.length, byCustomer: Object.fromEntries(rows.map((r) => [String(r._id), r])) };
}

// The group a new enrollment joins: the open group of the program that starts soonest and still
// has seats (PLAN-V2 §13: a purchase joins the nearest open group, or waits for the next one)
async function nearestOpenGroup(programId) {
    const open = await Cohort.find({ program: programId, status: 'open' }).lean();
    open.sort((a, b) => (a.startDate ? new Date(a.startDate).getTime() : Infinity) - (b.startDate ? new Date(b.startDate).getTime() : Infinity));
    for (const c of open) {
        if (!c.capacity || (await activeCount(c._id)) < c.capacity) return c;
    }
    return null;
}

// A group that opens takes the program's waiting enrollments, first come first served, up to its seats
async function placeWaiting(cohort, by = null) {
    if (!cohort || cohort.status !== 'open') return 0;
    const Enrollment = require('../../models/Enrollment');
    const waiting = await Enrollment.find({ program: cohort.program, waitingSince: { $ne: null }, cohort: null, status: { $in: Enrollment.OPEN_STATUSES } })
        .sort({ waitingSince: 1 }).populate('customer', 'user');
    let placed = 0;
    for (const e of waiting) {
        if (cohort.capacity && (await activeCount(cohort._id)) >= cohort.capacity) break;
        if (!e.customer) continue;
        e.cohort = cohort._id;
        e.waitingSince = null;
        await e.save();
        await addMember({ cohort, customer: e.customer, enrollment: e._id, by, via: 'enrollment' });
        placed += 1;
    }
    return placed;
}

module.exports = { activeCount, addMember, customerIdsOfUser, attendanceStats, nearestOpenGroup, placeWaiting };
