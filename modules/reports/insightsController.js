// The owner's analytics: everything the system records, for a period the owner picks, next to
// the period of the same length just before it. Money stays per currency (never converted).
const mongoose = require('mongoose');
const Customer = require('../../models/Customer');
const Enrollment = require('../../models/Enrollment');
const Complaint = require('../../models/Complaint');
const Satisfaction = require('../../models/Satisfaction');
const Certificate = require('../../models/Certificate');
const Lecture = require('../../models/Lecture');
const LectureAttendance = require('../../models/LectureAttendance');
const Cohort = require('../../models/Cohort');
const Task = require('../../models/Task');
const Employee = require('../../models/Employee');
const Review = require('../../models/PerformanceReview');
const F = require('../../models/finance');
const C = require('../../models/commission');
const { PayrollRun } = require('../../models/payroll');
const PR = require('../../lib/payroll');
const rules = require('../../lib/attendance');
const M = require('../../lib/money');
const { HttpError } = require('../../lib/http');
const { _evaluate: evaluateAttendance } = require('../hr/attendanceController');
const { _unpaidRows: unpaidRows } = require('../finance/hubController');

const DAY = 864e5;
const ymd = (d) => d.toISOString().slice(0, 10);

// from / to are days (YYYY-MM-DD, Cairo); the previous period has the same number of days
function periodOf(q) {
    const okDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
    const today = new Date();
    const to = okDay(q.to) ? new Date(`${q.to}T23:59:59.999+02:00`) : today;
    const from = okDay(q.from) ? new Date(`${q.from}T00:00:00+02:00`) : new Date(to.getTime() - 29 * DAY);
    if (from > to) throw new HttpError(400, 'تاريخ البداية بعد النهاية. / The start is after the end.');
    if (to - from > 3 * 366 * DAY) throw new HttpError(400, 'أقصى فترة ٣ سنين. / The longest period is 3 years.');
    const span = to.getTime() - from.getTime() + 1;
    return { from, to, prevFrom: new Date(from.getTime() - span), prevTo: new Date(from.getTime() - 1), days: Math.round(span / DAY) };
}

const between = (field, a, b) => ({ [field]: { $gte: a, $lte: b } });
const perCurrency = async (model, match, field = '$amount') => (await model.aggregate([{ $match: match }, { $group: { _id: '$currency', v: { $sum: field }, n: { $sum: 1 } } }, { $sort: { v: -1 } }]))
    .map((r) => ({ currency: r._id, amount: M.round(r.v, 3), count: r.n }));
const groupCount = (model, match, by, limit = 12) => model.aggregate([{ $match: match }, { $group: { _id: by, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: limit }]).then((rows) => rows.map((r) => ({ key: r._id, n: r.n })));
const net = (a, b) => {
    const out = {};
    for (const x of a) out[x.currency] = (out[x.currency] || 0) + x.amount;
    for (const x of b) out[x.currency] = (out[x.currency] || 0) - x.amount;
    return Object.entries(out).map(([currency, amount]) => ({ currency, amount: M.round(amount, 3) }));
};

// ---- money ----
async function money(p, a, b) {
    const pay = (x, y) => ({ status: 'confirmed', ...between('paidAt', x, y) });
    const exp = (x, y) => ({ status: 'posted', ...between('date', x, y) });
    const [collected, collectedPrev, expenses, expensesPrev, refunds, byMethod, byAccount, byCategory, byProgram, trendRows, commissions] = await Promise.all([
        perCurrency(F.Payment, pay(a, b)),
        perCurrency(F.Payment, pay(p.prevFrom, p.prevTo)),
        perCurrency(F.Expense, exp(a, b)),
        perCurrency(F.Expense, exp(p.prevFrom, p.prevTo)),
        perCurrency(F.Refund, { status: 'paid', ...between('paidAt', a, b) }),
        F.Payment.aggregate([{ $match: pay(a, b) }, { $group: { _id: { k: '$method', c: '$currency' }, v: { $sum: '$amount' }, n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
        F.Payment.aggregate([{ $match: pay(a, b) }, { $group: { _id: '$account', v: { $sum: '$amount' }, c: { $first: '$currency' }, n: { $sum: 1 } } }, { $lookup: { from: 'financeaccounts', localField: '_id', foreignField: '_id', as: 'a' } }, { $sort: { n: -1 } }]),
        F.Expense.aggregate([{ $match: exp(a, b) }, { $group: { _id: { k: '$category', c: '$currency' }, v: { $sum: '$amount' } } }, { $sort: { v: -1 } }, { $limit: 15 }]),
        F.Payment.aggregate([{ $match: { ...pay(a, b), enrollment: { $ne: null } } }, { $lookup: { from: 'enrollments', localField: 'enrollment', foreignField: '_id', as: 'e' } }, { $group: { _id: { k: { $arrayElemAt: ['$e.programTitleAr', 0] }, c: '$currency' }, v: { $sum: '$amount' } } }, { $sort: { v: -1 } }, { $limit: 12 }]),
        F.Payment.aggregate([{ $match: pay(a, b) }, { $group: { _id: { d: { $dateToString: { format: p.days > 62 ? '%Y-%m' : '%Y-%m-%d', date: '$paidAt', timezone: 'Africa/Cairo' } }, c: '$currency' }, v: { $sum: '$amount' } } }, { $sort: { '_id.d': 1 } }]),
        perCurrency(C.CommissionLine, { status: { $ne: 'cancelled' }, ...between('date', a, b) })
    ]);
    // What customers owe today (not limited to the period)
    const rows = await unpaidRows({}, new Date());
    const owed = {};
    const overdue = {};
    for (const r of rows) {
        owed[r.currency] = M.round((owed[r.currency] || 0) + r.remaining, 3);
        if (r.late) overdue[r.currency] = M.round((overdue[r.currency] || 0) + r.remaining, 3);
    }
    const list = (o) => Object.entries(o).map(([currency, amount]) => ({ currency, amount }));
    const kv = (rowsIn) => rowsIn.map((r) => ({ key: r._id.k || '—', currency: r._id.c, amount: M.round(r.v, 3), n: r.n }));
    return {
        collected, collectedPrev, expenses, expensesPrev, refunds,
        net: net(collected, expenses), netPrev: net(collectedPrev, expensesPrev),
        byMethod: kv(byMethod), byCategory: kv(byCategory), byProgram: kv(byProgram),
        byAccount: byAccount.map((r) => ({ key: r.a[0] ? r.a[0].nameAr : '—', currency: r.c, amount: M.round(r.v, 3), n: r.n })),
        trend: trendRows.map((r) => ({ d: r._id.d, currency: r._id.c, amount: M.round(r.v, 3) })),
        trendUnit: p.days > 62 ? 'month' : 'day',
        commissions,
        owedNow: list(owed), overdueNow: list(overdue), lateCustomersNow: new Set(rows.filter((r) => r.late).map((r) => String(r.customerId))).size
    };
}

// ---- sales and customers ----
async function sales(p, a, b) {
    const reg = (x, y) => ({ status: { $ne: 'merged' }, ...between('registeredAt', x, y) });
    const [leads, leadsPrev, converted, convertedPrev, bySource, byCountry, lost, lostReasons, byOwner, collectedByOwner] = await Promise.all([
        Customer.countDocuments(reg(a, b)),
        Customer.countDocuments(reg(p.prevFrom, p.prevTo)),
        Customer.countDocuments({ ...reg(a, b), status: 'customer' }),
        Customer.countDocuments({ ...reg(p.prevFrom, p.prevTo), status: 'customer' }),
        Customer.aggregate([{ $match: reg(a, b) }, { $group: { _id: '$source', n: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ['$status', 'customer'] }, 1, 0] } } } }, { $sort: { n: -1 } }]),
        groupCount(Customer, { ...reg(a, b), country: { $nin: ['', null] } }, '$country', 8),
        Customer.countDocuments({ status: 'lost', ...between('updatedAt', a, b) }),
        groupCount(Customer, { status: 'lost', ...between('updatedAt', a, b), lostReason: { $nin: ['', null] } }, { $toLower: { $trim: { input: '$lostReason' } } }, 6),
        Customer.aggregate([{ $match: reg(a, b) }, { $group: { _id: '$owner', n: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ['$status', 'customer'] }, 1, 0] } } } }, { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } }, { $sort: { won: -1, n: -1 } }]),
        F.Payment.aggregate([{ $match: { status: 'confirmed', ...between('paidAt', a, b) } }, { $group: { _id: { u: '$collectedBy', c: '$currency' }, v: { $sum: '$amount' } } }])
    ]);
    const collected = {};
    for (const r of collectedByOwner) (collected[String(r._id.u)] = collected[String(r._id.u)] || []).push({ currency: r._id.c, amount: M.round(r.v, 3) });
    return {
        leads, leadsPrev, converted, convertedPrev,
        conversion: leads ? Math.round((converted / leads) * 1000) / 10 : 0,
        conversionPrev: leadsPrev ? Math.round((convertedPrev / leadsPrev) * 1000) / 10 : 0,
        bySource: bySource.map((r) => ({ key: r._id || '—', n: r.n, won: r.won })),
        byCountry, lost, lostReasons,
        byEmployee: byOwner.map((r) => ({ name: r.u[0] ? r.u[0].name : null, n: r.n, won: r.won, collected: collected[String(r._id)] || [] }))
    };
}

// ---- learning ----
async function learning(p, a, b) {
    const [enrolled, enrolledPrev, byProgram, completed, certs, certsPrev, paperDelivered, lectures, activeGroups] = await Promise.all([
        Enrollment.countDocuments(between('enrolledAt', a, b)),
        Enrollment.countDocuments(between('enrolledAt', p.prevFrom, p.prevTo)),
        groupCount(Enrollment, between('enrolledAt', a, b), '$programTitleAr', 10),
        Enrollment.countDocuments({ status: 'completed', ...between('updatedAt', a, b) }),
        groupCount(Certificate, { kind: { $in: ['module', 'program'] }, status: { $ne: 'Cancelled' }, ...between('issuedAt', a, b) }, '$kind'),
        Certificate.countDocuments({ kind: { $in: ['module', 'program'] }, status: { $ne: 'Cancelled' }, ...between('issuedAt', p.prevFrom, p.prevTo) }),
        Certificate.countDocuments(between('delivery.paper.deliveredAt', a, b)),
        Lecture.find({ status: 'scheduled', ...between('startsAt', a, b < new Date() ? b : new Date()) }).select('_id cohort').lean(),
        Cohort.countDocuments({ status: { $in: ['open', 'running'] } })
    ]);
    let attendanceRate = null;
    if (lectures.length) {
        const ids = lectures.map((l) => l._id);
        const [present, marked] = await Promise.all([LectureAttendance.countDocuments({ lecture: { $in: ids }, present: true }), LectureAttendance.countDocuments({ lecture: { $in: ids } })]);
        attendanceRate = marked ? Math.round((present / marked) * 100) : null;
    }
    return { enrolled, enrolledPrev, byProgram, completed, certificates: certs, certificatesTotal: certs.reduce((s, r) => s + r.n, 0), certificatesPrev: certsPrev, paperDelivered, lecturesHeld: lectures.length, lectureAttendanceRate: attendanceRate, activeGroups };
}

// ---- customer service ----
async function service(p, a, b) {
    const [opened, openedPrev, resolved, byCategory, openNow, satisfaction, resolveTimes] = await Promise.all([
        Complaint.countDocuments(between('createdAt', a, b)),
        Complaint.countDocuments(between('createdAt', p.prevFrom, p.prevTo)),
        Complaint.countDocuments(between('resolvedAt', a, b)),
        groupCount(Complaint, between('createdAt', a, b), '$category'),
        Complaint.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
        Satisfaction.aggregate([{ $match: between('updatedAt', a, b) }, { $group: { _id: null, avg: { $avg: '$score' }, n: { $sum: 1 } } }]),
        Complaint.aggregate([{ $match: { ...between('resolvedAt', a, b), resolvedAt: { $ne: null } } }, { $group: { _id: null, h: { $avg: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600e3] } } } }])
    ]);
    return {
        opened, openedPrev, resolved, byCategory, openNow,
        satisfaction: satisfaction[0] ? { avg: Math.round(satisfaction[0].avg * 10) / 10, n: satisfaction[0].n } : null,
        avgResolveHours: resolveTimes[0] ? Math.round(resolveTimes[0].h) : null
    };
}

// ---- staff: attendance, tasks, reviews, payroll ----
function monthsIn(a, b) {
    const out = [];
    const d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
    while (d <= b && out.length < 40) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
    return out;
}
async function staff(p, a, b) {
    const emps = await Employee.find({ status: 'active' }).select('user nameAr').lean();
    const users = emps.map((e) => e.user);
    const months = monthsIn(a, b);
    const fromDay = ymd(new Date(a.getTime() + 2 * 3600e3));
    const toDay = ymd(new Date(b.getTime() + 2 * 3600e3));
    // Attendance across the months the period touches, counting only its days
    const perUser = {};
    for (const m of months.slice(0, 13)) {
        const rows = await evaluateAttendance(users, m);
        for (const r of rows) {
            const days = r.days.filter((d) => d.date >= fromDay && d.date <= toDay);
            (perUser[r.user] = perUser[r.user] || { name: r.name, days: [] }).days.push(...days);
        }
    }
    const people = Object.entries(perUser).map(([u, v]) => ({ user: u, name: v.name, ...rules.summarize(v.days) }));
    const sum = people.reduce((s, x) => ({ workingDays: s.workingDays + x.workingDays, present: s.present + x.present, absent: s.absent + x.absent, leave: s.leave + x.leave, lateMinutes: s.lateMinutes + x.lateMinutes }), { workingDays: 0, present: 0, absent: 0, leave: 0, lateMinutes: 0 });
    const counted = sum.workingDays - sum.leave;
    const [tasksDone, tasksCreated, overdueNow, reviews, runs] = await Promise.all([
        Task.find({ status: 'done', ...between('completedAt', a, b) }).select('dueAt completedAt').lean(),
        Task.countDocuments(between('createdAt', a, b)),
        Task.countDocuments({ status: 'open', dueAt: { $lt: new Date() } }),
        Review.aggregate([{ $match: { month: { $in: months }, status: { $ne: 'draft' }, average: { $ne: null } } }, { $group: { _id: '$name', avg: { $avg: '$average' }, n: { $sum: 1 } } }, { $sort: { avg: -1 } }]),
        PayrollRun.find({ status: 'approved', month: { $in: months } }).select('month lines.currency lines.net lines.basic lines.commission lines.bonus lines.deduction lines.advanceDeduction').lean()
    ]);
    const onTime = tasksDone.filter((t) => !t.dueAt || t.completedAt <= t.dueAt).length;
    const payroll = {};
    for (const r of runs) for (const [c, t] of Object.entries(PR.totals(r.lines))) payroll[c] = M.round((payroll[c] || 0) + t.net, 3);
    const allScores = reviews.reduce((s, r) => s + r.avg * r.n, 0);
    const allN = reviews.reduce((s, r) => s + r.n, 0);
    return {
        headcount: emps.length,
        attendanceRate: counted > 0 ? Math.round((sum.present / counted) * 100) : null,
        absentDays: sum.absent, lateMinutes: sum.lateMinutes, leaveDays: sum.leave,
        people: people.sort((x, y) => y.absent - x.absent || y.lateMinutes - x.lateMinutes).slice(0, 15).map(({ user, name, present, absent, late, lateMinutes, leave, workingDays }) => ({ user, name, present, absent, late, lateMinutes, leave, workingDays })),
        tasksCreated, tasksDone: tasksDone.length, tasksOnTimeRate: tasksDone.length ? Math.round((onTime / tasksDone.length) * 100) : null, tasksOverdueNow: overdueNow,
        reviewAverage: allN ? Math.round((allScores / allN) * 10) / 10 : null,
        reviews: reviews.map((r) => ({ name: r._id, avg: Math.round(r.avg * 10) / 10, n: r.n })),
        payroll: Object.entries(payroll).map(([currency, amount]) => ({ currency, amount })),
        payrollMonths: runs.map((r) => r.month)
    };
}

exports.overview = async (req, res) => {
    const p = periodOf(req.query);
    const [m, s, l, sv, st] = await Promise.all([money(p, p.from, p.to), sales(p, p.from, p.to), learning(p, p.from, p.to), service(p, p.from, p.to), staff(p, p.from, p.to)]);
    res.json({ from: ymd(new Date(p.from.getTime() + 2 * 3600e3)), to: ymd(new Date(p.to.getTime() + 2 * 3600e3)), days: p.days, prevFrom: ymd(new Date(p.prevFrom.getTime() + 2 * 3600e3)), prevTo: ymd(new Date(p.prevTo.getTime() + 2 * 3600e3)), money: m, sales: s, learning: l, service: sv, staff: st, generatedAt: new Date() });
};

exports._periodOf = periodOf;
