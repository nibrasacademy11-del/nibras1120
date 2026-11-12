// End-to-end test of Phase 7: station and kiosk code, scans, the monthly sheet, a correction,
// leave approval by the team leader, and the local server sync. Needs TEST_MONGO_URI.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

test('attendance flow', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    // No real emails from tests: empty (not deleted), so loading .env cannot fill them back in
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ADMIN_EMAIL = '';
    process.env.ADMIN_PASSWORD = '';
    process.env.ATTENDANCE_SYNC_SECRET = crypto.randomBytes(32).toString('hex');
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const User = require('../../models/User');
    const Team = require('../../models/Team');
    const Employee = require('../../models/Employee');
    const A = require('../../lib/attendance');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const mk = (role) => User.create({ name: `${role} ${tag}`, email: `at-${role}-${tag}@test.local`, password: hash, role });
    const [hr, leader, emp] = [await mk('hr_manager'), await mk('team_leader'), await mk('employee')];
    const team = await Team.create({ nameAr: `فريق ${tag}`, leader: leader._id });
    await Employee.create({ user: emp._id, employeeNo: `A-${tag}-1`, nameAr: emp.name, team: team._id });
    await Employee.create({ user: leader._id, employeeNo: `A-${tag}-2`, nameAr: leader.name, team: team._id });

    const client = () => {
        const jar = {};
        return async (method, url, body, headers = {}) => {
            const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers }, body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
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
        const h = await login(hr);
        const l = await login(leader);
        const e = await login(emp);
        const anon = client();

        let station;
        let kioskKey;
        await t.test('station and kiosk code', async () => {
            const r = await h('POST', '/api/v2/attendance/stations', { name: `Reception ${tag}` });
            station = r.data.item;
            kioskKey = new URL(r.data.kioskUrl).searchParams.get('key');
            assert.equal((await anon('GET', `/api/v2/attendance/kiosk/${station._id}?key=wrong`)).status, 404);
            const k = await anon('GET', `/api/v2/attendance/kiosk/${station._id}?key=${kioskKey}`);
            assert.equal(k.status, 200);
            assert.match(k.data.url, /\/portal\/attend\?s=/);
        });

        await t.test('scan in, double tap, and a stale code', async () => {
            const k = (await anon('GET', `/api/v2/attendance/kiosk/${station._id}?key=${kioskKey}`)).data;
            const first = await e('POST', '/api/v2/attendance/scan', { station: station._id, token: k.token, step: k.step });
            assert.equal(first.data.action, 'check_in');
            assert.equal((await e('POST', '/api/v2/attendance/scan', { station: station._id, token: k.token, step: k.step })).data.action, 'already_in');
            assert.equal((await e('POST', '/api/v2/attendance/scan', { station: station._id, token: k.token, step: k.step - 5 })).data.code, 'EXPIRED_CODE');
            const today = await l('GET', '/api/v2/attendance/today');
            assert.equal(today.data.items.find((i) => i.user === String(emp._id)).state, 'in');
        });

        await t.test('HR correction with a reason', async () => {
            const date = A.localParts(new Date()).date;
            assert.equal((await l('POST', '/api/v2/attendance/corrections', { user: emp._id, date, field: 'checkIn', time: '00:01', reason: 'x' })).status, 403);
            const r = await h('POST', '/api/v2/attendance/corrections', { user: emp._id, date, field: 'checkIn', time: '00:01', reason: 'forgot to scan' });
            assert.equal(r.status, 200, JSON.stringify(r.data));
            const month = (await e('GET', '/api/v2/attendance/me')).data;
            assert.ok(month.days.find((d) => d.date === date).corrected);
        });

        await t.test('leave requested by the employee, approved by the team leader', async () => {
            const d = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
            const r = await e('POST', '/api/v2/leaves', { type: 'annual', from: d, to: d, reason: 'family' });
            assert.equal(r.status, 201);
            assert.equal((await e('POST', '/api/v2/leaves', { type: 'sick', from: d, to: d })).data.code, 'DUPLICATE');
            const inbox = await l('GET', '/api/v2/leaves?box=approvals');
            const item = inbox.data.items.find((x) => x._id === r.data.item._id);
            assert.ok(item);
            assert.equal((await e('POST', `/api/v2/leaves/${item._id}/decide`, { decision: 'approve', __v: item.__v })).status, 403);
            assert.equal((await l('POST', `/api/v2/leaves/${item._id}/decide`, { decision: 'approve', __v: item.__v })).status, 200);
        });

        await t.test('local server sync: signed, once, disabled accounts refused', async () => {
            const at = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
            const payload = { server: 'test', scans: [{ id: `s-${tag}`, user: String(leader._id), at, device: 'x' }, { id: `s2-${tag}`, user: String(hr._id), at, device: 'x' }] };
            const body = JSON.stringify(payload);
            assert.equal((await anon('POST', '/api/v2/attendance/sync', body, { 'x-nibras-signature': 'bad' })).status, 401);
            const sig = A.signBody(process.env.ATTENDANCE_SYNC_SECRET, body);
            const r1 = await anon('POST', '/api/v2/attendance/sync', body, { 'x-nibras-signature': sig });
            assert.equal(r1.status, 200, JSON.stringify(r1.data));
            assert.equal(r1.data.accepted.length, 2);
            await User.updateOne({ _id: hr._id }, { status: 'disabled' });
            const r2 = await anon('POST', '/api/v2/attendance/sync', body, { 'x-nibras-signature': sig });
            assert.deepEqual(r2.data.revoked, [String(hr._id)]);
            const today = await l('GET', '/api/v2/attendance/today');
            const me = today.data.items.find((i) => i.user === String(leader._id));
            assert.equal(me.method, 'local');
            const dev = await e('POST', '/api/v2/attendance/device', {});
            assert.equal(A.verify(process.env.ATTENDANCE_SYNC_SECRET, dev.data.token).u, String(emp._id));
        });

        await t.test('monthly report', async () => {
            await User.updateOne({ _id: hr._id }, { status: 'active' });
            const h2 = await login(hr);
            const r = await h2('GET', '/api/v2/reports/attendance');
            assert.equal(r.status, 200, JSON.stringify(r.data));
            assert.ok(r.data.rows.some((x) => x.name === emp.name));
        });
    } finally {
        await User.updateMany({ email: new RegExp(`at-.*-${tag}@test.local`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
