const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/reviews');

test('scores are whole numbers from 1 to 5, only for the academy criteria', () => {
    const s = R.applyScores(R.DEFAULT_CRITERIA, { commitment: 5, quality: 3.6, teamwork: 9, initiative: 0, hacked: 5 });
    assert.equal(s.length, R.DEFAULT_CRITERIA.length);
    assert.equal(s.find((x) => x.key === 'commitment').score, 5);
    assert.equal(s.find((x) => x.key === 'quality').score, 4);
    assert.equal(s.find((x) => x.key === 'teamwork').score, undefined);
    assert.equal(s.find((x) => x.key === 'initiative').score, undefined);
    assert.equal(s.some((x) => x.key === 'hacked'), false);
});

test('the average counts only given scores', () => {
    assert.equal(R.averageOf([{ score: 5 }, { score: 4 }, { score: undefined }]), 4.5);
    assert.equal(R.averageOf([]), null);
});

test('rating words', () => {
    assert.equal(R.ratingOf(4.6).key, 'excellent');
    assert.equal(R.ratingOf(3.5).key, 'very_good');
    assert.equal(R.ratingOf(2.9).key, 'good');
    assert.equal(R.ratingOf(1.5).key, 'needs_work');
    assert.equal(R.ratingOf(1).key, 'weak');
    assert.equal(R.ratingOf(null), null);
});

test('attendance rate leaves out leave days', () => {
    assert.equal(R.attendanceRate({ workingDays: 22, present: 18, leave: 2 }), 90);
    assert.equal(R.attendanceRate({ workingDays: 0 }), null);
});

test('criteria the owner edits are cleaned', () => {
    const c = R.cleanCriteria([{ ar: 'الالتزام', key: 'Commit ment!' }, { ar: '' }, { ar: 'الالتزام 2', key: 'commitment' }]);
    assert.deepEqual(c.map((x) => x.key), ['commitment', 'commitment_']);
    assert.equal(R.cleanCriteria([]), null);
    assert.equal(R.cleanCriteria('x'), null);
});
