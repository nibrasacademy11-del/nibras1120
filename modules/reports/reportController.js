const P = require('../../lib/permissions');
const audit = require('../../lib/audit');
const { buildXlsx } = require('../../lib/xlsx');
const { HttpError } = require('../../lib/http');
const { REPORTS, available } = require('./registry');

// Lists the reports the user may run, runs them, exports them to Excel, and logs prints

const resourceOf = (permission) => permission.split('.')[0];

function load(req) {
    const report = REPORTS.find((r) => r.id === req.params.id);
    if (!report || !req.user.isStaff) throw new HttpError(404, 'Not found.');
    const scope = P.scopeFor(req.user.grants, report.permission);
    if (!P.hasScope(scope, report.minScope || 'own')) throw new HttpError(403, 'ليس لديك صلاحية لهذا التقرير. / You do not have access to this report.', 'FORBIDDEN');
    return { report, scope };
}

// Filters arrive as query strings; only the ones the report declares are passed on
function filtersOf(report, query) {
    const f = {};
    for (const def of report.filters || []) {
        const v = query[def.key];
        if (typeof v === 'string' && v.trim()) f[def.key] = v.trim().slice(0, 100);
    }
    return f;
}

// Export needs an export permission for the report's data, or the general reports export permission
function canExport(req, report) {
    const g = req.user.grants;
    return !!(g[`${resourceOf(report.permission)}.export`] || g['reports.export']);
}

exports.list = async (req, res) => {
    res.json({
        items: available(req.user.grants, req.user.role).map((r) => ({
            id: r.id, group: r.group, titleAr: r.titleAr, titleEn: r.titleEn, filters: r.filters, orientation: r.orientation || 'portrait', canExport: canExport(req, r)
        }))
    });
};

exports.run = async (req, res) => {
    const { report, scope } = load(req);
    const filters = filtersOf(report, req.query);
    const result = await report.run(req, filters, scope);
    res.json({ id: report.id, titleAr: report.titleAr, titleEn: report.titleEn, orientation: report.orientation || 'portrait', filters, scope, generatedAt: new Date(), generatedBy: req.user.name, ...result });
};

exports.exportXlsx = async (req, res) => {
    const { report, scope } = load(req);
    if (!canExport(req, report)) throw new HttpError(403, 'ليس لديك صلاحية التصدير. / You may not export this report.', 'FORBIDDEN');
    const filters = filtersOf(report, req.query);
    const result = await report.run(req, filters, scope);
    const lang = req.query.lang === 'en' ? 'en' : 'ar';
    const title = lang === 'en' ? report.titleEn : report.titleAr;
    const buf = buildXlsx({
        sheetName: title,
        title: `${title} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        rtl: lang === 'ar',
        columns: result.columns.map((c) => ({ key: c.key, label: lang === 'en' ? c.en : c.ar, type: c.type })),
        rows: result.rows
    });
    await audit.record(req, { action: 'report.exported', resource: 'reports', resourceId: report.id, summary: `${report.titleEn}: ${result.rows.length} rows`, meta: { filters, format: 'xlsx' } });
    const filename = `${report.id}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
};

// The portal reports when a report or record is printed or saved as PDF, for the audit log
exports.printed = async (req, res) => {
    const what = String(req.body.what || '').slice(0, 80);
    if (!what) throw new HttpError(400, 'Invalid request.');
    await audit.record(req, { action: 'report.printed', resource: 'reports', resourceId: what, summary: String(req.body.title || '').slice(0, 200), meta: req.body.filters && typeof req.body.filters === 'object' ? req.body.filters : undefined });
    res.json({ ok: true });
};
