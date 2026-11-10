const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/moduleWorkflow');

const worker = { roles: { worker: true, teamLeader: false, admin: false }, needsTeamLeader: true };
const leader = { roles: { worker: false, teamLeader: true, admin: false }, needsTeamLeader: true };
const admin = { roles: { worker: false, teamLeader: false, admin: true }, needsTeamLeader: true };
const adminNoTl = { ...admin, needsTeamLeader: false };
const nobody = { roles: { worker: false, teamLeader: false, admin: false }, needsTeamLeader: false };
const mod = (status, extra = {}) => ({ status, teamLeaderReview: null, ...extra });
const tlApproved = { teamLeaderReview: { decision: 'approved' } };

test('the employee moves work along and submits it', () => {
    assert.deepEqual(W.check('start', mod('not_started'), worker), { ok: true, to: 'in_progress' });
    assert.deepEqual(W.check('submit', mod('in_progress'), worker), { ok: true, to: 'ready_for_review' });
    assert.deepEqual(W.check('rework', mod('rejected'), worker), { ok: true, to: 'in_progress' });
    assert.equal(W.check('submit', mod('not_started'), worker).reason, 'wrong_status');
    assert.equal(W.check('approve', mod('ready_for_review', tlApproved), worker).reason, 'not_allowed');
    assert.equal(W.check('start', mod('not_started'), nobody).reason, 'not_allowed');
});

test('the team leader reviews before the admin when the team has a leader', () => {
    assert.equal(W.check('approve', mod('ready_for_review'), admin).reason, 'needs_team_leader_review');
    assert.deepEqual(W.check('team_leader_approve', mod('ready_for_review'), leader), { ok: true, to: 'ready_for_review' });
    assert.equal(W.check('team_leader_approve', mod('ready_for_review', tlApproved), leader).reason, 'already_reviewed');
    assert.deepEqual(W.check('team_leader_reject', mod('ready_for_review'), leader), { ok: true, to: 'rejected' });
    assert.equal(W.check('approve', mod('ready_for_review', tlApproved), leader).reason, 'not_allowed');
    assert.deepEqual(W.check('approve', mod('ready_for_review', tlApproved), admin), { ok: true, to: 'approved' });
    assert.deepEqual(W.check('approve', mod('ready_for_review'), adminNoTl), { ok: true, to: 'approved' });
    assert.deepEqual(W.check('reject', mod('ready_for_review'), admin), { ok: true, to: 'rejected' });
});

test('only the admin reopens, and nobody sets certificate_issued by hand', () => {
    assert.deepEqual(W.check('reopen', mod('approved'), admin), { ok: true, to: 'in_progress' });
    assert.equal(W.check('reopen', mod('approved'), worker).reason, 'not_allowed');
    assert.equal(W.check('reopen', mod('certificate_issued'), admin).reason, 'wrong_status');
    assert.equal(W.check('certificate_issued', mod('approved'), admin).reason, 'not_allowed');
    assert.equal(W.check('nonsense', mod('approved'), admin).reason, 'unknown_action');
});

test('available actions per role', () => {
    assert.deepEqual(W.availableActions(mod('in_progress'), worker), ['submit']);
    assert.deepEqual(W.availableActions(mod('ready_for_review'), leader), ['team_leader_approve', 'team_leader_reject']);
    assert.deepEqual(W.availableActions(mod('ready_for_review', tlApproved), admin).sort(), ['approve', 'reject', 'reopen'].sort());
    assert.deepEqual(W.availableActions(mod('approved'), worker), []);
});

test('completion follows the program rule', () => {
    const mods = [
        { required: true, status: 'approved' },
        { required: true, status: 'certificate_issued' },
        { required: true, status: 'in_progress' },
        { required: false, status: 'not_started' }
    ];
    assert.deepEqual(W.completion(mods, 0), { done: 2, target: 3, total: 4, approvedAll: 2, complete: false, percent: 67 });
    assert.equal(W.completion(mods, 2).complete, true);
    assert.equal(W.completion(mods, 2).percent, 100);
    assert.equal(W.completion(mods, 10).target, 3);
    assert.equal(W.completion([], 0).complete, false);
    assert.equal(W.completion([{ required: false, status: 'approved' }], 0).complete, false);
});
