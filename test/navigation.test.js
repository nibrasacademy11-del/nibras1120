const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const P = require('../lib/permissions');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'portal', 'src', 'components', 'navigation.js')).href);
const pages = (sections) => sections.flatMap((s) => s.items.map((i) => i.to));

test('every page sits in exactly one section and every section has a title', async () => {
    const { SECTIONS } = await load();
    const keys = SECTIONS.flatMap((s) => s.items.map((i) => `${i.to}|${i.key}`));
    assert.equal(new Set(keys).size, keys.length);
    for (const s of SECTIONS) {
        assert.ok(s.key.startsWith('sec_'));
        for (const i of s.items) assert.ok(i.desc, `${i.key} has a description`);
    }
});

test('an employee sees their work, not the money, settings or website', async () => {
    const { visibleSections } = await load();
    const seen = pages(visibleSections({ role: 'employee', isStaff: true, grants: P.DEFAULT_GRANTS.employee }));
    for (const p of ['/customers', '/tasks', '/my-access', '/security', '/attend']) assert.ok(seen.includes(p), p);
    for (const p of ['/finance', '/settings', '/website', '/roles', '/audit', '/system', '/print-samples', '/duplicates']) assert.ok(!seen.includes(p), p);
});

test('the super admin sees everything except the customer pages', async () => {
    const { visibleSections } = await load();
    const all = Object.fromEntries(Object.keys(P.RESOURCES).flatMap((r) => P.ACTIONS.map((a) => [`${r}.${a}`, 'all'])));
    const seen = pages(visibleSections({ role: 'super_admin', isStaff: true, grants: all }));
    for (const p of ['/finance', '/website', '/system', '/print-samples', '/roles']) assert.ok(seen.includes(p), p);
    assert.ok(!seen.includes('/my-lectures'));
    assert.ok(!seen.includes('/payments'), 'the finance hub replaces the payments page for them');
});

test('a customer sees only their own academy pages', async () => {
    const { visibleSections } = await load();
    const sections = visibleSections({ role: 'customer', isStaff: false, grants: P.DEFAULT_GRANTS.customer });
    assert.deepEqual(sections.map((s) => s.key), ['sec_customer', 'sec_account']);
});

test('what a role can do on a resource is grouped by reach', async () => {
    const { actionsOn } = await load();
    const by = actionsOn('customers', P.DEFAULT_GRANTS.employee);
    assert.ok(by.own.includes('view'));
    assert.equal(by.all.length, 0);
});
