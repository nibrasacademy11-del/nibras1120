const Lecture = require('../../models/Lecture');
const Cohort = require('../../models/Cohort');
const CohortMember = require('../../models/CohortMember');
const User = require('../../models/User');
const L = require('../../lib/lectures');
const zoom = require('../../lib/zoom');
const customerEmails = require('../../lib/customerEmails');
const { notify, getSetting } = require('../crm/service');

// Run by the reminder job (Vercel Cron):
//  - members get an email for lectures in the next 30 hours (the day before), and another one
//    about an hour before when the job runs hourly (Vercel Pro); the email links to their page
//    on the website, never to Zoom
//  - finished Zoom lectures get their attendance and recording from Zoom
// Each lecture is handled on its own, so one failure does not stop the others.

const BCC_CHUNK = 40;

function when(date, timeZone) {
    const opts = { timeZone, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' };
    return {
        ar: new Intl.DateTimeFormat('ar-EG', opts).format(date),
        en: new Intl.DateTimeFormat('en-GB', opts).format(date)
    };
}

async function remind(l, timeZone, { soon = false } = {}) {
    const cohort = await Cohort.findById(l.cohort).select('nameAr');
    const members = await CohortMember.find({ cohort: l.cohort, status: 'active' }).populate('customer', 'contact.email user').lean();
    const userIds = members.map((m) => m.customer && m.customer.user).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).select('email').lean();
    const userEmail = Object.fromEntries(users.map((u) => [String(u._id), u.email]));
    const emails = new Set();
    for (const m of members) {
        if (!m.customer) continue;
        const e = (m.customer.contact && m.customer.contact.email) || (m.customer.user && userEmail[String(m.customer.user)]);
        if (e) emails.add(String(e).toLowerCase());
    }
    const at = when(l.startsAt, timeZone);
    for (const uid of soon ? [] : userIds) {
        await notify(uid, {
            type: 'lecture_reminder',
            titleAr: `محاضرة قادمة: ${l.titleAr}`,
            titleEn: `Upcoming lecture: ${l.titleEn || l.titleAr}`,
            bodyAr: at.ar, bodyEn: at.en,
            link: '/my-lectures',
            dedupeKey: `lecture:${l._id}:${l.startsAt.toISOString()}`
        });
    }
    let sent = 0;
    const list = [...emails];
    for (let i = 0; i < list.length; i += BCC_CHUNK) {
        const r = await customerEmails.lecture(list.slice(i, i + BCC_CHUNK), { group: cohort ? cohort.nameAr : '', title: l.titleAr, at, soon });
        if (r.sent || r.kept) sent += Math.min(BCC_CHUNK, list.length - i);
    }
    if (soon) {
        l.remindedSoonAt = new Date();
        await l.save();
        return sent;
    }
    l.remindedAt = new Date();
    await l.save();
    return sent;
}

async function run() {
    const out = { reminded: 0, emails: 0, synced: 0, errors: 0 };
    const now = Date.now();
    const timeZone = await getSetting('attendance.timeZone');

    // about an hour before (only when the job runs hourly)
    const soon = await Lecture.find({ status: 'scheduled', remindedSoonAt: null, startsAt: { $gt: new Date(now), $lte: new Date(now + 90 * 60e3) } }).limit(20);
    for (const l of soon) {
        try {
            out.emails += await remind(l, timeZone, { soon: true });
            out.reminded++;
        } catch (err) {
            out.errors++;
            console.error('Lecture reminder failed:', l._id, err.message);
        }
    }

    const upcoming = await Lecture.find({ status: 'scheduled', remindedAt: null, startsAt: { $gt: new Date(now + 90 * 60e3), $lte: new Date(now + 30 * 3600e3) } }).limit(20);
    for (const l of upcoming) {
        try {
            out.emails += await remind(l, timeZone);
            out.reminded++;
        } catch (err) {
            out.errors++;
            console.error('Lecture reminder failed:', l._id, err.message);
        }
    }

    if (zoom.isConfigured()) {
        const { _syncLecture } = require('./groupController');
        // Ended in the last week; never synced, or synced before Zoom finished the recording
        const candidates = await Lecture.find({
            status: 'scheduled', 'zoom.managed': true,
            startsAt: { $gte: new Date(now - 7 * 864e5), $lte: new Date(now) },
            $or: [{ attendanceSyncedAt: null }, { 'recordings.source': { $ne: 'zoom' }, startsAt: { $gte: new Date(now - 3 * 864e5) } }]
        }).limit(30);
        for (const l of candidates.filter((x) => L.endOf(x).getTime() < now - 30 * 60e3).slice(0, 10)) {
            try {
                await _syncLecture(l);
                out.synced++;
            } catch (err) {
                out.errors++;
                await Lecture.updateOne({ _id: l._id }, { $set: { 'zoom.lastError': `Sync: ${err.message}`.slice(0, 500) } });
            }
        }
    }
    return out;
}

module.exports = { run };
