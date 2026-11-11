const CohortMember = require('../../models/CohortMember');
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

module.exports = { activeCount, addMember, customerIdsOfUser, attendanceStats };
