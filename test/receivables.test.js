const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/receivables');

const at = (s) => new Date(`${s}T10:00:00Z`);

test('reminder stages: a few days before, on the day, and on the chosen late days', () => {
    const cfg = { daysBefore: 3, overdueDays: [1, 7, 14] };
    const due = at('2026-12-10');
    assert.equal(R.reminderStage(due, at('2026-12-07'), cfg), 'before');
    assert.equal(R.reminderStage(due, at('2026-12-08'), cfg), null);
    assert.equal(R.reminderStage(due, at('2026-12-10'), cfg), 'due');
    assert.equal(R.reminderStage(due, at('2026-12-11'), cfg), 'overdue_1');
    assert.equal(R.reminderStage(due, at('2026-12-12'), cfg), null);
    assert.equal(R.reminderStage(due, at('2026-12-17'), cfg), 'overdue_7');
    assert.equal(R.reminderStage(due, at('2026-12-24'), cfg), 'overdue_14');
    assert.equal(R.reminderStage(due, at('2026-12-07'), { daysBefore: 0, overdueDays: [] }), null, 'no reminder ahead when switched off');
});

test('reminder settings are cleaned', () => {
    assert.deepEqual(R.cleanReminderSettings({ daysBefore: '2', overdueDays: [14, '3', 3, 0, 900], email: false }), { enabled: true, daysBefore: 2, overdueDays: [3, 14], email: false, notifyOwner: true });
    assert.equal(R.cleanReminderSettings({ daysBefore: 99 }), null);
    assert.equal(R.cleanReminderSettings('on'), null);
});

test('receivables grouped per customer, late ones first, amounts per currency', () => {
    const rows = [
        { customerId: 'a', currency: 'EGP', remaining: 1000, dueDate: at('2026-12-20'), late: false, daysLate: 0 },
        { customerId: 'b', currency: 'EGP', remaining: 500, dueDate: at('2026-11-01'), late: true, daysLate: 40 },
        { customerId: 'b', currency: 'SAR', remaining: 300, dueDate: at('2026-12-15'), late: false, daysLate: 0 },
        { customerId: 'a', currency: 'EGP', remaining: 1000, dueDate: at('2026-12-01'), late: true, daysLate: 9 }
    ];
    const g = R.groupByCustomer(rows);
    assert.equal(g[0].customerId, 'b', 'the latest first');
    assert.deepEqual(g[0].owed, [{ currency: 'EGP', amount: 500 }, { currency: 'SAR', amount: 300 }]);
    assert.deepEqual(g[0].overdue, [{ currency: 'EGP', amount: 500 }]);
    assert.equal(g[0].maxDaysLate, 40);
    assert.equal(g[1].customerId, 'a');
    assert.deepEqual(g[1].owed, [{ currency: 'EGP', amount: 2000 }]);
    assert.equal(g[1].nextDue.toISOString().slice(0, 10), '2026-12-20');
});

test('WhatsApp numbers: local Egyptian mobiles get the country code', () => {
    assert.equal(R.waNumber('01112220796'), '201112220796');
    assert.equal(R.waNumber('+966 50 123 4567'), '966501234567');
    assert.equal(R.waNumber('00971501234567'), '971501234567');
    assert.equal(R.waNumber('٠١١١٢٢٢٠٧٩٦'), '201112220796');
    assert.equal(R.waNumber('123'), '');
    const link = R.waLink('01112220796', 'مرحباً');
    assert.ok(link.startsWith('https://wa.me/201112220796?text='));
    assert.equal(R.waLink('', 'x'), '');
});

test('the reminder message lists each amount with its currency and date', () => {
    const text = R.reminderText({ name: 'سارة', items: [{ remaining: 2500, currency: 'EGP', dueDate: at('2026-12-10'), description: 'القسط الثاني' }, { remaining: 300, currency: 'SAR', dueDate: null, description: 'رسوم' }] });
    assert.ok(text.includes('سارة'));
    assert.ok(text.includes('2,500 EGP (2026-12-10) — القسط الثاني'));
    assert.ok(text.includes('300 SAR — رسوم'));
});
