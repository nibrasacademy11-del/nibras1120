// Payroll arithmetic, kept pure so it can be tested without a database.
//   net = basic + commission (same currency) + bonus - advance installment - deduction
// Commissions earned in another currency are listed on the line, not added to the net.
// Absence and lateness are shown next to each line; the deduction is typed by hand.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (v) => Math.max(0, round2(v));

function netOf(line) {
    return round2((line.basic || 0) + (line.commission || 0) + (line.bonus || 0) - (line.advanceDeduction || 0) - (line.deduction || 0));
}

// What an advance takes in a month: its monthly share, never more than what is left, nothing
// before its first month, and nothing twice for the same month
function installmentFor(advance, month) {
    if (!advance || advance.status !== 'active' || !/^\d{4}-\d{2}$/.test(month)) return 0;
    if (month < advance.startMonth) return 0;
    if ((advance.repayments || []).some((r) => r.month === month)) return 0;
    const left = round2(advance.amount - (advance.repaid || 0));
    if (left <= 0) return 0;
    const share = round2(advance.amount / advance.installments);
    return round2(Math.min(share, left));
}

// Commission lines of a month, grouped by currency (approved and paid count; due and cancelled don't)
function commissionsByCurrency(lines) {
    const out = {};
    for (const l of lines || []) {
        if (!['approved', 'paid'].includes(l.status)) continue;
        out[l.currency] = round2((out[l.currency] || 0) + l.amount);
    }
    return out;
}

// One sheet line from the employee's file, their commissions, advances and attendance summary.
// keep: the hand-typed parts of an earlier version of the line (bonus, deduction and notes)
function buildLine({ employee, salary, commissions = {}, advances = [], attendance = {}, month, keep = {} }) {
    const currency = (salary && salary.currency) || 'EGP';
    const advancesTaken = advances
        .filter((a) => a.currency === currency)
        .map((a) => ({ advance: a._id, amount: installmentFor(a, month) }))
        .filter((a) => a.amount > 0);
    const line = {
        user: employee.user,
        employeeNo: employee.employeeNo,
        name: employee.nameAr,
        jobTitle: employee.jobTitle || '',
        team: employee.team?._id || employee.team || null,
        teamName: employee.team?.nameAr || '',
        currency,
        basic: money(salary && salary.basic),
        commission: round2(commissions[currency] || 0),
        otherCommissions: Object.entries(commissions).filter(([c, v]) => c !== currency && v).map(([c, v]) => ({ currency: c, amount: round2(v) })),
        bonus: money(keep.bonus),
        bonusNote: keep.bonusNote || '',
        advanceDeduction: round2(advancesTaken.reduce((s, a) => s + a.amount, 0)),
        advances: advancesTaken,
        deduction: money(keep.deduction),
        deductionNote: keep.deductionNote || '',
        attendance: {
            workingDays: attendance.workingDays || 0,
            present: attendance.present || 0,
            absent: attendance.absent || 0,
            late: attendance.late || 0,
            leave: attendance.leave || 0,
            lateMinutes: attendance.lateMinutes || 0,
            earlyLeaveMinutes: attendance.earlyLeaveMinutes || 0
        }
    };
    line.net = netOf(line);
    return line;
}

// Sheet totals per currency
function totals(lines) {
    const out = {};
    for (const l of lines || []) {
        const t = out[l.currency] || (out[l.currency] = { basic: 0, commission: 0, bonus: 0, advanceDeduction: 0, deduction: 0, net: 0, people: 0 });
        for (const k of ['basic', 'commission', 'bonus', 'advanceDeduction', 'deduction', 'net']) t[k] = round2(t[k] + (l[k] || 0));
        t.people += 1;
    }
    return out;
}

module.exports = { netOf, installmentFor, commissionsByCurrency, buildLine, totals, round2, money };
