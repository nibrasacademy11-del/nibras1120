// End-to-end test of Phase 9: groups, bulk adding members, lectures, joining and attendance.
// Runs only with TEST_MONGO_URI pointing at a TEST database. Zoom is not called (no Zoom settings).

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

test('groups and lectures flow', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    // No real emails from tests: empty (not deleted), so loading .env cannot fill them back in
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ADMIN_EMAIL = '';
    process.env.ADMIN_PASSWORD = '';
    for (const k of ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET']) delete process.env[k];
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const User = require('../../models/User');
    const Course = require('../../models/Course');
    const Customer = require('../../models/Customer');
    const Enrollment = require('../../models/Enrollment');
    const ProgramModule = require('../../models/ProgramModule');
    const Cohort = require('../../models/Cohort');
    const CohortMember = require('../../models/CohortMember');
    const Lecture = require('../../models/Lecture');
    const LectureAttendance = require('../../models/LectureAttendance');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const mk = (role) => User.create({ name: `${role} ${tag}`, email: `gf-${role}-${tag}@test.local`, password: hash, role });
    const [admin, worker, learner] = [await mk('super_admin'), await mk('employee'), await mk('customer')];
    const program = await Course.create({ titleAr: `ماجستير ${tag}`, slug: `g-${tag}`, type: 'master', specialty: 'test', price: 0 });

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

    const nid = `29${String(Date.now()).slice(-12)}`;
    const customerIds = [];
    try {
        const a = await login(admin);
        const w = await login(worker);
        const me = await login(learner);
        let cohortId;
        let modA;

        await t.test('admin sets up a master with modules and a group covering one module', async () => {
            for (const title of ['محور أ', 'محور ب']) assert.equal((await a('POST', `/api/v2/programs/${program._id}/modules`, { titleAr: title })).status, 201);
            const mods = await ProgramModule.find({ program: program._id }).sort({ order: 1 });
            modA = String(mods[0]._id);
            const g = await a('POST', `/api/v2/programs/${program._id}/cohorts`, { nameAr: 'مجموعة المحور أ', capacity: 2, modules: [modA, String(new mongoose.Types.ObjectId())] });
            assert.equal(g.status, 201);
            cohortId = g.data.item._id;
            assert.deepEqual((await Cohort.findById(cohortId)).modules.map(String), [modA], 'a module of another program is dropped');
        });

        await t.test('bulk add: paste identity numbers and customer numbers, review, then add', async () => {
            const c1 = await a('POST', '/api/v2/customers', { nameAr: 'متدرب الهوية', identity: { nationalId: nid }, contact: { phone: `0105${String(Date.now()).slice(-7)}` } });
            assert.equal(c1.status, 201);
            customerIds.push(c1.data.item.id);
            const file = await Customer.create({ customerNo: `NB-8${String(Date.now()).slice(-8)}`, internalId: `i-${tag}`, nameAr: 'متدرب البوابة', user: learner._id, status: 'customer', contact: { email: learner.email } });
            customerIds.push(String(file._id));

            assert.equal((await w('POST', `/api/v2/groups/${cohortId}/members/preview`, { text: nid })).status, 403, 'an employee cannot add members');
            const p = await a('POST', `/api/v2/groups/${cohortId}/members/preview`, { text: `${nid}\n${file.customerNo}\n00000000000099\n${nid}` });
            assert.equal(p.status, 200);
            assert.equal(p.data.found.length, 2, JSON.stringify(p.data));
            assert.equal(p.data.found.find((f) => f.customerNo === c1.data.item.customerNo).matchedBy, 'national_id');
            assert.deepEqual(p.data.notFound, ['00000000000099']);
            assert.ok(p.data.found.every((f) => !f.enrollmentNo), 'neither is enrolled yet');
            assert.ok(!/Enc|Idx/.test(JSON.stringify(p.data)), 'no stored identity data is sent back, only the pasted line');

            const add = await a('POST', `/api/v2/groups/${cohortId}/members`, { customers: p.data.found.map((f) => f._id), enroll: true });
            assert.equal(add.status, 200);
            assert.equal(add.data.added, 2);
            assert.equal(add.data.enrolled, 2);
            const ens = await Enrollment.find({ program: program._id });
            assert.equal(ens.length, 2);
            assert.ok(ens.every((e) => String(e.cohort) === cohortId));
            const again = await a('POST', `/api/v2/groups/${cohortId}/members`, { customers: p.data.found.map((f) => f._id) });
            assert.equal(again.data.already, 2);
        });

        let lecNow;
        let lecLater;
        await t.test('lectures with hand-pasted links; customers never get the link without joining', async () => {
            const soon = await a('POST', `/api/v2/groups/${cohortId}/lectures`, { titleAr: 'المحاضرة 1', module: modA, startsAt: new Date(Date.now() - 5 * 60e3).toISOString(), durationMin: 60, mode: 'manual', joinUrl: 'https://zoom.us/j/111?pwd=abc', passcode: '9911' });
            assert.equal(soon.status, 201);
            lecNow = soon.data.item._id;
            const later = await a('POST', `/api/v2/groups/${cohortId}/lectures`, { titleAr: 'المحاضرة 2', startsAt: new Date(Date.now() + 3 * 864e5).toISOString(), durationMin: 90, mode: 'manual', joinUrl: 'javascript:alert(1)' });
            assert.equal(later.status, 201);
            lecLater = later.data.item._id;
            assert.equal((await Lecture.findById(lecLater)).zoom.joinUrl, '', 'unsafe links are dropped');
            assert.equal((await a('POST', `/api/v2/groups/${cohortId}/lectures`, { titleAr: 'x', startsAt: new Date().toISOString(), mode: 'zoom' })).data.code, 'ZOOM_OFF');

            const mine = await me('GET', '/api/v2/my/lectures');
            assert.equal(mine.status, 200);
            assert.equal(mine.data.groups.length, 1);
            const ls = mine.data.groups[0].lectures;
            assert.equal(ls.length, 2);
            assert.ok(!JSON.stringify(mine.data).includes('zoom.us/j/111'), 'the join link is not in the list');
            assert.equal(ls[0].state, 'open');
            assert.equal(ls[0].passcode, '9911');
        });

        await t.test('joining: open lecture gives the link and counts the click; a far lecture does not', async () => {
            const j = await me('POST', `/api/v2/my/lectures/${lecNow}/join`);
            assert.equal(j.status, 200);
            assert.equal(j.data.url, 'https://zoom.us/j/111?pwd=abc');
            await me('POST', `/api/v2/my/lectures/${lecNow}/join`);
            const seat = await LectureAttendance.findOne({ lecture: lecNow });
            assert.equal(seat.clicks, 2);
            assert.equal((await me('POST', `/api/v2/my/lectures/${lecLater}/join`)).data.code, 'NOT_OPEN');
            assert.equal((await w('POST', `/api/v2/my/lectures/${lecNow}/join`)).status, 404, 'non-members cannot join');
        });

        await t.test('attendance marked by staff counts toward the rate; cancelling and removing work', async () => {
            const file = await Customer.findOne({ user: learner._id });
            assert.equal((await a('POST', `/api/v2/lectures/${lecNow}/attendance`, { customer: String(file._id), present: true })).status, 200);
            await Lecture.updateOne({ _id: lecNow }, { $set: { startsAt: new Date(Date.now() - 3 * 3600e3) } });   // now finished
            const m = await a('GET', `/api/v2/groups/${cohortId}/members`);
            assert.equal(m.data.held, 1);
            assert.equal(m.data.items.find((x) => x.customer._id === String(file._id)).rate, 100);
            const att = await a('GET', `/api/v2/lectures/${lecNow}/attendance`);
            assert.equal(att.data.items.filter((r) => r.present).length, 1);

            assert.equal((await a('POST', `/api/v2/lectures/${lecLater}/cancel`, {})).data.code, 'REASON_REQUIRED');
            assert.equal((await a('POST', `/api/v2/lectures/${lecLater}/cancel`, { reason: 'المحاضر معتذر' })).status, 200);

            const member = await CohortMember.findOne({ cohort: cohortId, customer: file._id });
            assert.equal((await a('POST', `/api/v2/groups/${cohortId}/members/${member._id}/remove`, { reason: 'انسحب' })).status, 200);
            assert.equal((await me('GET', '/api/v2/my/lectures')).data.groups.length, 0, 'a removed member no longer sees the group');
            assert.equal((await a('GET', `/api/v2/customers/${file._id}/groups`)).data.items[0].status, 'removed');
        });

        await t.test('the group is full at its capacity', async () => {
            const c3 = await a('POST', '/api/v2/customers', { nameAr: 'ثالث', contact: { phone: `0103${String(Date.now()).slice(-7)}` } });
            customerIds.push(c3.data.item.id);
            const c4 = await a('POST', '/api/v2/customers', { nameAr: 'رابع', contact: { phone: `0104${String(Date.now()).slice(-7)}` } });
            customerIds.push(c4.data.item.id);
            const add = await a('POST', `/api/v2/groups/${cohortId}/members`, { customers: [c3.data.item.id, c4.data.item.id] });
            assert.equal(add.data.added, 1, 'one place was free after the removal');
            assert.equal(add.data.full, 1);
            assert.equal(add.data.notEnrolled, 1);
        });
    } finally {
        const cohorts = await Cohort.find({ program: program._id }).select('_id');
        await LectureAttendance.deleteMany({ cohort: { $in: cohorts.map((c) => c._id) } });
        await Lecture.deleteMany({ program: program._id });
        await CohortMember.deleteMany({ program: program._id });
        await Enrollment.deleteMany({ program: program._id });
        await ProgramModule.deleteMany({ program: program._id });
        await Cohort.deleteMany({ program: program._id });
        await Customer.deleteMany({ _id: { $in: customerIds } });
        await Course.deleteOne({ _id: program._id });
        await User.deleteMany({ email: new RegExp(`gf-.*-${tag}@test.local`) });
        server.close();
        await mongoose.disconnect();
    }
});
