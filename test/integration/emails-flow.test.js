// The remaining emails of PLAN-V2 §6: enrolled (#5), payment receipt (#6), installment reminder
// (#7), lecture reminder to the group by BCC (#8), and the new staff account with a link to choose
// the password (#12). Emails are kept in memory (MAIL_CAPTURE), never sent.
// Needs TEST_MONGO_URI (a test database, never the live one).

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

test('customer and staff emails', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ADMIN_EMAIL = '';
    process.env.ADMIN_PASSWORD = '';
    process.env.MAIL_CAPTURE = '1';
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const mail = require('../../lib/mail');
    const User = require('../../models/User');
    const Course = require('../../models/Course');
    const F = require('../../models/finance');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const owner = await User.create({ name: 'Mail Owner', email: `em-owner-${tag}@test.local`, password: await bcrypt.hash(pw, 10), role: 'super_admin' });
    const program = await Course.create({ titleAr: `برنامج الإيميلات ${tag}`, slug: `em-${tag}`, type: 'course', specialty: 'test', price: 0 });
    const customerEmail = `em-cust-${tag}@test.local`;
    const staffEmail = `em-staff-${tag}@test.local`;

    const jar = {};
    const o = async (method, url, body) => {
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
    const last = (kind, to) => [...mail.outbox].reverse().find((m) => m.kind === kind && (!to || m.to === to || (m.bcc || []).includes(to)));

    try {
        assert.equal((await o('POST', '/api/auth/login', { email: owner.email, password: pw })).status, 200);
        const group = (await o('POST', `/api/v2/programs/${program._id}/cohorts`, { nameAr: 'مجموعة الإيميلات', status: 'open', startDate: new Date(Date.now() + 5 * 864e5).toISOString() })).data.item;
        const customer = (await o('POST', '/api/v2/customers', { nameAr: 'عميلة الإيميلات', contact: { email: customerEmail, phone: `0101${String(Date.now()).slice(-7)}` } })).data.item;
        let enrollment;

        await t.test('#5 enrolled: the program, the group and when it starts', async () => {
            enrollment = (await o('POST', '/api/v2/enrollments', { customer: customer.id, program: String(program._id) })).data.item;
            const m = last('enrolled', customerEmail);
            assert.ok(m, 'enrollment email');
            assert.match(m.html, /مجموعة الإيميلات/);
            assert.match(m.html, /profile\.html#path/);
        });

        await t.test('#6 receipt: number, verification link and what remains', async () => {
            const acct = (await o('POST', '/api/v2/finance/accounts', { code: `EM-${tag}`, nameAr: 'خزينة', type: 'cash', currency: 'SAR', allowEmployees: true })).data.item;
            const charge = (await o('POST', '/api/v2/charges', { customer: customer.id, description: 'رسوم الدورة', currency: 'SAR', listAmount: 1000 })).data.item;
            const pay = await o('POST', '/api/v2/payments', { customer: customer.id, charge: charge._id, enrollment: enrollment._id, account: acct._id, method: 'cash', amount: 400 });
            assert.equal(pay.status, 201, JSON.stringify(pay.data));
            const m = last('payment-receipt', customerEmail);
            assert.ok(m, 'receipt email');
            assert.ok(m.html.includes(pay.data.item.receiptNo));
            assert.match(m.html, /receipt\.html\?no=[^"]+&amp;k=[0-9a-f]{16}/, 'a signed verification link');
            assert.match(m.html, /600 SAR/, 'what remains');
        });

        await t.test('#7 installment reminder on the due day, once', async () => {
            // "once" rests on a unique index: a brand-new test database builds it in the background
            await require('../../models/ReminderLog').init();
            const inst = await F.Charge.findOne({ customer: customer.id }).lean();
            const due = inst.installments[0].dueDate;
            const out = await require('../../modules/finance/reminderJobs').run(new Date(due));
            assert.ok(out.emails >= 1, JSON.stringify(out));
            const m = last('installment-reminder', customerEmail);
            assert.ok(m && /600 SAR/.test(m.html), 'the amount still owed');
            assert.match(m.html, /profile\.html#payments/);
            const again = await require('../../modules/finance/reminderJobs').run(new Date(due));
            assert.equal(again.emails, 0, 'nothing is sent twice');
        });

        await t.test('#8 lecture reminder: the day before to the group by BCC, and about an hour before', async () => {
            const tomorrow = (await o('POST', `/api/v2/groups/${group._id}/lectures`, { mode: 'manual', titleAr: 'محاضرة بكرة', startsAt: new Date(Date.now() + 20 * 3600e3).toISOString(), joinUrl: 'https://zoom.us/j/55' })).data.item;
            const soon = (await o('POST', `/api/v2/groups/${group._id}/lectures`, { mode: 'manual', titleAr: 'محاضرة بعد ساعة', startsAt: new Date(Date.now() + 60 * 60e3).toISOString(), joinUrl: 'https://zoom.us/j/66' })).data.item;
            const out = await require('../../modules/learning/lectureJobs').run();
            assert.ok(out.reminded >= 2, JSON.stringify(out));
            const day = [...mail.outbox].reverse().find((m) => m.kind === 'lecture-reminder' && m.subject.includes('محاضرة بكرة'));
            assert.ok(day && day.bcc.includes(customerEmail), 'the member is in BCC');
            assert.ok(!day.html.includes('zoom.us'), 'never the Zoom link');
            const hour = [...mail.outbox].reverse().find((m) => m.kind === 'lecture-soon' && m.subject.includes('محاضرة بعد ساعة'));
            assert.ok(hour, 'the hour-before reminder');
            void tomorrow; void soon;
            const again = await require('../../modules/learning/lectureJobs').run();
            assert.equal(again.reminded, 0, 'each reminder once');
        });

        await t.test('#12 a new employee is emailed a link to choose the password', async () => {
            const r = await o('POST', '/api/v2/employees', { nameAr: 'موظف الإيميل', email: staffEmail, role: 'employee' });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            assert.equal(r.data.emailed, true);
            assert.equal(r.data.setupLink, undefined, 'the owner never sees the link when it was emailed');
            const m = last('staff-account', staffEmail);
            const token = (m.html.match(/token=([a-f0-9]{64})/) || [])[1];
            assert.ok(token);
            assert.equal((await fetch(`${base}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: pw }) })).status, 200);
            const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: staffEmail, password: pw }) });
            assert.equal(login.status, 200, 'signs in with the chosen password');
        });
    } finally {
        await User.updateMany({ email: new RegExp(`em-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
