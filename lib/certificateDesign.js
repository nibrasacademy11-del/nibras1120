// Builds the frozen design of a certificate from a template and the learner's data. Pure.

const PLACEHOLDERS = ['name', 'nameEn', 'program', 'programEn', 'module', 'moduleEn', 'date', 'number', 'hours'];

function fill(text, data) {
    return String(text || '').replace(/\{(\w+)\}/g, (m, key) => (PLACEHOLDERS.includes(key) ? String(data[key] ?? '') : m));
}

const DEFAULT_TEMPLATE = {
    language: 'both',
    titleAr: 'شهادة إتمام',
    titleEn: 'Certificate of Completion',
    introAr: 'تشهد أكاديمية نبراس للتدريب والتأهيل المهني بأن',
    introEn: 'Nibras Academy for Training & Professional Qualification certifies that',
    logo: '/assets/img/logo.png',
    background: '',
    primaryColor: '#5a020e',
    accentColor: '#b98a35',
    showHours: true,
    showAccreditations: true,
    signatures: [],
    footerAr: '',
    footerEn: ''
};

const DEFAULT_BODY = {
    module: { ar: 'قد أتم بنجاح متطلبات محور «{module}» ضمن برنامج «{program}»', en: 'has successfully completed the module “{moduleEn}” of the “{programEn}” program' },
    program: { ar: 'قد أتم بنجاح جميع متطلبات برنامج «{program}»', en: 'has successfully completed all requirements of the “{programEn}” program' }
};

// data: { kind, name, nameEn, program, programEn, module, moduleEn, date, number, hours }
function buildDesign(template, data) {
    const t = { ...DEFAULT_TEMPLATE, ...(template || {}) };
    const kind = data.kind === 'program' ? 'program' : 'module';
    const values = {
        ...data,
        nameEn: data.nameEn || data.name,
        programEn: data.programEn || data.program,
        moduleEn: data.moduleEn || data.module
    };
    return {
        templateName: t.name || 'default',
        language: t.language,
        titleAr: fill(t.titleAr, values),
        titleEn: fill(t.titleEn, values),
        introAr: fill(t.introAr, values),
        introEn: fill(t.introEn, values),
        bodyAr: fill(template && template.bodyAr ? template.bodyAr : DEFAULT_BODY[kind].ar, values),
        bodyEn: fill(template && template.bodyEn ? template.bodyEn : DEFAULT_BODY[kind].en, values),
        footerAr: fill(t.footerAr, values),
        footerEn: fill(t.footerEn, values),
        logo: t.logo,
        background: t.background,
        primaryColor: t.primaryColor,
        accentColor: t.accentColor,
        showHours: t.showHours && Number(data.hours) > 0,
        showAccreditations: t.showAccreditations,
        signatures: (t.signatures || []).map((s) => ({ nameAr: s.nameAr, nameEn: s.nameEn, titleAr: s.titleAr, titleEn: s.titleEn, image: s.image }))
    };
}

// Number in the series, e.g. NC-0000123, plus "-2" for a reissued version
function versionedNumber(base, version) {
    return version > 1 ? `${base}-${version}` : base;
}

// What the public verification page may see: no ids, no internal notes, no PDF bytes
function publicView(cert) {
    const c = cert.toObject ? cert.toObject() : cert;
    return {
        cert_num: c.cert_num,
        trainee_name: c.trainee_name,
        nameEn: c.nameEn || '',
        program_name: c.program_name,
        programNameEn: c.programNameEn || '',
        program_type: c.program_type,
        field: c.field,
        moduleName: c.moduleName || '',
        hours: c.hours || 0,
        issue_date: c.issue_date,
        status: c.status,
        kind: c.kind || 'legacy',
        accreditations: (c.accreditations || []).map((a) => ({ nameAr: a.nameAr, nameEn: a.nameEn, body: a.body, number: a.number })),
        replacedByNumber: c.replacedByNumber || undefined,
        pdf_url: c.status === 'Valid' && c.pdf_url ? c.pdf_url : null
    };
}

module.exports = { fill, buildDesign, versionedNumber, publicView, PLACEHOLDERS, DEFAULT_BODY };
