// The menus (16 Nov 2026): four staff accounts (owner, assistant, team leader, employee) and the
// customer. A short list that is always open; related pages are tabs under one item.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'portal', 'src', 'components', 'navigation.js')).href);
// every page a menu reaches: the items and their tabs
const pages = (items) => [...new Set(items.flatMap((i) => [i.to, ...(i.tabs || []).map((x) => x.to)]))];

test('every role has a short menu', async () => {
    const { menuItems } = await load();
    for (const [role, max] of [['super_admin', 7], ['assistant', 7], ['team_leader', 6], ['employee', 5], ['customer', 6]]) {
        const n = menuItems({ role }).length;
        assert.ok(n <= max, `${role}: ${n}`);
    }
});

test('an employee sees their own work, never money, settings, the website or other people', async () => {
    const { menuItems } = await load();
    const p = pages(menuItems({ role: 'employee' }));
    for (const hidden of ['/finance', '/settings', '/website', '/employees', '/payroll', '/audit', '/roles', '/my-team', '/user-accounts']) assert.ok(!p.includes(hidden), hidden);
    for (const shown of ['/', '/customers', '/lookup', '/access-requests', '/tasks', '/my-payslips', '/my-profile']) assert.ok(p.includes(shown), shown);
});

test('a team leader adds their team, nothing administrative', async () => {
    const { menuItems } = await load();
    const p = pages(menuItems({ role: 'team_leader' }));
    for (const shown of ['/my-team', '/performance', '/access-requests']) assert.ok(p.includes(shown), shown);
    for (const hidden of ['/finance', '/payroll', '/settings', '/employees', '/audit']) assert.ok(!p.includes(hidden), hidden);
});

test('the assistant: everything except the money, the audit log and the settings', async () => {
    const { menuItems } = await load();
    const p = pages(menuItems({ role: 'assistant' }));
    for (const shown of ['/', '/reports', '/customers', '/customer-accounts', '/complaints', '/programs', '/groups', '/certificates', '/employees', '/website', '/user-accounts']) assert.ok(p.includes(shown), shown);
    for (const hidden of ['/finance', '/commissions', '/payroll', '/settings', '/audit']) assert.ok(!p.includes(hidden), hidden);
});

test('the owner has everything; customers and their accounts are one item', async () => {
    const { menuItems, itemFor } = await load();
    const items = menuItems({ role: 'super_admin' });
    const p = pages(items);
    for (const shown of ['/', '/customers', '/customer-accounts', '/programs', '/certificates', '/finance', '/employees', '/payroll', '/website', '/settings', '/audit', '/user-accounts']) assert.ok(p.includes(shown), shown);
    assert.equal(itemFor(items, '/customer-accounts'), itemFor(items, '/customers'));
    assert.equal(itemFor(items, '/customers/abc').key, 'customers', 'a customer file belongs to Customers');
});

test('old roles get their replacement menu; cms shows only the website', async () => {
    const { menuItems } = await load();
    assert.deepEqual(pages(menuItems({ role: 'admin' })), pages(menuItems({ role: 'employee' })));
    assert.deepEqual(pages(menuItems({ role: 'customer_support' })), pages(menuItems({ role: 'assistant' })));
    assert.deepEqual(menuItems({ role: 'super_admin', zone: 'cms' }).map((i) => i.to), ['/website', '/security']);
});
