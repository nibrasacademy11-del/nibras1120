const crypto = require('crypto');

// Attendance rules. Pure functions so they can be unit tested.
// Times are evaluated in the academy's time zone (default Africa/Cairo), whatever the server's zone.

const STEP_MS = 30 * 1000;   // the kiosk QR changes every 30 seconds

// The local date (YYYY-MM-DD), weekday (0 = Sunday) and minutes since midnight of a moment
function localParts(date, timeZone = 'Africa/Cairo') {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
    }).formatToParts(new Date(date)).map((p) => [p.type, p.value]));
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

// The UTC moment of a local date and time (YYYY-MM-DD, HH:MM) in the academy's zone
function localToUtc(ymd, hhmm, timeZone = 'Africa/Cairo') {
    const guess = new Date(`${ymd}T${hhmm}:00Z`);
    const p = localParts(guess, timeZone);
    const dayShift = p.date === ymd ? 0 : p.date > ymd ? 1440 : -1440;
    const offset = p.minutes + dayShift - toMinutes(hhmm);
    return new Date(guess.getTime() - offset * 60000);
}

const weekdayOf = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

// The status of one employee on one day.
// shift: { days, start, end, graceMinutes, earlyLeaveGraceMinutes }
// record: { checkInAt, checkOutAt } or null; leave: { type, hours } or null
function evaluateDay({ ymd, shift, record, leave, holiday, today, timeZone = 'Africa/Cairo' }) {
    const working = shift && (shift.days || []).includes(weekdayOf(ymd));
    const out = { date: ymd, status: '', lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0, checkIn: null, checkOut: null };
    if (record && record.checkInAt) {
        const inP = localParts(record.checkInAt, timeZone);
        out.checkIn = record.checkInAt;
        const start = toMinutes(shift?.start);
        const end = toMinutes(shift?.end);
        const late = inP.minutes - start;
        out.lateMinutes = working && late > (shift.graceMinutes || 0) ? late : 0;
        if (record.checkOutAt) {
            out.checkOut = record.checkOutAt;
            out.workedMinutes = Math.max(0, Math.round((new Date(record.checkOutAt) - new Date(record.checkInAt)) / 60000));
            const early = end - localParts(record.checkOutAt, timeZone).minutes;
            out.earlyLeaveMinutes = working && early > (shift.earlyLeaveGraceMinutes || 0) ? early : 0;
        }
        // An approved permission (استئذان) excuses lateness or leaving early up to its hours
        if (leave && leave.type === 'permission') {
            const excused = Math.round((leave.hours || 0) * 60);
            const lateCut = Math.min(out.lateMinutes, excused);
            out.lateMinutes -= lateCut;
            out.earlyLeaveMinutes = Math.max(0, out.earlyLeaveMinutes - (excused - lateCut));
        }
        out.status = !working ? 'extra' : out.lateMinutes > 0 ? 'late' : 'present';
        return out;
    }
    if (holiday) out.status = 'holiday';
    else if (leave && leave.type !== 'permission') out.status = 'leave';
    else if (!working) out.status = 'weekend';
    else if (ymd < today) out.status = 'absent';
    else out.status = 'pending';
    return out;
}

// Month summary from evaluated days
function summarize(days) {
    const s = { workingDays: 0, present: 0, late: 0, absent: 0, leave: 0, holiday: 0, extra: 0, lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0 };
    for (const d of days) {
        if (['present', 'late', 'absent', 'leave'].includes(d.status)) s.workingDays += 1;
        if (d.status === 'present' || d.status === 'late') s.present += 1;
        if (s[d.status] !== undefined && d.status !== 'present') s[d.status] += 1;
        s.lateMinutes += d.lateMinutes;
        s.earlyLeaveMinutes += d.earlyLeaveMinutes;
        s.workedMinutes += d.workedMinutes;
    }
    return s;
}

function daysOfMonth(month) {
    const [y, m] = month.split('-').map(Number);
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

// ---- kiosk QR tokens ----

const stepAt = (t = Date.now()) => Math.floor(t / STEP_MS);

function stationToken(secret, stationId, step) {
    return crypto.createHmac('sha256', secret).update(`${stationId}:${step}`).digest('base64url').slice(0, 22);
}

// A code is accepted for its own 30 seconds and the next 60, so a phone that scanned just
// before the change still gets through, but a photo of the code is useless a minute later
function verifyStationToken(secret, stationId, token, step, now = Date.now()) {
    const current = stepAt(now);
    const s = Number(step);
    if (!Number.isInteger(s) || s > current || current - s > 2) return false;
    const expected = stationToken(secret, stationId, s);
    const a = Buffer.from(expected);
    const b = Buffer.from(String(token || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- signed tokens shared with the local server (device pairing and sync) ----

function sign(secret, payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${mac}`;
}

function verify(secret, token) {
    const [body, mac] = String(token || '').split('.');
    if (!body || !mac) return null;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
    try {
        return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
}

function signBody(secret, rawBody) {
    return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

module.exports = { STEP_MS, localParts, localToUtc, toMinutes, weekdayOf, evaluateDay, summarize, daysOfMonth, stepAt, stationToken, verifyStationToken, sign, verify, signBody };
