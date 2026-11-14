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
const workflow = require('../../lib/moduleWorkflow');
const { HttpError } = require('../../lib/http');
const { _evaluate: evaluateAttendance } = require('../hr/attendanceController');
const { _unpaidRows: unpaidRows } = require('../finance/hubController');

const DAY = 864e5;
// Day or month buckets, in Cairo time
const bucket = (p, field) => ({ $dateToString: { format: p.days > 62 ? '%Y-%m' : '%Y-%m-%d', date: '$' + field, timezone: 'Africa/Cairo' } });
const series = (rows) => rows.map((r) => ({ d: r._id, v: r.n }));
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
const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);

// The owner narrows everything to one program and/or one employee. Expenses, payroll and the
// academy's attendance stay academy-wide (they belong to no program).
async function filtersOf(q) {
    const program = oid(q.program);
    const employee = oid(q.employee);
    const f = { program, employee, enrollmentIds: null, customerIds: null };
    if (program) {
        f.enrollmentIds = await Enrollment.distinct('_id', { program });
        f.customerIds = await Enrollment.distinct('customer', { program });
    }
    // match helpers per collection
    f.payment = { ...(employee ? { collectedBy: employee } : {}), ...(program ? { enrollment: { $in: f.enrollmentIds } } : {}) };
    f.customer = { ...(employee ? { owner: employee } : {}), ...(program ? { _id: { $in: f.customerIds } } : {}) };
    f.enrollment = { ...(employee ? { owner: employee } : {}), ...(program ? { program } : {}) };
    f.certificate = { ...(employee ? { owner: employee } : {}), ...(program ? { program } : {}) };
    f.lecture = program ? { program } : {};
    f.complaint = { ...(employee ? { assignee: employee } : {}), ...(program ? { customer: { $in: f.customerIds } } : {}) };
    f.charge = { ...(employee ? { owner: employee } : {}), ...(program ? { customer: { $in: f.customerIds } } : {}) };
    f.task = employee ? { assignee: employee } : {};
    f.active = !!(program || employee);
    return f;
}

// What the filter lists offer
async function filterOptions() {
    const Course = require('../../models/Course');
    const [programs, employees] = await Promise.all([
        Course.find({}).select('titleAr titleEn').sort({ titleAr: 1 }).limit(300).lean(),
        Employee.find({ status: 'active' }).select('user nameAr').sort({ nameAr: 1 }).lean()
    ]);
    return { programs: programs.map((p) => ({ id: p._id, nameAr: p.titleAr, nameEn: p.titleEn })), employees: employees.map((e) => ({ id: e.user, nameAr: e.nameAr })) };
}
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
async function money(p, a, b, f) {
    const pay = (x, y) => ({ status: 'confirmed', ...between('paidAt', x, y), ...f.payment });
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
    const [expenseTrend, pending, topCustomers] = await Promise.all([
        F.Expense.aggregate([{ $match: exp(a, b) }, { $group: { _id: { d: bucket(p, 'date'), c: '$currency' }, v: { $sum: '$amount' } } }, { $sort: { '_id.d': 1 } }]),
        perCurrency(F.Payment, { status: 'pending', ...f.payment }),
        F.Payment.aggregate([{ $match: pay(a, b) }, { $group: { _id: { k: '$customer', c: '$currency' }, v: { $sum: '$amount' }, n: { $sum: 1 } } }, { $sort: { v: -1 } }, { $limit: 6 }, { $lookup: { from: 'customers', localField: '_id.k', foreignField: '_id', as: 'x' } }])
    ]);
    // What customers owe today (not limited to the period)
    const rows = await unpaidRows(f.charge, new Date());
    const owed = {};
    const overdue = {};
    const soon = {};
    const in30 = Date.now() + 30 * DAY;
    for (const r of rows) {
        owed[r.currency] = M.round((owed[r.currency] || 0) + r.remaining, 3);
        if (r.late) overdue[r.currency] = M.round((overdue[r.currency] || 0) + r.remaining, 3);
        else if (r.dueDate && new Date(r.dueDate).getTime() <= in30) soon[r.currency] = M.round((soon[r.currency] || 0) + r.remaining, 3);
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
        expenseTrend: expenseTrend.map((r) => ({ d: r._id.d, currency: r._id.c, amount: M.round(r.v, 3) })),
        pending, dueNext30: list(soon),
        topCustomers: topCustomers.map((r) => ({ name: r.x[0] ? r.x[0].nameAr : '—', customerNo: r.x[0] ? r.x[0].customerNo : '', id: r._id.k, currency: r._id.c, amount: M.round(r.v, 3), n: r.n })),
        owedNow: list(owed), overdueNow: list(overdue), lateCustomersNow: new Set(rows.filter((r) => r.late).map((r) => String(r.customerId))).size
    };
}

// ---- sales and customers ----
async function sales(p, a, b, f) {
    const reg = (x, y) => ({ status: { $ne: 'merged' }, ...between('registeredAt', x, y), ...f.customer });
    const [leads, leadsPrev, converted, convertedPrev, bySource, byCountry, lost, lostReasons, byOwner, collectedByOwner] = await Promise.all([
        Customer.countDocuments(reg(a, b)),
        Customer.countDocuments(reg(p.prevFrom, p.prevTo)),
        Customer.countDocuments({ ...reg(a, b), status: 'customer' }),
        Customer.countDocuments({ ...reg(p.prevFrom, p.prevTo), status: 'customer' }),
        Customer.aggregate([{ $match: reg(a, b) }, { $group: { _id: '$source', n: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ['$status', 'customer'] }, 1, 0] } } } }, { $sort: { n: -1 } }]),
        groupCount(Customer, { ...reg(a, b), country: { $nin: ['', null] } }, '$country', 8),
        Customer.countDocuments({ status: 'lost', ...between('updatedAt', a, b), ...f.customer }),
        groupCount(Customer, { status: 'lost', ...between('updatedAt', a, b), lostReason: { $nin: ['', null] }, ...f.customer }, { $toLower: { $trim: { input: '$lostReason' } } }, 6),
        Customer.aggregate([{ $match: reg(a, b) }, { $group: { _id: '$owner', n: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ['$status', 'customer'] }, 1, 0] } } } }, { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } }, { $sort: { won: -1, n: -1 } }]),
        F.Payment.aggregate([{ $match: { status: 'confirmed', ...between('paidAt', a, b), ...f.payment } }, { $group: { _id: { u: '$collectedBy', c: '$currency' }, v: { $sum: '$amount' } } }])
    ]);
    const [funnel, leadTrend, allNow] = await Promise.all([
        groupCount(Customer, reg(a, b), '$status'),
        Customer.aggregate([{ $match: reg(a, b) }, { $group: { _id: bucket(p, 'registeredAt'), n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
        groupCount(Customer, { status: { $ne: 'merged' }, archived: { $ne: true }, ...f.customer }, '$status')
    ]);
    const collected = {};
    for (const r of collectedByOwner) (collected[String(r._id.u)] = collected[String(r._id.u)] || []).push({ currency: r._id.c, amount: M.round(r.v, 3) });
    return {
        leads, leadsPrev, converted, convertedPrev,
        conversion: leads ? Math.round((converted / leads) * 1000) / 10 : 0,
        conversionPrev: leadsPrev ? Math.round((convertedPrev / leadsPrev) * 1000) / 10 : 0,
        bySource: bySource.map((r) => ({ key: r._id || '—', n: r.n, won: r.won })),
        byCountry, lost, lostReasons,
        funnel: Object.fromEntries(funnel.map((r) => [r.key, r.n])), statusNow: Object.fromEntries(allNow.map((r) => [r.key, r.n])),
        trend: series(leadTrend),
        byEmployee: byOwner.map((r) => ({ name: r.u[0] ? r.u[0].name : null, n: r.n, won: r.won, collected: collected[String(r._id)] || [] }))
    };
}

// ---- learning ----
async function learning(p, a, b, f) {
    const [enrolled, enrolledPrev, byProgram, completed, certs, certsPrev, paperDelivered, lectures, activeGroups] = await Promise.all([
        Enrollment.countDocuments({ ...between('enrolledAt', a, b), ...f.enrollment }),
        Enrollment.countDocuments({ ...between('enrolledAt', p.prevFrom, p.prevTo), ...f.enrollment }),
        groupCount(Enrollment, { ...between('enrolledAt', a, b), ...f.enrollment }, '$programTitleAr', 10),
        Enrollment.countDocuments({ status: 'completed', ...between('updatedAt', a, b), ...f.enrollment }),
        groupCount(Certificate, { kind: { $in: ['module', 'program'] }, status: { $ne: 'Cancelled' }, ...between('issuedAt', a, b), ...f.certificate }, '$kind'),
        Certificate.countDocuments({ kind: { $in: ['module', 'program'] }, status: { $ne: 'Cancelled' }, ...between('issuedAt', p.prevFrom, p.prevTo), ...f.certificate }),
        Certificate.countDocuments({ ...between('delivery.paper.deliveredAt', a, b), ...f.certificate }),
        Lecture.find({ status: 'scheduled', ...between('startsAt', a, b < new Date() ? b : new Date()), ...f.lecture }).select('_id cohort').lean(),
        Cohort.countDocuments({ status: { $in: ['open', 'running'] }, ...(f.program ? { program: f.program } : {}) })
    ]);
    const [enrollTrend, paper, open] = await Promise.all([
        Enrollment.aggregate([{ $match: { ...between('enrolledAt', a, b), ...f.enrollment } }, { $group: { _id: bucket(p, 'enrolledAt'), n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
        groupCount(Certificate, { kind: { $in: ['module', 'program'] }, status: 'Valid', ...f.certificate }, '$delivery.paper.status'),
        // how far the learners of each program are now (PLAN-V2 §4: progress by itself)
        Enrollment.find({ status: { $in: ['active', 'on_hold'] }, ...f.enrollment }).select('programTitleAr modules.status modules.required modulesRequired').limit(5000).lean()
    ]);
    const prog = {};
    for (const e of open) {
        const c = workflow.completion(e.modules || [], e.modulesRequired);
        const k = e.programTitleAr || '—';
        (prog[k] = prog[k] || { key: k, sum: 0, n: 0 }).sum += c.percent;
        prog[k].n += 1;
    }
    const programProgress = Object.values(prog).map((r) => ({ key: r.key, avg: Math.round(r.sum / r.n), n: r.n })).sort((x, y) => y.n - x.n).slice(0, 10);
    let byGroup = [];
    let attendanceRate = null;
    if (lectures.length) {
        const att = await LectureAttendance.aggregate([{ $match: { lecture: { $in: lectures.map((l) => l._id) } } }, { $lookup: { from: 'lectures', localField: 'lecture', foreignField: '_id', as: 'l' } }, { $group: { _id: { $arrayElemAt: ['$l.cohort', 0] }, present: { $sum: { $cond: ['$present', 1, 0] } }, n: { $sum: 1 } } }, { $lookup: { from: 'cohorts', localField: '_id', foreignField: '_id', as: 'c' } }]);
        byGroup = att.map((r) => ({ key: r.c[0] ? r.c[0].nameAr : '—', rate: r.n ? Math.round((r.present / r.n) * 100) : 0, n: r.n })).sort((x, y) => y.rate - x.rate);
        const ids = lectures.map((l) => l._id);
        const [present, marked] = await Promise.all([LectureAttendance.countDocuments({ lecture: { $in: ids }, present: true }), LectureAttendance.countDocuments({ lecture: { $in: ids } })]);
        attendanceRate = marked ? Math.round((present / marked) * 100) : null;
    }
    return { programProgress, trend: series(enrollTrend), byGroup, paper: Object.fromEntries(paper.map((r) => [r.key || 'none', r.n])), enrolled, enrolledPrev, byProgram, completed, certificates: certs, certificatesTotal: certs.reduce((s, r) => s + r.n, 0), certificatesPrev: certsPrev, paperDelivered, lecturesHeld: lectures.length, lectureAttendanceRate: attendanceRate, activeGroups };
}

// ---- customer service ----
async function service(p, a, b, f) {
    const [opened, openedPrev, resolved, byCategory, openNow, byStatus, satisfaction, resolveTimes] = await Promise.all([
        Complaint.countDocuments({ ...between('createdAt', a, b), ...f.complaint }),
        Complaint.countDocuments({ ...between('createdAt', p.prevFrom, p.prevTo), ...f.complaint }),
        Complaint.countDocuments({ ...between('resolvedAt', a, b), ...f.complaint }),
        groupCount(Complaint, { ...between('createdAt', a, b), ...f.complaint }, '$category'),
        Complaint.countDocuments({ status: { $in: ['open', 'in_progress'] }, ...f.complaint }),
        groupCount(Complaint, f.complaint, '$status'),
        Satisfaction.aggregate([{ $match: between('updatedAt', a, b) }, { $group: { _id: null, avg: { $avg: '$score' }, n: { $sum: 1 } } }]),
        Complaint.aggregate([{ $match: { ...between('resolvedAt', a, b), resolvedAt: { $ne: null }, ...f.complaint } }, { $group: { _id: null, h: { $avg: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600e3] } } } }])
    ]);
    return {
        opened, openedPrev, resolved, byCategory, openNow, byStatus: Object.fromEntries(byStatus.map((r) => [r.key, r.n])),
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
async function staff(p, a, b, f) {
    const emps = await Employee.find({ status: 'active', ...(f.employee ? { user: f.employee } : {}) }).select('user nameAr').lean();
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
    // each working day of the period: how many came, for the coloured calendar
    const byDay = {};
    for (const v of Object.values(perUser)) {
        for (const d of v.days) {
            if (!['present', 'late', 'absent', 'leave'].includes(d.status)) continue;
            const x = (byDay[d.date] = byDay[d.date] || { date: d.date, present: 0, late: 0, absent: 0, leave: 0 });
            x[d.status] += 1;
        }
    }
    const calendar = Object.values(byDay).sort((x, y) => (x.date < y.date ? -1 : 1)).slice(-400).map((d) => {
        const counted = d.present + d.late + d.absent;
        return { ...d, rate: counted ? Math.round(((d.present + d.late) / counted) * 100) : null };
    });
    const sum = people.reduce((s, x) => ({ workingDays: s.workingDays + x.workingDays, present: s.present + x.present, absent: s.absent + x.absent, leave: s.leave + x.leave, lateMinutes: s.lateMinutes + x.lateMinutes }), { workingDays: 0, present: 0, absent: 0, leave: 0, lateMinutes: 0 });
    const counted = sum.workingDays - sum.leave;
    const [tasksDone, tasksCreated, overdueNow, reviews, runs] = await Promise.all([
        Task.find({ status: 'done', ...between('completedAt', a, b), ...f.task }).select('dueAt completedAt').lean(),
        Task.countDocuments({ ...between('createdAt', a, b), ...f.task }),
        Task.countDocuments({ status: 'open', dueAt: { $lt: new Date() }, ...f.task }),
        Review.aggregate([{ $match: { month: { $in: months }, status: { $ne: 'draft' }, average: { $ne: null }, ...(f.employee ? { user: f.employee } : {}) } }, { $group: { _id: '$name', avg: { $avg: '$average' }, n: { $sum: 1 } } }, { $sort: { avg: -1 } }]),
        PayrollRun.find({ status: 'approved', month: { $in: months } }).select('month lines.currency lines.net lines.basic lines.commission lines.bonus lines.deduction lines.advanceDeduction').lean()
    ]);
    const onTime = tasksDone.filter((t) => !t.dueAt || t.completedAt <= t.dueAt).length;
    const payroll = {};
    for (const r of runs) for (const [c, t] of Object.entries(PR.totals(r.lines))) payroll[c] = M.round((payroll[c] || 0) + t.net, 3);
    const allScores = reviews.reduce((s, r) => s + r.avg * r.n, 0);
    const allN = reviews.reduce((s, r) => s + r.n, 0);
    return {
        headcount: emps.length,
        calendar,
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

// What waits for the owner right now (not limited to the period)
async function attention() {
    const now = new Date();
    const A = require('../../models/attendance');
    const [payments, approvals, refunds, tasksOverdue, complaintsOpen, leaves, reviewsDraft] = await Promise.all([
        F.Payment.countDocuments({ status: 'pending' }),
        F.Approval.countDocuments({ status: 'pending' }),
        F.Refund.countDocuments({ status: 'pending' }),
        Task.countDocuments({ status: 'open', dueAt: { $lt: now } }),
        Complaint.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
        A.LeaveRequest.countDocuments({ status: 'pending' }),
        Review.countDocuments({ status: 'draft' })
    ]);
    return { payments, approvals, refunds, tasksOverdue, complaintsOpen, leaves, reviewsDraft };
}

exports.overview = async (req, res) => {
    const p = periodOf(req.query);
    const f = await filtersOf(req.query);
    const [m, s, l, sv, st, att, options] = await Promise.all([money(p, p.from, p.to, f), sales(p, p.from, p.to, f), learning(p, p.from, p.to, f), service(p, p.from, p.to, f), staff(p, p.from, p.to, f), attention(), filterOptions()]);
    res.json({ from: ymd(new Date(p.from.getTime() + 2 * 3600e3)), to: ymd(new Date(p.to.getTime() + 2 * 3600e3)), days: p.days, prevFrom: ymd(new Date(p.prevFrom.getTime() + 2 * 3600e3)), prevTo: ymd(new Date(p.prevTo.getTime() + 2 * 3600e3)), money: m, sales: s, learning: l, service: sv, staff: st, attention: att, unit: p.days > 62 ? 'month' : 'day', generatedAt: new Date(),
        filters: { program: f.program, employee: f.employee, active: f.active }, options });
};

exports._periodOf = periodOf;
