// End-to-end test of the customer's website profile (PLAN-V2 stage 2): sign-up with the names in
// Arabic and English, the confirmation and welcome emails, filling empty fields once, locked data,
// a change request approved by customer service, certificates reissued with the corrected name,
// and the password emails. Needs TEST_MONGO_URI (a test database, never the live one).

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

test('customer profile flow', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ADMIN_EMAIL = '';
    process.env.ADMIN_PASSWORD = '';
    // keep the emails in memory instead of sending them
    process.env.MAIL_CAPTURE = '1';
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const mail = require('../../lib/mail');
    const User = require('../../models/User');
    const Customer = require('../../models/Customer');
    const Course = require('../../models/Course');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const owner = await User.create({ name: 'Profile Owner', email: `pf-owner-${tag}@test.local`, password: hash, role: 'super_admin' });
    const support = await User.create({ name: 'Profile Support', email: `pf-cs-${tag}@test.local`, password: hash, role: 'customer_support' });
    const emp = await User.create({ name: 'Profile Employee', email: `pf-emp-${tag}@test.local`, password: hash, role: 'employee' });
    const program = await Course.create({ titleAr: `برنامج بروفايل ${tag}`, titleEn: 'Profile program', slug: `pf-${tag}`, type: 'course', specialty: 'test', price: 0 });
    const email = `pf-cust-${tag}@test.local`;

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
    const login = async (u) => {
        const c = client();
        assert.equal((await c('POST', '/api/auth/login', { email: u.email, password: pw })).status, 200);
        return c;
    };
    const lastMail = (to, kind) => [...mail.outbox].reverse().find((m) => m.to === to && m.kind === kind);
    const tokenIn = (m) => (m.html.match(/token=([a-f0-9]{64})/) || [])[1];

    try {
        const me = client();

        await t.test('sign-up keeps both names and sends the confirmation email', async () => {
            const r = await me('POST', '/api/auth/register', { nameAr: 'سارة أحمد محمود', nameEn: 'Sara Ahmed Mahmoud', email, phone: `0109${String(Date.now()).slice(-7)}`, password: pw, lang: 'ar' });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            assert.equal(r.data.verificationSent, true);
            assert.equal(r.data.user.emailVerified, false);
            const file = await Customer.findOne({ 'contact.email': email });
            assert.equal(file.nameAr, 'سارة أحمد محمود');
            assert.equal(file.nameEn, 'Sara Ahmed Mahmoud');
            const m = lastMail(email, 'verify-email');
            assert.ok(m, 'confirmation email');
            assert.match(m.html, /confirm-email\.html\?token=/);
            assert.match(m.html, /أكاديمية نبراس/);
        });

        await t.test('the profile shows the data, filled fields locked', async () => {
            const p = await me('GET', '/api/v2/my/profile');
            assert.equal(p.status, 200, JSON.stringify(p.data));
            const f = Object.fromEntries(p.data.fields.map((x) => [x.field, x]));
            assert.equal(f.nameAr.value, 'سارة أحمد محمود');
            assert.equal(f.nameAr.locked, true);
            assert.equal(f.email.locked, true);
            assert.equal(f.country.locked, false);
            assert.equal(p.data.account.emailVerified, false);
        });

        await t.test('the link confirms the email once and the welcome email follows', async () => {
            const token = tokenIn(lastMail(email, 'verify-email'));
            assert.equal((await client()('POST', '/api/auth/verify-email', { token: 'f'.repeat(64) })).status, 400);
            const ok = await client()('POST', '/api/auth/verify-email', { token });
            assert.equal(ok.status, 200, JSON.stringify(ok.data));
            assert.equal((await client()('POST', '/api/auth/verify-email', { token })).status, 400, 'works once');
            assert.ok(lastMail(email, 'welcome'), 'welcome email');
            assert.equal((await me('GET', '/api/v2/my/profile')).data.account.emailVerified, true);
            assert.equal((await me('POST', '/api/auth/resend-verification')).data.code, 'ALREADY_VERIFIED');
        });

        await t.test('empty fields are filled once, after confirming', async () => {
            const values = { country: 'مصر', nationality: 'مصرية', passport: 'A12345678', birthDate: '1995-04-20' };
            assert.equal((await me('POST', '/api/v2/my/profile', { values })).data.code, 'CONFIRM_REQUIRED');
            assert.equal((await me('POST', '/api/v2/my/profile', { values: { birthDate: '2030-01-01' }, confirm: true })).status, 400);
            const r = await me('POST', '/api/v2/my/profile', { values, confirm: true });
            assert.equal(r.status, 200, JSON.stringify(r.data));
            const p = (await me('GET', '/api/v2/my/profile')).data;
            const f = Object.fromEntries(p.fields.map((x) => [x.field, x]));
            assert.equal(f.passport.value, '••••5678', 'the number is never shown in full');
            assert.equal(f.country.locked, true);
            assert.equal((await me('POST', '/api/v2/my/profile', { values: { country: 'السعودية' }, confirm: true })).data.code, 'LOCKED');
            assert.equal((await me('POST', '/api/v2/my/profile', { values: { nameAr: 'اسم تاني خالص' }, confirm: true })).data.code, 'LOCKED');
        });

        // a certificate with the current name, to see it reissued after the change
        const o = await login(owner);
        const file = await Customer.findOne({ 'contact.email': email });
        await o('POST', `/api/v2/programs/${program._id}/modules`, { titleAr: 'محور البروفايل', titleEn: 'Profile module', hours: 6 });
        const e = (await o('POST', '/api/v2/enrollments', { customer: String(file._id), program: String(program._id) })).data.item;
        const mod = e.modules[0].module;
        for (const action of ['start', 'submit', 'approve']) {
            const cur = (await o('GET', `/api/v2/enrollments/${e._id}`)).data.item;
            assert.equal((await o('POST', `/api/v2/enrollments/${e._id}/modules/${mod}`, { action, __v: cur.__v })).status, 200, action);
        }
        // nothing owed: the certificate issued itself when the module was approved (PLAN-V2 §5)
        const cert = await require('../../models/Certificate').findOne({ enrollment: e._id, module: mod, status: 'Valid' }).lean();
        assert.ok(cert && cert.cert_num, 'a certificate to reissue');

        let request;
        await t.test('a change request with a reason; one at a time', async () => {
            assert.equal((await me('POST', '/api/v2/my/profile/requests', { changes: { nameEn: 'Sarah Ahmed Mahmoud' } })).data.code, 'REASON_REQUIRED');
            assert.equal((await me('POST', '/api/v2/my/profile/requests', { changes: { nameEn: 'Sara Ahmed Mahmoud' }, reason: 'same name' })).data.code, 'NOTHING');
            const r = await me('POST', '/api/v2/my/profile/requests', { changes: { nameEn: 'Sarah Ahmed Mahmoud', passport: 'B98765432' }, reason: 'The passport spells it Sarah' });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            request = r.data.item;
            assert.deepEqual(request.changes.find((c) => c.field === 'passport'), { field: 'passport', from: '••••5678', to: '••••5432' });
            assert.equal((await me('POST', '/api/v2/my/profile/requests', { changes: { country: 'x y' }, reason: 'another one' })).data.code, 'PENDING_EXISTS');
        });

        await t.test('only the owner and customer service see and answer requests', async () => {
            const e1 = await login(emp);
            assert.equal((await e1('GET', '/api/v2/profile-requests')).status, 403);
            assert.equal((await e1('POST', `/api/v2/profile-requests/${request._id}/decide`, { decision: 'approve' })).status, 403);
            assert.equal((await me('GET', '/api/v2/profile-requests')).status, 403, 'not the customer either');
            const cs = await login(support);
            const list = await cs('GET', '/api/v2/profile-requests?status=pending');
            assert.equal(list.status, 200);
            assert.ok(list.data.items.some((i) => i._id === request._id));
            assert.equal((await cs('POST', `/api/v2/profile-requests/${request._id}/decide`, { decision: 'reject' })).data.code, 'REASON_REQUIRED');
        });

        await t.test('approval applies the change and reissues the certificate with the new name', async () => {
            const cs = await login(support);
            const r = await cs('POST', `/api/v2/profile-requests/${request._id}/decide`, { decision: 'approve', note: 'matches the passport', __v: request.__v });
            assert.equal(r.status, 200, JSON.stringify(r.data));
            // the module certificate and the final one (a one-module program completes with it)
            assert.equal(r.data.reissued.length, 2);
            assert.ok(r.data.reissued.includes(`${cert.cert_num}-2`));
            const f = Object.fromEntries((await me('GET', '/api/v2/my/profile')).data.fields.map((x) => [x.field, x]));
            assert.equal(f.nameEn.value, 'Sarah Ahmed Mahmoud');
            assert.equal(f.passport.value, '••••5432');
            const v = await (await fetch(`${base}/api/certificates/${cert.cert_num}-2`)).json();
            assert.equal(v.certificate.status, 'Valid');
            const decision = lastMail(email, 'profile-decision');
            assert.ok(decision && /Sarah Ahmed Mahmoud/.test(decision.html), 'the customer is told');
            assert.ok(!/B98765432/.test(decision.html), 'the full number is never emailed');
            assert.equal((await cs('POST', `/api/v2/profile-requests/${request._id}/decide`, { decision: 'approve' })).data.code, 'ALREADY_DECIDED');
        });

        await t.test('an employee cannot rename a customer whose name is on a certificate', async () => {
            await Customer.updateOne({ _id: file._id }, { $set: { owner: emp._id } });
            const e1 = await login(emp);
            const cur = (await e1('GET', `/api/v2/customers/${file._id}`)).data.item;
            const r = await e1('PUT', `/api/v2/customers/${file._id}`, { nameAr: 'اسم آخر للعميلة', __v: cur.__v });
            assert.equal(r.data.code, 'NAME_LOCKED', JSON.stringify(r.data));
        });

        await t.test('a cancelled request frees the customer to send another', async () => {
            const r = (await me('POST', '/api/v2/my/profile/requests', { changes: { country: 'السعودية' }, reason: 'I moved' })).data.item;
            assert.equal((await me('POST', `/api/v2/my/profile/requests/${r._id}/cancel`)).status, 200);
            assert.equal((await me('POST', '/api/v2/my/profile/requests', { changes: { country: 'السعودية' }, reason: 'I moved, really' })).status, 201);
        });

        await t.test('staff accounts have no website profile', async () => {
            assert.equal((await o('GET', '/api/v2/my/profile')).data.code, 'CUSTOMERS_ONLY');
        });

        await t.test('password reset: branded email, then "your password was changed"', async () => {
            const anon = client();
            assert.equal((await anon('POST', '/api/auth/forgot-password', { email, lang: 'ar' })).status, 200);
            const m = lastMail(email, 'reset-password');
            assert.ok(m && /reset-password\.html\?token=/.test(m.html));
            const token = (m.html.match(/token=([a-f0-9]{64})/) || [])[1];
            assert.equal((await anon('POST', '/api/auth/reset-password', { token, password: 'New-password-456' })).status, 200);
            assert.ok(lastMail(email, 'password-changed'), 'told about the change');
            assert.equal((await me('GET', '/api/v2/my/profile')).status, 401, 'old sessions end');
        });
    } finally {
        await User.updateMany({ email: new RegExp(`pf-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
