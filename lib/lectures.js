// Training groups and lectures: rules that need no database, so they can be unit tested.

const data = require('./customerData');
const fieldCrypto = require('./fieldCrypto');

// The "join" button shows from 15 minutes before the start until 30 minutes after the end.
// The server accepts a little more on both sides, so a slow clock on a phone does not block anyone.
const SHOW_BEFORE_MIN = 15;
const SHOW_AFTER_MIN = 30;
const ACCEPT_BEFORE_MIN = 60;
const ACCEPT_AFTER_MIN = 120;
const MAX_LINES = 2000;

const minutes = (n) => n * 60 * 1000;

function endOf(lecture) {
    return new Date(new Date(lecture.startsAt).getTime() + minutes(lecture.durationMin || 0));
}

// What the member sees for a lecture right now
function joinState(lecture, now = new Date()) {
    if (lecture.status === 'cancelled') return 'cancelled';
    const start = new Date(lecture.startsAt).getTime();
    const end = endOf(lecture).getTime();
    const t = now.getTime();
    if (t < start - minutes(SHOW_BEFORE_MIN)) return 'upcoming';
    if (t <= end + minutes(SHOW_AFTER_MIN)) return 'open';
    return 'ended';
}

// Whether the server lets a member join now
function canJoinAt(lecture, now = new Date()) {
    if (lecture.status === 'cancelled') return false;
    const start = new Date(lecture.startsAt).getTime();
    const t = now.getTime();
    return t >= start - minutes(ACCEPT_BEFORE_MIN) && t <= endOf(lecture).getTime() + minutes(ACCEPT_AFTER_MIN);
}

// ---- the learning path (PLAN-V2 decisions 3 to 5) ----
// Every lecture is open to the group's members from the start, in any order, and a missed live
// lecture keeps its link. Entering (pressing "join") is what counts, once the lecture's time has
// come: a click days before opens Zoom but is not counted, so a module cannot be "finished" on
// day one by clicking every link.
const customerCanJoin = (lecture) => lecture.status !== 'cancelled';
function entryCounts(lecture, now = new Date()) {
    if (lecture.status === 'cancelled') return false;
    return now.getTime() >= new Date(lecture.startsAt).getTime() - minutes(SHOW_BEFORE_MIN);
}

// Each module's lectures and how many the customer entered. modules: the enrollment's modules
// [{ module }]; lectures: the group's lectures [{ _id, module, status }]; entered: a Set of lecture
// ids. A lecture without a module belongs to the only module of a one-module program (a course).
function lectureProgress(modules, lectures, entered) {
    const only = modules.length === 1 ? String(modules[0].module) : null;
    const rows = {};
    for (const m of modules) rows[String(m.module)] = { total: 0, entered: 0, percent: 0, complete: false };
    for (const l of lectures) {
        if (l.status === 'cancelled') continue;
        const key = l.module ? String(l.module) : only;
        if (!key || !rows[key]) continue;
        rows[key].total += 1;
        if (entered.has(String(l._id))) rows[key].entered += 1;
    }
    for (const r of Object.values(rows)) {
        r.percent = r.total ? Math.round((Math.min(r.entered, r.total) / r.total) * 100) : 0;
        r.complete = r.total > 0 && r.entered >= r.total;
    }
    return rows;
}

// The program's percent: the average of its required modules (all modules when none is
// required); a module already completed counts as 100
function programPercent(modules, rows, done = ['approved', 'certificate_issued']) {
    const counted = modules.some((m) => m.required !== false) ? modules.filter((m) => m.required !== false) : modules;
    if (!counted.length) return 0;
    const sum = counted.reduce((a, m) => a + (done.includes(m.status) ? 100 : (rows[String(m.module)] || {}).percent || 0), 0);
    return Math.round(sum / counted.length);
}

// The next lecture to attend: the first one not cancelled that has not ended yet
function nextLecture(lectures, now = new Date()) {
    return lectures
        .filter((l) => l.status !== 'cancelled' && endOf(l) > now)
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0] || null;
}

// One pasted line becomes the lookups to try. A line of digits can be a national ID, a passport
// or a phone number, so all of them are tried; the staff member sees which one matched.
function classifyLine(raw) {
    const value = String(raw || '').replace(/[‎‏‪-‮]/g, '').trim();
    if (!value) return null;
    const ascii = value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
    if (/^NB-?\d{1,9}$/i.test(ascii)) {
        const n = ascii.replace(/\D/g, '');
        return { raw: value, lookups: [{ kind: 'customer_no', value: `NB-${n.padStart(6, '0')}` }] };
    }
    const email = data.normalizeEmail(ascii);
    if (email) return { raw: value, lookups: [{ kind: 'email', value: email }] };
    const lookups = [];
    const id = fieldCrypto.normalizeIdentifier(ascii);
    if (id.length >= 5) {
        lookups.push({ kind: 'national_id', value: id });
        lookups.push({ kind: 'passport', value: id });
    }
    // Only something written like a phone number is tried as one (0…, 00…, +…, 966…, 971…),
    // so the last digits of an identity number never match someone's mobile
    const compact = ascii.replace(/[\s()-]/g, '');
    const phone = data.normalizePhone(ascii);
    if (/^(\+|00|0|966\d{9}$|971\d{9}$)\d*$/.test(compact) && phone.length >= 7) lookups.push({ kind: 'phone', value: phone });
    return lookups.length ? { raw: value, lookups } : { raw: value, lookups: [] };
}

// Pasted text: one value per line (commas, semicolons and tabs also separate). Repeats are dropped.
function parseLines(text) {
    const seen = new Set();
    const out = [];
    for (const piece of String(text || '').split(/[\r\n,;\t]+/)) {
        const c = classifyLine(piece);
        if (!c) continue;
        const key = c.raw.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(c);
        if (out.length >= MAX_LINES) break;
    }
    return out;
}

// The database conditions for one lookup
function lookupQuery({ kind, value }) {
    if (kind === 'customer_no') return { customerNo: value };
    if (kind === 'email') return { 'contact.email': value };
    if (kind === 'phone') return { 'contact.phoneNorm': value };
    if (kind === 'national_id') return { 'identity.nationalIdIdx': fieldCrypto.blindIndex(value, 'national_id') };
    if (kind === 'passport') return { 'identity.passportIdx': fieldCrypto.blindIndex(value, 'passport') };
    return null;
}

// Zoom lists one row per join; someone who dropped and came back appears twice.
// Rows are grouped by registrant (personal link) or else by email, and the time is added up.
function mergeParticipants(rows) {
    const byKey = new Map();
    for (const r of rows || []) {
        const email = data.normalizeEmail(r.user_email);
        const key = r.registrant_id ? `r:${r.registrant_id}` : email ? `e:${email}` : null;
        if (!key) continue;
        const cur = byKey.get(key) || { registrantId: r.registrant_id || '', email, seconds: 0, joinedAt: null, leftAt: null };
        cur.seconds += Number(r.duration) || 0;
        const j = r.join_time ? new Date(r.join_time) : null;
        const l = r.leave_time ? new Date(r.leave_time) : null;
        if (j && (!cur.joinedAt || j < cur.joinedAt)) cur.joinedAt = j;
        if (l && (!cur.leftAt || l > cur.leftAt)) cur.leftAt = l;
        if (!cur.email && email) cur.email = email;
        byKey.set(key, cur);
    }
    return [...byKey.values()].map((p) => ({ ...p, minutes: Math.round(p.seconds / 60) }));
}

// Present when the member stayed at least the set share of the lecture
function isPresent(attendedMinutes, durationMin, percent = 50) {
    const need = Math.max(1, Math.ceil(((durationMin || 0) * percent) / 100));
    return attendedMinutes >= need;
}

function attendanceRate(present, held) {
    return held ? Math.round((present / held) * 100) : null;
}

// Zoom wants times as yyyy-MM-ddTHH:mm:ssZ
const zoomTime = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

function meetingPayload({ topic, startsAt, durationMin, timeZone, registration, agenda }) {
    return {
        topic: String(topic || '').slice(0, 200),
        type: 2,
        start_time: zoomTime(startsAt),
        duration: durationMin,
        timezone: timeZone || 'Africa/Cairo',
        agenda: String(agenda || '').slice(0, 2000),
        settings: {
            join_before_host: false,
            waiting_room: false,
            mute_upon_entry: true,
            auto_recording: 'cloud',
            approval_type: registration ? 0 : 2,
            registration_type: 1,
            registrants_confirmation_email: false,
            registrants_email_notification: false,
            meeting_authentication: false
        }
    };
}

// Zoom needs a first and last name for a registrant
function splitName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { first_name: 'Nibras', last_name: 'Learner' };
    if (parts.length === 1) return { first_name: parts[0].slice(0, 64), last_name: '-' };
    return { first_name: parts[0].slice(0, 64), last_name: parts.slice(1).join(' ').slice(0, 64) };
}

// Only web links are kept for lecture links, recordings and materials
function safeUrl(v) {
    const s = String(v || '').trim().slice(0, 1000);
    if (!s) return '';
    try {
        const u = new URL(s);
        return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
    } catch {
        return '';
    }
}

module.exports = {
    SHOW_BEFORE_MIN, SHOW_AFTER_MIN, MAX_LINES,
    endOf, joinState, canJoinAt, customerCanJoin, entryCounts, lectureProgress, programPercent, nextLecture,
    classifyLine, parseLines, lookupQuery,
    mergeParticipants, isPresent, attendanceRate, zoomTime, meetingPayload, splitName, safeUrl
};
