const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/permissions');
const { REPORTS, available, range } = require('../modules/reports/registry');

test('every report has an id, titles, a known permission and a run function', () => {
    const ids = new Set();
    for (const r of REPORTS) {
        assert.ok(r.id && !ids.has(r.id), r.id);
        ids.add(r.id);
        assert.ok(r.titleAr && r.titleEn, r.id);
        const [resource, action] = r.permission.split('.');
        assert.ok(P.RESOURCES[resource] && P.ACTIONS.includes(action), r.permission);
        assert.equal(typeof r.run, 'function');
        for (const f of r.filters || []) assert.ok(f.key && f.type, `${r.id}.${f && f.key}`);
    }
});

test('reports follow the role permissions', () => {
    const ids = (role) => available(P.effectiveGrants(role), role).map((r) => r.id);
    assert.deepEqual(ids('customer'), [], 'customers get no staff reports');
    assert.ok(!ids('employee').includes('audit'));
    assert.ok(!ids('employee').includes('revenue_expenses'));
    assert.ok(!ids('employee').includes('employee_performance'));
    assert.ok(ids('team_leader').includes('team_performance'));
    assert.ok(ids('finance_manager').includes('revenue_expenses'));
    assert.ok(!ids('hr_manager').includes('payments'));
    assert.ok(ids('admin').includes('audit'));
    assert.equal(ids('super_admin').length, REPORTS.length);
});

test('date ranges include the whole last day', () => {
    const r = range({ from: '2026-11-01', to: '2026-11-30' }, 'paidAt');
    assert.equal(r.paidAt.$gte.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(r.paidAt.$lte.toISOString(), '2026-11-30T23:59:59.999Z');
    assert.deepEqual(range({}, 'paidAt'), {});
    assert.deepEqual(range({ from: 'nonsense' }, 'x'), {});
});
