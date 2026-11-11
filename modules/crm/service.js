const AccessRequest = require('../../models/AccessRequest');
const CustomerEvent = require('../../models/CustomerEvent');
const Notification = require('../../models/Notification');
const SystemSetting = require('../../models/SystemSetting');

// Shared helpers for the CRM controllers

// Adds an entry to the customer's timeline. Never breaks the request that caused it.
async function addEvent(req, customerId, type, summary, { section = 'general', meta } = {}) {
    try {
        await CustomerEvent.create({
            customer: customerId,
            type,
            summary: String(summary || '').slice(0, 500),
            actor: req && req.user ? req.user.id : null,
            actorName: req && req.user ? req.user.name : 'system',
            section,
            meta
        });
    } catch (err) {
        console.error('Timeline write failed:', type, err.message);
    }
}

async function notify(userId, { type, titleAr, titleEn = '', bodyAr = '', bodyEn = '', link = '', dedupeKey }) {
    if (!userId) return;
    try {
        await Notification.create({ user: userId, type, titleAr, titleEn, bodyAr, bodyEn, link, dedupeKey });
    } catch (err) {
        if (err.code !== 11000) console.error('Notification failed:', type, err.message);
    }
}

// Sections of this customer opened to this user by approved, unexpired access requests
async function approvedSections(userId, customerId) {
    const list = await AccessRequest.find({
        requester: userId,
        customer: customerId,
        status: 'approved',
        expiresAt: { $gt: new Date() }
    }).select('sections').lean();
    return [...new Set(list.flatMap((r) => r.sections))];
}

const SETTING_DEFAULTS = {
    'customers.lookupNamePolicy': 'partial',
    // A module goes to the team leader before the admin when the enrollment's team has a leader
    'enrollments.teamLeaderReview': true,
    // The academy's main currency: the default in forms and the one exchange rates are written against.
    // Reports never convert: every currency is shown on its own.
    'finance.baseCurrency': 'EGP',
    // Rates used for anyone without a rate of their own (percent)
    'commissions.defaultEmployeeRate': 0,
    'commissions.defaultLeaderRate': 0,
    // The time zone attendance days and hours are counted in
    'attendance.timeZone': 'Africa/Cairo',
    // A member counts as present when Zoom shows them in at least this share of the lecture (percent)
    'lectures.presentPercent': 50,
    // A certificate is issued only when nothing is owed: on any of the customer's charges (customer),
    // on the enrollment's charges (enrollment), or no check (off)
    'certificates.paymentRule': 'customer',
    // Name, contacts, tax number and VAT printed on receipts, invoices, statements and reports
    'academy.profile': require('../../lib/academy').PROFILE_DEFAULT
};

async function getSetting(key) {
    const doc = await SystemSetting.findOne({ key }).lean();
    return doc ? doc.value : SETTING_DEFAULTS[key];
}

module.exports = { addEvent, notify, approvedSections, getSetting, SETTING_DEFAULTS };
