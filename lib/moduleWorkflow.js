// The life of a module inside an enrollment. Pure rules, so they can be unit tested.
//
//   not_started → in_progress → ready_for_review → approved → certificate_issued
//                      ↑               │
//                      └── rejected ←──┘
//
// The employee responsible for the enrollment moves work along and submits it for review.
// When the enrollment's team has a leader, the leader reviews first; the admin gives the final approval.

const ACTIONS = {
    start: { from: ['not_started'], to: 'in_progress', who: 'worker' },
    submit: { from: ['in_progress'], to: 'ready_for_review', who: 'worker' },
    rework: { from: ['rejected'], to: 'in_progress', who: 'worker' },
    team_leader_approve: { from: ['ready_for_review'], to: 'ready_for_review', who: 'team_leader' },
    team_leader_reject: { from: ['ready_for_review'], to: 'rejected', who: 'team_leader' },
    approve: { from: ['ready_for_review'], to: 'approved', who: 'admin' },
    reject: { from: ['ready_for_review'], to: 'rejected', who: 'admin' },
    reopen: { from: ['approved', 'rejected', 'ready_for_review'], to: 'in_progress', who: 'admin' },
    // Set by the certificates module (phase 5) when the module certificate is issued
    certificate_issued: { from: ['approved'], to: 'certificate_issued', who: 'system' }
};

// roles: { worker, teamLeader, admin } — what the user may do on this enrollment
// needsTeamLeader: the enrollment's team has a leader and the policy requires their review
function check(action, mod, { roles, needsTeamLeader }) {
    const rule = ACTIONS[action];
    if (!rule) return { ok: false, reason: 'unknown_action' };
    if (!rule.from.includes(mod.status)) return { ok: false, reason: 'wrong_status' };
    if (rule.who === 'system') return { ok: false, reason: 'not_allowed' };
    if (rule.who === 'worker' && !(roles.worker || roles.admin)) return { ok: false, reason: 'not_allowed' };
    if (rule.who === 'team_leader') {
        if (!(roles.teamLeader || roles.admin)) return { ok: false, reason: 'not_allowed' };
        if (mod.teamLeaderReview && mod.teamLeaderReview.decision === 'approved') return { ok: false, reason: 'already_reviewed' };
    }
    if (rule.who === 'admin') {
        if (!roles.admin) return { ok: false, reason: 'not_allowed' };
        if (action === 'approve' && needsTeamLeader && !(mod.teamLeaderReview && mod.teamLeaderReview.decision === 'approved')) {
            return { ok: false, reason: 'needs_team_leader_review' };
        }
    }
    return { ok: true, to: rule.to };
}

// Which actions this user can take on this module right now, for the buttons in the portal
function availableActions(mod, ctx) {
    return Object.keys(ACTIONS).filter((a) => check(a, mod, ctx).ok);
}

const DONE = ['approved', 'certificate_issued'];

// Whether the enrollment meets the program's rule for the final certificate
function completion(modules, modulesRequired = 0) {
    const required = modules.filter((m) => m.required);
    const done = required.filter((m) => DONE.includes(m.status)).length;
    const target = modulesRequired > 0 ? Math.min(modulesRequired, required.length) : required.length;
    return {
        done,
        target,
        total: modules.length,
        approvedAll: modules.filter((m) => DONE.includes(m.status)).length,
        complete: target > 0 && done >= target,
        percent: target ? Math.round((Math.min(done, target) / target) * 100) : 0
    };
}

module.exports = { ACTIONS, check, availableActions, completion, DONE };
