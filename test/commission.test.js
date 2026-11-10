const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/commission');

test('one collector at 5%, leader extra 1% on top', () => {
    const lines = C.computeLines({ baseAmount: 1875, beneficiaries: [{ user: 'e1', share: 100, rate: 5, team: 't1' }], leader: { user: 'tl', rate: 1, team: 't1' } });
    assert.deepEqual(lines.map((l) => [l.beneficiary, l.role, l.amount]), [['e1', 'employee', 93.75], ['tl', 'team_leader', 18.75]]);
    assert.equal(lines[0].commissionable, 1875);
});

test('a split between two employees with different rates', () => {
    const lines = C.computeLines({ baseAmount: 1000, beneficiaries: [{ user: 'a', share: 60, rate: 5 }, { user: 'b', share: 40, rate: 10 }], leader: null });
    assert.deepEqual(lines.map((l) => [l.beneficiary, l.commissionable, l.amount]), [['a', 600, 30], ['b', 400, 40]]);
});

test('zero rates, no leader, and empty splits produce no lines', () => {
    assert.deepEqual(C.computeLines({ baseAmount: 1000, beneficiaries: [{ user: 'a', share: 100, rate: 0 }], leader: { user: 'tl', rate: 0 } }), []);
    assert.deepEqual(C.computeLines({ baseAmount: 1000, beneficiaries: [], leader: null }), []);
});

test('shares are scaled to 100 when they do not add up', () => {
    const s = C.normalizeShares([{ user: 'a', share: 1, rate: 5 }, { user: 'b', share: 3, rate: 5 }]);
    assert.deepEqual(s.map((x) => x.share), [25, 75]);
});

test('split validation', () => {
    assert.deepEqual(C.validateSplit([{ user: 'a', share: 50 }, { user: 'b', share: 50 }]), []);
    assert.ok(C.validateSplit([{ user: 'a', share: 50 }]).includes('total_not_100'));
    assert.ok(C.validateSplit([{ user: 'a', share: 50 }, { user: 'a', share: 50 }]).includes('duplicate_user'));
    assert.ok(C.validateSplit([]).includes('empty'));
    assert.ok(C.validateSplit([{ user: 'a', share: 0 }, { user: 'b', share: 100 }]).includes('bad_share'));
});

test('a refund reverses its fraction of every line at the frozen rate', () => {
    const lines = [
        { _id: 'l1', beneficiary: 'e1', role: 'employee', share: 100, rate: 5, commissionable: 1500, amount: 75 },
        { _id: 'l2', beneficiary: 'tl', role: 'team_leader', share: 100, rate: 1, commissionable: 1500, amount: 15 }
    ];
    const rev = C.reverseLines(lines, 0.25);
    assert.deepEqual(rev.map((l) => [l.beneficiary, l.amount, l.commissionable, l.reversalOf]), [['e1', -18.75, -375, 'l1'], ['tl', -3.75, -375, 'l2']]);
    assert.deepEqual(C.reverseLines(lines, 1).map((l) => l.amount), [-75, -15]);
    assert.deepEqual(C.reverseLines(lines, 0), []);
});

test('rate history: the rate in effect at the payment date', () => {
    const h = [{ rate: 5, effectiveFrom: '2026-01-01' }, { rate: 7, effectiveFrom: '2026-06-01' }];
    assert.equal(C.rateAt(h, '2026-03-15'), 5);
    assert.equal(C.rateAt(h, '2026-06-01'), 7);
    assert.equal(C.rateAt(h, '2025-12-31', 2), 2);
    assert.equal(C.rateAt([], new Date(), 3), 3);
});

test('statement totals by status', () => {
    const s = C.summarize([
        { amount: 100, status: 'paid' }, { amount: 50, status: 'approved' }, { amount: -20, status: 'due' }, { amount: 30, status: 'due' }, { amount: 999, status: 'cancelled' }
    ]);
    assert.deepEqual(s, { earned: 180, reversed: -20, net: 160, due: 10, approved: 50, paid: 100 });
});
