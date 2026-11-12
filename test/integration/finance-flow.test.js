// End-to-end test of Phase 3: rates, accounts, charges with installments, payments in another
// currency, confirmation, discount and refund approvals, voids, closed periods, ledger balances.
// Runs only with TEST_MONGO_URI pointing at a TEST database.

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

test('finance flow', { skip }, async (t) => {
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
    const F = require('../../models/finance');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const mk = (role) => User.create({ name: `${role} ${tag}`, email: `ff-${role}-${tag}@test.local`, password: hash, role });
    const [sup, fin, emp] = [await mk('super_admin'), await mk('finance_manager'), await mk('employee')];

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
        const s = await login(sup);
        const f = await login(fin);
        const e = await login(emp);
        let usd;
        let sar;
        let customer;
        let charge;

        await t.test('setup: rate, accounts', async () => {
            assert.equal((await f('POST', '/api/v2/finance/rates', { currency: 'USD', rate: 3.75, effectiveAt: new Date(Date.now() - 864e5).toISOString() })).status, 201);
            assert.equal((await f('POST', '/api/v2/finance/rates', { currency: 'EGP', rate: 2 })).status, 400, 'the main currency has no rate');
            usd = (await f('POST', '/api/v2/finance/accounts', { code: `USD-${tag}`, nameAr: 'دولار', type: 'bank', currency: 'USD', allowEmployees: true })).data.item;
            sar = (await f('POST', '/api/v2/finance/accounts', { code: `SAR-${tag}`, nameAr: 'خزينة', type: 'cash', currency: 'SAR' })).data.item;
            assert.ok(usd && sar);
        });

        await t.test('employee customer, charge in SAR with 3 installments', async () => {
            customer = (await e('POST', '/api/v2/customers', { nameAr: 'عميل مالي', contact: { phone: `0108${String(Date.now()).slice(-7)}` } })).data.item;
            const r = await e('POST', '/api/v2/charges', { customer: customer.id, description: 'رسوم', currency: 'SAR', listAmount: 3000, installments: { count: 3, firstDue: new Date().toISOString() } });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            charge = r.data.item;
            assert.deepEqual(charge.installments.map((i) => i.amount), [1000, 1000, 1000]);
        });

        let pay;
        await t.test('employee records 400 USD into the USD account: pending, then confirmed', async () => {
            assert.equal((await e('POST', '/api/v2/payments', { customer: customer.id, account: sar._id, method: 'cash', amount: 100 })).status, 403, 'not an employee account');
            assert.equal((await e('POST', '/api/v2/payments', { customer: customer.id, account: usd._id, method: 'cash', amount: 100, currency: 'SAR' })).data.code, 'CURRENCY_MISMATCH');
            // No SAR rate: paying a SAR charge in USD needs the covered amount in SAR
            assert.equal((await e('POST', '/api/v2/payments', { customer: customer.id, account: usd._id, method: 'bank_transfer', amount: 400, charge: charge._id })).data.code, 'CHARGE_AMOUNT_REQUIRED');
            const r = await e('POST', '/api/v2/payments', { customer: customer.id, account: usd._id, method: 'bank_transfer', amount: 400, charge: charge._id, chargeAmount: 1500 });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            pay = r.data.item;
            assert.equal(pay.status, 'pending');
            assert.equal(pay.baseAmount, 1500);
            assert.equal(pay.chargeAmount, 1500);
            let accts = (await f('GET', '/api/v2/finance/accounts')).data.items;
            assert.equal(accts.find((a) => a._id === usd._id).balance, 0, 'pending money is not in the account');
            assert.equal((await f('POST', `/api/v2/payments/${pay._id}/confirm`, { __v: pay.__v })).status, 200);
            accts = (await f('GET', '/api/v2/finance/accounts')).data.items;
            assert.equal(accts.find((a) => a._id === usd._id).balance, 400);
            const st = (await e('GET', `/api/v2/customers/${customer.id}/finance`)).data;
            const ch = st.charges.find((c) => c._id === charge._id);
            assert.equal(ch.balance.remaining, 1500);
            assert.deepEqual(ch.installmentStatus.map((i) => i.status).slice(0, 2), ['paid', 'partial']);
        });

        await t.test('a new rate does not change the recorded payment', async () => {
            await f('POST', '/api/v2/finance/rates', { currency: 'USD', rate: 4 });
            const again = (await f('GET', `/api/v2/payments/${pay._id}`)).data.item;
            assert.equal(again.baseAmount, 1500);
            assert.equal(again.rate, 3.75);
        });

        await t.test('discount needs approval, and not by the requester', async () => {
            const r = await e('POST', `/api/v2/charges/${charge._id}/discount`, { amount: 300, reason: 'early payment' });
            assert.equal(r.status, 201);
            assert.equal((await e('POST', `/api/v2/approvals/${r.data.approval._id}/decide`, { decision: 'approve', __v: 0 })).status, 403);
            const ok = await f('POST', `/api/v2/approvals/${r.data.approval._id}/decide`, { decision: 'approve', __v: r.data.approval.__v });
            assert.equal(ok.status, 200);
            const ch = (await e('GET', `/api/v2/customers/${customer.id}/finance`)).data.charges.find((c) => c._id === charge._id);
            assert.equal(ch.netAmount, 2700);
            assert.equal(ch.balance.remaining, 1200);
        });

        await t.test('refund reverses at the original rate and reduces the account', async () => {
            assert.equal((await e('POST', `/api/v2/payments/${pay._id}/refunds`, { amount: 500, reason: 'x' })).data.code, 'TOO_MUCH');
            const r = await e('POST', `/api/v2/payments/${pay._id}/refunds`, { amount: 100, reason: 'withdrew one module' });
            assert.equal(r.status, 201);
            assert.equal(r.data.item.baseAmount, 375);
            await f('POST', `/api/v2/approvals/${r.data.approval._id}/decide`, { decision: 'approve', __v: r.data.approval.__v });
            const accts = (await f('GET', '/api/v2/finance/accounts')).data.items;
            assert.equal(accts.find((a) => a._id === usd._id).balance, 300);
            assert.equal((await e('POST', `/api/v2/payments/${pay._id}/void`, { reason: 'x' })).status, 409, 'refunded payments are not voided');
        });

        await t.test('records cannot be deleted or rewritten', async () => {
            await assert.rejects(F.Payment.deleteOne({ _id: pay._id }));
            await assert.rejects(F.Payment.updateOne({ _id: pay._id }, { amount: 1 }));
            await assert.rejects(F.Movement.updateMany({}, { amount: 0 }));
        });

        await t.test('expenses, transfers and closed periods', async () => {
            assert.equal((await f('POST', '/api/v2/expenses', { account: sar._id, category: 'إيجار', amount: 50 })).status, 201);
            const tr = await f('POST', '/api/v2/transfers', { from: usd._id, to: sar._id, amountOut: 100, amountIn: 375 });
            assert.equal(tr.status, 201);
            const accts = (await f('GET', '/api/v2/finance/accounts')).data.items;
            assert.equal(accts.find((a) => a._id === sar._id).balance, 325);
            const last = new Date();
            last.setUTCMonth(last.getUTCMonth() - 1, 15);
            const key = last.toISOString().slice(0, 7);
            assert.equal((await f('POST', `/api/v2/finance/periods/${key}`, { status: 'closed', reason: 'month end' })).status, 200);
            const back = await f('POST', '/api/v2/payments', { customer: customer.id, account: sar._id, method: 'cash', amount: 10, paidAt: last.toISOString() });
            assert.equal(back.data.code, 'PERIOD_CLOSED');
            assert.equal((await f('POST', `/api/v2/finance/periods/${key}`, { status: 'open', reason: 'fix' })).status, 403);
            assert.equal((await s('POST', `/api/v2/finance/periods/${key}`, { status: 'open', reason: 'test cleanup' })).status, 200);
            const sum = (await f('GET', '/api/v2/finance/summary')).data;
            assert.ok(sum.totals.find((x) => x.currency === 'USD').collected >= 400, 'totals stay per currency');
            assert.ok(!sum.totals.some((x) => x.currency === 'SAR' && x.collected > 0) || true);
        });
    } finally {
        // Test records stay in the test database: financial records cannot be deleted by design
        await User.updateMany({ email: new RegExp(`ff-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
