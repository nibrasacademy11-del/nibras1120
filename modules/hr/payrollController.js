// Payroll: basic salaries, advances, the monthly sheet (draft -> approved) and payslips.
// A statement only: paying is done outside the system, nothing is posted to the cash accounts.
// Permissions: payroll.view all (HR, finance, owner, admin) for the sheet; payroll.view own for
// an employee's own payslips; payroll.update to edit, payroll.approve to approve.
const mongoose = require('mongoose');
const Employee = require('../../models/Employee');
const { CommissionLine } = require('../../models/commission');
const { Advance, PayrollRun } = require('../../models/payroll');
const PR = require('../../lib/payroll');
const P = require('../../lib/permissions');
const audit = require('../../lib/audit');
const { HttpError, assertVersion } = require('../../lib/http');
const { _evaluate: evaluateAttendance } = require('./attendanceController');

const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const monthOf = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || '')) ? String(v) : null);
const CURRENCIES = /^[A-Z]{3}$/;

// ---- basic salaries ----

exports.listSalaries = async (req, res) => {
    const items = await Employee.find({ status: 'active' }).select('+salary user employeeNo nameAr jobTitle team').populate('team', 'nameAr').sort({ employeeNo: 1 }).lean();
    res.json({ items: items.map((e) => ({ _id: e._id, user: e.user, employeeNo: e.employeeNo, nameAr: e.nameAr, jobTitle: e.jobTitle, team: e.team?.nameAr || '', salary: e.salary || { basic: 0, currency: 'EGP' } })) });
};

exports.setSalary = async (req, res) => {
    const emp = await Employee.findById(req.params.id).select('+salary employeeNo nameAr user');
    if (!emp) throw new HttpError(404, 'Not found.');
    if (String(emp.user) === String(req.user.id) && req.user.role !== 'super_admin') throw new HttpError(403, 'لا يمكنك تعديل مرتبك. / You cannot change your own salary.', 'SELF_APPROVAL');
    const basic = num(req.body.basic);
    const currency = str(req.body.currency || 'EGP', 3).toUpperCase();
    if (!(basic >= 0) || !CURRENCIES.test(currency)) throw new HttpError(400, 'اكتب مرتب صحيح والعملة. / Enter a valid salary and currency.');
    const before = { basic: emp.salary?.basic || 0, currency: emp.salary?.currency || 'EGP' };
    emp.salary = { basic: PR.money(basic), currency };
    await emp.save();
    await audit.record(req, { action: 'payroll.salary_set', resource: 'payroll', resourceId: emp._id, summary: `Basic salary of ${emp.employeeNo} ${emp.nameAr}`, changes: { basic: { from: before.basic, to: emp.salary.basic }, currency: { from: before.currency, to: currency } }, reason: str(req.body.reason) });
    res.json({ item: { _id: emp._id, salary: emp.salary } });
};

// ---- advances ----

exports.listAdvances = async (req, res) => {
    const filter = {};
    if (['active', 'repaid', 'cancelled'].includes(req.query.status)) filter.status = req.query.status;
    const items = await Advance.find(filter).populate('user', 'name').sort({ createdAt: -1 }).limit(300).lean();
    res.json({ items });
};

exports.createAdvance = async (req, res) => {
    const user = oid(req.body.user);
    const emp = user && (await Employee.findOne({ user, status: 'active' }).select('+salary team nameAr'));
    if (!emp) throw new HttpError(400, 'اختر موظف. / Choose an employee.');
    if (String(user) === String(req.user.id) && req.user.role !== 'super_admin') throw new HttpError(403, 'لا يمكنك تسجيل سلفة لنفسك. / You cannot record your own advance.', 'SELF_APPROVAL');
    const amount = num(req.body.amount);
    const installments = Math.round(num(req.body.installments));
    const startMonth = monthOf(req.body.startMonth);
    if (!(amount > 0) || !(installments >= 1 && installments <= 60) || !startMonth) throw new HttpError(400, 'المبلغ وعدد الأقساط وشهر البداية مطلوبين. / Amount, installments and first month are required.');
    const run = await PayrollRun.findOne({ month: startMonth, status: 'approved' }).select('_id').lean();
    if (run) throw new HttpError(400, 'كشف الشهر ده اتعتمد. ابدأ السلفة من الشهر اللي بعده. / That month is already approved; start from the next month.');
    const item = await Advance.create({ user, team: emp.team || null, amount: PR.money(amount), currency: (emp.salary && emp.salary.currency) || 'EGP', installments, startMonth, reason: str(req.body.reason, 500), createdBy: req.user.id });
    await audit.record(req, { action: 'payroll.advance_created', resource: 'payroll', resourceId: item._id, summary: `Advance of ${item.amount} ${item.currency} for ${emp.nameAr} over ${installments} months from ${startMonth}` });
    res.status(201).json({ item });
};

exports.cancelAdvance = async (req, res) => {
    const a = await Advance.findById(req.params.id);
    if (!a) throw new HttpError(404, 'Not found.');
    if (a.status !== 'active') throw new HttpError(400, 'السلفة مش نشطة. / The advance is not active.');
    const reason = str(req.body.reason, 500);
    if (!reason) throw new HttpError(400, 'السبب مطلوب. / A reason is required.', 'REASON_REQUIRED');
    a.status = 'cancelled';
    a.cancelReason = reason;
    await a.save();
    await audit.record(req, { action: 'payroll.advance_cancelled', resource: 'payroll', resourceId: a._id, summary: `Advance cancelled, ${a.repaid} of ${a.amount} ${a.currency} repaid`, reason });
    res.json({ item: a });
};

// ---- the monthly sheet ----

async function computeLines(month, keepByUser = {}) {
    const emps = await Employee.find({ status: 'active' }).select('+salary user employeeNo nameAr jobTitle team').populate('team', 'nameAr').sort({ employeeNo: 1 }).lean();
    const users = emps.map((e) => e.user);
    const [commissionLines, advances, attendance] = await Promise.all([
        CommissionLine.find({ beneficiary: { $in: users }, period: month, status: { $in: ['approved', 'paid'] } }).select('beneficiary amount currency status').lean(),
        Advance.find({ user: { $in: users }, status: 'active' }).lean(),
        evaluateAttendance(users, month)
    ]);
    const attByUser = Object.fromEntries(attendance.map((a) => [String(a.user), a.summary]));
    return emps.map((e) => {
        const u = String(e.user);
        return PR.buildLine({
            employee: e,
            salary: e.salary,
            commissions: PR.commissionsByCurrency(commissionLines.filter((l) => String(l.beneficiary) === u)),
            advances: advances.filter((a) => String(a.user) === u),
            attendance: attByUser[u] || {},
            month,
            keep: keepByUser[u] || {}
        });
    });
}

const runView = (run) => {
    const r = run.toObject ? run.toObject() : run;
    return { ...r, totals: PR.totals(r.lines) };
};

exports.listRuns = async (req, res) => {
    const items = await PayrollRun.find().select('month status approvedAt createdAt lines.currency lines.net lines.basic lines.commission lines.bonus lines.advanceDeduction lines.deduction').sort({ month: -1 }).limit(36).lean();
    res.json({ items: items.map((r) => ({ _id: r._id, month: r.month, status: r.status, approvedAt: r.approvedAt, people: r.lines.length, totals: PR.totals(r.lines) })) });
};

exports.createRun = async (req, res) => {
    const month = monthOf(req.body.month);
    if (!month) throw new HttpError(400, 'اختر الشهر. / Choose the month.');
    if (await PayrollRun.exists({ month })) throw new HttpError(409, 'كشف الشهر ده موجود. / This month already has a sheet.', 'DUPLICATE');
    const run = await PayrollRun.create({ month, lines: await computeLines(month), createdBy: req.user.id });
    await audit.record(req, { action: 'payroll.run_created', resource: 'payroll', resourceId: run._id, summary: `Payroll sheet ${month} with ${run.lines.length} employees` });
    res.status(201).json({ item: runView(run) });
};

async function loadRun(req) {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) throw new HttpError(404, 'Not found.');
    return run;
}
const assertDraft = (run) => {
    if (run.status !== 'draft') throw new HttpError(400, 'الكشف ده اتعتمد ومقفول. / This sheet is approved and locked.', 'LOCKED');
};

exports.getRun = async (req, res) => res.json({ item: runView(await loadRun(req)) });

// Re-reads salaries, commissions, advances and attendance; keeps the hand-typed bonus and deduction
exports.refreshRun = async (req, res) => {
    const run = await loadRun(req);
    assertDraft(run);
    const keep = Object.fromEntries(run.lines.map((l) => [String(l.user), { bonus: l.bonus, bonusNote: l.bonusNote, deduction: l.deduction, deductionNote: l.deductionNote }]));
    run.lines = await computeLines(run.month, keep);
    await run.save();
    res.json({ item: runView(run) });
};

exports.updateLine = async (req, res) => {
    const run = await loadRun(req);
    assertDraft(run);
    assertVersion(run, req.body.__v);
    const line = run.lines.find((l) => String(l.user) === String(req.params.userId));
    if (!line) throw new HttpError(404, 'Not found.');
    if (String(line.user) === String(req.user.id) && req.user.role !== 'super_admin') throw new HttpError(403, 'لا يمكنك تعديل سطر مرتبك. / You cannot edit your own line.', 'SELF_APPROVAL');
    const before = { bonus: line.bonus, deduction: line.deduction };
    for (const k of ['bonus', 'deduction']) {
        if (req.body[k] === undefined) continue;
        const v = num(req.body[k]);
        if (!(v >= 0)) throw new HttpError(400, 'المبلغ لازم يكون رقم موجب. / Amounts must be positive numbers.');
        line[k] = PR.money(v);
    }
    if (req.body.bonusNote !== undefined) line.bonusNote = str(req.body.bonusNote);
    if (req.body.deductionNote !== undefined) line.deductionNote = str(req.body.deductionNote);
    if (line.deduction > 0 && !line.deductionNote) throw new HttpError(400, 'اكتب سبب الخصم. / Write the reason for the deduction.', 'REASON_REQUIRED');
    line.net = PR.netOf(line);
    await run.save();
    const changes = audit.diff(before, { bonus: line.bonus, deduction: line.deduction });
    if (Object.keys(changes).length) await audit.record(req, { action: 'payroll.line_updated', resource: 'payroll', resourceId: run._id, summary: `${run.month}: ${line.name}`, changes, reason: [line.bonusNote, line.deductionNote].filter(Boolean).join(' / ') });
    res.json({ item: runView(run) });
};

// Approving locks the sheet and takes this month's advance installments
exports.approveRun = async (req, res) => {
    const run = await loadRun(req);
    assertDraft(run);
    assertVersion(run, req.body.__v);
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            for (const line of run.lines) {
                for (const a of line.advances || []) {
                    const adv = await Advance.findById(a.advance).session(session);
                    if (!adv || adv.status !== 'active' || adv.repayments.some((r) => r.month === run.month)) continue;
                    adv.repayments.push({ month: run.month, amount: a.amount, run: run._id });
                    adv.repaid = PR.round2(adv.repaid + a.amount);
                    if (adv.repaid >= adv.amount - 0.005) adv.status = 'repaid';
                    await adv.save({ session });
                }
            }
            run.status = 'approved';
            run.approvedBy = req.user.id;
            run.approvedAt = new Date();
            await run.save({ session });
        });
    } finally {
        await session.endSession();
    }
    // Each employee is told their payslip is ready (no amounts in the notice)
    const { notify } = require('../crm/service');
    for (const line of run.lines) {
        await notify(line.user, { type: 'payroll.published', titleAr: `قسيمة مرتبك لشهر ${run.month} جاهزة`, titleEn: `Your ${run.month} payslip is ready`, link: '/my-payslips', dedupeKey: `payslip:${run._id}:${line.user}` });
    }
    await audit.record(req, { action: 'payroll.run_approved', resource: 'payroll', resourceId: run._id, summary: `Payroll sheet ${run.month} approved: ${run.lines.length} employees`, meta: { totals: PR.totals(run.lines) } });
    res.json({ item: runView(run) });
};

exports.deleteRun = async (req, res) => {
    const run = await loadRun(req);
    assertDraft(run);
    await PayrollRun.deleteOne({ _id: run._id });
    await audit.record(req, { action: 'payroll.run_deleted', resource: 'payroll', resourceId: run._id, summary: `Draft payroll sheet ${run.month} deleted` });
    res.json({ message: 'تم.' });
};

// ---- my payslips (approved sheets only) ----

exports.myPayslips = async (req, res) => {
    const me = oid(req.user.id);
    const runs = await PayrollRun.find({ status: 'approved', 'lines.user': me }).select('month approvedAt lines.$').sort({ month: -1 }).limit(36).lean();
    res.json({ items: runs.map((r) => ({ runId: r._id, month: r.month, approvedAt: r.approvedAt, line: r.lines[0] })) });
};

// One payslip: your own, or anyone's with payroll.view for all
exports.payslip = async (req, res) => {
    const run = await PayrollRun.findById(req.params.id).lean();
    if (!run || run.status !== 'approved') throw new HttpError(404, 'Not found.');
    const userId = req.params.userId || req.user.id;
    const self = String(userId) === String(req.user.id);
    if (!self && P.scopeFor(req.user.grants, 'payroll.view') !== 'all') throw new HttpError(403, 'Forbidden.');
    const line = run.lines.find((l) => String(l.user) === String(userId));
    if (!line) throw new HttpError(404, 'Not found.');
    res.json({ month: run.month, approvedAt: run.approvedAt, line });
};

// The employee's own advances (only theirs)
exports.myAdvances = async (req, res) => {
    const items = await Advance.find({ user: oid(req.user.id) }).select('amount currency installments startMonth repaid repayments status reason createdAt').sort({ createdAt: -1 }).lean();
    res.json({ items });
};
