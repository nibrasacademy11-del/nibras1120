// End-to-end test of automatic certificates (PLAN-V2 stage 4): a module completed by its lectures
// issues its certificate only when the program is paid; while money is owed the customer sees
// nothing; customer service may release one earlier with a reason; paying the balance issues the
// rest at once, with the "certificate ready" email. Needs TEST_MONGO_URI (a test database).

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

test('automatic certificates flow', { skip }, async (t) => {
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
    const Customer = require('../../models/Customer');
    const Course = require('../../models/Course');
    const Certificate = require('../../models/Certificate');
    const ProgramModule = require('../../models/ProgramModule');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const owner = await User.create({ name: 'Cert Owner', email: `ac-owner-${tag}@test.local`, password: hash, role: 'super_admin' });
    const support = await User.create({ name: 'Cert Support', email: `ac-cs-${tag}@test.local`, password: hash, role: 'customer_support' });
    const learner = await User.create({ name: 'متعلمة الشهادات', email: `ac-learner-${tag}@test.local`, password: hash, role: 'customer' });
    const file = await Customer.create({ customerNo: `NB-6${String(Date.now()).slice(-8)}`, internalId: `ac-${tag}`, nameAr: 'متعلمة الشهادات', nameEn: 'Cert Learner', user: learner._id, status: 'customer', contact: { email: learner.email } });
    const program = await Course.create({ titleAr: `دبلوم الشهادات ${tag}`, titleEn: 'Certificates diploma', slug: `ac-${tag}`, type: 'diploma', specialty: 'test', price: 0 });

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
    const certMails = () => mail.outbox.filter((m) => m.to === learner.email && m.kind === 'certificate-ready');

    try {
        const o = await login(owner);
        const cs = await login(support);
        const me = await login(learner);
        await o('PUT', '/api/v2/settings', { reason: 'test', settings: { 'certificates.paymentRule': 'customer' } });
        for (const titleAr of ['محور أول', 'محور ثان']) await o('POST', `/api/v2/programs/${program._id}/modules`, { titleAr, hours: 12 });
        const [m1, m2] = (await ProgramModule.find({ program: program._id }).sort({ order: 1 })).map((m) => String(m._id));
        const group = (await o('POST', `/api/v2/programs/${program._id}/cohorts`, { nameAr: 'مجموعة الشهادات', status: 'open' })).data.item;
        const enrollment = (await o('POST', '/api/v2/enrollments', { customer: String(file._id), program: String(program._id) })).data.item;
        const acct = (await o('POST', '/api/v2/finance/accounts', { code: `AC-${tag}`, nameAr: 'خزينة', type: 'cash', currency: 'SAR', allowEmployees: true })).data.item;
        const charge = (await o('POST', '/api/v2/charges', { customer: String(file._id), description: 'رسوم الدبلوم', currency: 'SAR', listAmount: 900 })).data.item;
        const lecture = async (module) => (await o('POST', `/api/v2/groups/${group._id}/lectures`, { mode: 'manual', titleAr: 'محاضرة', module, startsAt: new Date(Date.now() - 3600e3).toISOString(), joinUrl: 'https://zoom.us/j/9' })).data.item._id;
        const l1 = await lecture(m1);
        const l2 = await lecture(m2);

        await t.test('a module completed while money is owed: no certificate, and the customer sees nothing', async () => {
            const j = await me('POST', `/api/v2/my/lectures/${l1}/join`);
            assert.ok(j.data.counted);
            assert.equal((await o('POST', `/api/v2/modules/${m1}/finish`)).data.completed, 1, 'the owner finishes the module: it completed');
            assert.equal(await Certificate.countDocuments({ customer: file._id }), 0);
            const mine = (await me('GET', '/api/v2/my/certificates')).data;
            assert.deepEqual(mine, { items: [] }, 'not even that one is waiting');
            assert.equal(certMails().length, 0);
        });

        await t.test('customer service sees it waiting and may release it, only with a reason', async () => {
            const waiting = (await cs('GET', '/api/v2/certificates/eligible')).data.items.filter((i) => i.enrollment === enrollment._id);
            assert.equal(waiting.length, 1);
            assert.deepEqual(waiting[0].unpaid, [{ currency: 'SAR', remaining: 900 }]);
            assert.equal((await cs('POST', '/api/v2/certificates/issue', { enrollment: enrollment._id, module: m1 })).status, 403, 'issuing without a reason is the owner\'s');
            const r = await cs('POST', '/api/v2/certificates/issue', { enrollment: enrollment._id, module: m1, waivePayment: 'منحة تفوق', email: true });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            assert.equal((await Certificate.findById(r.data.item._id)).paymentWaiver, 'منحة تفوق');
            assert.equal((await me('GET', '/api/v2/my/certificates')).data.items.length, 1, 'a released certificate shows');
        });

        await t.test('paying the balance issues the rest at once, and the customer is emailed', async () => {
            await me('POST', `/api/v2/my/lectures/${l2}/join`);
            const fin = (await o('POST', `/api/v2/modules/${m2}/finish`)).data;
            assert.equal(fin.waitingPayment, 1, 'finished, but the certificate waits for the payment');
            assert.equal(await Certificate.countDocuments({ customer: file._id }), 1, 'still owed: the second waits');
            const pay = await o('POST', '/api/v2/payments', { customer: String(file._id), charge: charge._id, account: acct._id, method: 'cash', amount: 900 });
            assert.equal(pay.status, 201, JSON.stringify(pay.data));
            const all = await Certificate.find({ customer: file._id, status: 'Valid' }).lean();
            assert.deepEqual(all.map((c) => c.kind).sort(), ['module', 'module', 'program'], 'the module and the final certificate');
            const m = certMails().at(-1);
            assert.ok(m, 'certificate ready email');
            assert.match(m.html, /certificate\.html\?id=/, 'links to the certificate page on the website');
            assert.equal((await me('GET', '/api/v2/my/certificates')).data.items.length, 3);
        });

        await t.test('the customer opens their certificate to download it; nobody else does', async () => {
            const c = await Certificate.findOne({ customer: file._id, module: m2, status: 'Valid' });
            const r = await me('GET', `/api/v2/certificates/${c._id}`);
            assert.equal(r.status, 200);
            assert.equal(r.data.item.trainee_name, 'متعلمة الشهادات');
            assert.ok(r.data.item.design && r.data.verifyUrl);
            const other = await User.create({ name: 'Other', email: `ac-other-${tag}@test.local`, password: hash, role: 'customer' });
            const x = await login(other);
            assert.equal((await x('GET', `/api/v2/certificates/${c._id}`)).status, 404);
        });
    } finally {
        await User.updateMany({ email: new RegExp(`ac-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
