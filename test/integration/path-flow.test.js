// End-to-end test of the learning path (PLAN-V2 stage 3): every lecture open in any order, an
// entry counted from the lecture's time, a missed live lecture still counts later, recordings open
// through the join step, modules completing by themselves, a course as one automatic module, the
// nearest open group and the waiting list. Needs TEST_MONGO_URI (a test database).

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

test('learning path flow', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ADMIN_EMAIL = '';
    process.env.ADMIN_PASSWORD = '';
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const User = require('../../models/User');
    const Customer = require('../../models/Customer');
    const Course = require('../../models/Course');
    const Enrollment = require('../../models/Enrollment');
    const Lecture = require('../../models/Lecture');
    const ProgramModule = require('../../models/ProgramModule');
    const CohortMember = require('../../models/CohortMember');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const owner = await User.create({ name: 'Path Owner', email: `pa-owner-${tag}@test.local`, password: hash, role: 'super_admin' });
    const learner = await User.create({ name: 'متعلم المسار', email: `pa-learner-${tag}@test.local`, password: hash, role: 'customer' });
    const file = await Customer.create({ customerNo: `NB-7${String(Date.now()).slice(-8)}`, internalId: `pa-${tag}`, nameAr: 'متعلم المسار', user: learner._id, status: 'customer', contact: { email: learner.email } });
    const master = await Course.create({ titleAr: `ماجستير المسار ${tag}`, titleEn: 'Path master', slug: `pa-m-${tag}`, type: 'master', specialty: 'test', price: 0 });
    const course = await Course.create({ titleAr: `دورة المسار ${tag}`, titleEn: 'Path course', slug: `pa-c-${tag}`, type: 'course', specialty: 'test', price: 0 });

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
    const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    const ahead = (h) => new Date(Date.now() + h * 3600e3).toISOString();

    try {
        const o = await login(owner);
        const me = await login(learner);
        let m1;
        let m2;
        let group;
        let enrollment;
        const lec = {};

        await t.test('enrolling without a group joins the nearest open group with seats', async () => {
            for (const titleAr of ['المحور الأول', 'المحور الثاني']) assert.equal((await o('POST', `/api/v2/programs/${master._id}/modules`, { titleAr })).status, 201);
            [m1, m2] = (await ProgramModule.find({ program: master._id }).sort({ order: 1 })).map((m) => String(m._id));
            await o('POST', `/api/v2/programs/${master._id}/cohorts`, { nameAr: 'مجموعة بعيدة', status: 'open', startDate: ahead(24 * 60) });
            group = (await o('POST', `/api/v2/programs/${master._id}/cohorts`, { nameAr: 'مجموعة قريبة', status: 'open', startDate: ahead(24 * 3) })).data.item;
            await o('POST', `/api/v2/programs/${master._id}/cohorts`, { nameAr: 'مجموعة مقفولة', status: 'finished', startDate: ahead(24) });
            const r = await o('POST', '/api/v2/enrollments', { customer: String(file._id), program: String(master._id) });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            enrollment = r.data.item;
            assert.equal(String(enrollment.cohort?._id || enrollment.cohort), group._id, 'the open group that starts soonest');
            assert.ok(await CohortMember.exists({ cohort: group._id, customer: file._id, status: 'active' }));
        });

        await t.test('every lecture opens; only an entry from its time counts', async () => {
            const add = async (key, body) => { lec[key] = (await o('POST', `/api/v2/groups/${group._id}/lectures`, { mode: 'manual', durationMin: 60, ...body })).data.item._id; };
            await add('past', { titleAr: 'محاضرة فاتت', module: m1, startsAt: ago(48), joinUrl: 'https://zoom.us/j/100?pwd=a' });
            await add('now', { titleAr: 'محاضرة الآن', module: m1, startsAt: ago(0.2), joinUrl: 'https://zoom.us/j/200', passcode: '2020' });
            await add('later', { titleAr: 'محاضرة بعد أسبوع', module: m2, startsAt: ahead(24 * 7), joinUrl: 'https://zoom.us/j/300' });
            const early = await me('POST', `/api/v2/my/lectures/${lec.later}/join`);
            assert.equal(early.status, 200, 'a far lecture opens too');
            assert.equal(early.data.url, 'https://zoom.us/j/300');
            assert.equal(early.data.counted, false, 'but entering it days before does not count');
            const list = (await me('GET', '/api/v2/my/lectures')).data.groups[0].lectures;
            assert.equal(list.find((l) => l._id === lec.later).entered, false);
        });

        await t.test('entering counts; a missed live lecture still counts; the module completes itself', async () => {
            const now = await me('POST', `/api/v2/my/lectures/${lec.now}/join`);
            assert.equal(now.status, 200);
            assert.equal(now.data.passcode, '2020');
            assert.ok(now.data.counted, 'counted');
            let e = await Enrollment.findById(enrollment._id);
            assert.equal(e.modules.find((m) => String(m.module) === m1).status, 'in_progress');
            const past = await me('POST', `/api/v2/my/lectures/${lec.past}/join`);
            assert.equal(past.status, 200, 'the link of a missed lecture stays');
            assert.deepEqual(past.data.completed.map((c) => c.titleAr), ['المحور الأول'], 'all its lectures entered: the module completes');
            e = await Enrollment.findById(enrollment._id);
            const mod = e.modules.find((m) => String(m.module) === m1);
            assert.equal(mod.status, 'approved');
            assert.equal(mod.history.at(-1).byName, 'system');
            assert.equal(e.status, 'active', 'the second module is still open');
            assert.equal((await me('POST', `/api/v2/my/lectures/${lec.past}/join`)).data.completed.length, 0, 'entering again changes nothing');
        });

        await t.test('my path: each module, the program percent and the next lecture', async () => {
            const items = (await me('GET', '/api/v2/my/enrollments')).data.items;
            const p = items.find((i) => i._id === enrollment._id).path;
            assert.deepEqual(p.modules[m1], { total: 2, entered: 2, percent: 100, complete: true });
            assert.equal(p.modules[m2].percent, 0);
            assert.equal(p.percent, 50);
            assert.deepEqual(p.lectures, { total: 3, entered: 2 });
            assert.equal(String(p.next._id), lec.now, 'the lecture running now comes next');
        });

        await t.test('a recording opens through the join step and counts; its link is never listed', async () => {
            await Lecture.updateOne({ _id: lec.later }, { $set: { startsAt: new Date(Date.now() - 72 * 3600e3) }, $push: { recordings: { title: 'التسجيل', url: 'https://zoom.us/rec/share/xyz', passcode: 'r3c', source: 'manual' } } });
            const mine = await me('GET', '/api/v2/my/lectures');
            assert.ok(!JSON.stringify(mine.data).includes('rec/share/xyz'), 'no recording link in the list');
            const rec = mine.data.groups[0].lectures.find((l) => l._id === lec.later).recordings[0];
            const r = await me('POST', `/api/v2/my/lectures/${lec.later}/recordings/${rec._id}`);
            assert.equal(r.status, 200, JSON.stringify(r.data));
            assert.equal(r.data.url, 'https://zoom.us/rec/share/xyz');
            assert.equal(r.data.passcode, 'r3c');
            assert.deepEqual(r.data.completed.map((c) => c.titleAr), ['المحور الثاني']);
            const e = await Enrollment.findById(enrollment._id);
            assert.equal(e.status, 'completed', 'both modules done: the program is complete');
            assert.equal(e.eligibleForFinalCertificate, true);
        });

        await t.test('a course studies as one automatic module; a program without an open group waits', async () => {
            const r = await o('POST', '/api/v2/enrollments', { customer: String(file._id), program: String(course._id) });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            const mods = await ProgramModule.find({ program: course._id });
            assert.equal(mods.length, 1);
            assert.equal(mods[0].auto, true);
            assert.equal(mods[0].titleAr, course.titleAr, 'named after the course');
            let e = await Enrollment.findById(r.data.item._id);
            assert.equal(e.modules.length, 1);
            assert.ok(e.waitingSince, 'no open group: waiting');
            assert.equal((await o('GET', `/api/v2/programs/${course._id}`)).data.waiting, 1);

            const g = await o('POST', `/api/v2/programs/${course._id}/cohorts`, { nameAr: 'دفعة الدورة', status: 'open', capacity: 5 });
            assert.equal(g.data.placed, 1, 'the new group takes the waiting list');
            e = await Enrollment.findById(r.data.item._id);
            assert.equal(String(e.cohort), g.data.item._id);
            assert.equal(e.waitingSince, null);

            const only = (await o('POST', `/api/v2/groups/${g.data.item._id}/lectures`, { mode: 'manual', titleAr: 'محاضرة الدورة', startsAt: ago(1), joinUrl: 'https://zoom.us/j/400' })).data.item._id;
            const j = await me('POST', `/api/v2/my/lectures/${only}/join`);
            assert.equal(j.data.completed.length, 1, 'a lecture without a module counts for the course');
            const p = (await me('GET', '/api/v2/my/enrollments')).data.items.find((i) => i._id === String(e._id)).path;
            assert.equal(p.single, true);
            assert.equal(p.percent, 100);
        });
    } finally {
        await User.updateMany({ email: new RegExp(`pa-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
