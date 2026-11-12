// End-to-end test of Phase 10: group approval, the payment gate, the group rule, the waiver,
// paper delivery steps and what the customer sees. Runs only with TEST_MONGO_URI (a TEST database).
// Financial records and certificates cannot be deleted by design, so they stay in the test database.

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

test('group certificates flow', { skip }, async (t) => {
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
    const Course = require('../../models/Course');
    const Customer = require('../../models/Customer');
    const Cohort = require('../../models/Cohort');
    const Certificate = require('../../models/Certificate');
    const groupCerts = require('../../modules/learning/groupCertificates');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const mk = (role) => User.create({ name: `${role} ${tag}`, email: `gc-${role}-${tag}@test.local`, password: hash, role });
    const [admin, learner] = [await mk('super_admin'), await mk('customer')];
    const program = await Course.create({ titleAr: `ماجستير ${tag}`, slug: `gc-${tag}`, type: 'master', specialty: 'test', price: 0 });

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
        const a = await login(admin);
        const me = await login(learner);
        await a('PUT', '/api/v2/settings', { reason: 'test', settings: { 'certificates.paymentRule': 'customer' } });
        for (const title of ['محور أ', 'محور ب']) assert.equal((await a('POST', `/api/v2/programs/${program._id}/modules`, { titleAr: title })).status, 201);
        const cohortId = (await a('POST', `/api/v2/programs/${program._id}/cohorts`, { nameAr: 'مجموعة الشهادات' })).data.item._id;
        const file = await Customer.create({ customerNo: `NB-C${tag}`, internalId: `ic-${tag}`, nameAr: 'متدرب الشهادة', user: learner._id, status: 'customer', contact: { email: learner.email } });
        const add = await a('POST', `/api/v2/groups/${cohortId}/members`, { customers: [String(file._id)], enroll: true });
        assert.equal(add.data.added, 1);

        const acct = (await a('POST', '/api/v2/finance/accounts', { code: `GC-${tag}`, nameAr: 'خزينة', type: 'cash', currency: 'SAR', allowEmployees: true })).data.item;
        const charge = await a('POST', '/api/v2/charges', { customer: String(file._id), description: 'رسوم الماجستير', currency: 'SAR', listAmount: 1000 });
        assert.equal(charge.status, 201, JSON.stringify(charge.data));

        let modA;
        await t.test('the admin approves a module for the whole group', async () => {
            const g = await a('GET', `/api/v2/groups/${cohortId}/certificates`);
            assert.equal(g.status, 200);
            modA = g.data.modules[0].module;
            assert.ok(g.data.items.every((i) => i.reason === 'not_approved'));
            const r = await a('POST', `/api/v2/groups/${cohortId}/approve-module`, { module: modA });
            assert.equal(r.data.approved, 1);
            assert.equal((await a('POST', `/api/v2/groups/${cohortId}/approve-module`, { module: modA })).data.already, 1);
        });

        await t.test('no certificate while money is owed; the customer is told how much', async () => {
            const g = await a('GET', `/api/v2/groups/${cohortId}/certificates`);
            const item = g.data.items.find((i) => i.module === modA);
            assert.equal(item.reason, 'unpaid');
            assert.deepEqual(item.remaining, [{ currency: 'SAR', remaining: 1000 }]);
            const direct = await a('POST', '/api/v2/certificates/issue', { enrollment: item.enrollment, module: modA });
            assert.equal(direct.data.code, 'UNPAID');
            const issued = await a('POST', `/api/v2/groups/${cohortId}/certificates/issue`, {});
            assert.equal(issued.data.results.length, 0, 'nothing ready');
            const mine = await me('GET', '/api/v2/my/certificates');
            assert.equal(mine.data.pending.length, 1);
            assert.deepEqual(mine.data.pending[0].remaining, [{ currency: 'SAR', remaining: 1000 }]);
        });

        await t.test('after paying, the daily run issues it under an "on approval" rule', async () => {
            assert.equal((await a('PUT', `/api/v2/groups/${cohortId}/certificate-rule`, { mode: 'on_approval', issue: 'modules', sendEmail: false })).status, 200);
            const pay = await a('POST', '/api/v2/payments', { customer: String(file._id), charge: charge.data.item._id, account: acct._id, method: 'cash', amount: 1000 });
            assert.equal(pay.status, 201, JSON.stringify(pay.data));
            const run = await groupCerts.runDue();
            assert.ok(run.issued >= 1, JSON.stringify(run));
            const cert = await Certificate.findOne({ customer: file._id, module: modA, status: 'Valid' });
            assert.ok(cert);
            assert.equal(cert.issuedBy, null, 'issued by the system');
            const g = await a('GET', `/api/v2/groups/${cohortId}/certificates`);
            assert.equal(g.data.items.find((i) => i.module === modA).reason, 'issued');
            assert.equal((await me('GET', '/api/v2/my/certificates')).data.pending.length, 0);
        });

        await t.test('paper delivery moves forward only and needs the receiver', async () => {
            const cert = await Certificate.findOne({ customer: file._id, module: modA, status: 'Valid' });
            const step = (s, body = {}) => a('POST', `/api/v2/certificates/${cert._id}/delivery`, { step: s, ...body });
            assert.equal((await step('delivered', { receivedBy: 'x' })).data.code, 'WRONG_STEP');
            assert.equal((await step('printed')).status, 200);
            assert.equal((await step('ready')).status, 200);
            assert.equal((await step('delivered')).data.code, 'RECEIVER_REQUIRED');
            const done = await step('delivered', { receivedBy: 'المتدرب نفسه' });
            assert.equal(done.data.item.delivery.paper.status, 'delivered');
            const opened = await me('GET', `/api/v2/certificates/${cert._id}`);
            assert.equal(opened.status, 200);
            assert.ok((await Certificate.findById(cert._id)).delivery.viewedAt, 'opening it in the portal is recorded');
            const list = await a('GET', `/api/v2/certificates?delivery=paper_pending&customer=${file._id}`);
            assert.equal(list.data.items.length, 0);
        });

        await t.test('a waiver issues despite a balance, and is recorded', async () => {
            const modB = (await a('GET', `/api/v2/groups/${cohortId}/certificates`)).data.modules[1].module;
            await a('POST', `/api/v2/groups/${cohortId}/approve-module`, { module: modB });
            await a('POST', '/api/v2/charges', { customer: String(file._id), description: 'رسوم إضافية', currency: 'SAR', listAmount: 200 });
            const item = (await a('GET', `/api/v2/groups/${cohortId}/certificates`)).data.items.find((i) => i.module === modB);
            assert.equal(item.reason, 'unpaid');
            const w = await a('POST', '/api/v2/certificates/issue', { enrollment: item.enrollment, module: modB, waivePayment: 'منحة' });
            assert.equal(w.status, 201, JSON.stringify(w.data));
            assert.equal((await Certificate.findById(w.data.item._id)).paymentWaiver, 'منحة');
        });
    } finally {
        await Cohort.updateMany({ program: program._id }, { $set: { status: 'cancelled', 'certificateRule.mode': 'manual' } });
        await User.updateMany({ email: new RegExp(`gc-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
