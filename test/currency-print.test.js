const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/money');
const A = require('../lib/academy');
const rules = require('../lib/commission');

test('no rate, no base amount: amounts stay in their own currency', () => {
    assert.equal(M.baseOf(100, null), null);
    assert.equal(M.baseOf(100, undefined), null);
    assert.equal(M.baseOf(100, 0), null);
    assert.equal(M.baseOf(100, 'x'), null);
    assert.equal(M.baseOf(100, 0.2, 2), 20);
});

test('rows pivot to one row per key with an amount per currency, never added together', () => {
    const rows = M.pivotByCurrency([
        { _id: { k: 'cash', c: 'EGP' }, amount: 5000, n: 3 },
        { _id: { k: 'cash', c: 'SAR' }, amount: 300, n: 1 },
        { _id: { k: 'card', c: 'EGP' }, amount: 900, n: 1 },
        { _id: { k: 'cash', c: 'EGP' }, amount: 1000, n: 1 }
    ]);
    assert.equal(rows[0]._id, 'cash');
    assert.equal(rows[0].n, 5);
    assert.deepEqual(rows[0].amounts, [{ currency: 'EGP', amount: 6000 }, { currency: 'SAR', amount: 300 }]);
    assert.deepEqual(rows[1].amounts, [{ currency: 'EGP', amount: 900 }]);
});

test('totals per currency with the net of each', () => {
    const t = M.currencyTotals({
        collected: [{ _id: 'EGP', amount: 10000 }, { _id: 'SAR', amount: 500 }],
        refunded: [{ _id: 'EGP', amount: 1000 }],
        expenses: [{ _id: 'EGP', amount: 2500 }, { _id: 'USD', amount: 40 }],
        commissions: [{ _id: 'SAR', amount: 25 }]
    });
    const egp = t.find((x) => x.currency === 'EGP');
    assert.deepEqual(egp, { currency: 'EGP', collected: 10000, refunded: 1000, expenses: 2500, commissions: 0, net: 6500 });
    assert.equal(t.find((x) => x.currency === 'SAR').net, 475);
    assert.equal(t.find((x) => x.currency === 'USD').net, -40, 'a currency with only expenses still shows');
    assert.equal(t[0].currency, 'EGP', 'largest collections first');
});

test('commission statements are per currency, and reversals keep the line currency', () => {
    const lines = [
        { amount: 100, status: 'due', currency: 'EGP' },
        { amount: -20, status: 'due', currency: 'EGP' },
        { amount: 15, status: 'approved', currency: 'SAR' }
    ];
    const s = rules.summarizeByCurrency(lines);
    assert.deepEqual(s.find((x) => x.currency === 'EGP'), { currency: 'EGP', earned: 100, reversed: -20, net: 80, due: 80, approved: 0, paid: 0 });
    assert.equal(s.find((x) => x.currency === 'SAR').approved, 15);
    const rev = rules.reverseLines([{ _id: 'l1', beneficiary: 'u', role: 'employee', share: 100, rate: 5, commissionable: 1000, amount: 50, currency: 'SAR' }], 0.5);
    assert.equal(rev[0].currency, 'SAR');
    assert.equal(rev[0].amount, -25);
});

test('commission is earned on the amount in the payment currency', () => {
    const lines = rules.computeLines({ baseAmount: 3000, beneficiaries: [{ user: 'u1', share: 100, rate: 5 }], leader: null, decimals: 2 });
    assert.equal(lines[0].amount, 150);
});

test('academy profile: cleaned, bounded, defaults kept', () => {
    const p = A.cleanProfile({ nameAr: '  أكاديمية نبراس  ', taxNumber: '123-456-789', vatRate: '14', pricesIncludeVat: false });
    assert.equal(p.nameAr, 'أكاديمية نبراس');
    assert.equal(p.taxNumber, '123-456-789');
    assert.equal(p.vatRate, 14);
    assert.equal(p.pricesIncludeVat, false);
    assert.equal(p.website, A.PROFILE_DEFAULT.website);
    assert.equal(A.cleanProfile({ vatRate: 150 }), null);
    assert.equal(A.cleanProfile({ phone: 5 }), null);
    assert.equal(A.cleanProfile('x'), null);
    assert.equal(A.cleanProfile({ nameAr: '' }).nameAr, A.PROFILE_DEFAULT.nameAr, 'the name is never empty');
});

test('VAT inside or on top of the amount', () => {
    assert.deepEqual(A.vatSplit(1140, 14, true), { net: 1000, vat: 140, total: 1140, rate: 14 });
    assert.deepEqual(A.vatSplit(1000, 14, false), { net: 1000, vat: 140, total: 1140, rate: 14 });
    const odd = A.vatSplit(999.99, 14, true);
    assert.equal(Math.round((odd.net + odd.vat) * 100) / 100, 999.99, 'net + vat = total');
    assert.deepEqual(A.vatSplit(500, 0), { net: 500, vat: 0, total: 500, rate: 0 });
});

test('receipt verification key: stable, short, different per receipt', () => {
    const k = A.receiptKey('RC-000123');
    assert.equal(k.length, 16);
    assert.equal(k, A.receiptKey('RC-000123'));
    assert.notEqual(k, A.receiptKey('RC-000124'));
});
