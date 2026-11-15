// Sign-in and permission checks, with the database replaced by in-memory stubs
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-' + Math.random();
delete process.env.REQUIRE_2FA;

const User = require('../models/User');
const Session = require('../models/Session');
const RolePolicy = require('../models/RolePolicy');
const Employee = require('../models/Employee');
const Team = require('../models/Team');
const { authRequired, requirePermission } = require('../middleware/auth');
const policyStore = require('../lib/policyStore');

const USER_ID = '64b000000000000000000001';
const SID = '64b0000000000000000000aa';

let users = {};
let sessions = {};
let policies = [];

const query = (value) => {
    const q = { select: () => q, populate: () => q, lean: () => Promise.resolve(value), then: (r, j) => Promise.resolve(value).then(r, j) };
    return q;
};

test.beforeEach(() => {
    users = {
        [USER_ID]: { _id: USER_ID, name: 'Sara', email: 's@x.com', role: 'employee', status: 'active', tokenVersion: 0, twoFactor: { enabled: false } }
    };
    sessions = { [SID]: { _id: SID, user: USER_ID, lastSeenAt: new Date() } };
    policies = [];
    policyStore.invalidate();
    test.mock.method(User, 'findById', (id) => query(users[id] || null));
    test.mock.method(Session, 'findOne', (f) => query(sessions[f._id] && String(sessions[f._id].user) === String(f.user) ? sessions[f._id] : null));
    test.mock.method(Session, 'updateOne', () => Promise.resolve({}));
    test.mock.method(RolePolicy, 'find', () => query(policies));
    test.mock.method(Employee, 'findOne', () => query({ team: 't1' }));
    test.mock.method(Team, 'find', () => query([{ _id: 't2' }]));
});
test.afterEach(() => test.mock.restoreAll());

function run(middleware, { token, url = '/api/v2/me' } = {}) {
    return new Promise((resolve) => {
        const req = { cookies: token ? { nibras_token: token } : {}, originalUrl: url };
        const res = {
            statusCode: 200,
            status(c) { this.statusCode = c; return this; },
            json(body) { resolve({ req, res: this, body, nextCalled: false }); }
        };
        middleware(req, res, () => resolve({ req, res, nextCalled: true }));
    });
}

const sign = (payload, opts) => jwt.sign(payload, process.env.JWT_SECRET, opts);

test('no cookie is 401', async () => {
    const r = await run(authRequired);
    assert.equal(r.res.statusCode, 401);
});

test('valid session token signs the user in with their grants', async () => {
    const r = await run(authRequired, { token: sign({ id: USER_ID, tv: 0, sid: SID }) });
    assert.equal(r.nextCalled, true);
    assert.equal(r.req.user.role, 'employee');
    assert.equal(r.req.user.sid, SID);
    assert.equal(r.req.user.grants['customers.view'], 'own');
    assert.deepEqual(r.req.user.teamIds.sort(), ['t1', 't2']);
});

test('revoked or foreign session is rejected', async () => {
    delete sessions[SID];
    assert.equal((await run(authRequired, { token: sign({ id: USER_ID, tv: 0, sid: SID }) })).res.statusCode, 401);
});

test('staff token without a session (issued before sessions) is rejected', async () => {
    assert.equal((await run(authRequired, { token: sign({ id: USER_ID, tv: 0 }) })).res.statusCode, 401);
});

test('customer token without a session keeps working', async () => {
    users[USER_ID].role = 'student';
    const r = await run(authRequired, { token: sign({ id: USER_ID, tv: 0 }) });
    assert.equal(r.nextCalled, true);
    assert.equal(r.req.user.role, 'customer');
});

test('old token version, disabled account, 2FA challenge token and bad signature are rejected', async () => {
    assert.equal((await run(authRequired, { token: sign({ id: USER_ID, tv: 1, sid: SID }) })).res.statusCode, 401);
    users[USER_ID].status = 'disabled';
    assert.equal((await run(authRequired, { token: sign({ id: USER_ID, tv: 0, sid: SID }) })).res.statusCode, 401);
    users[USER_ID].status = 'active';
    assert.equal((await run(authRequired, { token: sign({ id: USER_ID, tv: 0, purpose: '2fa' }) })).res.statusCode, 401);
    assert.equal((await run(authRequired, { token: jwt.sign({ id: USER_ID, tv: 0, sid: SID }, 'other') })).res.statusCode, 401);
});

test('saved role policy changes grants', async () => {
    policies = [{ role: 'employee', grants: { 'customers.view': 'team' } }];
    const r = await run(authRequired, { token: sign({ id: USER_ID, tv: 0, sid: SID }) });
    assert.deepEqual(r.req.user.grants, { 'customers.view': 'team' });
});

test('requirePermission enforces the minimum scope', async () => {
    const req = { user: { grants: { 'customers.view': 'own', 'audit.view': 'all' } } };
    const call = (perm, min) => new Promise((resolve) => {
        const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() { resolve({ ok: false, status: this.statusCode }); } };
        requirePermission(perm, min)(req, res, () => resolve({ ok: true, scope: req.scope }));
    });
    assert.deepEqual(await call('customers.view'), { ok: true, scope: 'own' });
    assert.deepEqual(await call('customers.view', 'all'), { ok: false, status: 403 });
    assert.deepEqual(await call('payments.view'), { ok: false, status: 403 });
    assert.deepEqual(await call('audit.view', 'all'), { ok: true, scope: 'all' });
});

test('required 2FA blocks everything but the security pages until it is on', async () => {
    process.env.REQUIRE_2FA = 'staff';
    try {
        const token = sign({ id: USER_ID, tv: 0, sid: SID });
        assert.equal((await run(authRequired, { token, url: '/api/v2/audit' })).res.statusCode, 403);
        assert.equal((await run(authRequired, { token, url: '/api/inquiries' })).res.statusCode, 403);
        assert.equal((await run(authRequired, { token, url: '/api/v2/me' })).nextCalled, true);
        assert.equal((await run(authRequired, { token, url: '/api/v2/me/2fa/setup' })).nextCalled, true);
        users[USER_ID].twoFactor.enabled = true;
        assert.equal((await run(authRequired, { token, url: '/api/v2/audit' })).nextCalled, true);
    } finally {
        delete process.env.REQUIRE_2FA;
    }
});
