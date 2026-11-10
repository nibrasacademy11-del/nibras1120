const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../lib/attendance');

const shift = { days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00', graceMinutes: 15, earlyLeaveGraceMinutes: 5 };
// Cairo is UTC+2 in winter: 07:00Z = 09:00 local
const at = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00+02:00`);

test('local time in Cairo regardless of the server zone', () => {
    const p = A.localParts(new Date('2026-11-15T22:30:00Z'));
    assert.deepEqual(p, { date: '2026-11-16', weekday: 1, minutes: 30 });
});

test('on time, late within grace, late beyond grace', () => {
    const ymd = '2026-11-15'; // Sunday
    assert.equal(A.evaluateDay({ ymd, shift, record: { checkInAt: at(ymd, '09:10') }, today: '2026-11-20' }).status, 'present');
    const late = A.evaluateDay({ ymd, shift, record: { checkInAt: at(ymd, '09:40'), checkOutAt: at(ymd, '17:00') }, today: '2026-11-20' });
    assert.equal(late.status, 'late');
    assert.equal(late.lateMinutes, 40);
    assert.equal(late.workedMinutes, 440);
    assert.equal(late.earlyLeaveMinutes, 0);
});

test('leaving early and a permission that excuses it', () => {
    const ymd = '2026-11-16';
    const rec = { checkInAt: at(ymd, '09:00'), checkOutAt: at(ymd, '15:00') };
    assert.equal(A.evaluateDay({ ymd, shift, record: rec, today: '2026-11-20' }).earlyLeaveMinutes, 120);
    const ok = A.evaluateDay({ ymd, shift, record: rec, leave: { type: 'permission', hours: 2 }, today: '2026-11-20' });
    assert.equal(ok.earlyLeaveMinutes, 0);
    const lateAndEarly = A.evaluateDay({ ymd, shift, record: { checkInAt: at(ymd, '10:00'), checkOutAt: at(ymd, '16:00') }, leave: { type: 'permission', hours: 1.5 }, today: '2026-11-20' });
    assert.equal(lateAndEarly.lateMinutes, 0);
    assert.equal(lateAndEarly.earlyLeaveMinutes, 30);
});

test('absent, leave, holiday, weekend, today not yet', () => {
    assert.equal(A.evaluateDay({ ymd: '2026-11-16', shift, today: '2026-11-20' }).status, 'absent');
    assert.equal(A.evaluateDay({ ymd: '2026-11-16', shift, leave: { type: 'annual' }, today: '2026-11-20' }).status, 'leave');
    assert.equal(A.evaluateDay({ ymd: '2026-11-16', shift, holiday: { name: 'x' }, today: '2026-11-20' }).status, 'holiday');
    assert.equal(A.evaluateDay({ ymd: '2026-11-20', shift, today: '2026-11-25' }).status, 'weekend'); // Friday
    assert.equal(A.evaluateDay({ ymd: '2026-11-19', shift, today: '2026-11-19' }).status, 'pending');
    assert.equal(A.evaluateDay({ ymd: '2026-11-21', shift, record: { checkInAt: at('2026-11-21', '10:00') }, today: '2026-11-25' }).status, 'extra');
});

test('month summary', () => {
    const s = A.summarize([
        { status: 'present', lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 480 },
        { status: 'late', lateMinutes: 30, earlyLeaveMinutes: 0, workedMinutes: 450 },
        { status: 'absent', lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0 },
        { status: 'leave', lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0 },
        { status: 'weekend', lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0 }
    ]);
    assert.deepEqual(s, { workingDays: 4, present: 2, late: 1, absent: 1, leave: 1, holiday: 0, extra: 0, lateMinutes: 30, earlyLeaveMinutes: 0, workedMinutes: 930 });
    assert.equal(A.daysOfMonth('2026-02').length, 28);
    assert.equal(A.daysOfMonth('2028-02').length, 29);
});

test('kiosk codes expire after about a minute and cannot be forged', () => {
    const now = 1_800_000_000_000;
    const step = A.stepAt(now);
    const tok = A.stationToken('secret', 'st1', step);
    assert.equal(A.verifyStationToken('secret', 'st1', tok, step, now), true);
    assert.equal(A.verifyStationToken('secret', 'st1', tok, step, now + 60 * 1000), true);
    assert.equal(A.verifyStationToken('secret', 'st1', tok, step, now + 95 * 1000), false);
    assert.equal(A.verifyStationToken('secret', 'st2', tok, step, now), false);
    assert.equal(A.verifyStationToken('other', 'st1', tok, step, now), false);
    assert.equal(A.verifyStationToken('secret', 'st1', tok, step + 1, now), false, 'future steps are refused');
    assert.equal(A.verifyStationToken('secret', 'st1', 'x', step, now), false);
});

test('signed device tokens', () => {
    const t = A.sign('k', { u: 'user1', n: 'Sara' });
    assert.deepEqual(A.verify('k', t), { u: 'user1', n: 'Sara' });
    assert.equal(A.verify('other', t), null);
    assert.equal(A.verify('k', t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))), null);
    assert.equal(A.verify('k', 'garbage'), null);
});

test('local date and time to the UTC moment, across midnight and zones', () => {
    assert.equal(A.localToUtc('2026-11-16', '09:00').toISOString(), '2026-11-16T07:00:00.000Z');
    assert.equal(A.localToUtc('2026-11-16', '00:30').toISOString(), '2026-11-15T22:30:00.000Z');
    assert.equal(A.localToUtc('2026-11-16', '23:30', 'Asia/Riyadh').toISOString(), '2026-11-16T20:30:00.000Z');
    assert.equal(A.localToUtc('2026-11-16', '08:00', 'America/New_York').toISOString(), '2026-11-16T13:00:00.000Z');
    assert.equal(A.localToUtc('2026-11-16', '22:00', 'America/New_York').toISOString(), '2026-11-17T03:00:00.000Z');
});
