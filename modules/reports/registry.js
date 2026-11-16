const mongoose = require('mongoose');
const Customer = require('../../models/Customer');
const Enrollment = require('../../models/Enrollment');
const Certificate = require('../../models/Certificate');
const Task = require('../../models/Task');
const Complaint = require('../../models/Complaint');
const Satisfaction = require('../../models/Satisfaction');
const Employee = require('../../models/Employee');
const AuditLog = require('../../models/AuditLog');
const ProgramModule = require('../../models/ProgramModule');
const F = require('../../models/finance');
const C = require('../../models/commission');
const P = require('../../lib/permissions');
const M = require('../../lib/money');
const L = require('../finance/ledger');

// Every report: who may run it, its filters, and a query that respects the user's scope.
// Columns carry Arabic and English labels; the portal prints them and the server exports them.

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const col = (key, ar, en, type = 'text') => ({ key, ar, en, type });
const day = (v) => (v ? new Date(v) : null);

function range(f, field) {
    const out = {};
    const from = f.from ? new Date(f.from) : null;
    const to = f.to ? new Date(f.to) : null;
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(f.to))) to.setUTCHours(23, 59, 59, 999);
    if (from && !Number.isNaN(from.getTime())) out.$gte = from;
    if (to && !Number.isNaN(to.getTime())) out.$lte = to;
    return Object.keys(out).length ? { [field]: out } : {};
}

// Aggregations do not cast ids like find() does
const cast = (filter) => JSON.parse(JSON.stringify(filter), (k, v) => {
    if (typeof v !== 'string') return v;
    if (/^[0-9a-f]{24}$/i.test(v)) return new mongoose.Types.ObjectId(v);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)) return new Date(v);
    return v;
});

const COMMON = { from: { key: 'from', type: 'date' }, to: { key: 'to', type: 'date' } };

const REPORTS = [
    {
        id: 'customers', group: 'crm', titleAr: 'تقرير العملاء', titleEn: 'Customers', permission: 'customers.view',
        filters: [COMMON.from, COMMON.to, { key: 'status', type: 'select', options: ['lead', 'interested', 'customer', 'lost', 'inactive'] }, { key: 'source', type: 'select', options: Customer.SOURCES }, { key: 'owner', type: 'staff' }, { key: 'country', type: 'text' }],
        orientation: 'landscape',
        async run(req, f, scope) {
            const filter = { ...P.scopeFilter(scope, req.user), ...range(f, 'registeredAt'), status: f.status || { $ne: 'merged' }, archived: false };
            if (f.source) filter.source = f.source;
            if (oid(f.owner)) filter.owner = oid(f.owner);
            if (f.country) filter.country = String(f.country);
            const contact = !!req.user.grants['customer_contact.view'];
            const rows = await Customer.find(filter).populate('owner', 'name').sort({ registeredAt: -1 }).limit(5000).lean();
            return {
                columns: [col('customerNo', 'رقم العميل', 'Customer no.'), col('name', 'الاسم', 'Name'), ...(contact ? [col('phone', 'الهاتف', 'Phone'), col('email', 'البريد', 'Email')] : []), col('country', 'الدولة', 'Country'), col('source', 'المصدر', 'Source'), col('status', 'الحالة', 'Status'), col('owner', 'المسؤول', 'Owner'), col('registeredAt', 'التسجيل', 'Registered', 'date'), col('lastContactAt', 'آخر تواصل', 'Last contact', 'date')],
                rows: rows.map((c) => ({ customerNo: c.customerNo, name: c.nameAr, phone: c.contact?.phone, email: c.contact?.email, country: c.country, source: c.source, status: c.status, owner: c.owner?.name || '', registeredAt: day(c.registeredAt), lastContactAt: day(c.lastContactAt) })),
                totals: { count: rows.length }
            };
        }
    },
    {
        id: 'lost_customers', group: 'crm', titleAr: 'تحليل العملاء المفقودين', titleEn: 'Lost customers', permission: 'customers.view',
        filters: [COMMON.from, COMMON.to, { key: 'owner', type: 'staff' }],
        async run(req, f, scope) {
            const filter = cast({ ...P.scopeFilter(scope, req.user), status: 'lost', ...range(f, 'updatedAt') });
            if (oid(f.owner)) filter.owner = oid(f.owner);
            const rows = await Customer.aggregate([{ $match: filter }, { $group: { _id: { $toLower: { $trim: { input: '$lostReason' } } }, n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
            const total = rows.reduce((a, r) => a + r.n, 0);
            return {
                columns: [col('reason', 'سبب الخسارة', 'Reason'), col('count', 'العدد', 'Count', 'number'), col('share', 'النسبة %', 'Share %', 'number')],
                rows: rows.map((r) => ({ reason: r._id || '—', count: r.n, share: total ? M.round((r.n * 100) / total, 1) : 0 })),
                totals: { count: total }
            };
        }
    },
    {
        id: 'enrollments', group: 'learning', titleAr: 'تقرير التسجيلات', titleEn: 'Enrollments', permission: 'enrollments.view', orientation: 'landscape',
        filters: [COMMON.from, COMMON.to, { key: 'program', type: 'program' }, { key: 'status', type: 'select', options: Enrollment.ENROLLMENT_STATUSES }, { key: 'owner', type: 'staff' }],
        async run(req, f, scope) {
            const filter = { ...P.scopeFilter(scope, req.user), ...range(f, 'enrolledAt') };
            if (oid(f.program)) filter.program = oid(f.program);
            if (f.status) filter.status = f.status;
            if (oid(f.owner)) filter.owner = oid(f.owner);
            const rows = await Enrollment.find(filter).populate('customer', 'customerNo nameAr').populate('owner', 'name').populate('cohort', 'nameAr').sort({ enrolledAt: -1 }).limit(5000).lean();
            return {
                columns: [col('enrollmentNo', 'رقم التسجيل', 'Enrollment no.'), col('customer', 'العميل', 'Customer'), col('program', 'البرنامج', 'Program'), col('cohort', 'المجموعة', 'Group'), col('owner', 'المسؤول', 'Owner'), col('done', 'محاور معتمدة', 'Modules done', 'number'), col('total', 'إجمالي المحاور', 'Modules', 'number'), col('status', 'الحالة', 'Status'), col('enrolledAt', 'التسجيل', 'Enrolled', 'date')],
                rows: rows.map((e) => ({ enrollmentNo: e.enrollmentNo, customer: `${e.customer?.customerNo || ''} ${e.customer?.nameAr || ''}`, program: e.programTitleAr, cohort: e.cohort?.nameAr || '', owner: e.owner?.name || '', done: e.modules.filter((m) => ['approved', 'certificate_issued'].includes(m.status)).length, total: e.modules.length, status: e.status, enrolledAt: day(e.enrolledAt) })),
                totals: { count: rows.length }
            };
        }
    },
    {
        id: 'module_progress', group: 'learning', titleAr: 'البرامج والمحاور ونسب الإنجاز', titleEn: 'Programs and module progress', permission: 'enrollments.view',
        filters: [{ key: 'program', type: 'program' }],
        async run(req, f, scope) {
            const match = cast({ ...P.scopeFilter(scope, req.user), status: { $in: ['active', 'on_hold', 'completed'] } });
            if (oid(f.program)) match.program = oid(f.program);
            const rows = await Enrollment.aggregate([
                { $match: match }, { $unwind: '$modules' },
                { $group: { _id: { program: '$programTitleAr', module: '$modules.titleAr', order: '$modules.order' }, total: { $sum: 1 }, done: { $sum: { $cond: [{ $in: ['$modules.status', ['approved', 'certificate_issued']] }, 1, 0] } }, review: { $sum: { $cond: [{ $eq: ['$modules.status', 'ready_for_review'] }, 1, 0] } }, rejected: { $sum: { $cond: [{ $eq: ['$modules.status', 'rejected'] }, 1, 0] } }, notStarted: { $sum: { $cond: [{ $eq: ['$modules.status', 'not_started'] }, 1, 0] } } } },
                { $sort: { '_id.program': 1, '_id.order': 1 } }
            ]);
            return {
                columns: [col('program', 'البرنامج', 'Program'), col('module', 'المحور', 'Module'), col('total', 'المسجلون', 'Enrolled', 'number'), col('done', 'معتمد', 'Approved', 'number'), col('review', 'قيد المراجعة', 'In review', 'number'), col('rejected', 'مرفوض', 'Rejected', 'number'), col('notStarted', 'لم يبدأ', 'Not started', 'number'), col('rate', 'الإنجاز %', 'Done %', 'number')],
                rows: rows.map((r) => ({ program: r._id.program, module: r._id.module, total: r.total, done: r.done, review: r.review, rejected: r.rejected, notStarted: r.notStarted, rate: r.total ? M.round((r.done * 100) / r.total, 1) : 0 }))
            };
        }
    },
    {
        id: 'certificates', group: 'learning', titleAr: 'الشهادات الصادرة والملغاة', titleEn: 'Certificates issued and cancelled', permission: 'certificates.view', orientation: 'landscape',
        filters: [COMMON.from, COMMON.to, { key: 'status', type: 'select', options: Certificate.STATUSES }, { key: 'kind', type: 'select', options: ['module', 'program', 'legacy'] }],
        async run(req, f, scope) {
            const filter = { ...(scope === 'all' ? {} : P.scopeFilter(scope, req.user)), ...range(f, 'createdAt') };
            if (f.status) filter.status = f.status;
            if (f.kind) filter.kind = f.kind;
            const rows = await Certificate.find(filter).select('-pdf_data -design').sort({ createdAt: -1 }).limit(5000).lean();
            return {
                columns: [col('cert_num', 'رقم الشهادة', 'Certificate no.'), col('name', 'الاسم', 'Name'), col('program', 'البرنامج', 'Program'), col('module', 'المحور', 'Module'), col('kind', 'النوع', 'Type'), col('issued', 'تاريخ الإصدار', 'Issued'), col('status', 'الحالة', 'Status'), col('reason', 'السبب', 'Reason')],
                rows: rows.map((c) => ({ cert_num: c.cert_num, name: c.trainee_name, program: c.program_name, module: c.moduleName || '', kind: c.kind || 'legacy', issued: c.issue_date, status: c.status, reason: c.statusReason || '' })),
                totals: { count: rows.length }
            };
        }
    },
    {
        id: 'payments', group: 'finance', titleAr: 'تقرير المدفوعات', titleEn: 'Payments', permission: 'payments.view', orientation: 'landscape',
        filters: [COMMON.from, COMMON.to, { key: 'status', type: 'select', options: ['confirmed', 'pending', 'voided', 'rejected'] }, { key: 'currency', type: 'currency' }, { key: 'method', type: 'select', options: F.METHODS }, { key: 'owner', type: 'staff' }],
        async run(req, f, scope) {
            const filter = { ...P.scopeFilter(scope, req.user, { owner: 'collectedBy', team: 'team' }), ...range(f, 'paidAt') };
            filter.status = f.status || 'confirmed';
            if (f.currency) filter.currency = String(f.currency).toUpperCase();
            if (f.method) filter.method = f.method;
            if (oid(f.owner)) filter.collectedBy = oid(f.owner);
            const rows = await F.Payment.find(filter).populate('customer', 'customerNo nameAr').populate('account', 'nameAr').populate('collectedBy', 'name').sort({ paidAt: -1 }).limit(10000).lean();
            const byCurrency = {};
            for (const p of rows) byCurrency[p.currency] = M.round((byCurrency[p.currency] || 0) + p.amount, 3);
            return {
                columns: [col('receiptNo', 'الإيصال', 'Receipt'), col('paidAt', 'التاريخ', 'Date', 'date'), col('customer', 'العميل', 'Customer'), col('amount', 'المبلغ', 'Amount', 'money'), col('currency', 'العملة', 'Currency'), col('refunded', 'مسترد', 'Refunded', 'money'), col('method', 'الطريقة', 'Method'), col('account', 'الحساب', 'Account'), col('collector', 'المحصّل', 'Collector'), col('status', 'الحالة', 'Status')],
                rows: rows.map((p) => ({ receiptNo: p.receiptNo, paidAt: day(p.paidAt), customer: `${p.customer?.customerNo || ''} ${p.customer?.nameAr || ''}`, amount: p.amount, currency: p.currency, refunded: p.refundedAmount || 0, method: p.method, account: p.account?.nameAr || '', collector: p.collectedBy?.name || '', status: p.status })),
                totals: { count: rows.length, byCurrency }
            };
        }
    },
    {
        id: 'installments', group: 'finance', titleAr: 'الأقساط والمبالغ المتبقية', titleEn: 'Installments and balances due', permission: 'customer_financial.view', minScope: 'all', orientation: 'landscape',
        filters: [{ key: 'state', type: 'select', options: ['overdue', 'due', 'partial'] }, { key: 'currency', type: 'currency' }],
        async run(req, f) {
            const filter = { status: 'active' };
            if (f.currency) filter.currency = String(f.currency).toUpperCase();
            const charges = await F.Charge.find(filter).populate('customer', 'customerNo nameAr').populate('owner', 'name').limit(10000).lean();
            const totals = await L.chargeTotals(charges.map((c) => c._id));
            const now = new Date();
            const rows = [];
            for (const c of charges) {
                const dec = await L.decimals(c.currency);
                const t = totals[String(c._id)] || { applied: 0, refunded: 0 };
                const bal = M.chargeBalance({ net: c.netAmount, applied: t.applied, refunded: t.refunded }, dec);
                for (const i of M.installmentStatus(c.installments || [], bal.paid, now, dec)) {
                    if (i.status === 'paid' || (f.state && i.status !== f.state)) continue;
                    rows.push({ customer: `${c.customer?.customerNo || ''} ${c.customer?.nameAr || ''}`, chargeNo: c.chargeNo, description: c.description, no: i.no, dueDate: day(i.dueDate), amount: i.amount, remaining: i.remaining, currency: c.currency, state: i.status, owner: c.owner?.name || '' });
                }
            }
            rows.sort((a, b) => a.dueDate - b.dueDate);
            const byCurrency = {};
            for (const r of rows) byCurrency[r.currency] = M.round((byCurrency[r.currency] || 0) + r.remaining, 3);
            return {
                columns: [col('customer', 'العميل', 'Customer'), col('chargeNo', 'المستحق', 'Charge'), col('description', 'الوصف', 'Description'), col('no', 'القسط', 'No.', 'number'), col('dueDate', 'الاستحقاق', 'Due', 'date'), col('amount', 'القيمة', 'Amount', 'money'), col('remaining', 'المتبقي', 'Remaining', 'money'), col('currency', 'العملة', 'Currency'), col('state', 'الحالة', 'State'), col('owner', 'المسؤول', 'Owner')],
                rows, totals: { count: rows.length, byCurrency }
            };
        }
    },
    {
        id: 'program_profit', group: 'finance', titleAr: 'ربحية البرامج', titleEn: 'Profit by program', permission: 'payments.view', minScope: 'all', orientation: 'landscape',
        filters: [COMMON.from, COMMON.to],
        async run(req, f) {
            // Per program and currency: collected − refunds − commissions earned − the program's own expenses
            const viaEnrollment = [{ $lookup: { from: 'enrollments', localField: 'enrollment', foreignField: '_id', as: 'e' } }, { $addFields: { program: { $arrayElemAt: ['$e.program', 0] } } }];
            const [pay, ref, com, exp] = await Promise.all([
                F.Payment.aggregate([{ $match: { status: 'confirmed', ...range(f, 'paidAt') } }, ...viaEnrollment, { $group: { _id: { p: '$program', c: '$currency' }, v: { $sum: '$amount' }, n: { $sum: 1 } } }]),
                F.Refund.aggregate([{ $match: { status: 'paid', ...range(f, 'paidAt') } }, { $lookup: { from: 'payments', localField: 'payment', foreignField: '_id', as: 'pay' } }, { $addFields: { enrollment: { $arrayElemAt: ['$pay.enrollment', 0] } } }, ...viaEnrollment, { $group: { _id: { p: '$program', c: '$currency' }, v: { $sum: '$amount' } } }]),
                C.CommissionLine.aggregate([{ $match: { status: { $ne: 'cancelled' }, ...range(f, 'date') } }, ...viaEnrollment, { $group: { _id: { p: '$program', c: '$currency' }, v: { $sum: '$amount' } } }]),
                F.Expense.aggregate([{ $match: { status: 'posted', program: { $ne: null }, ...range(f, 'date') } }, { $group: { _id: { p: '$program', c: '$currency' }, v: { $sum: '$amount' } } }])
            ]);
            const keyOf = (r) => `${r._id.p || ''}|${r._id.c}`;
            const keys = [...new Set([...pay, ...ref, ...com, ...exp].map(keyOf))];
            const get = (list, k) => list.find((r) => keyOf(r) === k)?.v || 0;
            const Course = require('../../models/Course');
            const titles = Object.fromEntries((await Course.find({ _id: { $in: keys.map((k) => k.split('|')[0]).filter(Boolean) } }).select('titleAr').lean()).map((c) => [String(c._id), c.titleAr]));
            const rows = keys.map((k) => {
                const [pid, currency] = k.split('|');
                const r = { program: pid ? titles[pid] || '—' : 'بدون برنامج / No program', currency, payments: pay.find((x) => keyOf(x) === k)?.n || 0, collected: M.round(get(pay, k), 3), refunds: M.round(get(ref, k), 3), commissions: M.round(get(com, k), 3), expenses: M.round(get(exp, k), 3) };
                r.profit = M.round(r.collected - r.refunds - r.commissions - r.expenses, 3);
                r.margin = r.collected ? M.round((r.profit * 100) / r.collected, 1) : 0;
                return r;
            }).sort((a, b) => a.currency.localeCompare(b.currency) || b.profit - a.profit);
            const byCurrency = {};
            for (const r of rows) byCurrency[r.currency] = M.round((byCurrency[r.currency] || 0) + r.profit, 3);
            return {
                columns: [col('program', 'البرنامج', 'Program'), col('currency', 'العملة', 'Currency'), col('payments', 'الدفعات', 'Payments', 'number'), col('collected', 'المحصّل', 'Collected', 'money'), col('refunds', 'الاستردادات', 'Refunds', 'money'), col('commissions', 'العمولات', 'Commissions', 'money'), col('expenses', 'مصروفات البرنامج', 'Program expenses', 'money'), col('profit', 'الربح', 'Profit', 'money'), col('margin', 'هامش الربح %', 'Margin %', 'number')],
                rows, totals: { programs: new Set(rows.map((r) => r.program)).size, byCurrency }
            };
        }
    },
    {
        id: 'revenue_expenses', group: 'finance', titleAr: 'الإيرادات والمصروفات', titleEn: 'Revenue and expenses', permission: 'payments.view', minScope: 'all',
        filters: [COMMON.from, COMMON.to],
        async run(req, f) {
            // One row per month and currency: amounts in different currencies are never added together
            const byMonth = (model, dateField, match, currencyField = '$currency', valueField = '$amount', pre = []) => model.aggregate([{ $match: { ...match, ...range(f, dateField) } }, ...pre, { $group: { _id: { m: { $dateToString: { format: '%Y-%m', date: `$${dateField}` } }, c: currencyField }, v: { $sum: valueField } } }]);
            const [pay, ref, exp, com] = await Promise.all([
                byMonth(F.Payment, 'paidAt', { status: 'confirmed' }),
                byMonth(F.Refund, 'paidAt', { status: 'paid' }),
                byMonth(F.Expense, 'date', { status: 'posted' }),
                byMonth(C.CommissionPayout, 'paidAt', {}, { $arrayElemAt: ['$a.currency', 0] }, '$accountAmount', [{ $lookup: { from: 'financeaccounts', localField: 'account', foreignField: '_id', as: 'a' } }])
            ]);
            const keys = [...new Set([...pay, ...ref, ...exp, ...com].map((r) => `${r._id.m}|${r._id.c}`))].sort();
            const get = (list, m, c) => list.find((r) => r._id.m === m && r._id.c === c)?.v || 0;
            const rows = keys.map((key) => {
                const [m, c] = key.split('|');
                const r = { month: m, currency: c, collected: M.round(get(pay, m, c), 3), refunds: M.round(get(ref, m, c), 3), expenses: M.round(get(exp, m, c), 3), commissions: M.round(get(com, m, c), 3) };
                r.net = M.round(r.collected - r.refunds - r.expenses - r.commissions, 3);
                return r;
            });
            const byCurrency = {};
            for (const r of rows) byCurrency[r.currency] = M.round((byCurrency[r.currency] || 0) + r.net, 3);
            return {
                columns: [col('month', 'الشهر', 'Month'), col('currency', 'العملة', 'Currency'), col('collected', 'المحصّل', 'Collected', 'money'), col('refunds', 'الاستردادات', 'Refunds', 'money'), col('expenses', 'المصروفات', 'Expenses', 'money'), col('commissions', 'العمولات المصروفة', 'Commissions paid', 'money'), col('net', 'الصافي', 'Net', 'money')],
                rows, totals: { months: new Set(rows.map((r) => r.month)).size, byCurrency }
            };
        }
    },
    {
        id: 'commissions', group: 'finance', titleAr: 'تقرير العمولات', titleEn: 'Commissions', permission: 'commissions.view',
        filters: [{ key: 'period', type: 'month' }],
        async run(req, f, scope) {
            const period = /^\d{4}-\d{2}$/.test(String(f.period || '')) ? f.period : M.periodKey(new Date());
            const match = cast({ ...P.scopeFilter(scope, req.user, { owner: 'beneficiary', team: 'team' }), period, status: { $ne: 'cancelled' } });
            const rows = await C.CommissionLine.aggregate([
                { $match: match },
                { $group: { _id: '$beneficiary', earned: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } }, reversed: { $sum: { $cond: [{ $lt: ['$amount', 0] }, '$amount', 0] } }, due: { $sum: { $cond: [{ $eq: ['$status', 'due'] }, '$amount', 0] } }, approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } }, paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } } } },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
                { $project: { name: { $arrayElemAt: ['$u.name', 0] }, earned: 1, reversed: 1, due: 1, approved: 1, paid: 1 } },
                { $sort: { earned: -1 } }
            ]);
            return {
                columns: [col('name', 'الموظف', 'Employee'), col('earned', 'المستحقة', 'Earned', 'money'), col('reversed', 'المعكوسة', 'Reversed', 'money'), col('due', 'غير معتمدة', 'Due', 'money'), col('approved', 'معتمدة', 'Approved', 'money'), col('paid', 'مصروفة', 'Paid', 'money')],
                rows: rows.map((r) => ({ ...r, earned: M.round(r.earned, 2), reversed: M.round(r.reversed, 2), due: M.round(r.due, 2), approved: M.round(r.approved, 2), paid: M.round(r.paid, 2) })),
                meta: { period }
            };
        }
    },
    {
        id: 'employee_performance', group: 'hr', titleAr: 'أداء الموظفين', titleEn: 'Employee performance', permission: 'reports.view', minScope: 'team', orientation: 'landscape',
        filters: [COMMON.from, COMMON.to, { key: 'team', type: 'team' }],
        async run(req, f, scope) {
            return performance(req, f, scope, 'employee');
        }
    },
    {
        id: 'team_performance', group: 'hr', titleAr: 'أداء الفرق', titleEn: 'Team performance', permission: 'reports.view', minScope: 'team',
        filters: [COMMON.from, COMMON.to],
        async run(req, f, scope) {
            return performance(req, f, scope, 'team');
        }
    },
    {
        id: 'employees', group: 'hr', titleAr: 'بيانات الموظفين', titleEn: 'Employees', permission: 'employees.view', orientation: 'landscape',
        filters: [{ key: 'status', type: 'select', options: ['active', 'left'] }, { key: 'team', type: 'team' }],
        async run(req, f, scope) {
            const filter = { ...P.scopeFilter(scope, req.user, { owner: 'user', team: 'team' }) };
            if (f.status) filter.status = f.status;
            if (oid(f.team)) filter.team = oid(f.team);
            const rows = await Employee.find(filter).populate('user', 'email role').populate('team', 'nameAr').populate('department', 'nameAr').sort({ employeeNo: 1 }).lean();
            return {
                columns: [col('employeeNo', 'الرقم', 'No.'), col('name', 'الاسم', 'Name'), col('email', 'البريد', 'Email'), col('role', 'الدور', 'Role'), col('jobTitle', 'الوظيفة', 'Job'), col('department', 'القسم', 'Department'), col('team', 'الفريق', 'Team'), col('hireDate', 'التعيين', 'Hired', 'date'), col('status', 'الحالة', 'Status')],
                rows: rows.map((e) => ({ employeeNo: e.employeeNo, name: e.nameAr, email: e.user?.email, role: e.user?.role, jobTitle: e.jobTitle, department: e.department?.nameAr || '', team: e.team?.nameAr || '', hireDate: day(e.hireDate), status: e.status })),
                totals: { count: rows.length }
            };
        }
    },
    {
        id: 'attendance', group: 'hr', titleAr: 'تقرير الحضور والانصراف الشهري', titleEn: 'Monthly attendance', permission: 'attendance.view', minScope: 'team', orientation: 'landscape',
        filters: [{ key: 'period', type: 'month' }, { key: 'team', type: 'team' }],
        async run(req, f, scope) {
            const { _evaluate } = require('../hr/attendanceController');
            const month = /^\d{4}-\d{2}$/.test(String(f.period || '')) ? f.period : new Date().toISOString().slice(0, 7);
            const filter = { status: 'active', ...P.scopeFilter(scope, req.user, { owner: 'user', team: 'team' }) };
            if (oid(f.team)) filter.team = oid(f.team);
            const emps = await Employee.find(filter).select('user').lean();
            const rows = await _evaluate(emps.map((e) => e.user), month);
            const h = (m) => M.round(m / 60, 1);
            return {
                columns: [col('name', 'الموظف', 'Employee'), col('team', 'الفريق', 'Team'), col('shift', 'الدوام', 'Shift'), col('workingDays', 'أيام العمل', 'Working days', 'number'), col('present', 'حضور', 'Present', 'number'), col('late', 'مرات التأخير', 'Late days', 'number'), col('lateMinutes', 'دقائق التأخير', 'Late minutes', 'number'), col('absent', 'غياب', 'Absent', 'number'), col('leave', 'إجازات', 'Leave', 'number'), col('earlyLeaveMinutes', 'انصراف مبكر (د)', 'Early leave (min)', 'number'), col('hours', 'ساعات العمل', 'Hours worked', 'number')],
                rows: rows.map((r) => ({ name: r.name, team: r.team, shift: `${r.shift.start}-${r.shift.end}`, ...r.summary, hours: h(r.summary.workedMinutes) })),
                meta: { month }
            };
        }
    },
    {
        id: 'tasks', group: 'crm', titleAr: 'المهام والمتابعات', titleEn: 'Tasks and follow-ups', permission: 'tasks.view', orientation: 'landscape',
        filters: [COMMON.from, COMMON.to, { key: 'status', type: 'select', options: ['open', 'done', 'cancelled'] }, { key: 'owner', type: 'staff' }],
        async run(req, f, scope) {
            const filter = { ...P.scopeFilter(scope, req.user, { owner: 'assignee', team: 'team' }), ...range(f, 'dueAt') };
            if (f.status) filter.status = f.status;
            if (oid(f.owner)) filter.assignee = oid(f.owner);
            const rows = await Task.find(filter).populate('assignee', 'name').populate('customer', 'customerNo nameAr').sort({ dueAt: 1 }).limit(5000).lean();
            const now = Date.now();
            return {
                columns: [col('title', 'المهمة', 'Task'), col('kind', 'النوع', 'Type'), col('customer', 'العميل', 'Customer'), col('assignee', 'المسؤول', 'Assignee'), col('dueAt', 'الموعد', 'Due', 'date'), col('status', 'الحالة', 'Status'), col('late', 'متأخرة', 'Late'), col('completedAt', 'أنجزت', 'Completed', 'date')],
                rows: rows.map((t) => ({ title: t.title, kind: t.kind, customer: t.customer ? `${t.customer.customerNo} ${t.customer.nameAr}` : '', assignee: t.assignee?.name || '', dueAt: day(t.dueAt), status: t.status, late: t.status === 'open' && t.dueAt && new Date(t.dueAt).getTime() < now ? '✓' : '', completedAt: day(t.completedAt) })),
                totals: { count: rows.length, open: rows.filter((r) => r.status === 'open').length, late: rows.filter((r) => r.late).length }
            };
        }
    },
    {
        id: 'complaints', group: 'crm', titleAr: 'تقرير الشكاوى', titleEn: 'Complaints', permission: 'complaints.view', orientation: 'landscape',
        filters: [COMMON.from, COMMON.to, { key: 'status', type: 'select', options: Complaint.STATUSES }, { key: 'category', type: 'select', options: Complaint.CATEGORIES }],
        async run(req, f, scope) {
            const filter = { ...P.scopeFilter(scope, req.user, { owner: 'assignee', team: 'team' }), ...range(f, 'createdAt') };
            if (f.status) filter.status = f.status;
            if (f.category) filter.category = f.category;
            const rows = await Complaint.find(filter).populate('customer', 'customerNo nameAr').populate('assignee', 'name').sort({ createdAt: -1 }).limit(5000).lean();
            const ratings = await Satisfaction.find({ complaint: { $in: rows.map((r) => r._id) } }).select('complaint score').lean();
            const rating = Object.fromEntries(ratings.map((r) => [String(r.complaint), r.score]));
            const hours = (c) => (c.resolvedAt ? M.round((new Date(c.resolvedAt) - new Date(c.createdAt)) / 3600000, 1) : null);
            return {
                columns: [col('complaintNo', 'الرقم', 'No.'), col('createdAt', 'التاريخ', 'Date', 'date'), col('customer', 'العميل', 'Customer'), col('subject', 'الموضوع', 'Subject'), col('category', 'التصنيف', 'Category'), col('priority', 'الأولوية', 'Priority'), col('assignee', 'المسؤول', 'Assignee'), col('status', 'الحالة', 'Status'), col('hours', 'ساعات الحل', 'Hours to resolve', 'number'), col('rating', 'التقييم', 'Rating', 'number')],
                rows: rows.map((c) => ({ complaintNo: c.complaintNo, createdAt: day(c.createdAt), customer: `${c.customer?.customerNo || ''} ${c.customer?.nameAr || ''}`, subject: c.subject, category: c.category, priority: c.priority, assignee: c.assignee?.name || '', status: c.status, hours: hours(c), rating: rating[String(c._id)] ?? null })),
                totals: { count: rows.length, open: rows.filter((r) => ['open', 'in_progress'].includes(r.status)).length }
            };
        }
    },
    {
        id: 'satisfaction', group: 'crm', titleAr: 'رضا العملاء', titleEn: 'Customer satisfaction', permission: 'reports.view', minScope: 'all',
        filters: [COMMON.from, COMMON.to, { key: 'kind', type: 'select', options: ['program', 'service', 'complaint'] }],
        async run(req, f) {
            const match = { ...range(f, 'updatedAt') };
            if (f.kind) match.kind = f.kind;
            const rows = await Satisfaction.aggregate([
                { $match: match },
                { $lookup: { from: 'courses', localField: 'program', foreignField: '_id', as: 'p' } },
                { $group: { _id: { kind: '$kind', program: { $ifNull: [{ $arrayElemAt: ['$p.titleAr', 0] }, '—'] } }, avg: { $avg: '$score' }, n: { $sum: 1 }, low: { $sum: { $cond: [{ $lte: ['$score', 2] }, 1, 0] } } } },
                { $sort: { n: -1 } }
            ]);
            return {
                columns: [col('kind', 'النوع', 'Type'), col('program', 'البرنامج', 'Program'), col('count', 'عدد التقييمات', 'Ratings', 'number'), col('avg', 'المتوسط من 5', 'Average of 5', 'number'), col('low', 'تقييمات منخفضة', 'Low (1–2)', 'number')],
                rows: rows.map((r) => ({ kind: r._id.kind, program: r._id.program, count: r.n, avg: M.round(r.avg, 2), low: r.low }))
            };
        }
    },
    {
        id: 'audit', group: 'admin', titleAr: 'سجل العمليات والتعديلات', titleEn: 'Audit log', permission: 'audit.view', minScope: 'all', orientation: 'landscape',
        filters: [COMMON.from, COMMON.to, { key: 'resource', type: 'text' }, { key: 'action', type: 'text' }],
        async run(req, f) {
            const filter = { ...range(f, 'at') };
            if (f.resource) filter.resource = String(f.resource);
            if (f.action) filter.action = String(f.action);
            const rows = await AuditLog.find(filter).sort({ at: -1 }).limit(10000).lean();
            return {
                columns: [col('at', 'الوقت', 'Time', 'date'), col('actor', 'المستخدم', 'User'), col('action', 'العملية', 'Action'), col('resource', 'القسم', 'Section'), col('summary', 'الملخص', 'Summary'), col('reason', 'السبب', 'Reason')],
                rows: rows.map((a) => ({ at: day(a.at), actor: a.actor?.name || 'system', action: a.action, resource: a.resource, summary: a.summary, reason: a.reason || '' })),
                totals: { count: rows.length }
            };
        }
    }
];

// Activity per employee (or per team) in a period: the basis for performance reviews
async function performance(req, f, scope, by) {
    const created = range(f, 'createdAt');
    const teams = scope === 'all' ? null : req.user.teamIds.map((t) => new mongoose.Types.ObjectId(t));
    const teamMatch = oid(f.team) ? { team: oid(f.team) } : teams ? { team: { $in: teams } } : {};
    const empFilter = { status: 'active', ...(by === 'employee' ? teamMatch : teams ? { team: { $in: teams } } : {}) };
    const employees = await Employee.find(empFilter).populate('team', 'nameAr').lean();
    const users = employees.map((e) => e.user);
    const key = by === 'team' ? '$team' : '$owner';
    const [cust, conv, enr, pay, done, late, mods, sat] = await Promise.all([
        Customer.aggregate([{ $match: { owner: { $in: users }, ...range(f, 'registeredAt') } }, { $group: { _id: key, n: { $sum: 1 } } }]),
        Customer.aggregate([{ $match: { owner: { $in: users }, status: 'customer', ...range(f, 'registeredAt') } }, { $group: { _id: key, n: { $sum: 1 } } }]),
        Enrollment.aggregate([{ $match: { owner: { $in: users }, ...range(f, 'enrolledAt') } }, { $group: { _id: key, n: { $sum: 1 } } }]),
        F.Payment.aggregate([{ $match: { collectedBy: { $in: users }, status: 'confirmed', ...range(f, 'paidAt') } }, { $group: { _id: { k: by === 'team' ? '$team' : '$collectedBy', c: '$currency' }, v: { $sum: '$amount' }, n: { $sum: 1 } } }]),
        Task.aggregate([{ $match: { assignee: { $in: users }, status: 'done', ...range(f, 'completedAt') } }, { $group: { _id: by === 'team' ? '$team' : '$assignee', n: { $sum: 1 } } }]),
        Task.aggregate([{ $match: { assignee: { $in: users }, status: 'open', dueAt: { $lt: new Date() } } }, { $group: { _id: by === 'team' ? '$team' : '$assignee', n: { $sum: 1 } } }]),
        Enrollment.aggregate([{ $match: { owner: { $in: users } } }, { $unwind: '$modules' }, { $match: { 'modules.status': { $in: ['approved', 'certificate_issued'] }, ...(Object.keys(created).length ? { 'modules.approvedAt': created.createdAt } : {}) } }, { $group: { _id: key, n: { $sum: 1 } } }]),
        Satisfaction.aggregate([{ $match: { owner: { $in: users } } }, { $group: { _id: by === 'team' ? '$team' : '$owner', avg: { $avg: '$score' }, n: { $sum: 1 } } }])
    ]);
    const val = (list, id, k = 'n') => list.find((r) => String(r._id) === String(id))?.[k] || 0;
    // Collections per currency, written out ("2,500 EGP · 300 SAR"), never added across currencies
    const collectedOf = (id) => pay.filter((r) => String(r._id.k) === String(id)).sort((a, b) => b.v - a.v).map((r) => `${M.round(r.v, 2).toLocaleString('en-US')} ${r._id.c}`).join(' · ');
    const paymentsOf = (id) => pay.filter((r) => String(r._id.k) === String(id)).reduce((a, r) => a + r.n, 0);
    const units = by === 'team'
        ? [...new Map(employees.filter((e) => e.team).map((e) => [String(e.team._id), { id: e.team._id, name: e.team.nameAr, members: employees.filter((x) => String(x.team?._id) === String(e.team._id)).length }])).values()]
        : employees.map((e) => ({ id: e.user, name: e.nameAr, team: e.team?.nameAr || '' }));
    const rows = units.map((u) => {
        const newCustomers = val(cust, u.id);
        const converted = val(conv, u.id);
        return {
            name: u.name, team: u.team, members: u.members,
            newCustomers, converted, conversion: newCustomers ? M.round((converted * 100) / newCustomers, 1) : 0,
            enrollments: val(enr, u.id), payments: paymentsOf(u.id), collected: collectedOf(u.id) || '—', modules: val(mods, u.id),
            tasksDone: val(done, u.id), tasksLate: val(late, u.id),
            satisfaction: val(sat, u.id, 'avg') ? M.round(val(sat, u.id, 'avg'), 2) : null
        };
    }).sort((a, b) => b.payments - a.payments);
    return {
        columns: [col('name', by === 'team' ? 'الفريق' : 'الموظف', by === 'team' ? 'Team' : 'Employee'), ...(by === 'team' ? [col('members', 'الأعضاء', 'Members', 'number')] : [col('team', 'الفريق', 'Team')]),
            col('newCustomers', 'عملاء جدد', 'New customers', 'number'), col('converted', 'تحولوا لعملاء', 'Converted', 'number'), col('conversion', 'التحويل %', 'Conversion %', 'number'),
            col('enrollments', 'تسجيلات', 'Enrollments', 'number'), col('payments', 'عدد الدفعات', 'Payments', 'number'), col('collected', 'المحصّل', 'Collected'), col('modules', 'محاور معتمدة', 'Modules approved', 'number'),
            col('tasksDone', 'مهام منجزة', 'Tasks done', 'number'), col('tasksLate', 'مهام متأخرة', 'Tasks late', 'number'), col('satisfaction', 'الرضا', 'Satisfaction', 'number')],
        rows
    };
}

// Reports are for staff; customers see their own data in their portal pages instead
// The finance group (payments, balances, profit, revenue, commissions) and the audit log are the
// owner's only: the assistant sees every other report.
const OWNER_GROUPS = ['finance', 'admin'];
const allowed = (r, grants) => P.hasScope(grants[r.permission], r.minScope || 'own') && (!OWNER_GROUPS.includes(r.group) || P.seesMoney(grants));

function available(grants, role) {
    if (role && !P.isStaffRole(role)) return [];
    return REPORTS.filter((r) => allowed(r, grants));
}

module.exports = { REPORTS, available, allowed, range };
