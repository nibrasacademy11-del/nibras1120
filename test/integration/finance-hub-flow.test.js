// End-to-end test of Phase 13: receivables, reminders (by hand and automatic, never twice),
// today's numbers and the month-close checklist. Runs only with TEST_MONGO_URI (a TEST database).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_URI = process.env.TEST_MONGO_URI;
function liveUri() {
    try {
        const m = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').match(/^MONGO_URI=(.*)$/m);
        return m ? m[1].trim() : '';
    } catch {
        return '';
    }
}
const skip = !TEST_URI ? 'TEST_MONGO_URI is not set' : TEST_URI === liveUri() ? 'TEST_MONGO_URI is the live database: refusing to run' : false;

test('finance hub flow', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    // No real emails from tests: empty (not deleted), so loading .env cannot fill them back in
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ADMIN_EMAIL = '';
    process.env.ADMIN_PASSWORD = '';
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const User = require('../../models/User');
    const Customer = require('../../models/Customer');
    const Notification = require('../../models/Notification');
    const jobs = require('../../modules/finance/reminderJobs');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const mk = (role) => User.create({ name: `${role} ${tag}`, email: `fh-${role}-${tag}@test.local`, password: hash, role });
    const [admin, learner] = [await mk('super_admin'), await mk('customer')];
    const client = () => {
        const jar = {};
        return async (method, url, body) => {
            const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
            for (const c of res.headers.getSetCookie()) {
                const [pair] = c.split(';');
                const [k, v] = pair.split('=');
                if (v === '') delete jar[k];
                else jar[k] = v;
            }
            let data = null;
            try { data = await res.json(); } catch { data = null; }
            return { status: res.status, data };
        };
    };
    const a = client();
    assert.equal((await a('POST', '/api/auth/login', { email: admin.email, password: pw })).status, 200);

    try {
        const file = await Customer.create({ customerNo: `NB-F${tag}`, internalId: `if-${tag}`, nameAr: 'عميل متأخر', user: learner._id, status: 'customer', contact: { phone: '01112220796' } });
        // Two installments: the first one 7 days late, the second about three weeks from now
        const first = new Date(Date.now() - 7 * 864e5);
        const charge = await a('POST', '/api/v2/charges', { customer: String(file._id), description: 'رسوم البرنامج', currency: 'EGP', listAmount: 2000, installments: { count: 2, firstDue: first.toISOString(), everyMonths: 1 } });
        assert.equal(charge.status, 201, JSON.stringify(charge.data));

        await t.test('the customer shows as overdue with the amount in its currency', async () => {
            const r = await a('GET', '/api/v2/finance/receivables?state=overdue');
            const row = r.data.items.find((x) => x.customer._id === String(file._id));
            assert.ok(row, 'listed');
            assert.ok(row.maxDaysLate >= 6);
            assert.equal(row.overdue[0].currency, 'EGP');
            assert.ok(row.phone, 'the admin sees the phone for WhatsApp');
        });

        await t.test('reminders by hand: WhatsApp link and portal notice, logged on the file', async () => {
            const wa = await a('POST', `/api/v2/finance/receivables/${file._id}/remind`, { channel: 'whatsapp' });
            assert.equal(wa.status, 200, JSON.stringify(wa.data));
            assert.ok(wa.data.link.startsWith('https://wa.me/201112220796?text='));
            assert.equal((await a('POST', `/api/v2/finance/receivables/${file._id}/remind`, { channel: 'portal' })).status, 200);
            assert.equal((await a('POST', `/api/v2/finance/receivables/${file._id}/remind`, { channel: 'email' })).data.code, 'NO_MAIL', 'no email on the file: the portal account email is used, and email is off in tests');
            const again = await a('GET', '/api/v2/finance/receivables?state=overdue');
            assert.ok(again.data.items.find((x) => x.customer._id === String(file._id)).lastReminderAt);
        });

        await t.test('the daily job reminds on the 7th late day once, never twice', async () => {
            const before = await Notification.countDocuments({ user: learner._id, type: 'payment_reminder' });
            const r1 = await jobs.run();
            const mid = await Notification.countDocuments({ user: learner._id, type: 'payment_reminder' });
            await jobs.run();
            const after = await Notification.countDocuments({ user: learner._id, type: 'payment_reminder' });
            assert.ok(r1.installments >= 1, JSON.stringify(r1));
            assert.equal(mid, before + 1);
            assert.equal(after, mid, 'the second run sends nothing new');
        });

        await t.test('today and the month-close checklist', async () => {
            const today = await a('GET', '/api/v2/finance/today');
            assert.equal(today.status, 200);
            assert.ok(today.data.overdue.customers >= 1);
            const key = new Date().toISOString().slice(0, 7);
            const check = await a('GET', `/api/v2/finance/periods/${key}/check`);
            assert.equal(check.status, 200);
            assert.deepEqual(check.data.checks.map((c) => c.id), ['pendingPayments', 'pendingApprovals', 'pendingRefunds', 'commissionsDue', 'expensesNoReceipt']);
        });
    } finally {
        await User.updateMany({ email: new RegExp(`fh-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
