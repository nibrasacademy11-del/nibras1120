// A certificate written by hand (17 Nov 2026): the owner issues one for someone with no account,
// with the next number or one they type; it is verified on the website like any other; a number
// cannot be used twice; a kind without its design yet is refused; an employee cannot do it.
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

test('manual certificate flow', { skip }, async (t) => {
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
    const Certificate = require('../../models/Certificate');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const owner = await User.create({ name: 'Manual Owner', email: `mc-o-${tag}@test.local`, password: await bcrypt.hash(pw, 10), role: 'super_admin' });
    const staff = await User.create({ name: 'Manual Emp', email: `mc-e-${tag}@test.local`, password: await bcrypt.hash(pw, 10), role: 'employee' });
    const typed = `MT-${tag.toUpperCase().slice(-6)}`;

    const session = () => {
        const jar = {};
        return async (method, url, body) => {
            const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
            for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const [k, v] = pair.split('='); if (v === '') delete jar[k]; else jar[k] = v; }
            let data = null;
            try { data = await res.json(); } catch { data = null; }
            return { status: res.status, data };
        };
    };
    const asOwner = session();
    const asStaff = session();
    const made = [];
    const form = { docType: 'course', gender: 'female', name: 'فوزيه عبدالله جده حكمي', nameEn: 'Fawziah Abdullah Jidah Hakami', program: 'دورة إدارة الموارد البشرية', programEn: 'Human Resources Management Course', hours: 60, date: '2026-11-02' };

    try {
        assert.equal((await asOwner('POST', '/api/auth/login', { email: owner.email, password: pw })).status, 200);
        assert.equal((await asStaff('POST', '/api/auth/login', { email: staff.email, password: pw })).status, 200);

        await t.test('the kinds: course, master, doctorate and diploma are ready; the degree waits for its design', async () => {
            const r = await asOwner('GET', '/api/v2/certificates/manual/types');
            assert.equal(r.status, 200);
            const ready = Object.fromEntries(r.data.items.map((x) => [x.key, x.ready]));
            assert.deepEqual(ready, { course: true, master: true, phd: true, diploma: true, degree: false });
        });

        await t.test('the owner issues one with the next number; it is verified publicly', async () => {
            const r = await asOwner('POST', '/api/v2/certificates/manual', { ...form, numberMode: 'auto' });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            made.push(r.data.item._id);
            assert.match(r.data.item.cert_num, /^NC-\d+/);
            assert.equal(r.data.item.kind, 'manual');
            assert.equal(r.data.item.design.layout, 'nibras');
            assert.equal(r.data.item.design.gender, 'female');
            assert.equal(r.data.item.design.subjectEn, 'Human Resources Management Course');
            const v = await asStaff('GET', `/api/certificates/${encodeURIComponent(r.data.item.cert_num)}`);
            assert.equal(v.status, 200);
            assert.equal(v.data.certificate.trainee_name, form.name);
            assert.equal(v.data.certificate.status, 'Valid');
            assert.equal(v.data.certificate.hours, 60);
        });

        await t.test('a typed number is kept, and cannot be used twice', async () => {
            const r = await asOwner('POST', '/api/v2/certificates/manual', { ...form, numberMode: 'manual', number: typed.toLowerCase() });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            made.push(r.data.item._id);
            assert.equal(r.data.item.cert_num, typed);
            const again = await asOwner('POST', '/api/v2/certificates/manual', { ...form, numberMode: 'manual', number: typed });
            assert.equal(again.status, 409);
            assert.equal(again.data.code, 'DUPLICATE');
            assert.equal((await asOwner('POST', '/api/v2/certificates/manual', { ...form, numberMode: 'manual', number: 'a b' })).data.code, 'BAD_NUMBER');
        });

        await t.test('refused: a kind with no design yet, missing names, and an employee', async () => {
            assert.equal((await asOwner('POST', '/api/v2/certificates/manual', { ...form, docType: 'degree' })).data.code, 'NO_DESIGN');
            assert.equal((await asOwner('POST', '/api/v2/certificates/manual', { ...form, nameEn: '' })).data.code, 'NAME_REQUIRED');
            assert.equal((await asStaff('POST', '/api/v2/certificates/manual', form)).status, 403);
        });

        await t.test('an issued manual certificate keeps its content', async () => {
            const c = await Certificate.findById(made[0]);
            c.trainee_name = 'Someone else';
            await assert.rejects(c.save(), /cannot be edited/);
        });
    } finally {
        // certificates are never deleted by the app; the test removes its own directly
        await Certificate.collection.deleteMany({ _id: { $in: made.map((id) => new mongoose.Types.ObjectId(id)) } });
        await User.deleteMany({ _id: { $in: [owner._id, staff._id] } });
        server.close();
        await mongoose.disconnect();
    }
});
