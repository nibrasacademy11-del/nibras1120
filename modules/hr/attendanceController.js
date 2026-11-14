const crypto = require('crypto');
const mongoose = require('mongoose');
const A = require('../../models/attendance');
const Employee = require('../../models/Employee');
const User = require('../../models/User');
const P = require('../../lib/permissions');
const rules = require('../../lib/attendance');
const audit = require('../../lib/audit');
const { teamOf } = require('../../lib/teams');
const { HttpError, assertVersion, clientIp, clientAgent } = require('../../lib/http');
const { getSetting, notify } = require('../crm/service');

// Attendance: kiosk QR codes, scans, the day and month views, corrections, leaves,
// shifts, holidays, stations, and scans synced from the academy's local server

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const tz = () => getSetting('attendance.timeZone');
const FIELDS = { owner: 'user', team: 'team' };
const DEFAULT_SHIFT = { name: 'Default', days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00', graceMinutes: 15, earlyLeaveGraceMinutes: 5 };

const syncSecret = () => {
    const s = process.env.ATTENDANCE_SYNC_SECRET;
    if (!s || s.length < 32) throw new HttpError(503, 'الحضور المحلي غير مُعد على السيرفر. / Offline attendance is not configured on the server.', 'NOT_CONFIGURED');
    return s;
};

// ---- recording a scan ----

async function punch({ userId, at, method, station, ip, device, syncId }) {
    const timeZone = await tz();
    const { date } = rules.localParts(at, timeZone);
    const team = await teamOf(userId);
    const rec = await A.AttendanceRecord.findOneAndUpdate(
        { user: userId, date },
        { $setOnInsert: { user: userId, date, team } },
        { upsert: true, new: true }
    );
    if (syncId && rec.syncIds.includes(syncId)) return { record: rec, action: 'duplicate' };
    const p = { at, method, station: station || null, ip, device: String(device || '').slice(0, 200) };
    let action;
    if (!rec.checkIn || new Date(at) < new Date(rec.checkIn.at)) {
        // An earlier scan synced late from the local server becomes the check-in
        if (rec.checkIn && !rec.checkOut) rec.checkOut = rec.checkIn;
        rec.checkIn = p;
        action = 'check_in';
    } else if (new Date(at) - new Date(rec.checkIn.at) < 5 * 60 * 1000 && !rec.checkOut) {
        action = 'already_in';   // a second scan within 5 minutes is a double tap, not a check-out
    } else if (!rec.checkOut || new Date(at) > new Date(rec.checkOut.at)) {
        rec.checkOut = p;
        action = 'check_out';
    } else action = 'ignored';
    rec.scans += 1;
    if (syncId) rec.syncIds.push(syncId);
    await rec.save();
    return { record: rec, action };
}

// The kiosk screen asks for the current code with its key; no sign-in is involved
exports.kiosk = async (req, res) => {
    const station = await A.AttendanceStation.findById(req.params.id);
    if (!station || !station.active || station.keyHash !== sha(req.query.key || '')) throw new HttpError(404, 'Not found.');
    const step = rules.stepAt();
    const token = rules.stationToken(station.secret, String(station._id), step);
    const origin = `${req.protocol}://${req.get('host')}`;
    A.AttendanceStation.updateOne({ _id: station._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        name: station.name, location: station.location, step, token,
        url: `${origin}/portal/attend?s=${station._id}&t=${token}&w=${step}`,
        refreshInMs: rules.STEP_MS - (Date.now() % rules.STEP_MS)
    });
};

exports.scan = async (req, res) => {
    const station = await A.AttendanceStation.findById(oid(req.body.station));
    if (!station || !station.active) throw new HttpError(400, 'رمز غير صالح. / Invalid code.', 'BAD_CODE');
    if (!rules.verifyStationToken(station.secret, String(station._id), req.body.token, req.body.step)) {
        throw new HttpError(400, 'انتهت صلاحية الرمز. امسح الرمز الظاهر على الشاشة الآن. / The code expired; scan the code on the screen now.', 'EXPIRED_CODE');
    }
    const ip = clientIp(req);
    if (station.allowedIps.length && !station.allowedIps.includes(ip)) {
        throw new HttpError(403, 'يجب أن تكون متصلاً بشبكة الأكاديمية. / Connect to the academy network to record attendance.', 'WRONG_NETWORK');
    }
    const out = await punch({ userId: oid(req.user.id), at: new Date(), method: 'qr', station: station._id, ip, device: clientAgent(req) });
    res.json({ action: out.action, checkIn: out.record.checkIn?.at || null, checkOut: out.record.checkOut?.at || null, date: out.record.date });
};

// Pairs a phone with the local server: a signed token the local server can check without internet
exports.deviceToken = async (req, res) => {
    const secret = syncSecret();
    const token = rules.sign(secret, { u: req.user.id, n: req.user.name, iat: Date.now() });
    await audit.record(req, { action: 'attendance.device_paired', resource: 'attendance', resourceId: req.user.id, summary: 'Phone paired with the local attendance server' });
    res.json({ token });
};

// The local server sends the scans it recorded, signed with the shared secret. Each scan has its own
// id, so sending the same batch twice changes nothing. Scans of disabled accounts are refused.
exports.sync = async (req, res) => {
    const secret = syncSecret();
    const signature = String(req.get('x-nibras-signature') || '');
    const expected = rules.signBody(secret, JSON.stringify(req.body));
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return res.status(401).json({ message: 'Bad signature.' });
    }
    const scans = Array.isArray(req.body.scans) ? req.body.scans.slice(0, 2000) : [];
    const accepted = [];
    const rejected = [];
    const users = await User.find({ _id: { $in: scans.map((s) => oid(s.user)).filter(Boolean) } }).select('status role').lean();
    const ok = new Set(users.filter((u) => u.status !== 'disabled' && P.isStaffRole(u.role)).map((u) => String(u._id)));
    for (const s of scans) {
        const at = new Date(s.at);
        if (!s.id || !ok.has(String(s.user)) || Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 10 * 60 * 1000 || Date.now() - at.getTime() > 45 * 864e5) {
            rejected.push({ id: s.id, reason: 'invalid' });
            continue;
        }
        await punch({ userId: oid(s.user), at, method: 'local', ip: 'local', device: `${str(req.body.server, 60)} ${str(s.device, 100)}`, syncId: String(s.id).slice(0, 64) });
        accepted.push(s.id);
    }
    res.json({ accepted, rejected, revoked: [...new Set(scans.map((s) => String(s.user)))].filter((u) => !ok.has(u)), serverTime: new Date() });
};

// ---- day and month ----

async function shiftsFor(userIds) {
    const [emps, shifts] = await Promise.all([
        Employee.find({ user: { $in: userIds } }).select('user shift nameAr team').populate('team', 'nameAr').lean(),
        A.Shift.find({ active: true }).lean()
    ]);
    const def = shifts.find((s) => s.isDefault) || DEFAULT_SHIFT;
    const byId = Object.fromEntries(shifts.map((s) => [String(s._id), s]));
    return Object.fromEntries(emps.map((e) => [String(e.user), { shift: (e.shift && byId[String(e.shift)]) || def, name: e.nameAr, team: e.team?.nameAr || '' }]));
}

async function evaluate(userIds, month) {
    const timeZone = await tz();
    const days = rules.daysOfMonth(month);
    const today = rules.localParts(new Date(), timeZone).date;
    const [records, leaves, holidays, info] = await Promise.all([
        A.AttendanceRecord.find({ user: { $in: userIds }, date: { $gte: days[0], $lte: days[days.length - 1] } }).lean(),
        A.LeaveRequest.find({ user: { $in: userIds }, status: 'approved', from: { $lte: days[days.length - 1] }, to: { $gte: days[0] } }).lean(),
        A.Holiday.find({ date: { $gte: days[0], $lte: days[days.length - 1] } }).lean(),
        shiftsFor(userIds)
    ]);
    const holidayOn = Object.fromEntries(holidays.map((h) => [h.date, h]));
    return userIds.map((uid) => {
        const u = String(uid);
        const shift = info[u]?.shift || DEFAULT_SHIFT;
        const list = days.map((ymd) => {
            const rec = records.find((r) => String(r.user) === u && r.date === ymd);
            const leave = leaves.find((l) => String(l.user) === u && l.from <= ymd && l.to >= ymd);
            const day = rules.evaluateDay({ ymd, shift, record: rec ? { checkInAt: rec.checkIn?.at, checkOutAt: rec.checkOut?.at } : null, leave, holiday: holidayOn[ymd], today, timeZone });
            if (leave) day.leaveType = leave.type;
            if (holidayOn[ymd]) day.holiday = holidayOn[ymd].nameAr;
            if (rec?.corrections?.length) day.corrected = true;
            return day;
        });
        return { user: u, name: info[u]?.name || '', team: info[u]?.team || '', shift: { name: shift.name, start: shift.start, end: shift.end }, days: list, summary: rules.summarize(list) };
    });
}

const monthOf = (q) => (/^\d{4}-\d{2}$/.test(String(q || '')) ? String(q) : new Date().toISOString().slice(0, 7));

exports.myMonth = async (req, res) => {
    const [me] = await evaluate([oid(req.user.id)], monthOf(req.query.month));
    res.json(me);
};

async function staffInScope(req) {
    const filter = { status: 'active', ...P.scopeFilter(req.scope, req.user, FIELDS) };
    if (oid(req.query.team)) filter.team = oid(req.query.team);
    return Employee.find(filter).select('user nameAr team').populate('team', 'nameAr').lean();
}

exports.month = async (req, res) => {
    const month = monthOf(req.query.month);
    let ids = (await staffInScope(req)).map((e) => e.user);
    if (oid(req.query.user)) ids = ids.filter((u) => String(u) === String(req.query.user));
    const rows = await evaluate(ids, month);
    res.json({ month, items: oid(req.query.user) ? rows : rows.map(({ days, ...r }) => r) });
};

// Who is in the academy right now, who left, and who has not come in yet
exports.today = async (req, res) => {
    const timeZone = await tz();
    const today = rules.localParts(new Date(), timeZone).date;
    const staff = await staffInScope(req);
    const [records, info, leaves] = await Promise.all([
        A.AttendanceRecord.find({ date: today, user: { $in: staff.map((e) => e.user) } }).lean(),
        shiftsFor(staff.map((e) => e.user)),
        A.LeaveRequest.find({ status: 'approved', from: { $lte: today }, to: { $gte: today }, user: { $in: staff.map((e) => e.user) } }).lean()
    ]);
    const items = staff.map((e) => {
        const r = records.find((x) => String(x.user) === String(e.user));
        const leave = leaves.find((l) => String(l.user) === String(e.user));
        const shift = info[String(e.user)]?.shift || DEFAULT_SHIFT;
        const day = rules.evaluateDay({ ymd: today, shift, record: r ? { checkInAt: r.checkIn?.at, checkOutAt: r.checkOut?.at } : null, leave, today, timeZone });
        const state = r?.checkIn ? (r.checkOut ? 'left' : 'in') : leave && leave.type !== 'permission' ? 'leave' : day.status === 'weekend' ? 'off' : 'not_in';
        return { user: String(e.user), name: e.nameAr, team: e.team?.nameAr || '', state, checkIn: r?.checkIn?.at || null, checkOut: r?.checkOut?.at || null, lateMinutes: day.lateMinutes, method: r?.checkIn?.method || null };
    });
    const count = (s) => items.filter((i) => i.state === s).length;
    res.json({ date: today, counts: { in: count('in'), left: count('left'), not_in: count('not_in'), leave: count('leave'), late: items.filter((i) => i.lateMinutes > 0).length }, items });
};

// HR fixes a missed or wrong scan; the old value and the reason stay on the record
exports.correct = async (req, res) => {
    const user = await User.findById(oid(req.body.user)).select('name');
    if (!user) throw new HttpError(400, 'اختر الموظف. / Choose the employee.');
    const date = String(req.body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Invalid date.');
    const field = req.body.field === 'checkOut' ? 'checkOut' : 'checkIn';
    const reason = str(req.body.reason);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    const time = String(req.body.time || '');
    if (!/^\d{2}:\d{2}$/.test(time)) throw new HttpError(400, 'Invalid time.');
    // Build the moment from the local date and time in the academy's zone
    const timeZone = await tz();
    const at = rules.localToUtc(date, time, timeZone);
    if (at > new Date()) throw new HttpError(400, 'لا يمكن تسجيل وقت مستقبلي. / The time cannot be in the future.');
    const rec = await A.AttendanceRecord.findOneAndUpdate({ user: user._id, date }, { $setOnInsert: { user: user._id, date, team: await teamOf(user._id) } }, { upsert: true, new: true });
    const before = rec[field]?.at || null;
    rec[field] = { at, method: 'manual', ip: clientIp(req), device: `by ${req.user.name}` };
    rec.corrections.push({ at: new Date(), by: req.user.id, byName: req.user.name, field, from: before, to: at, reason });
    if (rec.checkIn && rec.checkOut && rec.checkOut.at < rec.checkIn.at) throw new HttpError(400, 'وقت الانصراف قبل الحضور. / Check-out is before check-in.');
    await rec.save();
    await audit.record(req, { action: 'attendance.corrected', resource: 'attendance', resourceId: rec._id, summary: `${user.name} ${date} ${field} ${time}`, reason, changes: { [field]: { from: before, to: at } } });
    await notify(user._id, { type: 'attendance', titleAr: `تم تعديل حضورك يوم ${date}`, titleEn: `Your attendance on ${date} was corrected`, bodyAr: reason, bodyEn: reason, link: '/attendance' });
    res.json({ item: rec });
};

// ---- leaves ----

exports.listLeaves = async (req, res) => {
    const box = String(req.query.box || 'mine');
    let filter;
    if (box === 'mine') filter = { user: req.user.id };
    else {
        const scope = P.scopeFor(req.user.grants, 'leaves.approve');
        if (!scope) throw new HttpError(403, 'Forbidden.');
        filter = { ...P.scopeFilter(scope, req.user, FIELDS), user: { $ne: oid(req.user.id) } };
    }
    if (req.query.status) filter.status = String(req.query.status);
    const items = await A.LeaveRequest.find(filter).populate('user', 'name').populate('decidedBy', 'name').sort({ createdAt: -1 }).limit(300).lean();
    res.json({ items });
};

exports.requestLeave = async (req, res) => {
    const type = A.LeaveRequest.TYPES.includes(req.body.type) ? req.body.type : null;
    if (!type) throw new HttpError(400, 'اختر النوع. / Choose the type.');
    const from = String(req.body.from || '');
    const to = type === 'permission' ? from : String(req.body.to || from);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new HttpError(400, 'تحقق من التواريخ. / Check the dates.');
    const hours = type === 'permission' ? Math.min(Math.max(Number(req.body.hours) || 0, 0.5), 8) : 0;
    const overlap = await A.LeaveRequest.exists({ user: req.user.id, status: { $in: ['pending', 'approved'] }, from: { $lte: to }, to: { $gte: from }, type: type === 'permission' ? 'permission' : { $ne: 'permission' } });
    if (overlap) throw new HttpError(409, 'لديك طلب في نفس الفترة. / You already have a request for these dates.', 'DUPLICATE');
    const team = await teamOf(req.user.id);
    const l = await A.LeaveRequest.create({ user: req.user.id, team, type, from, to, hours, reason: str(req.body.reason, 500) });
    // The team leader decides; without a team, HR does
    const Team = require('../../models/Team');
    const leader = team ? (await Team.findById(team).select('leader').lean())?.leader : null;
    const message = { type: 'leave', titleAr: `طلب ${type === 'permission' ? 'استئذان' : 'إجازة'} من ${req.user.name}`, titleEn: `${type === 'permission' ? 'Permission' : 'Leave'} request from ${req.user.name}`, bodyAr: `${from}${to !== from ? ` → ${to}` : ''}`, bodyEn: `${from}${to !== from ? ` → ${to}` : ''}`, link: '/leaves' };
    if (leader && String(leader) !== req.user.id) await notify(leader, message);
    else {
        const hr = await User.find({ role: 'super_admin', status: 'active' }).select('_id').lean();
        for (const u of hr) if (String(u._id) !== req.user.id) await notify(u._id, message);
    }
    await audit.record(req, { action: 'leave.requested', resource: 'leaves', resourceId: l._id, summary: `${type} ${from}→${to}` });
    res.status(201).json({ item: l });
};

exports.decideLeave = async (req, res) => {
    const l = await A.LeaveRequest.findById(req.params.id);
    if (!l) throw new HttpError(404, 'Not found.');
    const scope = P.scopeFor(req.user.grants, 'leaves.approve');
    if (!scope || !P.recordInScope(scope, req.user, l, FIELDS) || String(l.user) === req.user.id) throw new HttpError(403, 'Forbidden.');
    if (l.status !== 'pending') throw new HttpError(400, 'تم البت في الطلب. / Already decided.');
    assertVersion(l, req.body.__v);
    const approve = req.body.decision === 'approve';
    const note = str(req.body.note);
    if (!approve && !note) throw new HttpError(400, 'سبب الرفض مطلوب. / A reason is required.', 'REASON_REQUIRED');
    l.status = approve ? 'approved' : 'rejected';
    l.decidedBy = req.user.id;
    l.decidedAt = new Date();
    l.decisionNote = note;
    await l.save();
    await audit.record(req, { action: `leave.${l.status}`, resource: 'leaves', resourceId: l._id, summary: `${l.type} ${l.from}→${l.to}`, reason: note });
    await notify(l.user, { type: 'leave', titleAr: `${approve ? 'تمت الموافقة على' : 'تم رفض'} طلبك (${l.from})`, titleEn: `Your request (${l.from}) was ${approve ? 'approved' : 'rejected'}`, bodyAr: note, bodyEn: note, link: '/leaves' });
    res.json({ item: l });
};

exports.cancelLeave = async (req, res) => {
    const l = await A.LeaveRequest.findOne({ _id: req.params.id, user: req.user.id });
    if (!l || !['pending', 'approved'].includes(l.status)) throw new HttpError(404, 'Not found.');
    const today = rules.localParts(new Date(), await tz()).date;
    if (l.status === 'approved' && l.from <= today) throw new HttpError(400, 'لا يمكن إلغاء إجازة بدأت. / A leave that started cannot be cancelled.');
    l.status = 'cancelled';
    await l.save();
    res.json({ item: l });
};

// ---- setup: shifts, holidays, stations ----

exports.listShifts = async (req, res) => res.json({ items: await A.Shift.find().sort({ isDefault: -1, name: 1 }).lean(), timeZone: await tz() });

exports.saveShift = async (req, res) => {
    const days = (Array.isArray(req.body.days) ? req.body.days : []).map(Number).filter((d) => d >= 0 && d <= 6);
    const data = { name: str(req.body.name, 80), days: [...new Set(days)], start: String(req.body.start || ''), end: String(req.body.end || ''), graceMinutes: Number(req.body.graceMinutes) || 0, earlyLeaveGraceMinutes: Number(req.body.earlyLeaveGraceMinutes) || 0, isDefault: req.body.isDefault === true, active: req.body.active !== false };
    if (!data.name || !/^\d{2}:\d{2}$/.test(data.start) || !/^\d{2}:\d{2}$/.test(data.end) || !data.days.length) throw new HttpError(400, 'الاسم والأيام والمواعيد مطلوبة. / Name, days and times are required.');
    let doc;
    if (req.params.id) {
        doc = await A.Shift.findById(req.params.id);
        if (!doc) throw new HttpError(404, 'Not found.');
        assertVersion(doc, req.body.__v);
        doc.set(data);
        await doc.save();
    } else doc = await A.Shift.create(data);
    if (doc.isDefault) await A.Shift.updateMany({ _id: { $ne: doc._id } }, { $set: { isDefault: false } });
    await audit.record(req, { action: 'attendance.shift_saved', resource: 'attendance', resourceId: doc._id, summary: `${doc.name} ${doc.start}-${doc.end}` });
    res.json({ item: doc });
};

exports.listHolidays = async (req, res) => res.json({ items: await A.Holiday.find().sort({ date: -1 }).limit(200).lean() });

exports.addHoliday = async (req, res) => {
    const date = String(req.body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !str(req.body.nameAr)) throw new HttpError(400, 'التاريخ والاسم مطلوبان. / Date and name are required.');
    const h = await A.Holiday.findOneAndUpdate({ date }, { date, nameAr: str(req.body.nameAr, 120), nameEn: str(req.body.nameEn, 120) }, { upsert: true, new: true });
    await audit.record(req, { action: 'attendance.holiday_saved', resource: 'attendance', resourceId: date, summary: h.nameAr });
    res.json({ item: h });
};

exports.removeHoliday = async (req, res) => {
    const h = await A.Holiday.findOneAndDelete({ date: String(req.params.date) });
    if (!h) throw new HttpError(404, 'Not found.');
    await audit.record(req, { action: 'attendance.holiday_removed', resource: 'attendance', resourceId: h.date, summary: h.nameAr });
    res.json({ ok: true });
};

exports.listStations = async (req, res) => {
    res.json({ items: await A.AttendanceStation.find().select('-secret -keyHash').sort({ name: 1 }).lean() });
};

// Creating a station (or asking for a new key) shows the kiosk link once; only its hash is stored
exports.saveStation = async (req, res) => {
    const data = {
        name: str(req.body.name, 80),
        location: str(req.body.location, 160),
        allowedIps: (Array.isArray(req.body.allowedIps) ? req.body.allowedIps : String(req.body.allowedIps || '').split(/[\s,]+/)).map((x) => String(x).trim()).filter((x) => /^[0-9a-f.:]+$/i.test(x)).slice(0, 20),
        active: req.body.active !== false
    };
    if (!data.name) throw new HttpError(400, 'الاسم مطلوب. / A name is required.');
    let station;
    let key = null;
    if (req.params.id) {
        station = await A.AttendanceStation.findById(req.params.id);
        if (!station) throw new HttpError(404, 'Not found.');
        station.set(data);
        if (req.body.newKey === true) {
            key = crypto.randomBytes(24).toString('base64url');
            station.keyHash = sha(key);
            station.secret = crypto.randomBytes(32).toString('hex');
        }
        await station.save();
    } else {
        key = crypto.randomBytes(24).toString('base64url');
        station = await A.AttendanceStation.create({ ...data, keyHash: sha(key), secret: crypto.randomBytes(32).toString('hex') });
    }
    await audit.record(req, { action: key ? 'attendance.station_key_issued' : 'attendance.station_updated', resource: 'attendance', resourceId: station._id, summary: station.name });
    const origin = `${req.protocol}://${req.get('host')}`;
    res.json({ item: { _id: station._id, name: station.name, location: station.location, allowedIps: station.allowedIps, active: station.active }, kioskUrl: key ? `${origin}/portal/kiosk/${station._id}?key=${key}` : null });
};

exports._punch = punch;
exports._evaluate = evaluate;
