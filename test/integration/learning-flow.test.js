// End-to-end test of Phase 2: modules, groups, enrollment, module review chain, completion.
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

test('learning flow', { skip }, async (t) => {
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
    const Employee = require('../../models/Employee');
    const Team = require('../../models/Team');
    const Enrollment = require('../../models/Enrollment');
    const ProgramModule = require('../../models/ProgramModule');
    const Cohort = require('../../models/Cohort');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const mk = (role) => User.create({ name: `${role} ${tag}`, email: `lf-${role}-${tag}@test.local`, password: hash, role });
    const [admin, leader, worker] = [await mk('super_admin'), await mk('team_leader'), await mk('employee')];
    const team = await Team.create({ nameAr: `فريق ${tag}`, leader: leader._id });
    for (const [u, n] of [[leader, 1], [worker, 2]]) await Employee.create({ user: u._id, employeeNo: `T-${tag}-${n}`, nameAr: u.name, team: team._id });
    const program = await Course.create({ titleAr: `برنامج ${tag}`, slug: `p-${tag}`, type: 'course', specialty: 'test', price: 0 });

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

    let customerId;
    try {
        const a = await login(admin);
        const tl = await login(leader);
        const w = await login(worker);

        await t.test('admin builds the program', async () => {
            for (const title of ['محور 1', 'محور 2']) assert.equal((await a('POST', `/api/v2/programs/${program._id}/modules`, { titleAr: title, requirements: ['مشروع'] })).status, 201);
            assert.equal((await w('POST', `/api/v2/programs/${program._id}/modules`, { titleAr: 'x' })).status, 403);
            const g = await a('POST', `/api/v2/programs/${program._id}/cohorts`, { nameAr: 'مجموعة 1', capacity: 1 });
            assert.equal(g.status, 201);
            const p = await a('GET', `/api/v2/programs/${program._id}`);
            assert.equal(p.data.modules.length, 2);
        });

        let e;
        await t.test('employee enrolls their customer; duplicates and full groups are refused', async () => {
            const c = await w('POST', '/api/v2/customers', { nameAr: 'متدرب', contact: { phone: `0109${String(Date.now()).slice(-7)}` } });
            customerId = c.data.item.id;
            const cohort = (await a('GET', `/api/v2/cohorts?program=${program._id}`)).data.items[0];
            const r = await w('POST', '/api/v2/enrollments', { customer: customerId, program: String(program._id), cohort: cohort._id });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            e = r.data.item;
            assert.equal(e.modules.length, 2);
            assert.deepEqual(e.modules[0].actions, ['start']);
            assert.equal((await w('POST', '/api/v2/enrollments', { customer: customerId, program: String(program._id) })).data.code, 'ALREADY_ENROLLED');
            assert.equal((await w('GET', `/api/v2/customers/${customerId}`)).data.item.status, 'customer');
        });

        const act = async (c, mod, action, note) => {
            const cur = (await a('GET', `/api/v2/enrollments/${e._id}`)).data.item;
            return c('POST', `/api/v2/enrollments/${e._id}/modules/${mod}`, { action, note, __v: cur.__v });
        };

        await t.test('review chain: employee → team leader → admin', async () => {
            const [m1, m2] = e.modules.map((m) => m.module);
            assert.equal((await act(w, m1, 'start')).status, 200);
            assert.equal((await act(w, m1, 'submit')).status, 200);
            assert.equal((await act(a, m1, 'approve')).data.code, 'NEEDS_TEAM_LEADER_REVIEW');
            assert.equal((await act(w, m1, 'team_leader_approve')).status, 403);
            const queue = await tl('GET', '/api/v2/reviews');
            assert.ok(queue.data.items.some((r) => r.module.id === m1));
            assert.equal((await act(tl, m1, 'team_leader_approve')).status, 200);
            assert.equal((await act(tl, m1, 'approve')).status, 403);
            assert.equal((await act(a, m1, 'approve')).status, 200);

            await act(w, m2, 'start');
            await act(w, m2, 'submit');
            assert.equal((await act(tl, m2, 'team_leader_reject')).data.code, 'REASON_REQUIRED');
            assert.equal((await act(tl, m2, 'team_leader_reject', 'ناقص')).status, 200);
            await act(w, m2, 'rework');
            await act(w, m2, 'submit');
            await act(tl, m2, 'team_leader_approve');
            const done = await act(a, m2, 'approve');
            assert.equal(done.data.item.status, 'completed');
            assert.equal(done.data.item.eligibleForFinalCertificate, true);

            const stale = await w('POST', `/api/v2/enrollments/${e._id}/modules/${m2}`, { action: 'start', __v: 0 });
            assert.equal(stale.status, 409);
        });

        await t.test('the lookup card shows programs and module statuses', async () => {
            const look = await tl('GET', `/api/v2/customers/${customerId}`);
            assert.equal(look.data.item.programs[0].modules.every((m) => m.status === 'approved'), true);
        });
    } finally {
        await Enrollment.deleteMany({ program: program._id });
        await ProgramModule.deleteMany({ program: program._id });
        await Cohort.deleteMany({ program: program._id });
        await Course.deleteOne({ _id: program._id });
        if (customerId) await Customer.deleteOne({ _id: customerId });
        await Employee.deleteMany({ user: { $in: [leader._id, worker._id] } });
        await Team.deleteOne({ _id: team._id });
        await User.deleteMany({ email: new RegExp(`lf-.*-${tag}@test.local`) });
        server.close();
        await mongoose.disconnect();
    }
});
