// The owner's dashboard numbers with the filters of PLAN-V2 §7: a program and an employee narrow
// money, sales and learning; the lists for the filters come with the answer; the attendance
// calendar and the programs' progress are there. Needs TEST_MONGO_URI (a test database).

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

test('owner dashboard filters', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ADMIN_EMAIL = '';
    process.env.ADMIN_PASSWORD = '';
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const User = require('../../models/User');
    const Course = require('../../models/Course');
    const Employee = require('../../models/Employee');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const owner = await User.create({ name: 'Dash Owner', email: `in-owner-${tag}@test.local`, password: hash, role: 'super_admin' });
    const emp = await User.create({ name: 'Dash Employee', email: `in-emp-${tag}@test.local`, password: hash, role: 'employee' });
    await Employee.create({ user: emp._id, employeeNo: `D-${tag}`, nameAr: 'موظف اللوحة' });
    const pA = await Course.create({ titleAr: `برنامج أ ${tag}`, slug: `in-a-${tag}`, type: 'course', specialty: 'test', price: 0 });
    const pB = await Course.create({ titleAr: `برنامج ب ${tag}`, slug: `in-b-${tag}`, type: 'course', specialty: 'test', price: 0 });

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

    try {
        assert.equal((await o('POST', '/api/auth/login', { email: owner.email, password: pw })).status, 200);
        const acct = (await o('POST', '/api/v2/finance/accounts', { code: `IN-${tag}`, nameAr: 'خزينة', type: 'cash', currency: 'KWD', allowEmployees: true })).data.item;
        // by: the customer's responsible employee, who collects the payment
        const mk = async (nameAr, program, amount, by) => {
            const c = (await o('POST', '/api/v2/customers', { nameAr, owner: String(by), contact: { phone: `0108${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 9)}` } })).data.item;
            const e = (await o('POST', '/api/v2/enrollments', { customer: c.id, program: String(program._id), owner: String(by) })).data.item;
            const p = await o('POST', '/api/v2/payments', { customer: c.id, enrollment: e._id, account: acct._id, method: 'cash', amount, collectedBy: String(by) });
            assert.equal(p.status, 201, JSON.stringify(p.data));
        };
        await mk('عميل البرنامج أ', pA, 300, emp._id);
        await mk('عميل البرنامج ب', pB, 500, owner._id);
        const kwd = (list) => (list.find((x) => x.currency === 'KWD') || {}).amount || 0;

        await t.test('a program narrows the money and the learning numbers', async () => {
            const all = await o('GET', '/api/v2/insights');
            assert.equal(all.status, 200, JSON.stringify(all.data));
            assert.equal(kwd(all.data.money.collected), 800);
            const a = (await o('GET', `/api/v2/insights?program=${pA._id}`)).data;
            assert.equal(kwd(a.money.collected), 300);
            assert.equal(a.learning.enrolled, 1);
            assert.equal(a.filters.active, true);
            assert.ok(a.learning.programProgress.every((r) => r.key === pA.titleAr), 'progress of the chosen program only');
        });

        await t.test('an employee narrows what they collected', async () => {
            const e = (await o('GET', `/api/v2/insights?employee=${emp._id}`)).data;
            assert.equal(kwd(e.money.collected), 300);
            assert.equal(e.staff.headcount, 1, 'the team numbers are that person');
        });

        await t.test('the answer carries the filter lists, the calendar and the progress', async () => {
            const d = (await o('GET', '/api/v2/insights')).data;
            assert.ok(d.options.programs.some((p) => String(p.id) === String(pA._id)));
            assert.ok(d.options.employees.some((x) => String(x.id) === String(emp._id)));
            assert.ok(Array.isArray(d.staff.calendar));
            assert.ok(Array.isArray(d.learning.programProgress));
        });
    } finally {
        await User.updateMany({ email: new RegExp(`in-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
