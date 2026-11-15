// Certificates by group: when a group's certificates are due, who is held back and why,
// and where each paper certificate is on its way. Pure, so it can be unit tested.

const RULE_MODES = ['manual', 'on_approval', 'on_date', 'after_end'];
const ISSUE_WHAT = ['modules', 'program', 'both'];
const PAYMENT_RULES = ['customer', 'enrollment', 'off'];

// Paper certificates: printed → ready for pickup or shipped → delivered
const PAPER_STEPS = ['printed', 'ready', 'shipped', 'delivered'];
const PAPER_FROM = {
    printed: ['none'],
    ready: ['printed'],
    shipped: ['printed', 'ready'],
    delivered: ['printed', 'ready', 'shipped']
};

function normalizeRule(input = {}, before = {}) {
    const pick = (k, d) => (input[k] !== undefined ? input[k] : before[k] !== undefined ? before[k] : d);
    const mode = RULE_MODES.includes(pick('mode', 'manual')) ? pick('mode', 'manual') : 'manual';
    const issue = ISSUE_WHAT.includes(pick('issue', 'both')) ? pick('issue', 'both') : 'both';
    const date = pick('date', null) ? new Date(pick('date', null)) : null;
    return {
        mode,
        issue,
        date: date && !Number.isNaN(date.getTime()) ? date : null,
        daysAfterEnd: Math.min(Math.max(parseInt(pick('daysAfterEnd', 0), 10) || 0, 0), 365),
        minAttendance: Math.min(Math.max(parseInt(pick('minAttendance', 0), 10) || 0, 0), 100),
        sendEmail: pick('sendEmail', true) !== false,
        template: pick('template', null) || null
    };
}

// Whether the group's rule says its certificates should be issued now (by the daily job)
function ruleDue(rule, cohort, now = new Date()) {
    if (!rule || rule.mode === 'manual') return false;
    if (rule.mode === 'on_approval') return true;
    if (rule.mode === 'on_date') return !!rule.date && now >= new Date(rule.date);
    if (rule.mode === 'after_end') {
        if (!cohort.endDate) return false;
        return now.getTime() >= new Date(cohort.endDate).getTime() + (rule.daysAfterEnd || 0) * 864e5;
    }
    return false;
}

// What a customer still owes, per currency, from charges and what was paid toward them
function outstanding(charges, totals, decimalsOf = () => 2) {
    const byCurrency = {};
    for (const c of charges) {
        if (c.status !== 'active') continue;
        const t = totals[String(c._id)] || { applied: 0, refunded: 0 };
        const dec = decimalsOf(c.currency);
        const f = 10 ** dec;
        const remaining = Math.round((c.netAmount - (t.applied - t.refunded)) * f) / f;
        if (remaining > 0) byCurrency[c.currency] = Math.round(((byCurrency[c.currency] || 0) + remaining) * f) / f;
    }
    const list = Object.entries(byCurrency).map(([currency, remaining]) => ({ currency, remaining }));
    return { clear: list.length === 0, byCurrency: list };
}

// Why a certificate is not issued yet; null when it can be issued
function holdReason({ approved, paid, rate, minAttendance = 0, issued }) {
    if (issued) return 'issued';
    if (!approved) return 'not_approved';
    if (minAttendance > 0 && (rate === null || rate === undefined || rate < minAttendance)) return 'low_attendance';
    if (!paid) return 'unpaid';
    return null;
}

function canMovePaper(from, step) {
    return !!PAPER_FROM[step] && PAPER_FROM[step].includes(from || 'none');
}

// Modules that can be approved for the whole group at once (not yet approved)
const GROUP_APPROVABLE = ['not_started', 'in_progress', 'ready_for_review', 'rejected'];

const money = (list) => list.map((x) => `${x.remaining} ${x.currency}`).join(' + ');

module.exports = {
    RULE_MODES, ISSUE_WHAT, PAYMENT_RULES, PAPER_STEPS, GROUP_APPROVABLE,
    normalizeRule, ruleDue, outstanding, holdReason, canMovePaper, money
};
