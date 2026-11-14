// The learning path in the database (PLAN-V2 §4): a module completes by itself once the customer
// has entered all of its lectures, and the customer sees each module's percent and the next lecture.
// The rules themselves are in lib/lectures (pure, unit tested).

const Enrollment = require('../../models/Enrollment');
const CohortMember = require('../../models/CohortMember');
const Lecture = require('../../models/Lecture');
const LectureAttendance = require('../../models/LectureAttendance');
const L = require('../../lib/lectures');
const workflow = require('../../lib/moduleWorkflow');
const { addEvent } = require('../crm/service');

const ACTIVE = [...Enrollment.OPEN_STATUSES, 'completed'];
const LECTURE_FIELDS = '_id cohort module status startsAt durationMin titleAr titleEn';

async function enteredSet(customerIds, cohortIds) {
    const seats = await LectureAttendance.find({ customer: { $in: customerIds }, cohort: { $in: cohortIds }, enteredAt: { $ne: null } }).select('lecture').lean();
    return new Set(seats.map((s) => String(s.lecture)));
}

// Records the customer's first counted entry to a lecture. Returns true when it is new.
async function markEntered(lecture, customerId, via, now = new Date()) {
    const r = await LectureAttendance.updateOne(
        { lecture: lecture._id, customer: customerId, enteredAt: null },
        { $set: { enteredAt: now, enteredVia: via, cohort: lecture.cohort } }
    );
    return r.modifiedCount > 0;
}

// Brings the customer's enrollment in this group up to date: modules they started show as in
// progress, modules whose lectures they all entered complete (approved, by the system).
// Returns [{ enrollment, completed: [module subdocuments] }] for the certificate step.
async function refresh({ customerId, cohortId }) {
    const members = await CohortMember.find({ cohort: cohortId, customer: customerId, status: 'active' }).select('enrollment').lean();
    const ids = members.map((m) => m.enrollment).filter(Boolean);
    const enrollments = ids.length
        ? await Enrollment.find({ _id: { $in: ids }, status: { $in: ACTIVE } })
        : await Enrollment.find({ customer: customerId, cohort: cohortId, status: { $in: ACTIVE } });
    if (!enrollments.length) return [];
    const lectures = await Lecture.find({ cohort: cohortId }).select(LECTURE_FIELDS).lean();
    const entered = await enteredSet([customerId], [cohortId]);
    const out = [];
    const now = new Date();
    for (const e of enrollments) {
        const rows = L.lectureProgress(e.modules, lectures, entered);
        const completed = [];
        let changed = false;
        for (const mod of e.modules) {
            const r = rows[String(mod.module)];
            if (!r || workflow.DONE.includes(mod.status)) continue;
            if (r.complete) {
                const from = mod.status;
                mod.status = 'approved';
                mod.startedAt = mod.startedAt || now;
                mod.approvedAt = now;
                mod.approvedBy = null;
                mod.rejectionReason = '';
                mod.history.push({ from, to: 'approved', note: 'All lectures entered', by: null, byName: 'system', at: now });
                completed.push(mod);
                changed = true;
            } else if (r.entered > 0 && mod.status === 'not_started') {
                mod.status = 'in_progress';
                mod.startedAt = mod.startedAt || now;
                mod.history.push({ from: 'not_started', to: 'in_progress', note: 'First lecture entered', by: null, byName: 'system', at: now });
                changed = true;
            }
        }
        if (!changed) continue;
        const c = workflow.completion(e.modules, e.modulesRequired);
        e.eligibleForFinalCertificate = c.complete;
        if (c.complete && e.status === 'active') {
            e.status = 'completed';
            e.completedAt = now;
        }
        await e.save();
        for (const mod of completed) {
            await addEvent(null, e.customer, 'module', `${mod.titleAr}: completed (all lectures entered)`, { meta: { enrollment: String(e._id), action: 'auto_complete' } });
        }
        out.push({ enrollment: e, completed });
    }
    return out;
}

// What the customer's "my path" shows for each enrollment: every module's lectures entered out of
// all, the program's percent and the next lecture of the group
async function pathFor(enrollments, customerIds) {
    const cohortIds = [...new Set(enrollments.map((e) => String((e.cohort && e.cohort._id) || e.cohort || '')).filter(Boolean))];
    const lectures = cohortIds.length ? await Lecture.find({ cohort: { $in: cohortIds } }).select(LECTURE_FIELDS).lean() : [];
    const entered = cohortIds.length ? await enteredSet(customerIds, cohortIds) : new Set();
    const now = new Date();
    const out = {};
    for (const e of enrollments) {
        const cohortId = String((e.cohort && e.cohort._id) || e.cohort || '');
        const mine = lectures.filter((l) => String(l.cohort) === cohortId);
        const rows = L.lectureProgress(e.modules, mine, entered);
        const next = L.nextLecture(mine, now);
        out[String(e._id)] = {
            modules: rows,
            percent: L.programPercent(e.modules, rows, workflow.DONE),
            lectures: { total: mine.filter((l) => l.status !== 'cancelled').length, entered: mine.filter((l) => l.status !== 'cancelled' && entered.has(String(l._id))).length },
            next: next ? { _id: next._id, titleAr: next.titleAr, titleEn: next.titleEn, startsAt: next.startsAt, durationMin: next.durationMin, module: next.module, state: L.joinState(next, now) } : null,
            single: e.modules.length === 1
        };
    }
    return out;
}

module.exports = { markEntered, refresh, pathFor };
