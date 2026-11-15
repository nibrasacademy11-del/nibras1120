// The learning path in the database (PLAN-V2 §4, as settled on 15 Nov 2026):
//   program → modules → lectures. A lecture of the program (no group) is for everyone enrolled.
//   Entering lectures shows progress; a module COMPLETES only once the owner presses "the module
//   is finished", and then only for those who entered all its lectures. Its certificate follows
//   (when the program is paid). Someone who enters their missing lectures later completes it then.
// The rules themselves are in lib/lectures (pure, unit tested).

const Enrollment = require('../../models/Enrollment');
const Lecture = require('../../models/Lecture');
const LectureAttendance = require('../../models/LectureAttendance');
const ProgramModule = require('../../models/ProgramModule');
const L = require('../../lib/lectures');
const workflow = require('../../lib/moduleWorkflow');
const { addEvent } = require('../crm/service');

const ACTIVE = [...Enrollment.OPEN_STATUSES, 'completed'];
const LECTURE_FIELDS = '_id program cohort module status startsAt durationMin titleAr titleEn order';

// The lectures an enrollment counts: the program's own, plus those of its group (older lectures)
const lecturesFor = (lectures, e) => lectures.filter((l) => String(l.program) === String(e.program) && (!l.cohort || (e.cohort && String(l.cohort) === String((e.cohort && e.cohort._id) || e.cohort))));

async function enteredSet(customerIds, lectureIds) {
    const seats = await LectureAttendance.find({ customer: { $in: customerIds }, lecture: { $in: lectureIds }, enteredAt: { $ne: null } }).select('lecture').lean();
    return new Set(seats.map((s) => String(s.lecture)));
}

const finishedSet = async (programIds) => new Set((await ProgramModule.find({ program: { $in: programIds }, finishedAt: { $ne: null } }).select('_id').lean()).map((m) => String(m._id)));

// Records the customer's first counted entry to a lecture. Returns true when it is new.
async function markEntered(lecture, customerId, via, now = new Date()) {
    const r = await LectureAttendance.updateOne(
        { lecture: lecture._id, customer: customerId, enteredAt: null },
        { $set: { enteredAt: now, enteredVia: via, cohort: lecture.cohort || null, program: lecture.program } }
    );
    return r.modifiedCount > 0;
}

// Brings one enrollment up to date: modules started show as in progress; a finished module whose
// lectures were all entered completes (approved, by the system). Returns the completed modules.
async function refreshEnrollment(e, { lectures, entered, finished, now = new Date() }) {
    const rows = L.lectureProgress(e.modules, lecturesFor(lectures, e), entered);
    const completed = [];
    let changed = false;
    for (const mod of e.modules) {
        const r = rows[String(mod.module)];
        if (!r || workflow.DONE.includes(mod.status)) continue;
        if (r.complete && finished.has(String(mod.module))) {
            const from = mod.status;
            mod.status = 'approved';
            mod.startedAt = mod.startedAt || now;
            mod.approvedAt = now;
            mod.approvedBy = null;
            mod.rejectionReason = '';
            mod.history.push({ from, to: 'approved', note: 'Module finished; all its lectures entered', by: null, byName: 'system', at: now });
            completed.push(mod);
            changed = true;
        } else if (r.entered > 0 && mod.status === 'not_started') {
            mod.status = 'in_progress';
            mod.startedAt = mod.startedAt || now;
            mod.history.push({ from: 'not_started', to: 'in_progress', note: 'First lecture entered', by: null, byName: 'system', at: now });
            changed = true;
        }
    }
    if (!changed) return [];
    const c = workflow.completion(e.modules, e.modulesRequired);
    e.eligibleForFinalCertificate = c.complete;
    if (c.complete && e.status === 'active') {
        e.status = 'completed';
        e.completedAt = now;
    }
    await e.save();
    for (const mod of completed) {
        await addEvent(null, e.customer, 'module', `${mod.titleAr}: completed (module finished, all lectures entered)`, { meta: { enrollment: String(e._id), action: 'auto_complete' } });
    }
    return completed;
}

// One customer's enrollments in one program, after an entry. Returns [{ enrollment, completed }].
async function refresh({ customerId, programId }) {
    const enrollments = await Enrollment.find({ customer: customerId, program: programId, status: { $in: ACTIVE } });
    if (!enrollments.length) return [];
    const lectures = await Lecture.find({ program: programId }).select(LECTURE_FIELDS).lean();
    const entered = await enteredSet([customerId], lectures.map((l) => l._id));
    const finished = await finishedSet([programId]);
    const out = [];
    for (const e of enrollments) {
        const completed = await refreshEnrollment(e, { lectures, entered, finished });
        if (completed.length) out.push({ enrollment: e, completed });
    }
    return out;
}

// "The module is finished": everyone enrolled who entered all its lectures completes it now.
// Returns { completed: [{ enrollment, completed }], missing } (missing: enrolled, lectures left).
async function finishModule(moduleId) {
    const mod = await ProgramModule.findById(moduleId).lean();
    const enrollments = await Enrollment.find({ program: mod.program, status: { $in: ACTIVE }, 'modules.module': mod._id });
    const lectures = await Lecture.find({ program: mod.program }).select(LECTURE_FIELDS).lean();
    const finished = await finishedSet([mod.program]);
    const out = [];
    let missing = 0;
    for (const e of enrollments) {
        const entered = await enteredSet([e.customer], lectures.map((l) => l._id));
        const completed = await refreshEnrollment(e, { lectures, entered, finished });
        if (completed.length) out.push({ enrollment: e, completed });
        const m = e.modules.find((x) => String(x.module) === String(mod._id));
        if (m && !workflow.DONE.includes(m.status)) missing += 1;
    }
    return { completed: out, missing };
}

// What the customer's "my path" shows for each enrollment: every module's lectures entered out of
// all (and whether the module is finished), the program's percent and the next lecture
async function pathFor(enrollments, customerIds) {
    const programIds = [...new Set(enrollments.map((e) => String(e.program)))];
    const lectures = programIds.length ? await Lecture.find({ program: { $in: programIds } }).select(LECTURE_FIELDS).lean() : [];
    const entered = lectures.length ? await enteredSet(customerIds, lectures.map((l) => l._id)) : new Set();
    const finished = await finishedSet(programIds);
    const now = new Date();
    const out = {};
    for (const e of enrollments) {
        const mine = lecturesFor(lectures, e);
        const rows = L.lectureProgress(e.modules, mine, entered);
        for (const [k, r] of Object.entries(rows)) r.finished = finished.has(k);
        const next = L.nextLecture(mine, now);
        const live = mine.filter((l) => l.status !== 'cancelled');
        out[String(e._id)] = {
            modules: rows,
            percent: L.programPercent(e.modules, rows, workflow.DONE),
            lectures: { total: live.length, entered: live.filter((l) => entered.has(String(l._id))).length },
            next: next ? { _id: next._id, titleAr: next.titleAr, titleEn: next.titleEn, startsAt: next.startsAt, durationMin: next.durationMin, module: next.module, state: L.joinState(next, now) } : null,
            single: e.modules.length === 1
        };
    }
    return out;
}

module.exports = { markEntered, refresh, finishModule, pathFor, lecturesFor, LECTURE_FIELDS, ACTIVE };
