// Money customers owe: grouping by customer, when to remind them, and the WhatsApp message.
// Pure, so it can be unit tested.

const M = require('./money');

const DAY = 864e5;
const REMINDER_DEFAULTS = Object.freeze({ enabled: true, daysBefore: 3, overdueDays: [1, 7, 14], email: true, notifyOwner: true });

function cleanReminderSettings(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const days = Array.isArray(v.overdueDays) ? v.overdueDays : REMINDER_DEFAULTS.overdueDays;
    const overdueDays = [...new Set(days.map((d) => parseInt(d, 10)).filter((d) => d >= 1 && d <= 365))].sort((a, b) => a - b).slice(0, 6);
    const daysBefore = parseInt(v.daysBefore ?? REMINDER_DEFAULTS.daysBefore, 10);
    if (!Number.isFinite(daysBefore) || daysBefore < 0 || daysBefore > 30) return null;
    return { enabled: v.enabled !== false, daysBefore, overdueDays, email: v.email !== false, notifyOwner: v.notifyOwner !== false };
}

// Which reminder an installment gets today: 'before' (a few days ahead), 'due' (today), 'overdue_N'
// (N days late, on the configured days), or null. Days are counted in whole calendar days.
function reminderStage(dueDate, now = new Date(), cfg = REMINDER_DEFAULTS) {
    const day = (d) => Math.floor(new Date(d).getTime() / DAY);
    const diff = day(now) - day(dueDate);   // >0 late, <0 ahead
    if (diff === 0) return 'due';
    if (diff < 0 && cfg.daysBefore > 0 && -diff === cfg.daysBefore) return 'before';
    if (diff > 0 && (cfg.overdueDays || []).includes(diff)) return `overdue_${diff}`;
    return null;
}

const daysLate = (dueDate, now = new Date()) => Math.max(0, Math.floor((now - new Date(dueDate)) / DAY));

// One line per customer: what they owe per currency, how late, and their next due date.
// rows: { customerId, currency, remaining, dueDate, late, daysLate, ... } per unpaid installment
function groupByCustomer(rows) {
    const map = new Map();
    for (const r of rows) {
        const key = String(r.customerId);
        const g = map.get(key) || { customerId: r.customerId, owed: {}, overdue: {}, maxDaysLate: 0, nextDue: null, installments: [] };
        g.owed[r.currency] = M.round((g.owed[r.currency] || 0) + r.remaining, 3);
        if (r.late) {
            g.overdue[r.currency] = M.round((g.overdue[r.currency] || 0) + r.remaining, 3);
            g.maxDaysLate = Math.max(g.maxDaysLate, r.daysLate || 0);
        } else if (r.dueDate && (!g.nextDue || new Date(r.dueDate) < new Date(g.nextDue))) {
            g.nextDue = r.dueDate;
        }
        g.installments.push(r);
        map.set(key, g);
    }
    const toList = (o) => Object.entries(o).map(([currency, amount]) => ({ currency, amount }));
    return [...map.values()]
        .map((g) => ({ ...g, owed: toList(g.owed), overdue: toList(g.overdue) }))
        .sort((a, b) => b.maxDaysLate - a.maxDaysLate || (a.nextDue ? new Date(a.nextDue) : Infinity) - (b.nextDue ? new Date(b.nextDue) : Infinity));
}

// wa.me needs the number with its country code and digits only. A local Egyptian mobile
// (01xxxxxxxxx) gets 20; numbers already written with a country code are kept.
function waNumber(phone, defaultCountry = '20') {
    let d = String(phone || '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = defaultCountry + d.slice(1);
    return d.length >= 10 && d.length <= 15 ? d : '';
}

function reminderText({ name, items, academy = 'أكاديمية نبراس' }) {
    const lines = items.map((i) => `• ${M.round(i.remaining, 2).toLocaleString('en-US')} ${i.currency}${i.dueDate ? ` (${new Date(i.dueDate).toISOString().slice(0, 10)})` : ''} — ${i.description}`);
    return `مرحباً ${name}،\nنذكّرك بالمبالغ المستحقة:\n${lines.join('\n')}\nللاستفسار أو السداد تواصل معنا. شكراً لك.\n${academy}`;
}

const waLink = (phone, text) => {
    const n = waNumber(phone);
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : '';
};

module.exports = { REMINDER_DEFAULTS, cleanReminderSettings, reminderStage, daysLate, groupByCustomer, waNumber, reminderText, waLink };
