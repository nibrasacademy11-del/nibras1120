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

test('admin cannot edit role definitions by default', () => {
    const g = P.effectiveGrants('admin');
    assert.equal(g['roles.view'], 'all');
    assert.equal(g['roles.manage'], undefined);
    assert.equal(g['payments.approve'], 'all');
});

test('employees are limited to their own customers, team leaders to their team', () => {
    assert.equal(P.effectiveGrants('employee')['customers.view'], 'own');
    assert.equal(P.effectiveGrants('team_leader')['customers.view'], 'team');
    assert.equal(P.effectiveGrants('employee')['customer_lookup.view'], 'all');
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
