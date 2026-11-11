const mongoose = require('mongoose');
const Course = require('../../models/Course');
const ProgramModule = require('../../models/ProgramModule');
const Cohort = require('../../models/Cohort');
const Enrollment = require('../../models/Enrollment');
const CohortMember = require('../../models/CohortMember');
const audit = require('../../lib/audit');
const { HttpError, assertVersion, paging } = require('../../lib/http');

// Programs (the existing Course catalog), their modules and training groups

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PROGRAM_FIELDS = 'titleAr titleEn slug type specialty status duration price currency modulesRequired';

async function loadProgram(id) {
    const p = await Course.findById(id).select(PROGRAM_FIELDS);
    if (!p) throw new HttpError(404, 'Not found.');
    return p;
}

exports.list = async (req, res) => {
    const { limit, page, skip } = paging(req.query, { defaultLimit: 100, maxLimit: 500 });
    const filter = {};
    if (req.query.type) filter.type = String(req.query.type);
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.q) {
        const rx = new RegExp(escapeRx(String(req.query.q).slice(0, 60)), 'i');
        filter.$or = [{ titleAr: rx }, { titleEn: rx }, { specialty: rx }];
    }
    const [items, total] = await Promise.all([
        Course.find(filter).select(PROGRAM_FIELDS).sort({ titleAr: 1 }).skip(skip).limit(limit).lean(),
        Course.countDocuments(filter)
    ]);
    const ids = items.map((p) => p._id);
    const [mods, enr] = await Promise.all([
        ProgramModule.aggregate([{ $match: { program: { $in: ids }, active: true } }, { $group: { _id: '$program', n: { $sum: 1 } } }]),
        Enrollment.aggregate([{ $match: { program: { $in: ids }, status: { $in: Enrollment.OPEN_STATUSES } } }, { $group: { _id: '$program', n: { $sum: 1 } } }])
    ]);
    const m = Object.fromEntries(mods.map((x) => [String(x._id), x.n]));
    const e = Object.fromEntries(enr.map((x) => [String(x._id), x.n]));
    res.json({ items: items.map((p) => ({ ...p, modules: m[String(p._id)] || 0, openEnrollments: e[String(p._id)] || 0 })), total, page, limit });
};

exports.get = async (req, res) => {
    const program = await loadProgram(req.params.id);
    const [modules, cohorts] = await Promise.all([
        ProgramModule.find({ program: program._id }).sort({ active: -1, order: 1, createdAt: 1 }).lean(),
        Cohort.find({ program: program._id }).sort({ startDate: -1, createdAt: -1 }).lean()
    ]);
    const counts = await CohortMember.aggregate([{ $match: { cohort: { $in: cohorts.map((c) => c._id) }, status: 'active' } }, { $group: { _id: '$cohort', n: { $sum: 1 } } }]);
    const byCohort = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    res.json({ item: program, modules, cohorts: cohorts.map((c) => ({ ...c, enrolled: byCohort[String(c._id)] || 0 })) });
};

exports.updateRules = async (req, res) => {
    const program = await Course.findById(req.params.id);
    if (!program) throw new HttpError(404, 'Not found.');
    const before = program.modulesRequired || 0;
    const n = Math.max(parseInt(req.body.modulesRequired, 10) || 0, 0);
    program.modulesRequired = n;
    await program.save();
    await audit.record(req, { action: 'program.rules_updated', resource: 'programs', resourceId: program._id, summary: program.titleAr, reason: str(req.body.reason, 300), changes: { modulesRequired: { from: before, to: n } } });
    res.json({ modulesRequired: n });
};

function moduleInput(body) {
    return {
        code: str(body.code, 30),
        titleAr: str(body.titleAr),
        titleEn: str(body.titleEn),
        descriptionAr: str(body.descriptionAr, 4000),
        descriptionEn: str(body.descriptionEn, 4000),
        requirements: Array.isArray(body.requirements) ? body.requirements.map((r) => str(String(r), 300)).filter(Boolean).slice(0, 30) : [],
        hours: Math.min(Math.max(Number(body.hours) || 0, 0), 2000),
        required: body.required !== false,
        certificate: body.certificate !== false
    };
}

exports.addModule = async (req, res) => {
    const program = await loadProgram(req.params.id);
    const input = moduleInput(req.body);
    if (!input.titleAr) throw new HttpError(400, 'اسم المحور مطلوب. / The module title is required.');
    const last = await ProgramModule.findOne({ program: program._id }).sort({ order: -1 }).select('order').lean();
    const mod = await ProgramModule.create({ ...input, program: program._id, order: last ? last.order + 1 : 1, createdBy: req.user.id });
    await audit.record(req, { action: 'module.created', resource: 'programs', resourceId: mod._id, summary: `${program.titleAr}: ${mod.titleAr}` });
    res.status(201).json({ item: mod });
};

exports.updateModule = async (req, res) => {
    const mod = await ProgramModule.findById(req.params.moduleId);
    if (!mod) throw new HttpError(404, 'Not found.');
    assertVersion(mod, req.body.__v);
    const before = mod.toObject();
    const input = moduleInput({ ...before, ...req.body });
    if (!input.titleAr) throw new HttpError(400, 'اسم المحور مطلوب. / The module title is required.');
    mod.set(input);
    if (req.body.active !== undefined) mod.active = req.body.active === true;
    await mod.save();
    await audit.record(req, { action: 'module.updated', resource: 'programs', resourceId: mod._id, summary: mod.titleAr, changes: audit.diff(before, mod.toObject(), [...Object.keys(input), 'active']) });
    res.json({ item: mod });
};

exports.reorderModules = async (req, res) => {
    const program = await loadProgram(req.params.id);
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(oid).filter(Boolean);
    const ops = ids.map((id, i) => ({ updateOne: { filter: { _id: id, program: program._id }, update: { $set: { order: i + 1 } } } }));
    if (ops.length) await ProgramModule.bulkWrite(ops);
    res.json({ ok: true });
};

function cohortInput(body) {
    const date = (v) => (v ? new Date(v) : null);
    return {
        nameAr: str(body.nameAr, 160),
        nameEn: str(body.nameEn, 160),
        startDate: date(body.startDate),
        endDate: date(body.endDate),
        schedule: str(body.schedule, 300),
        instructor: str(body.instructor, 160),
        delivery: ['online', 'onsite', 'hybrid'].includes(body.delivery) ? body.delivery : 'online',
        capacity: Math.min(Math.max(parseInt(body.capacity, 10) || 0, 0), 10000),
        status: ['planned', 'open', 'running', 'finished', 'cancelled'].includes(body.status) ? body.status : 'open',
        notes: str(body.notes, 1000),
        modules: (Array.isArray(body.modules) ? body.modules : []).map(oid).filter(Boolean).slice(0, 50)
    };
}

// Only modules of the group's own program are kept
async function ownModules(programId, ids) {
    if (!ids.length) return [];
    const found = await ProgramModule.find({ _id: { $in: ids }, program: programId }).select('_id').lean();
    const ok = new Set(found.map((m) => String(m._id)));
    return ids.filter((id) => ok.has(String(id)));
}

exports.listCohorts = async (req, res) => {
    const filter = {};
    if (oid(req.query.program)) filter.program = oid(req.query.program);
    if (req.query.open === '1') filter.status = { $in: ['planned', 'open', 'running'] };
    res.json({ items: await Cohort.find(filter).sort({ startDate: -1 }).limit(300).lean() });
};

exports.addCohort = async (req, res) => {
    const program = await loadProgram(req.params.id);
    const input = cohortInput(req.body);
    if (!input.nameAr) throw new HttpError(400, 'اسم المجموعة مطلوب. / The group name is required.');
    input.modules = await ownModules(program._id, input.modules);
    const c = await Cohort.create({ ...input, program: program._id });
    await audit.record(req, { action: 'cohort.created', resource: 'programs', resourceId: c._id, summary: `${program.titleAr}: ${c.nameAr}` });
    res.status(201).json({ item: c });
};

exports.updateCohort = async (req, res) => {
    const c = await Cohort.findById(req.params.cohortId);
    if (!c) throw new HttpError(404, 'Not found.');
    assertVersion(c, req.body.__v);
    const before = c.toObject();
    const input = cohortInput({ ...before, ...req.body });
    if (!input.nameAr) throw new HttpError(400, 'اسم المجموعة مطلوب. / The group name is required.');
    input.modules = await ownModules(c.program, input.modules);
    c.set(input);
    await c.save();
    await audit.record(req, { action: 'cohort.updated', resource: 'programs', resourceId: c._id, summary: c.nameAr, changes: audit.diff(before, c.toObject(), Object.keys(input)) });
    res.json({ item: c });
};
