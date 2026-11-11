const Lecture = require('../../models/Lecture');
const Cohort = require('../../models/Cohort');
const CohortMember = require('../../models/CohortMember');
const User = require('../../models/User');
const L = require('../../lib/lectures');
const zoom = require('../../lib/zoom');
const { isMailConfigured, createTransporter } = require('../../config/mailer');
const { notify, getSetting } = require('../crm/service');

// Run once a day by the reminder job (Vercel Cron):
//  - members get an email and a portal notification for lectures in the next 30 hours
//  - finished Zoom lectures get their attendance and recording from Zoom
// Each lecture is handled on its own, so one failure does not stop the others.

const siteUrl = () => (process.env.SITE_URL || 'https://www.nibras-ac.com').replace(/\/$/, '');
const BCC_CHUNK = 40;
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function when(date, timeZone) {
    const opts = { timeZone, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' };
    return {
        ar: new Intl.DateTimeFormat('ar-EG', opts).format(date),
        en: new Intl.DateTimeFormat('en-GB', opts).format(date)
    };
}

// The reminder email, in the academy's colours. It links to the portal, never to Zoom directly.
function reminderHtml({ group, title, at }) {
    const link = `${siteUrl()}/portal/my-lectures`;
    return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#fbf7f0;font-family:Tahoma,Arial,sans-serif;color:#2a2023">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eadfce">
<tr><td style="background:#5a020e;color:#fff;padding:18px 24px;font-size:18px;font-weight:bold">أكاديمية نبراس <span style="color:#e0bc72">·</span> Nibras Academy</td></tr>
<tr><td style="padding:24px;line-height:1.8">
<p style="margin:0 0 8px;font-size:16px"><strong>تذكير بمحاضرتك القادمة</strong></p>
<p style="margin:0 0 4px">${esc(group)}</p>
<p style="margin:0 0 4px;font-size:17px;color:#5a020e"><strong>${esc(title)}</strong></p>
<p style="margin:0 0 16px">${esc(at.ar)}</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#5a020e;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px">افتح محاضراتي</a></p>
<p style="margin:0;color:#6b5e63;font-size:13px" dir="ltr">Reminder: ${esc(title)} — ${esc(at.en)}. Join from “My lectures” in the Nibras portal; the button opens 15 minutes before the start.</p>
</td></tr>
<tr><td style="background:#f8efdc;color:#8a6420;padding:12px 24px;font-size:12px">زر الدخول يظهر قبل المحاضرة بربع ساعة · لا تشارك رابط المحاضرة مع أحد</td></tr>
</table></td></tr></table></body></html>`;
}

async function remind(l, timeZone) {
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
    for (const uid of userIds) {
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
    if (emails.size && isMailConfigured()) {
        const list = [...emails];
        const transporter = createTransporter();
        for (let i = 0; i < list.length; i += BCC_CHUNK) {
            await transporter.sendMail({
                from: `"أكاديمية نبراس" <${process.env.EMAIL_USER}>`,
                to: process.env.EMAIL_USER,
                bcc: list.slice(i, i + BCC_CHUNK),
                subject: `تذكير: ${l.titleAr} - ${at.ar}`,
                html: reminderHtml({ group: cohort ? cohort.nameAr : '', title: l.titleAr, at }),
                text: `تذكير بمحاضرة ${l.titleAr} (${cohort ? cohort.nameAr : ''}) يوم ${at.ar}. ادخل من صفحة محاضراتي: ${siteUrl()}/portal/my-lectures`
            });
            sent += Math.min(BCC_CHUNK, list.length - i);
        }
    }
    l.remindedAt = new Date();
    await l.save();
    return sent;
}

async function run() {
    const out = { reminded: 0, emails: 0, synced: 0, errors: 0 };
    const now = Date.now();
    const timeZone = await getSetting('attendance.timeZone');

    const upcoming = await Lecture.find({ status: 'scheduled', remindedAt: null, startsAt: { $gt: new Date(now), $lte: new Date(now + 30 * 3600e3) } }).limit(20);
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

module.exports = { run, reminderHtml };
