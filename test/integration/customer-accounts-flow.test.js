// Customer accounts page (15 Nov 2026): customer service and the owner list customers' sign-in
// accounts and give a temporary password; the customer must choose a new one first. Staff accounts
// cannot be reset from here, and other roles cannot see the page. Needs TEST_MONGO_URI.

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

test('customer accounts flow', { skip }, async (t) => {
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
    const User = require('../../models/User');
    const Customer = require('../../models/Customer');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const support = await User.create({ name: 'CS', email: `ca-cs-${tag}@test.local`, password: hash, role: 'customer_support' });
    const employee = await User.create({ name: 'Emp', email: `ca-emp-${tag}@test.local`, password: hash, role: 'employee' });
    const owner = await User.create({ name: 'Owner', email: `ca-owner-${tag}@test.local`, password: hash, role: 'super_admin' });
    const cu = await User.create({ name: `عميلة نسيت ${tag}`, email: `ca-cu-${tag}@test.local`, password: hash, role: 'customer' });
    await Customer.create({ customerNo: `NB-7${String(Date.now()).slice(-8)}`, internalId: `ca-${tag}`, nameAr: 'عميلة نسيت', user: cu._id, status: 'customer', contact: { email: cu.email } });

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
    const login = async (email, password = pw) => {
        const c = client();
        const r = await c('POST', '/api/auth/login', { email, password });
        return { c, status: r.status };
    };

    try {
        const cs = (await login(support.email)).c;
        const customerOld = (await login(cu.email)).c;

        await t.test('customer service lists customers with their sign-up date; staff are not listed', async () => {
            const r = await cs('GET', `/api/v2/customer-accounts?q=${encodeURIComponent(tag)}`);
            assert.equal(r.status, 200, JSON.stringify(r.data));
            assert.deepEqual(r.data.items.map((u) => u.email), [cu.email]);
            assert.ok(r.data.items[0].createdAt);
            assert.ok(r.data.items[0].customer.customerNo);
            assert.equal(r.data.items[0].password, undefined, 'no password hash');
        });

        await t.test('an employee cannot see the page', async () => {
            const emp = (await login(employee.email)).c;
            assert.equal((await emp('GET', '/api/v2/customer-accounts')).status, 403);
            assert.equal((await emp('POST', `/api/v2/customer-accounts/${cu._id}/reset-password`)).status, 403);
        });

        let temp;
        await t.test('a temporary password: the old one stops, devices sign out, a new one is required', async () => {
            const r = await cs('POST', `/api/v2/customer-accounts/${cu._id}/reset-password`);
            assert.equal(r.status, 200, JSON.stringify(r.data));
            temp = r.data.password;
            assert.match(temp, /^[A-Za-z2-9]{10}$/);
            assert.equal((await customerOld('GET', '/api/auth/me')).status, 401, 'the old session is signed out');
            assert.notEqual((await login(cu.email, pw)).status, 200, 'the old password stops working');
            const fresh = await login(cu.email, temp);
            assert.equal(fresh.status, 200);
            const me = await fresh.c('GET', '/api/auth/me');
            assert.equal(me.data.user.mustChangePassword, true);
            assert.equal((await fresh.c('GET', '/api/v2/my/enrollments')).data.code, 'PASSWORD_CHANGE_REQUIRED');
            const ch = await fresh.c('POST', '/api/v2/me/password', { currentPassword: temp, newPassword: 'My-own-new-pass-1' });
            assert.equal(ch.status, 200, JSON.stringify(ch.data));
            assert.equal((await User.findById(cu._id)).mustChangePassword, false);
        });

        await t.test('staff accounts are never reset from here', async () => {
            const o = (await login(owner.email)).c;
            assert.equal((await o('POST', `/api/v2/customer-accounts/${employee._id}/reset-password`)).data.code, 'NOT_A_CUSTOMER');
            assert.equal((await o('GET', '/api/v2/customer-accounts')).status, 200, 'the owner sees the page too');
        });
    } finally {
        await User.updateMany({ email: new RegExp(`ca-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
