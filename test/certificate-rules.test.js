const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/certificateRules');
const { brandedEmail } = require('../lib/brandEmail');

test('rules are cleaned: unknown modes fall back to manual, numbers are bounded', () => {
    const r = R.normalizeRule({ mode: 'whenever', issue: 'x', daysAfterEnd: '900', minAttendance: -5, sendEmail: false });
    assert.equal(r.mode, 'manual');
    assert.equal(r.issue, 'both');
    assert.equal(r.daysAfterEnd, 365);
    assert.equal(r.minAttendance, 0);
    assert.equal(r.sendEmail, false);
    const kept = R.normalizeRule({ minAttendance: 75 }, { mode: 'on_approval', issue: 'modules' });
    assert.equal(kept.mode, 'on_approval', 'unchanged fields keep their saved value');
    assert.equal(kept.issue, 'modules');
    assert.equal(kept.minAttendance, 75);
});

test('when a group rule is due', () => {
    const now = new Date('2026-12-10T08:00:00Z');
    assert.equal(R.ruleDue({ mode: 'manual' }, {}, now), false);
    assert.equal(R.ruleDue({ mode: 'on_approval' }, {}, now), true);
    assert.equal(R.ruleDue({ mode: 'on_date', date: '2026-12-11' }, {}, now), false);
    assert.equal(R.ruleDue({ mode: 'on_date', date: '2026-12-09' }, {}, now), true);
    const cohort = { endDate: new Date('2026-12-01T00:00:00Z') };
    assert.equal(R.ruleDue({ mode: 'after_end', daysAfterEnd: 7 }, cohort, now), true);
    assert.equal(R.ruleDue({ mode: 'after_end', daysAfterEnd: 10 }, cohort, now), false);
    assert.equal(R.ruleDue({ mode: 'after_end', daysAfterEnd: 0 }, {}, now), false, 'no end date, never due');
});

test('what is still owed, per currency', () => {
    const charges = [
        { _id: 'a', currency: 'EGP', netAmount: 10000, status: 'active' },
        { _id: 'b', currency: 'EGP', netAmount: 5000, status: 'active' },
        { _id: 'c', currency: 'SAR', netAmount: 1500, status: 'active' },
        { _id: 'd', currency: 'USD', netAmount: 900, status: 'cancelled' }
    ];
    const totals = { a: { applied: 10000, refunded: 0 }, b: { applied: 3000, refunded: 500 }, c: { applied: 1500, refunded: 0 } };
    const o = R.outstanding(charges, totals);
    assert.equal(o.clear, false);
    assert.deepEqual(o.byCurrency, [{ currency: 'EGP', remaining: 2500 }], 'a refund reopens the balance; cancelled charges are ignored');
    assert.equal(R.money(o.byCurrency), '2500 EGP');
    assert.equal(R.outstanding([{ _id: 'x', currency: 'EGP', netAmount: 100, status: 'active' }], { x: { applied: 120, refunded: 0 } }).clear, true, 'overpaid is clear');
    assert.equal(R.outstanding([], {}).clear, true);
});

test('why a certificate waits: approval first, then attendance, then payment', () => {
    assert.equal(R.holdReason({ approved: false, paid: false, rate: 10, minAttendance: 50 }), 'not_approved');
    assert.equal(R.holdReason({ approved: true, paid: false, rate: 40, minAttendance: 50 }), 'low_attendance');
    assert.equal(R.holdReason({ approved: true, paid: true, rate: null, minAttendance: 50 }), 'low_attendance', 'no lectures held yet');
    assert.equal(R.holdReason({ approved: true, paid: false, rate: 90, minAttendance: 50 }), 'unpaid');
    assert.equal(R.holdReason({ approved: true, paid: true, rate: null, minAttendance: 0 }), null);
    assert.equal(R.holdReason({ approved: true, paid: true, issued: true }), 'issued');
});

test('paper certificate steps go forward only', () => {
    assert.equal(R.canMovePaper('none', 'printed'), true);
    assert.equal(R.canMovePaper('none', 'delivered'), false);
    assert.equal(R.canMovePaper('printed', 'ready'), true);
    assert.equal(R.canMovePaper('printed', 'shipped'), true);
    assert.equal(R.canMovePaper('ready', 'delivered'), true);
    assert.equal(R.canMovePaper('delivered', 'printed'), false);
    assert.equal(R.canMovePaper('shipped', 'ready'), false);
    assert.equal(R.canMovePaper(undefined, 'printed'), true);
});

test('modules approvable for a whole group', () => {
    for (const s of ['not_started', 'in_progress', 'ready_for_review', 'rejected']) assert.ok(R.GROUP_APPROVABLE.includes(s));
    for (const s of ['approved', 'certificate_issued']) assert.ok(!R.GROUP_APPROVABLE.includes(s));
});

test('branded email escapes names and keeps the academy colours', () => {
    const html = brandedEmail({ heading: 'مبروك <b>', lines: ['x', null], button: { label: 'عرض', url: 'https://x.test/a?b=1&c=2' } });
    assert.ok(html.includes('#5a020e'));
    assert.ok(html.includes('مبروك &lt;b&gt;'));
    assert.ok(html.includes('https://x.test/a?b=1&amp;c=2'));
});
