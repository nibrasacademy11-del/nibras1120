const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/permissions');

const actor = { id: 'u1', teamIds: ['t1', 't2'] };

test('legacy roles are customers', () => {
    assert.equal(P.normalizeRole('student'), 'customer');
    assert.equal(P.normalizeRole('user'), 'customer');
    assert.equal(P.normalizeRole('something-else'), 'customer');
    assert.equal(P.normalizeRole('team_leader'), 'team_leader');
    assert.equal(P.isStaffRole('student'), false);
    assert.equal(P.isStaffRole('employee'), true);
    assert.equal(P.isAdminRole('super_admin'), true);
    assert.equal(P.isAdminRole('hr_manager'), false);
});

test('super admin holds every permission, whatever is saved for it', () => {
    const g = P.effectiveGrants('super_admin', { super_admin: {} });
    for (const r of Object.keys(P.RESOURCES)) {
        for (const a of P.ACTIONS) assert.equal(g[`${r}.${a}`], 'all', `${r}.${a}`);
    }
});

test('four staff accounts and the customer; old roles read as their replacement (16 Nov 2026)', () => {
    assert.deepEqual(P.ROLES, ['super_admin', 'assistant', 'team_leader', 'employee', 'customer']);
    for (const old of ['admin', 'hr_manager', 'finance_manager', 'accountant', 'cms_manager']) {
        assert.equal(P.normalizeRole(old), 'employee', old);
        assert.equal(P.isAdminRole(old), false, old);
    }
    assert.equal(P.normalizeRole('customer_support'), 'assistant', 'customer service became the assistant');
    assert.equal(P.effectiveGrants('admin')['payments.approve'], undefined, 'an old admin account gets no admin rights');
});

test('the assistant does everything except the money, the audit log, roles and settings', () => {
    const g = P.effectiveGrants('assistant');
    for (const k of ['customers.update', 'customer_identity.view', 'enrollments.approve', 'certificates.approve', 'employees.update', 'website.manage', 'users.manage', 'reports.view']) assert.equal(g[k], 'all', k);
    assert.equal(g['payments.view'], 'all', 'the payments of a customer, to record and follow them');
    for (const k of ['accounts.view', 'expenses.view', 'currencies.view', 'payments.approve', 'audit.view', 'roles.manage', 'settings.manage']) assert.equal(g[k], undefined, k);
    assert.equal(g['payroll.view'], 'own');
    assert.equal(g['commissions.view'], 'own');
    assert.equal(P.seesMoney(g), false);
    assert.equal(P.seesMoney(P.effectiveGrants('super_admin')), true);
    assert.equal(P.roleLevel('assistant'), 'owner', 'the owner dashboard, without the money');
});

test('employees and team leaders work on their own customers; a search shows a name and asks for the rest', () => {
    assert.equal(P.effectiveGrants('employee')['customers.view'], 'own');
    assert.equal(P.effectiveGrants('team_leader')['customers.view'], 'own');
    assert.equal(P.effectiveGrants('employee')['customer_lookup.view'], 'all');
    assert.equal(P.effectiveGrants('employee')['access_requests.create'], 'own');
    assert.equal(P.effectiveGrants('team_leader')['access_requests.approve'], 'team', 'the leader decides for the files of the team');
    assert.equal(P.effectiveGrants('employee')['customer_identity.view'], undefined);
    assert.equal(P.effectiveGrants('employee')['customers.export'], undefined);
    assert.equal(P.effectiveGrants('employee')['audit.view'], undefined);
});

test('customers never get staff permissions', () => {
    const g = P.effectiveGrants('student');
    for (const [k, scope] of Object.entries(g)) {
        if (k === 'programs.view') continue;
        assert.equal(scope, 'own', k);
    }
    assert.equal(g['customers.view'], undefined);
    assert.equal(g['customer_lookup.view'], undefined);
});

test('saved overrides replace the defaults and are sanitized', () => {
    const g = P.effectiveGrants('employee', {
        employee: { 'customers.view': 'team', 'bogus.view': 'all', 'customers.fly': 'all', 'payments.view': 'everything', 'a.b.c': 'all' }
    });
    assert.deepEqual(g, { 'customers.view': 'team' });
});

test('scope ranking', () => {
    assert.equal(P.hasScope('all', 'team'), true);
    assert.equal(P.hasScope('team', 'all'), false);
    assert.equal(P.hasScope('own', 'own'), true);
    assert.equal(P.hasScope(null, 'own'), false);
    assert.equal(P.hasScope(undefined), false);
});

test('scopeFilter builds the right MongoDB filters', () => {
    assert.deepEqual(P.scopeFilter('all', actor), {});
    assert.deepEqual(P.scopeFilter('own', actor), { owner: 'u1' });
    assert.deepEqual(P.scopeFilter('own', actor, { owner: 'assignedTo' }), { assignedTo: 'u1' });
    assert.deepEqual(P.scopeFilter('team', actor), { $or: [{ owner: 'u1' }, { team: { $in: ['t1', 't2'] } }] });
    assert.deepEqual(P.scopeFilter('team', { id: 'u1' }), { $or: [{ owner: 'u1' }] });
});

test('scopeFilter matches nothing without a scope or actor', () => {
    const nothing = { _id: { $exists: false } };
    assert.deepEqual(P.scopeFilter(null, actor), nothing);
    assert.deepEqual(P.scopeFilter('nonsense', actor), nothing);
    assert.deepEqual(P.scopeFilter('all', null), nothing);
    assert.deepEqual(P.scopeFilter('all', {}), nothing);
});

test('recordInScope checks single records', () => {
    assert.equal(P.recordInScope('own', actor, { owner: 'u1' }), true);
    assert.equal(P.recordInScope('own', actor, { owner: 'u2', team: 't1' }), false);
    assert.equal(P.recordInScope('team', actor, { owner: 'u2', team: 't1' }), true);
    assert.equal(P.recordInScope('team', actor, { owner: 'u2', team: 't9' }), false);
    assert.equal(P.recordInScope('team', actor, { owner: { _id: 'u1' } }), true);
    assert.equal(P.recordInScope('all', actor, { owner: 'u9' }), true);
    assert.equal(P.recordInScope(null, actor, { owner: 'u1' }), false);
});

test('identifiers are masked except the last digits', () => {
    assert.equal(P.maskIdentifier('29801011234567'), '••••••••••4567');
    assert.equal(P.maskIdentifier('123'), '•••');
    assert.equal(P.maskIdentifier(''), '');
    assert.equal(P.maskIdentifier(null), '');
});

test('every default grant uses a known resource, action and scope', () => {
    for (const [role, grants] of Object.entries(P.DEFAULT_GRANTS)) {
        assert.deepEqual(P.sanitizeGrants(grants), grants, role);
    }
});
