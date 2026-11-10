const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/money');

test('rounding per currency, without float drift', () => {
    assert.equal(M.round(1.005, 2), 1.01);
    assert.equal(M.round(2.675, 2), 2.68);
    assert.equal(M.round(-1.005, 2), -1.01);
    assert.equal(M.round(1.0005, 3), 1.001);
    assert.equal(M.round(0.1 + 0.2, 2), 0.3);
    assert.equal(M.round('abc'), 0);
    assert.equal(M.decimalsOf('KWD'), 3);
    assert.equal(M.decimalsOf('SAR'), 2);
});

test('conversion through the base currency', () => {
    assert.equal(M.toBase(100, 3.75), 375);
    assert.equal(M.toBase(1000, 0.0773), 77.3);
    assert.equal(M.fromBase(375, 3.75), 100);
    assert.equal(M.fromBase(10, 0), 0);
    // 100 USD into EGP when 1 USD = 3.75 SAR and 1 EGP = 0.0773 SAR
    assert.equal(M.convert(100, 3.75, 0.0773), 4851.23);
    assert.equal(M.convert(50, 12.2, 1, 2), 610);
});

test('currency codes from the old catalog', () => {
    assert.equal(M.normalizeCode('US$'), 'USD');
    assert.equal(M.normalizeCode('sar'), 'SAR');
    assert.equal(M.normalizeCode('ج.م'), 'EGP');
    assert.equal(M.normalizeCode('dollars'), '');
});

test('amount validation', () => {
    assert.equal(M.isValidAmount(10.5), true);
    assert.equal(M.isValidAmount(10.555), false);
    assert.equal(M.isValidAmount(10.555, 3), true);
    assert.equal(M.isValidAmount(0), false);
    assert.equal(M.isValidAmount(-5), false);
    assert.equal(M.isValidAmount('x'), false);
});

test('installments split evenly with the remainder on the last', () => {
    const list = M.splitInstallments(1000, 3, '2026-01-15T00:00:00Z');
    assert.deepEqual(list.map((i) => i.amount), [333.33, 333.33, 333.34]);
    assert.equal(list.reduce((a, i) => a + i.amount, 0).toFixed(2), '1000.00');
    assert.equal(new Date(list[2].dueDate).getUTCMonth(), 2);
    assert.equal(M.splitInstallments(500, 0, new Date()).length, 1);
});

test('payments cover installments in due order', () => {
    const list = M.splitInstallments(900, 3, '2026-01-01T00:00:00Z');
    const s = M.installmentStatus(list, 450, new Date('2026-02-15T00:00:00Z'));
    assert.deepEqual(s.map((i) => i.status), ['paid', 'partial', 'due']);
    assert.deepEqual(s.map((i) => i.remaining), [0, 150, 300]);
    const late = M.installmentStatus(list, 0, new Date('2026-02-15T00:00:00Z'));
    assert.deepEqual(late.map((i) => i.status), ['overdue', 'overdue', 'due']);
    assert.deepEqual(M.installmentStatus(list, 2000, new Date()).map((i) => i.status), ['paid', 'paid', 'paid']);
});

test('charge balance counts refunds and overpayment', () => {
    assert.deepEqual(M.chargeBalance({ net: 1000, applied: 600, refunded: 100 }), { net: 1000, paid: 500, remaining: 500, overpaid: 0 });
    assert.deepEqual(M.chargeBalance({ net: 1000, applied: 1200 }), { net: 1000, paid: 1200, remaining: -200, overpaid: 200 });
});

test('period keys are monthly, in UTC', () => {
    assert.equal(M.periodKey('2026-11-30T23:00:00Z'), '2026-11');
    assert.equal(M.periodKey('2026-01-01T00:00:00Z'), '2026-01');
});
