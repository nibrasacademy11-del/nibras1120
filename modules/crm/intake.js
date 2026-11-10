const crypto = require('crypto');
const Customer = require('../../models/Customer');
const Communication = require('../../models/Communication');
const CustomerEvent = require('../../models/CustomerEvent');
const Inquiry = require('../../models/Inquiry');
const { nextNumber } = require('../../lib/sequence');
const data = require('../../lib/customerData');

// Turns website activity into CRM records: a sign-up becomes a customer file linked to the account,
// a contact or enrollment request becomes a lead (or joins the existing file with the same phone/email).
// New files from the website start unassigned, in the pool the admin or team leaders distribute.
// With { dryRun: true } nothing is written; the result says what would happen (used by the migration).

async function findExisting({ phone, email, userId }) {
    if (userId) {
        const linked = await Customer.findOne({ user: userId, status: { $ne: 'merged' } });
        if (linked) return linked;
    }
    const or = [];
    const p = data.normalizePhone(phone);
    if (p.length >= 7) or.push({ 'contact.phoneNorm': p });
    const e = data.normalizeEmail(email);
    if (e) or.push({ 'contact.email': e });
    if (!or.length) return null;
    return Customer.findOne({ $or: or, status: { $ne: 'merged' } }).sort({ registeredAt: 1 });
}

async function createFile({ name, phone, email, country, source, sourceDetail, userId, registeredAt, status, legacy }) {
    const { number } = await nextNumber('customer');
    const c = await Customer.create({
        customerNo: number,
        internalId: crypto.randomUUID(),
        nameAr: String(name || email || phone || 'عميل').trim().slice(0, 200),
        country: String(country || '').slice(0, 80),
        source,
        sourceDetail: String(sourceDetail || '').slice(0, 200),
        status,
        user: userId || null,
        registeredAt: registeredAt || new Date(),
        contact: { phone: String(phone || '').slice(0, 30), phoneNorm: data.normalizePhone(phone), email: data.normalizeEmail(email) },
        legacy
    });
    await CustomerEvent.create({ customer: c._id, type: 'created', summary: `File ${c.customerNo} created from the website (${sourceDetail || source})`, actorName: 'system', at: registeredAt || new Date() });
    return c;
}

async function ingestUser(user, { dryRun = false } = {}) {
    const existing = await findExisting({ phone: user.phone, email: user.email, userId: user._id });
    if (existing) {
        if (dryRun) return { action: existing.user ? 'already_linked' : 'link', customerNo: existing.customerNo };
        if (!existing.user) {
            existing.user = user._id;
            await existing.save();
            await CustomerEvent.create({ customer: existing._id, type: 'updated', summary: 'Linked to the customer portal account', actorName: 'system' });
        }
        return { action: 'linked', customer: existing };
    }
    if (dryRun) return { action: 'create' };
    const c = await createFile({
        name: user.name, phone: user.phone, email: user.email, source: 'website', sourceDetail: 'account',
        userId: user._id, registeredAt: user.createdAt, status: (user.enrolledCourses || []).length ? 'customer' : 'lead',
        legacy: { from: 'user', id: String(user._id) }
    });
    return { action: 'created', customer: c };
}

async function ingestInquiry(inquiry, { dryRun = false } = {}) {
    if (inquiry.customer) return { action: 'already_linked' };
    const existing = await findExisting({ phone: inquiry.phone, email: inquiry.email });
    if (dryRun) return { action: existing ? 'attach' : 'create', customerNo: existing && existing.customerNo };
    const isEnrollment = (inquiry.items || []).length > 0;
    const customer = existing || await createFile({
        name: inquiry.name, phone: inquiry.phone, email: inquiry.email, country: inquiry.country,
        source: 'website', sourceDetail: isEnrollment ? 'enrollment_request' : 'contact_form',
        registeredAt: inquiry.createdAt, status: isEnrollment ? 'interested' : 'lead',
        legacy: { from: 'inquiry', id: String(inquiry._id) }
    });
    if (existing && isEnrollment && existing.status === 'lead') {
        existing.status = 'interested';
        await existing.save();
    }
    const programs = (inquiry.items || []).map((i) => i.title).filter(Boolean);
    const summary = [inquiry.inquiryType, inquiry.subject, programs.length ? programs.join('، ') : '', String(inquiry.message || '').slice(0, 1500)].filter(Boolean).join(' — ');
    const at = inquiry.createdAt || new Date();
    await Communication.create({ customer: customer._id, channel: 'other', direction: 'inbound', summary: summary.slice(0, 3000), at, by: null, inquiry: inquiry._id });
    await CustomerEvent.create({ customer: customer._id, type: 'communication', section: 'contact', summary: `Website ${isEnrollment ? 'enrollment request' : 'message'}: ${summary.slice(0, 300)}`, actorName: 'website', at });
    await Customer.updateOne({ _id: customer._id, $or: [{ lastContactAt: null }, { lastContactAt: { $lt: at } }] }, { $set: { lastContactAt: at } });
    await Inquiry.updateOne({ _id: inquiry._id }, { $set: { customer: customer._id } });
    return { action: existing ? 'attached' : 'created', customer };
}

// For live requests: CRM problems are logged and never break the public form
async function safely(fn, label) {
    try {
        return await fn();
    } catch (err) {
        console.error(`CRM intake (${label}) failed:`, err.message);
        return null;
    }
}

module.exports = { ingestUser, ingestInquiry, findExisting, safely };
