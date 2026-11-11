const mongoose = require('mongoose');
const Cohort = require('../../models/Cohort');
const CohortMember = require('../../models/CohortMember');
const Lecture = require('../../models/Lecture');
const LectureAttendance = require('../../models/LectureAttendance');
const Course = require('../../models/Course');
const ProgramModule = require('../../models/ProgramModule');
const Enrollment = require('../../models/Enrollment');
const Customer = require('../../models/Customer');
const User = require('../../models/User');
const audit = require('../../lib/audit');
const P = require('../../lib/permissions');
const L = require('../../lib/lectures');
const zoom = require('../../lib/zoom');
const { customerAccess, displayName } = require('../../lib/customerAccess');
const { HttpError, assertVersion } = require('../../lib/http');
const { addEvent, getSetting } = require('../crm/service');
const groups = require('./groups');
const { createEnrollment } = require('./enrollmentController');

// Training groups: members, lectures (Zoom), joining from the portal and attendance

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const MAX_ADD = 500;

async function loadCohort(id) {
    const c = await Cohort.findById(id);
    if (!c) throw new HttpError(404, 'Not found.');
    return c;
}

async function loadLecture(id) {
    const l = await Lecture.findById(id);
    if (!l) throw new HttpError(404, 'Not found.');
    return l;
}

const timeZone = () => getSetting('attendance.timeZone');
const presentPercent = async () => Number(await getSetting('lectures.presentPercent')) || 50;

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

// ---- groups ----

exports.list = async (req, res) => {
    const filter = {};
    if (oid(req.query.program)) filter.program = oid(req.query.program);
    if (req.query.status) filter.status = String(req.query.status);
    else filter.status = { $ne: 'cancelled' };
    const cohorts = await Cohort.find(filter).populate('program', 'titleAr titleEn').sort({ startDate: -1, createdAt: -1 }).limit(300).lean();
    const ids = cohorts.map((c) => c._id);
    const [members, next] = await Promise.all([
        CohortMember.aggregate([{ $match: { cohort: { $in: ids }, status: 'active' } }, { $group: { _id: '$cohort', n: { $sum: 1 } } }]),
        Lecture.aggregate([
            { $match: { cohort: { $in: ids }, status: 'scheduled', startsAt: { $gte: new Date(Date.now() - 3 * 3600e3) } } },
            { $sort: { startsAt: 1 } },
            { $group: { _id: '$cohort', startsAt: { $first: '$startsAt' }, titleAr: { $first: '$titleAr' }, titleEn: { $first: '$titleEn' } } }
        ])
    ]);
    const m = Object.fromEntries(members.map((r) => [String(r._id), r.n]));
    const nx = Object.fromEntries(next.map((r) => [String(r._id), r]));
    res.json({
        items: cohorts.map((c) => ({ ...c, members: m[String(c._id)] || 0, nextLecture: nx[String(c._id)] || null })),
        zoomConnected: zoom.isConfigured()
    });
};

exports.get = async (req, res) => {
    const c = await Cohort.findById(req.params.id).populate('program', 'titleAr titleEn type').lean();
    if (!c) throw new HttpError(404, 'Not found.');
    const modules = await ProgramModule.find({ program: c.program._id }).sort({ order: 1 }).select('titleAr titleEn order active').lean();
    res.json({
        item: { ...c, members: await groups.activeCount(c._id) },
        modules,
        zoomConnected: zoom.isConfigured(),
        canManage: P.scopeFor(req.user.grants, 'programs.update') === 'all',
        canEnroll: P.scopeFor(req.user.grants, 'enrollments.create') === 'all'
    });
};

// ---- members ----

exports.members = async (req, res) => {
    const c = await loadCohort(req.params.id);
    const rows = await CohortMember.find({ cohort: c._id, status: req.query.removed === '1' ? 'removed' : 'active' })
        .populate('customer', 'customerNo nameAr owner team user contact.email')
        .populate('enrollment', 'enrollmentNo status')
        .sort({ addedAt: -1 }).limit(3000).lean();
    const [stats, namePolicy] = await Promise.all([attendanceStats(c._id), getSetting('customers.lookupNamePolicy')]);
    res.json({
        held: stats.held,
        items: rows.filter((r) => r.customer).map((r) => {
            const access = customerAccess({ actor: req.user, grants: req.user.grants, customer: r.customer });
            const s = stats.byCustomer[String(r.customer._id)];
            return {
                _id: r._id,
                customer: { _id: r.customer._id, customerNo: r.customer.customerNo, name: displayName(r.customer, access, namePolicy), canOpen: access.inFile },
                hasPortal: !!r.customer.user,
                hasEmail: !!(r.customer.contact && r.customer.contact.email),
                enrollment: r.enrollment,
                addedAt: r.addedAt,
                addedVia: r.addedVia,
                removedAt: r.removedAt,
                removeReason: r.removeReason,
                attended: s ? s.n : 0,
                rate: L.attendanceRate(s ? s.n : 0, stats.held)
            };
        })
    });
};

// What adding these lines or this filter would do, before anything is saved
exports.previewMembers = async (req, res) => {
    const c = await loadCohort(req.params.id);
    let found = [];
    const notFound = [];
    const ambiguous = [];
    if (req.body.source === 'program') {
        // Everyone with an open enrollment in the group's program
        const ens = await Enrollment.find({ program: c.program, status: { $in: Enrollment.OPEN_STATUSES } }).select('customer').limit(MAX_ADD * 4).lean();
        const customers = await Customer.find({ _id: { $in: ens.map((e) => e.customer) }, status: { $ne: 'merged' } }).select('customerNo nameAr owner team').lean();
        found = customers.map((cu) => ({ customer: cu, line: cu.customerNo, matchedBy: 'enrollment' }));
    } else {
        const lines = L.parseLines(req.body.text);
        if (!lines.length) throw new HttpError(400, 'الصق رقماً واحداً على الأقل. / Paste at least one number.');
        for (const line of lines) {
            const or = line.lookups.map(L.lookupQuery).filter(Boolean);
            if (!or.length) { notFound.push(line.raw); continue; }
            const matches = await Customer.find({ $or: or, status: { $ne: 'merged' } }).select('customerNo nameAr owner team contact.email contact.phoneNorm identity.nationalIdIdx identity.passportIdx').limit(5).lean();
            if (!matches.length) notFound.push(line.raw);
            else if (matches.length > 1) ambiguous.push({ line: line.raw, matches: matches.map((m) => ({ _id: m._id, customerNo: m.customerNo, nameAr: m.nameAr })) });
            else {
                const m = matches[0];
                const by = line.lookups.find((k) => {
                    const q = L.lookupQuery(k);
                    const [field, value] = Object.entries(q)[0];
                    return field.split('.').reduce((o, p) => (o ? o[p] : undefined), m) === value;
                });
                found.push({ customer: m, line: line.raw, matchedBy: by ? by.kind : 'other' });
            }
        }
    }
    // The same customer found by two lines counts once
    const seen = new Set();
    found = found.filter((f) => (seen.has(String(f.customer._id)) ? false : seen.add(String(f.customer._id))));
    const ids = found.map((f) => f.customer._id);
    const [members, enrolled] = await Promise.all([
        CohortMember.find({ cohort: c._id, customer: { $in: ids }, status: 'active' }).select('customer').lean(),
        Enrollment.find({ program: c.program, customer: { $in: ids }, status: { $in: Enrollment.OPEN_STATUSES } }).select('customer enrollmentNo').lean()
    ]);
    const inGroup = new Set(members.map((m) => String(m.customer)));
    const enr = Object.fromEntries(enrolled.map((e) => [String(e.customer), e.enrollmentNo]));
    const namePolicy = await getSetting('customers.lookupNamePolicy');
    res.json({
        found: found.map((f) => {
            const access = customerAccess({ actor: req.user, grants: req.user.grants, customer: f.customer });
            return {
                _id: f.customer._id, customerNo: f.customer.customerNo, name: displayName(f.customer, access, namePolicy),
                line: f.line, matchedBy: f.matchedBy, alreadyMember: inGroup.has(String(f.customer._id)), enrollmentNo: enr[String(f.customer._id)] || null
            };
        }),
        notFound,
        ambiguous: ambiguous.map((a) => ({ line: a.line, matches: a.matches.map((m) => ({ _id: m._id, customerNo: m.customerNo })) })),
        capacity: c.capacity,
        members: await groups.activeCount(c._id)
    });
};

exports.addMembers = async (req, res) => {
    const c = await loadCohort(req.params.id);
    if (c.status === 'cancelled') throw new HttpError(400, 'المجموعة ملغاة. / The group is cancelled.');
    const ids = [...new Set((Array.isArray(req.body.customers) ? req.body.customers : []).map(oid).filter(Boolean).map(String))].slice(0, MAX_ADD);
    if (!ids.length) throw new HttpError(400, 'اختر العملاء. / Choose the customers.');
    const enroll = req.body.enroll === true;
    if (enroll && P.scopeFor(req.user.grants, 'enrollments.create') !== 'all') throw new HttpError(403, 'Forbidden.');
    const program = await Course.findById(c.program).select('titleAr titleEn modulesRequired');
    const customers = await Customer.find({ _id: { $in: ids }, status: { $ne: 'merged' } });
    let room = c.capacity > 0 ? c.capacity - (await groups.activeCount(c._id)) : Infinity;
    const out = { added: 0, already: 0, enrolled: 0, notEnrolled: 0, full: 0, failed: [] };
    for (const cu of customers) {
        try {
            const isMember = await CohortMember.exists({ cohort: c._id, customer: cu._id, status: 'active' });
            if (isMember) { out.already++; continue; }
            if (room <= 0) { out.full++; continue; }
            let e = await Enrollment.findOne({ customer: cu._id, program: c.program, status: { $in: Enrollment.OPEN_STATUSES } });
            if (!e && enroll) {
                e = await createEnrollment(req, { customer: cu, program, cohort: null, owner: cu.owner || null, notes: `Added with group ${c.nameAr}` });
                out.enrolled++;
            }
            if (!e) out.notEnrolled++;
            else if (!e.cohort) await Enrollment.updateOne({ _id: e._id }, { $set: { cohort: c._id } });
            await groups.addMember({ cohort: c, customer: cu, enrollment: e ? e._id : null, by: req.user.id, via: 'bulk' });
            await addEvent(req, cu._id, 'enrollment_updated', `Added to group ${c.nameAr}`);
            out.added++;
            room--;
        } catch (err) {
            out.failed.push({ customerNo: cu.customerNo, message: err.message });
        }
    }
    await audit.record(req, { action: 'cohort.members_added', resource: 'programs', resourceId: c._id, summary: `${c.nameAr}: +${out.added}`, meta: { ...out, failed: out.failed.length } });
    res.json(out);
};

exports.removeMember = async (req, res) => {
    const m = await CohortMember.findOne({ _id: req.params.memberId, cohort: req.params.id }).populate('customer', 'customerNo');
    if (!m || m.status !== 'active') throw new HttpError(404, 'Not found.');
    const reason = str(req.body.reason, 300);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    m.set({ status: 'removed', removedAt: new Date(), removedBy: req.user.id, removeReason: reason });
    await m.save();
    const c = await Cohort.findById(m.cohort).select('nameAr');
    await Enrollment.updateOne({ _id: m.enrollment, cohort: m.cohort }, { $set: { cohort: null } });
    await addEvent(req, m.customer._id, 'enrollment_updated', `Removed from group ${c ? c.nameAr : ''}: ${reason}`);
    await audit.record(req, { action: 'cohort.member_removed', resource: 'programs', resourceId: m.cohort, summary: `${m.customer.customerNo} ← ${c ? c.nameAr : ''}`, reason });
    res.json({ ok: true });
};

// ---- lectures (staff) ----

function lectureInput(body, before = {}) {
    const startsAt = body.startsAt ? new Date(body.startsAt) : before.startsAt;
    if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) throw new HttpError(400, 'حدد ميعاد المحاضرة. / Set the lecture time.');
    const durationMin = Math.min(Math.max(parseInt(body.durationMin ?? before.durationMin, 10) || 90, 5), 600);
    const titleAr = str(body.titleAr ?? before.titleAr, 200);
    if (!titleAr) throw new HttpError(400, 'عنوان المحاضرة مطلوب. / The lecture title is required.');
    const materials = (Array.isArray(body.materials) ? body.materials : before.materials || [])
        .map((m) => ({ title: str(m.title, 200), url: L.safeUrl(m.url) })).filter((m) => m.title && m.url).slice(0, 30);
    return { titleAr, titleEn: str(body.titleEn ?? before.titleEn, 200), startsAt: new Date(startsAt), durationMin, module: body.module !== undefined ? oid(body.module) : before.module || null, materials, notes: str(body.notes ?? before.notes, 1000) };
}

function staffLecture(l, counts = {}) {
    return { ...l, state: L.joinState(l), endsAt: L.endOf(l), attendance: counts[String(l._id)] || { present: 0, clicked: 0 } };
}

exports.lectures = async (req, res) => {
    const c = await loadCohort(req.params.id);
    const items = await Lecture.find({ cohort: c._id }).sort({ startsAt: 1 }).lean();
    const counts = await LectureAttendance.aggregate([
        { $match: { lecture: { $in: items.map((l) => l._id) } } },
        { $group: { _id: '$lecture', present: { $sum: { $cond: ['$present', 1, 0] } }, clicked: { $sum: { $cond: [{ $gt: ['$clicks', 0] }, 1, 0] } } } }
    ]);
    const byId = Object.fromEntries(counts.map((r) => [String(r._id), { present: r.present, clicked: r.clicked }]));
    res.json({ items: items.map((l) => staffLecture(l, byId)) });
};

async function topicOf(cohort, titleAr) {
    return `${cohort.nameAr} - ${titleAr}`;
}

exports.addLecture = async (req, res) => {
    const c = await loadCohort(req.params.id);
    const input = lectureInput(req.body);
    if (input.module && !(await ProgramModule.exists({ _id: input.module, program: c.program }))) throw new HttpError(400, 'المحور لا يتبع البرنامج. / The module is not part of the program.');
    const useZoom = req.body.mode === 'zoom';
    const l = new Lecture({ ...input, cohort: c._id, program: c.program, createdBy: req.user.id });
    if (useZoom) {
        if (!zoom.isConfigured()) throw new HttpError(400, 'زوم غير مربوط. أضف الرابط يدوياً. / Zoom is not connected. Add the link by hand.', 'ZOOM_OFF');
        const registration = req.body.registration !== false;
        try {
            const m = await zoom.createMeeting(L.meetingPayload({ topic: await topicOf(c, input.titleAr), startsAt: input.startsAt, durationMin: input.durationMin, timeZone: await timeZone(), registration }));
            l.zoom = { managed: true, meetingId: String(m.id), joinUrl: m.join_url, passcode: m.password || '', registration };
        } catch (err) {
            throw new HttpError(502, `تعذر إنشاء الاجتماع على زوم. / Could not create the Zoom meeting. ${err.message}`, 'ZOOM_FAILED');
        }
    } else {
        l.zoom = { managed: false, joinUrl: L.safeUrl(req.body.joinUrl), passcode: str(req.body.passcode, 100), registration: false };
    }
    await l.save();
    await audit.record(req, { action: 'lecture.created', resource: 'programs', resourceId: l._id, summary: `${c.nameAr}: ${l.titleAr} @ ${l.startsAt.toISOString()}` });
    res.status(201).json({ item: staffLecture(l.toObject()) });
};

exports.updateLecture = async (req, res) => {
    const l = await loadLecture(req.params.id);
    assertVersion(l, req.body.__v);
    if (l.status === 'cancelled') throw new HttpError(400, 'المحاضرة ملغاة. / The lecture is cancelled.');
    const before = l.toObject();
    const input = lectureInput(req.body, before);
    if (input.module && !(await ProgramModule.exists({ _id: input.module, program: l.program }))) throw new HttpError(400, 'المحور لا يتبع البرنامج. / The module is not part of the program.');
    l.set(input);
    if (!l.zoom.managed) {
        if (req.body.joinUrl !== undefined) l.zoom.joinUrl = L.safeUrl(req.body.joinUrl);
        if (req.body.passcode !== undefined) l.zoom.passcode = str(req.body.passcode, 100);
    } else if (+before.startsAt !== +l.startsAt || before.durationMin !== l.durationMin || before.titleAr !== l.titleAr) {
        const c = await Cohort.findById(l.cohort).select('nameAr');
        try {
            const p = L.meetingPayload({ topic: await topicOf(c, l.titleAr), startsAt: l.startsAt, durationMin: l.durationMin, timeZone: await timeZone(), registration: l.zoom.registration });
            await zoom.updateMeeting(l.zoom.meetingId, { topic: p.topic, start_time: p.start_time, duration: p.duration, timezone: p.timezone });
        } catch (err) {
            throw new HttpError(502, `تعذر تعديل الاجتماع على زوم. / Could not update the Zoom meeting. ${err.message}`, 'ZOOM_FAILED');
        }
    }
    // Recordings added by hand (Zoom's own are kept)
    if (Array.isArray(req.body.recordings)) {
        const manual = req.body.recordings.map((r) => ({ title: str(r.title, 200), url: L.safeUrl(r.url), passcode: str(r.passcode, 100), source: 'manual' })).filter((r) => r.url).slice(0, 20);
        l.recordings = [...l.recordings.filter((r) => r.source === 'zoom'), ...manual];
    }
    if (+before.startsAt !== +l.startsAt) l.remindedAt = null;
    await l.save();
    await audit.record(req, { action: 'lecture.updated', resource: 'programs', resourceId: l._id, summary: l.titleAr, changes: audit.diff(before, l.toObject(), ['titleAr', 'startsAt', 'durationMin', 'module']) });
    res.json({ item: staffLecture(l.toObject()) });
};

exports.cancelLecture = async (req, res) => {
    const l = await loadLecture(req.params.id);
    const reason = str(req.body.reason, 300);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    if (l.status === 'cancelled') return res.json({ item: staffLecture(l.toObject()) });
    if (l.zoom.managed && l.zoom.meetingId) {
        try {
            await zoom.deleteMeeting(l.zoom.meetingId);
        } catch (err) {
            l.zoom.lastError = `Delete failed: ${err.message}`.slice(0, 500);
        }
    }
    l.status = 'cancelled';
    l.cancelReason = reason;
    await l.save();
    await audit.record(req, { action: 'lecture.cancelled', resource: 'programs', resourceId: l._id, summary: l.titleAr, reason });
    res.json({ item: staffLecture(l.toObject()) });
};

// Pulls attendance and the recording from Zoom for a finished lecture
async function syncLecture(l) {
    const result = { attendance: 0, recording: false };
    if (!l.zoom.managed || !l.zoom.meetingId) return result;
    const percent = await presentPercent();
    const rows = L.mergeParticipants(await zoom.listParticipants(l.zoom.meetingId));
    const members = await CohortMember.find({ cohort: l.cohort, status: { $ne: 'removed' } }).populate('customer', 'contact.email user').lean();
    const users = await User.find({ _id: { $in: members.map((m) => m.customer && m.customer.user).filter(Boolean) } }).select('email').lean();
    const userEmail = Object.fromEntries(users.map((u) => [String(u._id), String(u.email || '').toLowerCase()]));
    const byEmail = {};
    for (const m of members) {
        if (!m.customer) continue;
        for (const e of [m.customer.contact && m.customer.contact.email, m.customer.user && userEmail[String(m.customer.user)]]) if (e) byEmail[e] = m.customer._id;
    }
    const seats = await LectureAttendance.find({ lecture: l._id }).lean();
    const byRegistrant = Object.fromEntries(seats.filter((s) => s.registrantId).map((s) => [s.registrantId, s.customer]));
    for (const p of rows) {
        const customer = (p.registrantId && byRegistrant[p.registrantId]) || (p.email && byEmail[p.email]);
        if (!customer) continue;
        const present = L.isPresent(p.minutes, l.durationMin, percent);
        const existing = seats.find((s) => String(s.customer) === String(customer));
        // A manual "present" by staff is not undone by Zoom
        const keepManual = existing && existing.source === 'manual' && existing.present;
        await LectureAttendance.updateOne(
            { lecture: l._id, customer },
            { $set: { cohort: l.cohort, minutes: p.minutes, joinedAt: p.joinedAt, leftAt: p.leftAt, ...(keepManual ? {} : { present, source: 'zoom' }) } },
            { upsert: true }
        );
        result.attendance++;
    }
    const rec = await zoom.getRecording(l.zoom.meetingId);
    if (rec && !l.recordings.some((r) => r.url === rec.url)) {
        l.recordings.push({ title: 'Zoom', url: rec.url, passcode: rec.passcode, source: 'zoom', zoomFileId: rec.fileId });
        result.recording = true;
    }
    l.attendanceSyncedAt = new Date();
    l.zoom.lastError = '';
    await l.save();
    return result;
}
exports._syncLecture = syncLecture;

exports.syncLecture = async (req, res) => {
    const l = await loadLecture(req.params.id);
    if (!l.zoom.managed) throw new HttpError(400, 'هذه المحاضرة ليست مربوطة بزوم. / This lecture is not linked to Zoom.');
    if (L.endOf(l) > new Date()) throw new HttpError(400, 'المحاضرة لم تنته بعد. / The lecture has not ended yet.');
    if (!zoom.isConfigured()) throw new HttpError(400, 'زوم غير مربوط. / Zoom is not connected.', 'ZOOM_OFF');
    let result;
    try {
        result = await syncLecture(l);
    } catch (err) {
        throw new HttpError(502, `تعذر جلب البيانات من زوم. / Could not read from Zoom. ${err.message}`, 'ZOOM_FAILED');
    }
    await audit.record(req, { action: 'lecture.synced', resource: 'programs', resourceId: l._id, summary: `${l.titleAr}: ${result.attendance} attendees`, meta: result });
    res.json(result);
};

exports.attendance = async (req, res) => {
    const l = await loadLecture(req.params.id);
    const [members, seats, namePolicy] = await Promise.all([
        CohortMember.find({ cohort: l.cohort, $or: [{ status: 'active' }, { removedAt: { $gt: l.startsAt } }] }).populate('customer', 'customerNo nameAr owner team').lean(),
        LectureAttendance.find({ lecture: l._id }).lean(),
        getSetting('customers.lookupNamePolicy')
    ]);
    const bySeat = Object.fromEntries(seats.map((s) => [String(s.customer), s]));
    res.json({
        lecture: { _id: l._id, titleAr: l.titleAr, titleEn: l.titleEn, startsAt: l.startsAt, durationMin: l.durationMin, managed: l.zoom.managed, syncedAt: l.attendanceSyncedAt },
        items: members.filter((m) => m.customer).map((m) => {
            const s = bySeat[String(m.customer._id)] || {};
            const access = customerAccess({ actor: req.user, grants: req.user.grants, customer: m.customer });
            return {
                customer: { _id: m.customer._id, customerNo: m.customer.customerNo, name: displayName(m.customer, access, namePolicy) },
                present: !!s.present, minutes: s.minutes || 0, clicks: s.clicks || 0, source: s.source || 'none', joinedAt: s.joinedAt || null
            };
        })
    });
};

// Staff mark attendance by hand (lectures without Zoom data, or a correction)
exports.markAttendance = async (req, res) => {
    const l = await loadLecture(req.params.id);
    const customer = oid(req.body.customer);
    if (!customer || !(await CohortMember.exists({ cohort: l.cohort, customer }))) throw new HttpError(400, 'العميل ليس في المجموعة. / The customer is not in the group.');
    const present = req.body.present === true;
    await LectureAttendance.updateOne({ lecture: l._id, customer }, { $set: { cohort: l.cohort, present, source: 'manual', markedBy: req.user.id } }, { upsert: true });
    await audit.record(req, { action: 'lecture.attendance_marked', resource: 'programs', resourceId: l._id, summary: `${l.titleAr}: ${present ? 'present' : 'absent'}`, meta: { customer: String(customer) } });
    res.json({ ok: true });
};

exports.zoomStatus = async (req, res) => {
    if (!zoom.isConfigured()) return res.json({ configured: false });
    try {
        const me = await zoom.testConnection();
        res.json({ configured: true, ok: true, email: me.email, licensed: me.type === 2 });
    } catch (err) {
        res.json({ configured: true, ok: false, error: err.message });
    }
};

// A customer's groups, for the customer file
exports.forCustomer = async (req, res) => {
    const customer = await Customer.findById(req.params.id).select('owner team');
    if (!customer) throw new HttpError(404, 'Not found.');
    if (!customerAccess({ actor: req.user, grants: req.user.grants, customer }).inFile) throw new HttpError(404, 'Not found.');
    const rows = await CohortMember.find({ customer: customer._id }).populate({ path: 'cohort', select: 'nameAr nameEn startDate endDate status program', populate: { path: 'program', select: 'titleAr titleEn' } }).sort({ addedAt: -1 }).lean();
    const items = [];
    for (const r of rows) {
        if (!r.cohort) continue;
        const stats = await attendanceStats(r.cohort._id);
        const s = stats.byCustomer[String(customer._id)];
        items.push({ _id: r._id, cohort: r.cohort, status: r.status, addedAt: r.addedAt, removeReason: r.removeReason, held: stats.held, attended: s ? s.n : 0, rate: L.attendanceRate(s ? s.n : 0, stats.held) });
    }
    res.json({ items });
};

// ---- the customer's own lectures ----

exports.mine = async (req, res) => {
    const files = await groups.customerIdsOfUser(req.user.id);
    const memberships = await CohortMember.find({ customer: { $in: files }, status: 'active' }).lean();
    const cohortIds = memberships.map((m) => m.cohort);
    const [cohorts, lectures, seats] = await Promise.all([
        Cohort.find({ _id: { $in: cohortIds }, status: { $ne: 'cancelled' } }).populate('program', 'titleAr titleEn').populate('modules', 'titleAr titleEn order').lean(),
        Lecture.find({ cohort: { $in: cohortIds } }).populate('module', 'titleAr titleEn').sort({ startsAt: 1 }).lean(),
        LectureAttendance.find({ customer: { $in: files }, cohort: { $in: cohortIds } }).select('lecture present minutes').lean()
    ]);
    const mySeat = Object.fromEntries(seats.map((s) => [String(s.lecture), s]));
    const now = new Date();
    res.json({
        now,
        groups: cohorts.map((c) => ({
            _id: c._id, nameAr: c.nameAr, nameEn: c.nameEn, instructor: c.instructor, schedule: c.schedule, startDate: c.startDate, endDate: c.endDate,
            program: c.program, modules: c.modules,
            lectures: lectures.filter((l) => String(l.cohort) === String(c._id)).map((l) => {
                const state = L.joinState(l, now);
                const seat = mySeat[String(l._id)];
                return {
                    _id: l._id, titleAr: l.titleAr, titleEn: l.titleEn, module: l.module, startsAt: l.startsAt, durationMin: l.durationMin, endsAt: L.endOf(l),
                    state, cancelReason: l.status === 'cancelled' ? l.cancelReason : undefined,
                    hasLink: !!(l.zoom.joinUrl || l.zoom.managed),
                    // A personal Zoom link carries the passcode; the passcode is still shown in case Zoom asks
                    passcode: state === 'cancelled' ? '' : l.zoom.passcode,
                    recordings: state === 'ended' ? l.recordings.map((r) => ({ _id: r._id, title: r.title, url: r.url, passcode: r.passcode })) : [],
                    materials: l.materials,
                    attended: seat ? { present: seat.present, minutes: seat.minutes } : null
                };
            })
        }))
    });
};

// The customer presses "join": membership and time are checked, the click recorded, and the
// customer gets the Zoom link (their personal one when the meeting uses registration)
exports.join = async (req, res) => {
    const l = await loadLecture(req.params.id);
    const files = await groups.customerIdsOfUser(req.user.id);
    const member = await CohortMember.findOne({ cohort: l.cohort, customer: { $in: files }, status: 'active' });
    if (!member) throw new HttpError(404, 'Not found.');
    if (!L.canJoinAt(l)) {
        throw new HttpError(409, l.status === 'cancelled' ? 'المحاضرة ملغاة. / The lecture is cancelled.' : 'الدخول متاح قبل المحاضرة بربع ساعة. / Joining opens 15 minutes before the lecture.', 'NOT_OPEN');
    }
    const now = new Date();
    const seat = await LectureAttendance.findOneAndUpdate(
        { lecture: l._id, customer: member.customer },
        { $set: { cohort: l.cohort, lastClickAt: now }, $setOnInsert: { firstClickAt: now }, $inc: { clicks: 1 } },
        { upsert: true, new: true }
    );
    let url = l.zoom.joinUrl;
    if (l.zoom.managed && l.zoom.registration && zoom.isConfigured()) {
        if (seat.personalJoinUrl) url = seat.personalJoinUrl;
        else {
            const customer = await Customer.findById(member.customer).select('nameAr nameEn contact.email');
            const user = await User.findById(req.user.id).select('email name');
            const email = (customer.contact && customer.contact.email) || (user && user.email);
            if (email) {
                try {
                    const r = await zoom.addRegistrant(l.zoom.meetingId, { email, ...L.splitName(customer.nameEn || customer.nameAr || (user && user.name)) });
                    seat.registrantId = String(r.registrant_id || '');
                    seat.personalJoinUrl = r.join_url || '';
                    await seat.save();
                    if (r.join_url) url = r.join_url;
                } catch (err) {
                    // The general link still works; staff see the error on the lecture
                    await Lecture.updateOne({ _id: l._id }, { $set: { 'zoom.lastError': `Registrant: ${err.message}`.slice(0, 500) } });
                }
            }
        }
    }
    if (!url) throw new HttpError(409, 'رابط المحاضرة لم يُضف بعد. / The lecture link has not been added yet.', 'NO_LINK');
    res.json({ url, passcode: l.zoom.passcode });
};
