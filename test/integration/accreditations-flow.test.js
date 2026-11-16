// Accreditations per program, and one module with its own (16 Nov 2026): a module certificate
// carries the program's accreditations unless that module has its own list; changing one module
// leaves the others alone. Needs TEST_MONGO_URI (a test database).

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

test('accreditations flow', { skip }, async (t) => {
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
    const Course = require('../../models/Course');
    const ProgramModule = require('../../models/ProgramModule');
    const Accreditation = require('../../models/Accreditation');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const owner = await User.create({ name: 'Acc Owner', email: `acc-o-${tag}@test.local`, password: await bcrypt.hash(pw, 10), role: 'super_admin' });
    const program = await Course.create({ titleAr: `دبلوم الاعتمادات ${tag}`, slug: `acc-${tag}`, type: 'diploma', specialty: 'test', price: 0 });
    const [a1, a2] = [await Accreditation.create({ nameAr: `اعتماد أ ${tag}` }), await Accreditation.create({ nameAr: `اعتماد ب ${tag}` })];

    const jar = {};
    const call = async (method, url, body) => {
        const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
        for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const [k, v] = pair.split('='); if (v === '') delete jar[k]; else jar[k] = v; }
        let data = null;
        try { data = await res.json(); } catch { data = null; }
        return { status: res.status, data };
    };

    try {
        assert.equal((await call('POST', '/api/auth/login', { email: owner.email, password: pw })).status, 200);
        for (const titleAr of ['محور ١', 'محور ٢']) await call('POST', `/api/v2/programs/${program._id}/modules`, { titleAr });
        const [m1, m2] = await ProgramModule.find({ program: program._id }).sort({ order: 1 });
        const { _accreditationsFor: forCert } = require('../../modules/learning/certificateController');

        await t.test('the program gets its accreditations from its own page', async () => {
            assert.equal((await call('PUT', `/api/v2/programs/${program._id}/accreditations`, { ids: [String(a1._id)] })).status, 200);
            const d = (await call('GET', `/api/v2/programs/${program._id}/accreditations`)).data;
            assert.equal(d.items.find((x) => String(x._id) === String(a1._id)).inProgram, true);
            assert.equal(d.items.find((x) => String(x._id) === String(a2._id)).inProgram, false);
            assert.deepEqual((await forCert(program._id, new Date(), m1._id)).map((a) => a.nameAr), [a1.nameAr]);
        });

        await t.test('one module with its own list; the other module keeps the program\'s', async () => {
            assert.equal((await call('PUT', `/api/v2/modules/${m2._id}/accreditations`, { custom: true, ids: [String(a2._id)] })).status, 200);
            assert.deepEqual((await forCert(program._id, new Date(), m2._id)).map((a) => a.nameAr), [a2.nameAr], 'module 2: its own');
            assert.deepEqual((await forCert(program._id, new Date(), m1._id)).map((a) => a.nameAr), [a1.nameAr], 'module 1: unchanged');
            assert.deepEqual((await forCert(program._id, new Date())).map((a) => a.nameAr), [a1.nameAr], 'the program certificate: unchanged');
            assert.equal((await call('PUT', `/api/v2/modules/${m2._id}/accreditations`, { custom: false })).status, 200);
            assert.deepEqual((await forCert(program._id, new Date(), m2._id)).map((a) => a.nameAr), [a1.nameAr], 'back to the program\'s');
        });
    } finally {
        await Accreditation.deleteMany({ _id: { $in: [a1._id, a2._id] } });
        await ProgramModule.deleteMany({ program: program._id });
        await Course.deleteOne({ _id: program._id });
        await User.deleteOne({ _id: owner._id });
        server.close();
        await mongoose.disconnect();
    }
});
