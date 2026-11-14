// The menus of the five roles (PLAN-V2): a few pages each, never more than the role needs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'portal', 'src', 'components', 'navigation.js')).href);
const pages = (sections) => sections.flatMap((s) => s.items.map((i) => i.to));

test('every role has a short menu', async () => {
    const { visibleSections } = await load();
    const count = (role) => pages(visibleSections({ role })).length;
    assert.ok(count('employee') <= 7, `employee: ${count('employee')}`);
    assert.ok(count('team_leader') <= 8, `team leader: ${count('team_leader')}`);
    assert.ok(count('customer_support') <= 8, `customer service: ${count('customer_support')}`);
    assert.ok(count('customer') <= 6, `customer: ${count('customer')}`);
});

test('an employee sees their own work, never money, settings, the website or other people', async () => {
    const { visibleSections } = await load();
    const p = pages(visibleSections({ role: 'employee' }));
    for (const hidden of ['/finance', '/settings', '/website', '/employees', '/payroll', '/audit', '/my-access', '/roles', '/my-team']) assert.ok(!p.includes(hidden), hidden);
    for (const shown of ['/', '/customers', '/tasks', '/my-payslips', '/my-profile']) assert.ok(p.includes(shown), shown);
});

test('a team leader adds their team, nothing administrative', async () => {
    const { visibleSections } = await load();
    const p = pages(visibleSections({ role: 'team_leader' }));
    assert.ok(p.includes('/my-team'));
    for (const hidden of ['/finance', '/payroll', '/settings', '/employees', '/audit']) assert.ok(!p.includes(hidden), hidden);
});

test('customer service: customers, complaints, lectures and certificates', async () => {
    const { visibleSections } = await load();
    const p = pages(visibleSections({ role: 'customer_support' }));
    for (const shown of ['/customers', '/complaints', '/groups', '/certificates']) assert.ok(p.includes(shown), shown);
    for (const hidden of ['/finance', '/payroll', '/settings', '/website']) assert.ok(!p.includes(hidden), hidden);
});

test('the owner has every section; no permissions pages anywhere', async () => {
    const { visibleSections, MENUS } = await load();
    const p = pages(visibleSections({ role: 'super_admin' }));
    for (const shown of ['/', '/customers', '/programs', '/certificates', '/finance', '/employees', '/payroll', '/website', '/settings', '/audit']) assert.ok(p.includes(shown), shown);
    for (const role of Object.keys(MENUS)) {
        const all = pages(MENUS[role]);
        assert.ok(!all.includes('/my-access') && !all.includes('/roles'), role);
    }
});

test('removed roles get the employee menu; cms shows only the website', async () => {
    const { visibleSections } = await load();
    assert.deepEqual(pages(visibleSections({ role: 'admin' })), pages(visibleSections({ role: 'employee' })));
    assert.deepEqual(pages(visibleSections({ role: 'super_admin', zone: 'cms' })), ['/website', '/security']);
});
