// End-to-end test of sign-in, two-factor, devices, roles and the audit log against a real database.
// Runs only with TEST_MONGO_URI pointing at a TEST database (never the live one):
//
//   TEST_MONGO_URI="mongodb+srv://.../nibras_test" npm test
//
// It creates accounts with a unique suffix and removes them at the end.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_URI = process.env.TEST_MONGO_URI;

function liveUri() {
    try {
        const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
        const m = env.match(/^MONGO_URI=(.*)$/m);
        return m ? m[1].trim() : '';
    } catch {
        return '';
    }
}

const skip = !TEST_URI ? 'TEST_MONGO_URI is not set' : TEST_URI === liveUri() ? 'TEST_MONGO_URI is the live database: refusing to run' : false;

test('security flow', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    // No real emails from tests: empty (not deleted), so loading .env cannot fill them back in
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ADMIN_EMAIL = '';
    process.env.ADMIN_PASSWORD = '';
    delete process.env.MONGO_URI_FALLBACK;
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const User = require('../../models/User');
    const Session = require('../../models/Session');
    const AuditLog = require('../../models/AuditLog');
    const RolePolicy = require('../../models/RolePolicy');
    const RateHit = require('../../models/RateHit');
    const LoginAttempt = require('../../models/LoginAttempt');
    const totp = require('../../lib/totp');

    await require('../../config/db')();
    await RateHit.deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const emails = { emp: `emp-${tag}@test.local`, sup: `sup-${tag}@test.local`, lock: `lock-${tag}@test.local` };
    await User.create([
        { name: 'Test Employee', email: emails.emp, password: hash, role: 'employee' },
        { name: 'Test Super', email: emails.sup, password: hash, role: 'super_admin' },
        { name: 'Test Lock', email: emails.lock, password: hash, role: 'employee' }
    ]);

    // A tiny cookie jar per client
    const client = () => {
        const jar = {};
        return async (method, url, body) => {
            const res = await fetch(base + url, {
                method,
                headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
                body: body ? JSON.stringify(body) : undefined
            });
            for (const c of res.headers.getSetCookie()) {
                const [pair] = c.split(';');
                const [k, v] = pair.split('=');
                if (/Expires=Thu, 01 Jan 1970/.test(c) || v === '') delete jar[k];
                else jar[k] = v;
            }
            let data = null;
            try { data = await res.json(); } catch { data = null; }
            return { status: res.status, data };
        };
    };

    try {
        const emp = client();
        await t.test('employee signs in and sees own grants', async () => {
            const r = await emp('POST', '/api/auth/login', { email: emails.emp, password: pw });
            assert.equal(r.status, 200);
            assert.equal(r.data.user.isStaff, true);
            const me = await emp('GET', '/api/v2/me');
            assert.equal(me.status, 200);
            assert.equal(me.data.grants['customers.view'], 'own');
            assert.ok(me.data.sessionId);
        });

        await t.test('employee cannot open roles or audit', async () => {
            assert.equal((await emp('GET', '/api/v2/roles')).status, 403);
            assert.equal((await emp('GET', '/api/v2/audit')).status, 403);
            assert.equal((await emp('GET', '/api/auth/users')).status, 403);
        });

        let secret;
        let recovery;
        await t.test('employee turns on two-factor', async () => {
            assert.equal((await emp('POST', '/api/v2/me/2fa/setup', { password: 'wrong' })).status, 401);
            const s = await emp('POST', '/api/v2/me/2fa/setup', { password: pw });
            assert.equal(s.status, 200);
            secret = s.data.secret;
            assert.equal((await emp('POST', '/api/v2/me/2fa/enable', { code: '000000' })).status, 400);
            const e = await emp('POST', '/api/v2/me/2fa/enable', { code: totp.totp(secret) });
            assert.equal(e.status, 200);
            recovery = e.data.recoveryCodes;
            assert.equal(recovery.length, 8);
            const stored = await User.findOne({ email: emails.emp });
            assert.ok(!stored.twoFactor.secretEnc.includes(secret), 'secret is stored encrypted');
        });

        await t.test('signing in now needs the code', async () => {
            const second = client();
            const r = await second('POST', '/api/auth/login', { email: emails.emp, password: pw });
            assert.equal(r.data.twoFactorRequired, true);
            assert.equal((await second('GET', '/api/v2/me')).status, 401);
            assert.equal((await second('POST', '/api/auth/login/2fa', { code: '123456' })).status, 401);
            const ok = await second('POST', '/api/auth/login/2fa', { code: recovery[0] });
            assert.equal(ok.status, 200);
            assert.equal((await second('GET', '/api/v2/me')).status, 200);
            const reused = client();
            await reused('POST', '/api/auth/login', { email: emails.emp, password: pw });
            assert.equal((await reused('POST', '/api/auth/login/2fa', { code: recovery[0] })).status, 401, 'recovery code works once');

            const list = await emp('GET', '/api/v2/me/sessions');
            assert.equal(list.data.sessions.length, 2);
            const revoked = await emp('POST', '/api/v2/me/sessions/revoke-others');
            assert.equal(revoked.data.revoked, 1);
            assert.equal((await second('GET', '/api/v2/me')).status, 401, 'the other device is signed out');
            assert.equal((await emp('GET', '/api/v2/me')).status, 200, 'this device stays');
        });

        const sup = client();
        await t.test('super admin edits a role and it takes effect', async () => {
            assert.equal((await sup('POST', '/api/auth/login', { email: emails.sup, password: pw })).status, 200);
            const roles = await sup('GET', '/api/v2/roles');
            assert.equal(roles.status, 200);
            assert.equal(roles.data.roles.length, 10, 'nine roles plus the website manager');
            assert.equal((await sup('PUT', '/api/v2/roles/employee', { grants: { 'customers.view': 'team' } })).status, 400, 'reason required');
            assert.equal((await sup('PUT', '/api/v2/roles/super_admin', { grants: {}, reason: 'x' })).status, 400);
            const upd = await sup('PUT', '/api/v2/roles/employee', { grants: { 'customers.view': 'team', 'bad.key': 'all' }, reason: 'integration test' });
            assert.equal(upd.status, 200);
            assert.deepEqual(upd.data.grants, { 'customers.view': 'team' });
            const reset = await sup('PUT', '/api/v2/roles/employee', { reset: true, reason: 'integration test cleanup' });
            assert.equal(reset.status, 200);
            assert.equal(reset.data.grants['customers.view'], 'own');
        });

        await t.test('audit log records the work and cannot be changed', async () => {
            const log = await sup('GET', '/api/v2/audit?resource=roles');
            assert.equal(log.status, 200);
            assert.ok(log.data.items.some((e) => e.action === 'roles.updated' && e.reason === 'integration test'));
            const entry = await AuditLog.findOne({ action: 'security.2fa_enabled' });
            assert.ok(entry);
            await assert.rejects(AuditLog.updateOne({ _id: entry._id }, { summary: 'changed' }));
            await assert.rejects(AuditLog.deleteOne({ _id: entry._id }));
            entry.summary = 'changed';
            await assert.rejects(entry.save());
        });

        await t.test('ten wrong passwords lock the email', async () => {
            const c = client();
            for (let i = 0; i < 10; i++) assert.equal((await c('POST', '/api/auth/login', { email: emails.lock, password: 'nope' })).status, 401);
            const r = await c('POST', '/api/auth/login', { email: emails.lock, password: pw });
            assert.equal(r.status, 429);
            assert.equal(r.data.code, 'LOCKED');
        });

        await t.test('only the super admin hands out admin roles', async () => {
            const target = await User.findOne({ email: emails.lock });
            await User.updateOne({ email: emails.emp }, { role: 'admin', 'twoFactor.enabled': false });
            const adm = client();
            assert.equal((await adm('POST', '/api/auth/login', { email: emails.emp, password: pw })).status, 200);
            assert.equal((await adm('PUT', `/api/auth/users/${target._id}`, { role: 'admin' })).status, 403);
            // staff roles are given from Employees (with the HR file and team), not from the accounts page
            assert.equal((await adm('PUT', `/api/auth/users/${target._id}`, { role: 'team_leader' })).status, 400);
            assert.equal((await adm('PUT', `/api/auth/users/${target._id}`, { name: 'اسم جديد' })).status, 200);
            const sa = await User.findOne({ email: emails.sup });
            assert.equal((await adm('PUT', `/api/auth/users/${sa._id}`, { name: 'x' })).status, 403);
        });
    } finally {
        const ids = (await User.find({ email: { $in: Object.values(emails) } }).select('_id')).map((u) => u._id);
        await Session.deleteMany({ user: { $in: ids } });
        await LoginAttempt.deleteMany({ email: { $in: Object.values(emails) } });
        await User.deleteMany({ _id: { $in: ids } });
        await RolePolicy.deleteMany({ role: 'employee' });
        server.close();
        await mongoose.disconnect();
    }
});
