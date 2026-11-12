const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/payroll');

const advance = (o = {}) => ({ _id: 'a1', status: 'active', amount: 3000, currency: 'EGP', installments: 3, startMonth: '2026-11', repaid: 0, repayments: [], ...o });

test('net = basic + commission + bonus - advance - deduction', () => {
    assert.equal(P.netOf({ basic: 8000, commission: 1250.5, bonus: 500, advanceDeduction: 1000, deduction: 300 }), 8450.5);
    assert.equal(P.netOf({}), 0);
});

test('an advance takes its monthly share from its first month, never twice, never more than is left', () => {
    assert.equal(P.installmentFor(advance(), '2026-10'), 0, 'before the first month');
    assert.equal(P.installmentFor(advance(), '2026-11'), 1000);
    assert.equal(P.installmentFor(advance({ repayments: [{ month: '2026-11', amount: 1000 }], repaid: 1000 }), '2026-11'), 0, 'same month again');
    assert.equal(P.installmentFor(advance({ repaid: 2500 }), '2027-01'), 500, 'only what is left');
    assert.equal(P.installmentFor(advance({ repaid: 3000 }), '2027-02'), 0);
    assert.equal(P.installmentFor(advance({ status: 'cancelled' }), '2026-11'), 0);
    assert.equal(P.installmentFor(advance({ amount: 1000, installments: 3 }), '2026-11'), 333.33);
});

test('only approved and paid commissions count, per currency', () => {
    const c = P.commissionsByCurrency([
        { status: 'approved', currency: 'EGP', amount: 500 },
        { status: 'paid', currency: 'EGP', amount: 250 },
        { status: 'due', currency: 'EGP', amount: 9999 },
        { status: 'cancelled', currency: 'EGP', amount: 9999 },
        { status: 'approved', currency: 'EGP', amount: -100 },
        { status: 'approved', currency: 'SAR', amount: 75 }
    ]);
    assert.deepEqual(c, { EGP: 650, SAR: 75 });
});

test('a line: commission in the salary currency is added, others are listed; hand-typed parts are kept', () => {
    const line = P.buildLine({
        employee: { user: 'u1', employeeNo: 'EMP-0001', nameAr: 'أحمد', jobTitle: 'مستشار', team: { _id: 't1', nameAr: 'فريق' } },
        salary: { basic: 9000, currency: 'EGP' },
        commissions: { EGP: 1200, SAR: 60 },
        advances: [advance(), advance({ _id: 'a2', currency: 'SAR' })],
        attendance: { workingDays: 20, present: 18, absent: 2, lateMinutes: 45 },
        month: '2026-11',
        keep: { bonus: 500, bonusNote: 'تارجت', deduction: 600, deductionNote: 'غياب يومين' }
    });
    assert.equal(line.commission, 1200);
    assert.deepEqual(line.otherCommissions, [{ currency: 'SAR', amount: 60 }]);
    assert.equal(line.advanceDeduction, 1000, 'only the advance in the salary currency');
    assert.equal(line.attendance.absent, 2);
    assert.equal(line.attendance.lateMinutes, 45);
    assert.equal(line.bonusNote, 'تارجت');
    assert.equal(line.net, 9000 + 1200 + 500 - 1000 - 600);
});

test('no automatic deduction for absence: the deduction stays what was typed', () => {
    const line = P.buildLine({ employee: { user: 'u', nameAr: 'x' }, salary: { basic: 5000 }, attendance: { absent: 5, lateMinutes: 300 }, month: '2026-11' });
    assert.equal(line.deduction, 0);
    assert.equal(line.net, 5000);
});

test('totals per currency', () => {
    const t = P.totals([{ currency: 'EGP', basic: 100, net: 90, deduction: 10 }, { currency: 'EGP', basic: 50, net: 50 }, { currency: 'SAR', basic: 10, net: 10 }]);
    assert.equal(t.EGP.basic, 150);
    assert.equal(t.EGP.net, 140);
    assert.equal(t.EGP.people, 2);
    assert.equal(t.SAR.people, 1);
});
