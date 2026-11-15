const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/whatsappTemplates');

test('templates are filled with the customer details; unknown names stay', () => {
    const text = W.fillTemplate('مرحباً {name} ({customerNo})، المستحق {owed}. {unknown}', { name: 'سارة', customerNo: 'NB-000102', owed: '2,500 EGP' });
    assert.equal(text, 'مرحباً سارة (NB-000102)، المستحق 2,500 EGP. {unknown}');
    assert.equal(W.fillTemplate('{name}', { name: null }), '{name}');
});

test('the default templates cover the common messages and are valid', () => {
    const keys = W.DEFAULT_TEMPLATES.map((x) => x.key);
    for (const k of ['welcome', 'payment', 'lecture', 'certificate']) assert.ok(keys.includes(k));
    assert.deepEqual(W.cleanTemplates(W.DEFAULT_TEMPLATES), W.DEFAULT_TEMPLATES.map((x) => ({ ...x })));
});

test('saved templates are cleaned: title and text required, at most 20, keys filled', () => {
    assert.equal(W.cleanTemplates([{ titleAr: '', text: 'x' }]), null);
    assert.equal(W.cleanTemplates('x'), null);
    assert.equal(W.cleanTemplates(new Array(21).fill({ titleAr: 'a', text: 'b' })), null);
    const out = W.cleanTemplates([{ titleAr: ' تهنئة ', text: ' مبروك {name} ' }]);
    assert.deepEqual(out, [{ key: 't1', titleAr: 'تهنئة', text: 'مبروك {name}' }]);
});
