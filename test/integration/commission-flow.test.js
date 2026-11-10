// End-to-end test of Phase 4: rates, split, lines on confirmation, leader extra, refund and void
// reversals, approval (never one's own), payout from an account. Needs TEST_MONGO_URI (a test database).

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

test('commission flow', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const User = require('../../models/User');
    const Team = require('../../models/Team');
    const Employee = require('../../models/Employee');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const mk = (role) => User.create({ name: `${role} ${tag}`, email: `cf-${role}-${tag}@test.local`, password: hash, role });
    const [fin, leader, emp] = [await mk('finance_manager'), await mk('team_leader'), await mk('employee')];
    const team = await Team.create({ nameAr: `فريق ${tag}`, leader: leader._id });
    await Employee.create({ user: emp._id, employeeNo: `C-${tag}-1`, nameAr: emp.name, team: team._id });
    await Employee.create({ user: leader._id, employeeNo: `C-${tag}-2`, nameAr: leader.name, team: team._id });

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
        const f = await login(fin);
        const e = await login(emp);
        const tl = await login(leader);
        const yesterday = new Date(Date.now() - 864e5).toISOString();

        await f('POST', '/api/v2/commissions/rates', { user: emp._id, kind: 'employee', rate: 5, effectiveFrom: yesterday, reason: 'contract' });
        await f('POST', '/api/v2/commissions/rates', { user: leader._id, kind: 'team_leader', rate: 1, effectiveFrom: yesterday, reason: 'contract' });
        assert.equal((await e('POST', '/api/v2/commissions/rates', { user: emp._id, kind: 'employee', rate: 50, reason: 'x' })).status, 403);

        const acct = (await f('POST', '/api/v2/finance/accounts', { code: `CM-${tag}`, nameAr: 'خزينة', type: 'cash', currency: 'SAR', allowEmployees: true })).data.item;
        const customer = (await e('POST', '/api/v2/customers', { nameAr: 'عميل عمولة', contact: { phone: `0107${String(Date.now()).slice(-7)}` } })).data.item;

        let pay;
        await t.test('a confirmed payment creates the employee and leader lines', async () => {
            pay = (await e('POST', '/api/v2/payments', { customer: customer.id, account: acct._id, method: 'cash', amount: 2000 })).data.item;
            assert.equal((await e('GET', '/api/v2/commissions/statement')).data.lines.length, 0, 'pending payments earn nothing');
            await f('POST', `/api/v2/payments/${pay._id}/confirm`, { __v: pay.__v });
            const mine = (await e('GET', '/api/v2/commissions/statement')).data;
            assert.equal(mine.totals.earned, 100);
            const lead = (await tl('GET', '/api/v2/commissions/statement')).data;
            assert.equal(lead.totals.earned, 20);
            const teamView = (await tl('GET', `/api/v2/commissions/statement?user=${emp._id}`));
            assert.equal(teamView.status, 200, 'the leader sees team members');
            assert.equal((await e('GET', `/api/v2/commissions/statement?user=${leader._id}`)).status, 404, 'an employee sees only themself');
        });

        await t.test('a later rate does not touch the earned line', async () => {
            await f('POST', '/api/v2/commissions/rates', { user: emp._id, kind: 'employee', rate: 10, reason: 'raise' });
            assert.equal((await e('GET', '/api/v2/commissions/statement')).data.totals.earned, 100);
        });

        await t.test('a refund of a quarter reverses a quarter', async () => {
            const r = await e('POST', `/api/v2/payments/${pay._id}/refunds`, { amount: 500, reason: 'partial withdrawal' });
            await f('POST', `/api/v2/approvals/${r.data.approval._id}/decide`, { decision: 'approve', __v: r.data.approval.__v });
            const mine = (await e('GET', '/api/v2/commissions/statement')).data;
            assert.equal(mine.totals.reversed, -25);
            assert.equal(mine.totals.net, 75);
        });

        await t.test('approval and payout', async () => {
            const period = new Date().toISOString().slice(0, 7);
            assert.equal((await f('POST', '/api/v2/commissions/approve', { period })).status, 200);
            const ov = (await f('GET', `/api/v2/commissions/overview?period=${period}`)).data.items.find((r) => r._id === String(emp._id));
            assert.equal(ov.payable, 75);
            const p = await f('POST', '/api/v2/commissions/payouts', { beneficiary: emp._id, account: acct._id });
            assert.equal(p.status, 201, JSON.stringify(p.data));
            assert.equal(p.data.item.amount, 75);
            assert.equal((await f('POST', '/api/v2/commissions/payouts', { beneficiary: emp._id, account: acct._id })).data.code, 'NOTHING_TO_PAY');
            assert.equal((await e('GET', '/api/v2/commissions/statement')).data.totals.paid, 75);
        });

        await t.test('a void after payout leaves a negative line for the next month', async () => {
            const pay2 = (await f('POST', '/api/v2/payments', { customer: customer.id, account: acct._id, method: 'cash', amount: 1000, collectedBy: emp._id })).data.item;
            assert.equal(pay2.status, 'confirmed');
            const v = await e('POST', `/api/v2/payments/${pay2._id}/void`, { reason: 'duplicate entry' });
            await f('POST', `/api/v2/approvals/${v.data.approval._id}/decide`, { decision: 'approve', __v: v.data.approval.__v });
            const mine = (await e('GET', '/api/v2/commissions/statement')).data;
            const lines = mine.lines.filter((l) => l.receiptNo === pay2.receiptNo);
            assert.equal(lines.reduce((a, l) => a + l.amount, 0), 0, 'earned and reversed cancel out');
        });
    } finally {
        await User.updateMany({ email: new RegExp(`cf-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
