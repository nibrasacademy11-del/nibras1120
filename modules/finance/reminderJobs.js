const Customer = require('../../models/Customer');
const User = require('../../models/User');
const ReminderLog = require('../../models/ReminderLog');
const R = require('../../lib/receivables');
const { notify, getSetting } = require('../crm/service');

// Run once a day by the reminder job: each unpaid installment gets a reminder a few days before
// its due date, on the day, and on the chosen days after it. The customer is told in the portal
// and by email; the employee responsible is told when it is late. Nothing is sent twice.

const MAX_EMAILS = 40;   // per run, so the job stays short; the rest go out the next day

async function once(key, customer, channel) {
    try {
        await ReminderLog.create({ key, customer, channel });
        return true;
    } catch (err) {
        if (err.code === 11000) return false;
        throw err;
    }
}

async function run(now = new Date()) {
    const out = { installments: 0, portal: 0, emails: 0, owners: 0, errors: 0 };
    const cfg = R.cleanReminderSettings(await getSetting('finance.reminders')) || R.REMINDER_DEFAULTS;
    if (!cfg.enabled) return { ...out, disabled: true };
    const rows = (await require('./hubController')._unpaidRows({}, now)).filter((r) => r.dueDate);
    const due = [];
    for (const r of rows) {
        const stage = R.reminderStage(r.dueDate, now, cfg);
        if (stage) due.push({ ...r, stage });
    }
    if (!due.length) return out;
    const customers = await Customer.find({ _id: { $in: [...new Set(due.map((r) => String(r.customerId)))] } }).select('customerNo nameAr user owner contact.email').lean();
    const byId = Object.fromEntries(customers.map((c) => [String(c._id), c]));
    const users = await User.find({ _id: { $in: customers.map((c) => c.user).filter(Boolean) } }).select('email').lean();
    const userEmail = Object.fromEntries(users.map((u) => [String(u._id), u.email]));
    const mail = cfg.email;
    const customerEmails = require('../../lib/customerEmails');

    for (const r of due) {
        const c = byId[String(r.customerId)];
        if (!c) continue;
        out.installments++;
        const key = `inst:${r.chargeId}:${r.no}:${r.stage}`;
        const amount = `${r.remaining.toLocaleString('en-US')} ${r.currency}`;
        const day = new Date(r.dueDate).toISOString().slice(0, 10);
        const late = r.stage.startsWith('overdue');
        try {
            if (c.user && await once(`${key}:portal`, c._id, 'portal')) {
                await notify(c.user, {
                    type: 'payment_reminder',
                    titleAr: late ? `قسط متأخر: ${amount}` : `قسط مستحق ${r.stage === 'due' ? 'اليوم' : `يوم ${day}`}: ${amount}`,
                    titleEn: late ? `Overdue installment: ${amount}` : `Installment due ${r.stage === 'due' ? 'today' : `on ${day}`}: ${amount}`,
                    bodyAr: r.description, bodyEn: r.description, link: '/my-payments'
                });
                out.portal++;
            }
            const to = (c.contact && c.contact.email) || (c.user && userEmail[String(c.user)]);
            if (mail && to && out.emails < MAX_EMAILS && await once(`${key}:email`, c._id, 'email')) {
                const sent = await customerEmails.installment(to, { name: c.nameAr, amount, description: r.description, dueDate: r.dueDate, late, daysLate: r.daysLate });
                if (sent.sent || sent.kept) out.emails++;
            }
            if (late && cfg.notifyOwner && (r.owner || c.owner) && await once(`${key}:owner`, c._id, 'owner')) {
                await notify(r.owner || c.owner, {
                    type: 'payment_overdue',
                    titleAr: `قسط متأخر ${r.daysLate} يوم: ${c.customerNo}`, titleEn: `Installment ${r.daysLate} days late: ${c.customerNo}`,
                    bodyAr: `${c.nameAr} · ${amount}`, bodyEn: `${c.nameAr} · ${amount}`, link: `/customers/${c._id}`
                });
                out.owners++;
            }
        } catch (err) {
            out.errors++;
            console.error('Payment reminder failed:', key, err.message);
        }
    }
    return out;
}

module.exports = { run };
