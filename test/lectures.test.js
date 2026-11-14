const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/lectures');
const zoom = require('../lib/zoom');
const fieldCrypto = require('../lib/fieldCrypto');
const { reminderHtml } = require('../modules/learning/lectureJobs');

const lecture = (startsAt, durationMin = 60, status = 'scheduled') => ({ startsAt: new Date(startsAt), durationMin, status });

test('join window: hidden until 15 minutes before, open until 30 minutes after the end', () => {
    const l = lecture('2026-12-01T18:00:00Z', 60);
    assert.equal(L.joinState(l, new Date('2026-12-01T17:44:00Z')), 'upcoming');
    assert.equal(L.joinState(l, new Date('2026-12-01T17:45:00Z')), 'open');
    assert.equal(L.joinState(l, new Date('2026-12-01T19:30:00Z')), 'open');
    assert.equal(L.joinState(l, new Date('2026-12-01T19:31:00Z')), 'ended');
    assert.equal(L.joinState({ ...l, status: 'cancelled' }, new Date('2026-12-01T18:00:00Z')), 'cancelled');
});

test('the server accepts a wider window than the button shows, and never a cancelled lecture', () => {
    const l = lecture('2026-12-01T18:00:00Z', 60);
    assert.equal(L.canJoinAt(l, new Date('2026-12-01T17:00:00Z')), true);
    assert.equal(L.canJoinAt(l, new Date('2026-12-01T16:59:00Z')), false);
    assert.equal(L.canJoinAt(l, new Date('2026-12-01T21:00:00Z')), true);
    assert.equal(L.canJoinAt(l, new Date('2026-12-01T21:01:00Z')), false);
    assert.equal(L.canJoinAt({ ...l, status: 'cancelled' }, new Date('2026-12-01T18:00:00Z')), false);
});

test('pasted lines: customer numbers, emails, identity numbers and phones', () => {
    const lines = L.parseLines('NB-12\n nb000034 ;ali@Mail.com\t1023456789\n+20 111 222 0796\n\n1023456789\nA1234567');
    assert.equal(lines.length, 6, 'the repeated identity number is dropped');
    assert.deepEqual(lines[0].lookups, [{ kind: 'customer_no', value: 'NB-000012' }]);
    assert.deepEqual(lines[1].lookups, [{ kind: 'customer_no', value: 'NB-000034' }]);
    assert.deepEqual(lines[2].lookups, [{ kind: 'email', value: 'ali@mail.com' }]);
    assert.deepEqual(lines[3].lookups.map((k) => k.kind), ['national_id', 'passport'], 'an identity number is not tried as a phone');
    assert.ok(lines[4].lookups.some((k) => k.kind === 'phone' && k.value === '112220796'));
    assert.deepEqual(lines[5].lookups.map((k) => k.kind), ['national_id', 'passport'], 'letters are never a phone number');
});

test('phone numbers are recognised only when written like one', () => {
    const kinds = (s) => L.parseLines(s)[0].lookups.map((k) => k.kind);
    assert.ok(kinds('01112220796').includes('phone'));
    assert.ok(kinds('0501234567').includes('phone'));
    assert.ok(kinds('966501234567').includes('phone'));
    assert.ok(kinds('00971501234567').includes('phone'));
    assert.ok(!kinds('29801011234567').includes('phone'), 'Egyptian national ID');
    assert.ok(!kinds('1023456789').includes('phone'), 'Saudi national ID');
});

test('Arabic digits are read as numbers', () => {
    const [line] = L.parseLines('١٠٢٣٤٥٦٧٨٩');
    assert.equal(line.lookups[0].value, '1023456789');
});

test('lookups use the blind index, never the plain identity number', () => {
    const q = L.lookupQuery({ kind: 'national_id', value: '1023456789' });
    assert.equal(q['identity.nationalIdIdx'], fieldCrypto.blindIndex('1023456789', 'national_id'));
    assert.ok(!JSON.stringify(q).includes('1023456789'));
});

test('Zoom participants: rejoins are added up, by personal link first, then email', () => {
    const rows = L.mergeParticipants([
        { registrant_id: 'r1', user_email: 'a@x.com', duration: 1200, join_time: '2026-12-01T18:02:00Z', leave_time: '2026-12-01T18:22:00Z' },
        { registrant_id: 'r1', user_email: 'a@x.com', duration: 1800, join_time: '2026-12-01T18:25:00Z', leave_time: '2026-12-01T18:55:00Z' },
        { user_email: 'B@X.com', duration: 600 },
        { name: 'guest without email', duration: 3000 }
    ]);
    assert.equal(rows.length, 2);
    const a = rows.find((r) => r.registrantId === 'r1');
    assert.equal(a.minutes, 50);
    assert.equal(a.joinedAt.toISOString(), '2026-12-01T18:02:00.000Z');
    assert.equal(a.leftAt.toISOString(), '2026-12-01T18:55:00.000Z');
    assert.equal(rows.find((r) => r.email === 'b@x.com').minutes, 10);
});

test('present when staying the set share of the lecture', () => {
    assert.equal(L.isPresent(45, 90, 50), true);
    assert.equal(L.isPresent(44, 90, 50), false);
    assert.equal(L.isPresent(1, 0, 50), true);
    assert.equal(L.attendanceRate(3, 4), 75);
    assert.equal(L.attendanceRate(0, 0), null);
});

test('meeting settings: registration gives personal links, recordings go to the cloud', () => {
    const p = L.meetingPayload({ topic: 'G1 - Intro', startsAt: '2026-12-01T18:00:00.000Z', durationMin: 90, timeZone: 'Africa/Cairo', registration: true });
    assert.equal(p.start_time, '2026-12-01T18:00:00Z');
    assert.equal(p.type, 2);
    assert.equal(p.settings.approval_type, 0);
    assert.equal(p.settings.auto_recording, 'cloud');
    assert.equal(L.meetingPayload({ startsAt: new Date(), durationMin: 30, registration: false }).settings.approval_type, 2);
});

test('names and links', () => {
    assert.deepEqual(L.splitName('محمد أحمد علي'), { first_name: 'محمد', last_name: 'أحمد علي' });
    assert.deepEqual(L.splitName('Sara'), { first_name: 'Sara', last_name: '-' });
    assert.equal(L.safeUrl('javascript:alert(1)'), '');
    assert.equal(L.safeUrl('https://us02web.zoom.us/j/123?pwd=abc'), 'https://us02web.zoom.us/j/123?pwd=abc');
});

test('the reminder email links to the portal and escapes text', () => {
    const html = reminderHtml({ group: 'G<1>', title: 'Intro "1"', at: { ar: 'الثلاثاء', en: 'Tuesday' } });
    assert.ok(html.includes('/portal/my-lectures'));
    assert.ok(html.includes('G&lt;1&gt;'));
    assert.ok(!html.includes('zoom.us'));
});

test('Zoom client: signs in once, reuses the token, and retries once on 401', async () => {
    const env = { ...process.env };
    Object.assign(process.env, { ZOOM_ACCOUNT_ID: 'acc', ZOOM_CLIENT_ID: 'cid', ZOOM_CLIENT_SECRET: 'sec', ZOOM_HOST_USER: 'host@x.com' });
    zoom.resetToken();
    const calls = [];
    let tokens = 0;
    let first401 = true;
    const fake = async (url, init) => {
        calls.push({ url, init });
        const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
        if (url.startsWith('https://zoom.us/oauth/token')) {
            tokens++;
            assert.equal(init.headers.Authorization, `Basic ${Buffer.from('cid:sec').toString('base64')}`);
            return json(200, { access_token: `t${tokens}`, expires_in: 3600 });
        }
        if (url.endsWith('/users/host%40x.com/meetings')) {
            if (first401) { first401 = false; return json(401, { message: 'expired' }); }
            assert.equal(init.headers.Authorization, 'Bearer t2');
            return json(201, { id: 99, join_url: 'https://zoom.us/j/99?pwd=x', password: 'p1' });
        }
        if (url.includes('/report/meetings/99/participants')) {
            return url.includes('next_page_token') ? json(200, { participants: [{ user_email: 'b@x.com' }] }) : json(200, { participants: [{ user_email: 'a@x.com' }], next_page_token: 'n2' });
        }
        return json(404, { message: 'no' });
    };
    try {
        assert.equal(zoom.isConfigured(), true);
        const m = await zoom.createMeeting({ topic: 't' }, fake);
        assert.equal(m.id, 99);
        assert.equal(tokens, 2, 'a 401 gets a fresh token once');
        const rows = await zoom.listParticipants('99', fake);
        assert.equal(rows.length, 2, 'all pages are read');
        assert.equal(tokens, 2, 'the token is reused');
        assert.equal(await zoom.getRecording('99', fake), null, 'no recording yet is not an error');
        await zoom.deleteMeeting('99', fake);   // 404: already gone
    } finally {
        process.env = env;
        zoom.resetToken();
    }
});

// ---- the learning path (PLAN-V2 decisions 3 to 5) ----

test('every lecture is open to members; entering counts once its time has come', () => {
    const l = { startsAt: '2026-12-01T18:00:00Z', durationMin: 90, status: 'scheduled' };
    assert.equal(L.customerCanJoin(l), true);
    assert.equal(L.customerCanJoin({ ...l, status: 'cancelled' }), false);
    assert.equal(L.entryCounts(l, new Date('2026-11-20T10:00:00Z')), false, 'days before: opens, not counted');
    assert.equal(L.entryCounts(l, new Date('2026-12-01T17:45:00Z')), true, 'from 15 minutes before');
    assert.equal(L.entryCounts(l, new Date('2027-01-10T10:00:00Z')), true, 'a missed lecture still counts later');
    assert.equal(L.entryCounts({ ...l, status: 'cancelled' }, new Date('2026-12-01T18:00:00Z')), false);
});

test('module progress comes from the lectures entered; a course has one module', () => {
    const modules = [{ module: 'm1', required: true, status: 'in_progress' }, { module: 'm2', required: true, status: 'not_started' }];
    const lectures = [
        { _id: 'a', module: 'm1', status: 'scheduled' }, { _id: 'b', module: 'm1', status: 'scheduled' },
        { _id: 'c', module: 'm2', status: 'scheduled' }, { _id: 'd', module: 'm2', status: 'cancelled' }
    ];
    const rows = L.lectureProgress(modules, lectures, new Set(['a', 'b', 'd']));
    assert.deepEqual(rows.m1, { total: 2, entered: 2, percent: 100, complete: true });
    assert.deepEqual(rows.m2, { total: 1, entered: 0, percent: 0, complete: false }, 'cancelled lectures do not count');
    assert.equal(L.programPercent(modules, rows), 50);
    assert.equal(L.programPercent([{ ...modules[0], status: 'approved' }, modules[1]], {}), 50, 'a completed module counts 100');

    const course = L.lectureProgress([{ module: 'only' }], [{ _id: 'x', module: null, status: 'scheduled' }, { _id: 'y', module: null, status: 'scheduled' }], new Set(['x']));
    assert.equal(course.only.total, 2, 'lectures without a module belong to the only module');
    assert.equal(course.only.percent, 50);
    assert.equal(L.lectureProgress([{ module: 'm1' }], [], new Set()).m1.complete, false, 'no lectures, not complete');
});

test('the next lecture is the first one that has not ended', () => {
    const now = new Date('2026-12-01T19:00:00Z');
    const ls = [
        { _id: 'past', startsAt: '2026-11-30T18:00:00Z', durationMin: 60, status: 'scheduled' },
        { _id: 'now', startsAt: '2026-12-01T18:30:00Z', durationMin: 90, status: 'scheduled' },
        { _id: 'off', startsAt: '2026-12-01T18:45:00Z', durationMin: 90, status: 'cancelled' },
        { _id: 'later', startsAt: '2026-12-03T18:00:00Z', durationMin: 90, status: 'scheduled' }
    ];
    assert.equal(L.nextLecture(ls, now)._id, 'now');
    assert.equal(L.nextLecture([ls[0]], now), null);
});
