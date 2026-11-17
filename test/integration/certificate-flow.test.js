// End-to-end test of Phase 5: issue module and final certificates, duplicates refused, public
// verification, reissue with a corrected name, cancellation frees the module. Needs TEST_MONGO_URI.

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

test('certificate flow', { skip }, async (t) => {
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
    const Certificate = require('../../models/Certificate');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const admin = await User.create({ name: 'Cert Admin', email: `crt-${tag}@test.local`, password: await bcrypt.hash(pw, 10), role: 'super_admin' });
    const program = await Course.create({ titleAr: `برنامج شهادات ${tag}`, titleEn: 'Cert program', slug: `cp-${tag}`, type: 'course', specialty: 'test', price: 0 });

    const jar = {};
    const a = async (method, url, body) => {
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
        assert.equal((await a('POST', '/api/auth/login', { email: admin.email, password: pw })).status, 200);
        await a('POST', `/api/v2/programs/${program._id}/modules`, { titleAr: 'محور الشهادة', titleEn: 'Cert module', hours: 10 });
        await a('POST', '/api/v2/accreditations', { nameAr: `اعتماد ${tag}`, number: 'AC-1', programs: [String(program._id)] });
        await a('POST', '/api/v2/certificate-templates', { name: `قالب ${tag}`, kind: 'module', layout: 'classic', isDefault: true, titleAr: 'شهادة {module}' });
        const customer = (await a('POST', '/api/v2/customers', { nameAr: 'متدربة الشهادة', nameEn: 'Cert Trainee', contact: { phone: `0106${String(Date.now()).slice(-7)}` } })).data.item;
        const e = (await a('POST', '/api/v2/enrollments', { customer: customer.id, program: String(program._id) })).data.item;
        const mod = e.modules[0].module;

        await t.test('nothing is issued before approval', async () => {
            assert.equal((await a('POST', '/api/v2/certificates/issue', { enrollment: e._id, module: mod })).data.code, 'NOT_ELIGIBLE');
        });

        let cert;
        await t.test('module approved → its certificate and the final one issue themselves, once (PLAN-V2 §5)', async () => {
            for (const action of ['start', 'submit', 'approve']) {
                const cur = (await a('GET', `/api/v2/enrollments/${e._id}`)).data.item;
                assert.equal((await a('POST', `/api/v2/enrollments/${e._id}/modules/${mod}`, { action, __v: cur.__v })).status, 200, action);
            }
            const auto = await Certificate.find({ enrollment: e._id, status: 'Valid' }).lean();
            assert.deepEqual(auto.map((c) => c.kind).sort(), ['module', 'program'], 'nothing owed: issued at once');
            cert = auto.find((c) => c.kind === 'module');
            assert.equal(cert.issuedBy, null, 'issued by the system');
            assert.equal((await a('GET', '/api/v2/certificates/eligible')).data.items.filter((i) => i.enrollment === e._id).length, 0, 'nothing left waiting');
            assert.match(cert.cert_num, /^NC-\d{7}$/);
            assert.equal(cert.design.titleAr, 'شهادة محور الشهادة');
            assert.equal(cert.hours, 10);
            assert.equal(cert.accreditations[0].number, 'AC-1');
            assert.equal((await a('POST', '/api/v2/certificates/issue', { enrollment: e._id, module: mod })).data.code, 'DUPLICATE');
            const after = (await a('GET', `/api/v2/enrollments/${e._id}`)).data.item;
            assert.equal(after.modules[0].status, 'certificate_issued');
        });

        await t.test('public verification shows only public fields', async () => {
            const v = await (await fetch(`${base}/api/certificates/${cert.cert_num}`)).json();
            assert.equal(v.certificate.trainee_name, 'متدربة الشهادة');
            assert.equal(v.certificate.status, 'Valid');
            assert.equal(v.certificate.customer, undefined);
            assert.equal(v.certificate.design, undefined);
        });

        await t.test('reissue with a corrected name; the old one points to the new', async () => {
            const r = await a('POST', `/api/v2/certificates/${cert._id}/reissue`, { nameAr: 'متدربة الشهادة المصححة', reason: 'spelling' });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            assert.equal(r.data.item.cert_num, `${cert.cert_num}-2`);
            const old = await (await fetch(`${base}/api/certificates/${cert.cert_num}`)).json();
            assert.equal(old.certificate.status, 'Replaced');
            assert.equal(old.certificate.replacedByNumber, `${cert.cert_num}-2`);
            await assert.rejects(Certificate.deleteOne({ _id: cert._id }));
            const doc = await Certificate.findById(r.data.item._id);
            doc.trainee_name = 'x';
            await assert.rejects(doc.save());

            assert.equal((await a('POST', `/api/v2/certificates/${r.data.item._id}/status`, { status: 'Cancelled', reason: 'test' })).status, 200);
            const mods = (await a('GET', `/api/v2/enrollments/${e._id}`)).data.item.modules;
            assert.equal(mods[0].status, 'approved', 'cancelling frees the module for a new certificate');
        });

        await t.test('the final certificate came with the completed program', async () => {
            const fin = await Certificate.findOne({ enrollment: e._id, kind: 'program', status: 'Valid' });
            assert.ok(fin, 'issued by itself when the program completed');
            assert.equal((await a('POST', '/api/v2/certificates/issue', { enrollment: e._id })).data.code, 'DUPLICATE');
        });
    } finally {
        await User.updateOne({ _id: admin._id }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
