// The four staff accounts (16 Nov 2026): the assistant sees everything but the money; anyone's
// role changes from the sign-in accounts page (with the employee file following); an employee's
// data request reaches the customer's employee, their team leader, the owner and the assistant.
// Needs TEST_MONGO_URI (a test database).

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

test('roles flow', { skip }, async (t) => {
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
    const Employee = require('../../models/Employee');
    const Team = require('../../models/Team');
    const Notification = require('../../models/Notification');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const mk = (role, n) => User.create({ name: `${role} ${n}`, email: `rl-${n}-${tag}@test.local`, password: hash, role });
    const owner = await mk('super_admin', 'o');
    const assistant = await mk('customer_support', 'a'); // an old customer service account
    const leader = await mk('team_leader', 'l');
    const emp1 = await mk('employee', 'e1');
    const emp2 = await mk('employee', 'e2');
    const buyer = await mk('customer', 'c');
    const team = await Team.create({ nameAr: `فريق ${tag}`, leader: leader._id });
    const cust = await Customer.create({ customerNo: `NB-8${String(Date.now()).slice(-8)}`, internalId: `rl-${tag}`, nameAr: 'عميل الأدوار', owner: emp1._id, team: team._id, status: 'customer', contact: { email: `rl-cust-${tag}@test.local`, phone: '01099988877', phoneNorm: require('../../lib/customerData').normalizePhone('01099988877') } });

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

    try {
        const O = await login(owner);
        const A = await login(assistant);

        await t.test('the assistant: the owner dashboard without money, no finance figures or reports', async () => {
            const me = (await A('GET', '/api/auth/me')).data;
            assert.ok(me);
            const ins = await A('GET', '/api/v2/insights');
            assert.equal(ins.status, 200);
            assert.equal(ins.data.money, null, 'no money figures');
            assert.equal(ins.data.attention.payments, undefined);
            assert.ok(ins.data.sales && ins.data.learning, 'the rest is there');
            assert.ok((await O('GET', '/api/v2/insights')).data.money, 'the owner sees the money');
            for (const url of ['/api/v2/finance/today', '/api/v2/finance/receivables', '/api/v2/finance/summary', '/api/v2/audit', '/api/v2/settings']) {
                assert.equal((await A('GET', url)).status, 403, url);
            }
            const ids = (await A('GET', '/api/v2/reports')).data.items.map((r) => r.id);
            for (const id of ['payments', 'installments', 'program_profit', 'revenue_expenses', 'commissions', 'audit']) assert.ok(!ids.includes(id), id);
            for (const id of ['customers', 'enrollments', 'certificates', 'complaints']) assert.ok(ids.includes(id), id);
            assert.equal((await A('GET', '/api/v2/reports/payments')).status, 403);
            assert.equal((await A('GET', `/api/v2/customers/${cust._id}`)).data.item.access, 'full', 'every customer, in full');
        });

        await t.test('anyone\'s role from the sign-in accounts page; the employee file follows', async () => {
            const list = await A('GET', `/api/v2/accounts?q=${tag}`);
            assert.equal(list.status, 200);
            assert.equal(list.data.items.find((u) => u.email === assistant.email).role, 'assistant', 'customer service reads as the assistant');
            // a customer becomes an employee
            const r = await A('POST', `/api/v2/users/${buyer._id}/role`, { role: 'employee' });
            assert.equal(r.status, 200, JSON.stringify(r.data));
            assert.equal((await User.findById(buyer._id)).role, 'employee');
            assert.equal((await Employee.findOne({ user: buyer._id })).status, 'active', 'an employee file was made');
            // and back to a customer: the file is closed and kept
            assert.equal((await A('POST', `/api/v2/users/${buyer._id}/role`, { role: 'customer' })).status, 200);
            assert.equal((await Employee.findOne({ user: buyer._id })).status, 'left');
            // an employee with customers hands them over first
            assert.equal((await A('POST', `/api/v2/users/${emp1._id}/role`, { role: 'customer' })).data.code, 'HAS_CUSTOMERS');
            // only the owner makes an owner; nobody changes their own role
            assert.equal((await A('POST', `/api/v2/users/${emp2._id}/role`, { role: 'super_admin' })).status, 403);
            assert.equal((await A('POST', `/api/v2/users/${assistant._id}/role`, { role: 'employee' })).data.code, 'SELF');
            const E2 = await login(emp2);
            assert.equal((await E2('GET', '/api/v2/accounts')).status, 403, 'not for employees');
            assert.equal((await E2('POST', `/api/v2/users/${buyer._id}/role`, { role: 'employee' })).status, 403);
        });

        await t.test('any owner changes another owner, even the old primary owner; the assistant cannot (18 Nov 2026)', async () => {
            const owner2 = await User.create({ name: 'owner 2', email: `rl-o2-${tag}@test.local`, password: hash, role: 'super_admin', isPrimaryOwner: true });
            const staff = await O('GET', `/api/v2/accounts?kind=staff&q=${tag}`);
            assert.ok(staff.data.items.some((u) => u.email === owner2.email && u.role === 'super_admin'), 'the team tab lists the owners');
            assert.ok(!staff.data.items.some((u) => u.email === buyer.email && u.role === 'customer'), 'and no customers');
            assert.equal((await A('POST', `/api/v2/users/${owner2._id}/role`, { role: 'assistant' })).data.code, 'OWNER_ONLY');
            const down = await O('POST', `/api/v2/users/${owner2._id}/role`, { role: 'assistant' });
            assert.equal(down.status, 200, JSON.stringify(down.data));
            const now = await User.findById(owner2._id);
            assert.equal(now.role, 'assistant');
            assert.equal(now.isPrimaryOwner, false, 'no longer protected');
            assert.equal((await O('POST', `/api/v2/users/${owner2._id}/role`, { role: 'super_admin' })).status, 200, 'and back to an owner');
            assert.equal((await User.findById(owner2._id)).role, 'super_admin');
            await Employee.deleteMany({ user: owner2._id });
        });

        await t.test('an employee finds a customer by mobile: the name and who they are with; the request reaches four people', async () => {
            const E2 = await login(emp2);
            const look = await E2('GET', '/api/v2/customers/lookup?q=01099988877');
            assert.equal(look.status, 200);
            assert.equal(look.data.items.length, 1);
            assert.equal(look.data.items[0].owner.id, String(emp1._id));
            assert.equal(look.data.items[0].status, undefined);
            const req = await E2('POST', `/api/v2/customers/${cust._id}/access-requests`, { sections: ['contact'], purpose: 'متابعة سداد القسط', durationHours: 2 });
            assert.equal(req.status, 201, JSON.stringify(req.data));
            for (const u of [emp1, leader, owner, assistant]) {
                assert.ok(await Notification.exists({ user: u._id, type: 'access_request' }), u.email);
            }
            // the team leader decides for the team's files
            const L = await login(leader);
            const inbox = (await L('GET', '/api/v2/access-requests?box=incoming')).data.items;
            const r = inbox.find((x) => x._id === req.data.item._id);
            assert.ok(r, 'the leader sees it');
            const ok = await L('POST', `/api/v2/access-requests/${r._id}/decide`, { decision: 'approve', __v: r.__v });
            assert.equal(ok.status, 200, JSON.stringify(ok.data));
            assert.equal((await E2('GET', `/api/v2/customers/${cust._id}`)).data.item.access, 'granted');
        });
    } finally {
        await Customer.deleteOne({ _id: cust._id });
        await Team.deleteOne({ _id: team._id });
        await Employee.deleteMany({ user: buyer._id });
        await User.updateMany({ email: new RegExp(`rl-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
