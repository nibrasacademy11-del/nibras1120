// The emails of a customer's learning and payments (PLAN-V2 §6): enrolled, joined a group,
// payment receipt, installment reminder and lecture reminder. Arabic first with an English line,
// in the academy's identity; links go to the customer's page on the website, never to Zoom.
// Each returns what lib/mail.send returned and never throws.

const { brandedEmail } = require('./brandEmail');
const mail = require('./mail');
const A = require('./academy');

const siteUrl = () => (process.env.SITE_URL || 'https://www.nibras-ac.com').replace(/\/$/, '');
const profileLink = (tab = '') => `${siteUrl()}/pages/ar/profile.html${tab ? `#${tab}` : ''}`;
const money = (amount, currency) => `${Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 3 })} ${currency}`;
const day = (d, timeZone = 'Africa/Cairo') => (d ? new Date(d).toLocaleDateString('ar-EG', { dateStyle: 'long', timeZone }) : '');
const METHODS = { cash: 'نقدي', bank_transfer: 'تحويل بنكي', card: 'بطاقة', wallet: 'محفظة', gateway: 'دفع إلكتروني', cheque: 'شيك', other: 'أخرى' };

async function academy() {
    try {
        const { getSetting } = require('../modules/crm/service');
        return { ...A.PROFILE_DEFAULT, ...((await getSetting('academy.profile')) || {}) };
    } catch {
        return { ...A.PROFILE_DEFAULT };
    }
}

async function deliver({ kind, to, bcc, subject, parts, text }) {
    try {
        const prof = await academy();
        const footer = [prof.phone, prof.email, prof.website].filter(Boolean).join(' · ');
        return await mail.send({ kind, to, bcc, subject, html: brandedEmail({ ...parts, footer }), text });
    } catch (err) {
        console.error(`Email "${kind}" failed:`, err.message);
        return { sent: false, reason: 'failed' };
    }
}

// The address of a customer file: its own email, else the website account's
async function emailOf(customer) {
    if (!customer) return '';
    if (customer.contact && customer.contact.email) return customer.contact.email;
    if (customer.user) {
        const User = require('../models/User');
        const u = await User.findById(customer.user._id || customer.user).select('email').lean();
        return (u && u.email) || '';
    }
    return '';
}

// #5 enrolled in a program; with a group, when it starts. waiting: no open group yet.
function enrolled(to, { name, program, group, startDate, waiting }) {
    const lines = [`تم تسجيلك في «${program}».`];
    if (group) lines.push(`مجموعتك: ${group}${startDate ? `، وتبدأ يوم ${day(startDate)}` : ''}.`);
    if (waiting) lines.push('سنضمك إلى أول مجموعة تُفتح لهذا البرنامج ونبلغك بموعدها.');
    lines.push('محاضراتك ونسبة تقدمك ومدفوعاتك وشهاداتك كلها في صفحتك على موقعنا.');
    return deliver({
        kind: 'enrolled', to,
        subject: `تم تسجيلك في ${program} - أكاديمية نبراس / You are enrolled`,
        parts: { heading: `أهلاً ${name}`, lines, button: { url: profileLink('path'), label: 'افتح مساري' }, noteEn: `You are enrolled in "${program}". Your lectures, progress, payments and certificates are on your profile.` },
        text: `${lines.join(' ')} ${profileLink('path')}`
    });
}

// A waiting enrollment joined a group that just opened
function groupJoined(to, { name, program, group, startDate }) {
    const lines = [`فُتحت مجموعة جديدة لبرنامج «${program}» وانضممت إليها: ${group}.`, startDate ? `تبدأ يوم ${day(startDate)}.` : ''];
    return deliver({
        kind: 'group-joined', to,
        subject: `مجموعتك جاهزة - ${program} / Your group is ready`,
        parts: { heading: `أهلاً ${name}`, lines, button: { url: profileLink('lectures'), label: 'افتح محاضراتي' }, noteEn: `A new group of "${program}" opened and you are in it: ${group}.` },
        text: `${lines.filter(Boolean).join(' ')} ${profileLink('lectures')}`
    });
}

// #6 a confirmed payment: the receipt, its verification link and what remains
function receipt(to, { name, receiptNo, amount, currency, method, paidAt, remaining = [], verifyLink }) {
    const left = remaining.filter((r) => r.remaining > 0);
    const lines = [
        `استلمنا دفعتك، شكراً لك.`,
        `رقم الإيصال: ${receiptNo}`,
        `المبلغ: ${money(amount, currency)} · ${METHODS[method] || method} · ${day(paidAt)}`,
        left.length ? `المتبقي عليك: ${left.map((r) => money(r.remaining, r.currency)).join(' · ')}` : 'لا يوجد عليك أي مبلغ متبقٍ.'
    ];
    return deliver({
        kind: 'payment-receipt', to,
        subject: `إيصال دفع ${receiptNo} - أكاديمية نبراس / Payment receipt`,
        parts: {
            heading: `أهلاً ${name}`, lines, highlight: money(amount, currency),
            button: { url: profileLink('payments'), label: 'مدفوعاتي' },
            secondary: verifyLink ? { url: verifyLink, label: 'التحقق من الإيصال' } : null,
            noteEn: `We received your payment of ${money(amount, currency)}, receipt ${receiptNo}. Thank you.`
        },
        text: `${lines.join('\n')}\n${profileLink('payments')}`
    });
}

// #7 an installment before its date, on it, or late
function installment(to, { name, amount, description, dueDate, late, daysLate }) {
    const lines = [late ? `نذكّرك بقسط متأخر منذ ${daysLate} يوم:` : `نذكّرك بقسط مستحق يوم ${day(dueDate)}:`, `${amount} — ${description}`, 'للسداد أو أي استفسار تواصل معنا. شكراً لك.'];
    return deliver({
        kind: 'installment-reminder', to,
        subject: late ? 'تذكير بقسط متأخر - أكاديمية نبراس / Overdue installment' : 'تذكير بقسط مستحق - أكاديمية نبراس / Installment reminder',
        parts: { heading: `أهلاً ${name}`, lines, button: { url: profileLink('payments'), label: 'مدفوعاتي' }, noteEn: late ? `A reminder: an installment of ${amount} is ${daysLate} days late.` : `A reminder: an installment of ${amount} is due.` },
        text: lines.join('\n')
    });
}

// #8 a lecture tomorrow (or in about an hour), to the whole group by BCC
function lecture(bcc, { group, title, at, soon }) {
    const lines = [group, `«${title}»`, at.ar, 'ادخل من صفحتك على الموقع: «محاضراتي». المحاضرة تُحسب لك عندما تدخلها في موعدها، ورابطها يبقى متاحاً إن فاتتك.'];
    return deliver({
        kind: soon ? 'lecture-soon' : 'lecture-reminder', bcc,
        subject: `${soon ? 'بعد قليل' : 'تذكير'}: ${title} - ${at.ar}`,
        parts: { heading: soon ? 'محاضرتك تبدأ بعد قليل' : 'تذكير بمحاضرتك القادمة', lines, button: { url: profileLink('lectures'), label: 'افتح محاضراتي' }, noteEn: `${soon ? 'Starting soon' : 'Reminder'}: ${title} — ${at.en}. Join from "My lectures" on your profile.` },
        text: `${lines.join(' ')} ${profileLink('lectures')}`
    });
}

module.exports = { emailOf, enrolled, groupJoined, receipt, installment, lecture, profileLink };
