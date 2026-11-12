// End-to-end test of Phase 6: every report runs, Excel export, analytics, complaints and ratings,
// and an employee cannot reach reports beyond their permissions. Needs TEST_MONGO_URI.

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

test('reports flow', { skip }, async (t) => {
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
    const { REPORTS } = require('../../modules/reports/registry');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const sup = await User.create({ name: 'Rep Admin', email: `rep-a-${tag}@test.local`, password: hash, role: 'super_admin' });
    const emp = await User.create({ name: 'Rep Emp', email: `rep-e-${tag}@test.local`, password: hash, role: 'employee' });
    const cust = await User.create({ name: 'Rep Customer', email: `rep-c-${tag}@test.local`, password: hash, role: 'student' });

    const client = () => {
        const jar = {};
        return async (method, url, body, raw) => {
            const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
            for (const c of res.headers.getSetCookie()) {
                const [pair] = c.split(';');
                const [k, v] = pair.split('=');
                if (v === '') delete jar[k];
                else jar[k] = v;
            }
            if (raw) return res;
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
        const a = await login(sup);
        const e = await login(emp);

        await t.test('every report runs for the super admin', async () => {
            for (const r of REPORTS) {
                const res = await a('GET', `/api/v2/reports/${r.id}`);
                assert.equal(res.status, 200, `${r.id}: ${JSON.stringify(res.data)}`);
                assert.ok(Array.isArray(res.data.columns) && Array.isArray(res.data.rows), r.id);
            }
        });

        await t.test('Excel export and the audit trail', async () => {
            const res = await a('GET', '/api/v2/reports/customers/xlsx?lang=ar', null, true);
            assert.equal(res.status, 200);
            assert.match(res.headers.get('content-type'), /spreadsheetml/);
            const buf = Buffer.from(await res.arrayBuffer());
            assert.equal(buf.readUInt32LE(0), 0x04034b50);
            const log = await a('GET', '/api/v2/audit?action=report.exported');
            assert.ok(log.data.items.length >= 1);
        });

        await t.test('an employee is kept to their reports', async () => {
            assert.equal((await e('GET', '/api/v2/reports/audit')).status, 403);
            assert.equal((await e('GET', '/api/v2/reports/revenue_expenses')).status, 403);
            assert.equal((await e('GET', '/api/v2/reports/customers/xlsx', null, true)).status, 403, 'employees have no export permission by default');
            assert.equal((await e('GET', '/api/v2/analytics')).status, 403);
            assert.equal((await e('GET', '/api/v2/reports/customers')).status, 200);
        });

        await t.test('analytics', async () => {
            const res = await a('GET', '/api/v2/analytics');
            assert.equal(res.status, 200, JSON.stringify(res.data));
            assert.ok(res.data.kpis.newCustomers);
        });

        await t.test('a customer files a complaint, staff resolve it, the customer rates it', async () => {
            const c = await login(cust);
            const files = await a('GET', `/api/v2/customers?q=${encodeURIComponent(cust.email)}`);
            assert.equal(files.data.items.length, 0, 'login does not create a file; registration does');
            await a('POST', '/api/v2/customers', { nameAr: 'عميل شكوى', contact: { email: cust.email } });
            const Customer = require('../../models/Customer');
            await Customer.updateOne({ 'contact.email': cust.email }, { $set: { user: cust._id } });
            const r = await c('POST', '/api/v2/complaints', { subject: 'تأخر الشهادة', description: 'لم تصلني', category: 'certificate' });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            assert.equal(r.data.item.channel, 'portal');
            assert.equal((await c('PUT', `/api/v2/complaints/${r.data.item._id}`, { status: 'closed' })).status, 403);
            const fix = await a('PUT', `/api/v2/complaints/${r.data.item._id}`, { status: 'resolved', __v: r.data.item.__v });
            assert.equal(fix.data.code, 'REASON_REQUIRED');
            assert.equal((await a('PUT', `/api/v2/complaints/${r.data.item._id}`, { status: 'resolved', resolution: 'تم الإصدار', note: 'internal check', internal: true, __v: r.data.item.__v })).status, 200);
            const mine = await c('GET', '/api/v2/complaints');
            assert.ok(mine.data.items[0].updates.every((u) => !u.internal), 'customers do not see internal notes');
            assert.equal((await c('POST', '/api/v2/my/ratings', { kind: 'complaint', complaint: r.data.item._id, score: 4 })).status, 200);
            assert.equal((await c('GET', '/api/v2/reports')).data.items.length, 0);
        });
    } finally {
        await User.updateMany({ email: new RegExp(`rep-.-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
