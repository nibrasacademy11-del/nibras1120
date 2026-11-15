// Program → modules → lectures (PLAN-V2, 15 Nov 2026): the owner adds lectures under each module of
// the program and every enrolled customer sees them at once. Entering lectures shows progress, but
// a module completes only when the owner presses "the module is finished": then everyone who
// entered all its lectures completes it and gets its certificate; a latecomer completes it when
// they enter their last lecture. Needs TEST_MONGO_URI (a test database).

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

test('module finish flow', { skip }, async (t) => {
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
    const Enrollment = require('../../models/Enrollment');
    const Certificate = require('../../models/Certificate');
    const ProgramModule = require('../../models/ProgramModule');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const owner = await User.create({ name: 'Finish Owner', email: `mf-owner-${tag}@test.local`, password: hash, role: 'super_admin' });
    const program = await Course.create({ titleAr: `ماجستير المحاور ${tag}`, slug: `mf-${tag}`, type: 'master', specialty: 'test', price: 0 });
    const people = [];
    for (const n of [1, 2]) {
        const u = await User.create({ name: `متعلم ${n}`, email: `mf-c${n}-${tag}@test.local`, password: hash, role: 'customer' });
        const c = await Customer.create({ customerNo: `NB-5${n}${String(Date.now()).slice(-7)}`, internalId: `mf-${n}-${tag}`, nameAr: `متعلم رقم ${n}`, user: u._id, status: 'customer', contact: { email: u.email } });
        people.push({ u, c });
    }

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
    const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();

    try {
        const o = await login(owner);
        const [one, two] = [await login(people[0].u), await login(people[1].u)];
        for (const titleAr of ['محور أ', 'محور ب']) await o('POST', `/api/v2/programs/${program._id}/modules`, { titleAr });
        const [mA, mB] = (await ProgramModule.find({ program: program._id }).sort({ order: 1 })).map((m) => String(m._id));
        const enrollments = [];
        for (const p of people) enrollments.push((await o('POST', '/api/v2/enrollments', { customer: String(p.c._id), program: String(program._id), autoGroup: false })).data.item);
        const lec = {};

        await t.test('the owner adds lectures under each module; everyone enrolled sees them at once', async () => {
            assert.equal((await o('POST', `/api/v2/programs/${program._id}/lectures`, { titleAr: 'بلا محور', startsAt: ago(1), mode: 'manual' })).data.code, 'MODULE_REQUIRED');
            for (const [key, module, titleAr, d] of [['a1', mA, 'أ ١', 10], ['a2', mA, 'أ ٢', 3], ['b1', mB, 'ب ١', 1]]) {
                const r = await o('POST', `/api/v2/programs/${program._id}/lectures`, { module, titleAr, startsAt: ago(d), mode: 'manual', joinUrl: 'https://zoom.us/j/1', passcode: '11' });
                assert.equal(r.status, 201, JSON.stringify(r.data));
                lec[key] = r.data.item._id;
            }
            const list = (await o('GET', `/api/v2/programs/${program._id}/lectures`)).data;
            assert.equal(list.items.length, 3);
            assert.equal(list.enrolled, 2);
            const mine = (await one('GET', '/api/v2/my/lectures')).data.programs.find((p) => String(p.program) === String(program._id));
            assert.deepEqual(mine.modules.map((m) => [m.titleAr, m.total]), [['محور أ', 2], ['محور ب', 1]], 'program → modules → lectures');
            // a lecture added now (or its link changed) shows for everyone, no group needed
            const late = await o('POST', `/api/v2/programs/${program._id}/lectures`, { module: mB, titleAr: 'ب ٢', startsAt: ago(0.5), mode: 'manual', joinUrl: 'https://zoom.us/j/2' });
            lec.b2 = late.data.item._id;
            const seen = (await two('GET', '/api/v2/my/lectures')).data.programs[0].modules.find((m) => m.titleAr === 'محور ب');
            assert.equal(seen.total, 2);
        });

        await t.test('entering every lecture shows progress but does not finish the module', async () => {
            await one('POST', `/api/v2/my/lectures/${lec.a1}/join`);
            await one('POST', `/api/v2/my/lectures/${lec.a2}/join`);
            await two('POST', `/api/v2/my/lectures/${lec.a1}/join`);
            const e = await Enrollment.findById(enrollments[0]._id);
            assert.equal(e.modules.find((m) => String(m.module) === mA).status, 'in_progress', 'not completed before the owner finishes it');
            const p = (await one('GET', '/api/v2/my/enrollments')).data.items[0].path;
            assert.equal(p.modules[mA].percent, 100);
            assert.equal(p.modules[mA].finished, false);
            assert.equal(await Certificate.countDocuments({ program: program._id }), 0);
        });

        await t.test('"the module is finished": those who entered everything complete it and get the certificate', async () => {
            const r = await o('POST', `/api/v2/modules/${mA}/finish`);
            assert.equal(r.status, 200, JSON.stringify(r.data));
            assert.equal(r.data.completed, 1);
            assert.equal(r.data.missing, 1, 'the second one still has a lecture to enter');
            assert.equal(r.data.issued, 1);
            const cert = await Certificate.findOne({ customer: people[0].c._id, module: mA, status: 'Valid' });
            assert.ok(cert, 'the certificate of the module');
            assert.ok(mail.outbox.some((m) => m.kind === 'certificate-ready' && m.to === people[0].u.email), 'and it was emailed');
            assert.equal(await Certificate.countDocuments({ customer: people[1].c._id }), 0);
            assert.equal((await one('GET', '/api/v2/my/enrollments')).data.items[0].path.modules[mA].finished, true);
        });

        await t.test('a latecomer completes a finished module when entering the last lecture', async () => {
            const j = await two('POST', `/api/v2/my/lectures/${lec.a2}/join`);
            assert.equal(j.data.completed.length, 1);
            assert.ok(await Certificate.exists({ customer: people[1].c._id, module: mA, status: 'Valid' }));
        });

        await t.test('only the owner finishes a module; a module without lectures cannot be finished; it can be reopened', async () => {
            assert.equal((await one('POST', `/api/v2/modules/${mB}/finish`)).status, 403);
            const empty = (await o('POST', `/api/v2/programs/${program._id}/modules`, { titleAr: 'محور فاضي' })).data;
            const mC = String((await ProgramModule.findOne({ program: program._id, titleAr: 'محور فاضي' }))._id);
            assert.equal((await o('POST', `/api/v2/modules/${mC}/finish`)).data.code, 'NO_LECTURES');
            void empty;
            assert.equal((await o('POST', `/api/v2/modules/${mA}/reopen`)).status, 200);
            assert.equal((await ProgramModule.findById(mA)).finishedAt, null);
        });
    } finally {
        await User.updateMany({ email: new RegExp(`mf-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
