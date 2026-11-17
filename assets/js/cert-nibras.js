// The academy's certificate design (17 Nov 2026), for courses, professional masters and
// professional doctorates: the blank sheet the academy designed, with the text laid on it.
// One file for the website (the customer's download) and the staff portal (print and preview),
// so both always show the same certificate. Plain script: window.NibrasCertificate, or require().
//
// Fonts: English in Canva Sans, Arabic in Siwa, the headings and the date in Roboto. Canva Sans and
// Siwa are not free web fonts, so the closest free ones stand in (Figtree, Almarai) until the
// font files are added to /assets/fonts (cert-nibras.css then uses them first).

(function (root) {
    // The sheets the academy designed, one per kind of document. A kind without a sheet yet
    // (diplomas, academic degrees) cannot be issued by hand until its design is added.
    const SHEETS = {
        professional: '/assets/img/certificates/nibras-professional.jpg'
    };
    const DOC_TYPES = {
        course: { ar: 'دورة تدريبية', en: 'Course', sheet: 'professional' },
        master: { ar: 'ماجستير مهني', en: 'Professional Master', sheet: 'professional' },
        phd: { ar: 'دكتوراه مهنية', en: 'Professional Doctorate', sheet: 'professional' },
        diploma: { ar: 'دبلوم مهني', en: 'Professional Diploma', sheet: null },
        degree: { ar: 'درجة علمية', en: 'Academic Degree', sheet: null }
    };
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const trimDot = (s) => String(s || '').trim().replace(/[.،,]+$/, '');

    // 2026-11-02 -> "2 November , 2026" (as on the academy's sheet)
    function longDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        if (!m) return esc(iso);
        return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} , ${m[1]}`;
    }

    // The two paragraphs. Bold parts are the name, the program and the hours, as on the sample.
    function paragraphs(cert, d) {
        const female = d.gender === 'female';
        const nameAr = trimDot(cert.trainee_name);
        const nameEn = trimDot(cert.nameEn || cert.trainee_name);
        const subjectAr = trimDot(d.subjectAr || cert.program_name);
        const subjectEn = trimDot(d.subjectEn || cert.programNameEn || cert.program_name);
        const hours = Number(cert.hours) > 0 ? Number(cert.hours) : 0;
        const ar = `تشهد أكاديمية نبراس (NBTC) بأن ${female ? 'المتدربة' : 'المتدرب'}<br>`
            + `<b>${esc(nameAr)}.</b><br>`
            + `${female ? 'قد أتمت' : 'قد أتم'} بنجاح جميع متطلبات <b>${esc(subjectAr)}</b>، `
            + `وذلك ضمن إطار برنامج تدريبي معتمد${hours ? ` <b>بإجمالي ${hours} ساعة تدريبية</b>` : ''}، `
            + 'وفقًا لأعلى معايير التدريب المهني المعتمدة.';
        const en = 'Nibras Academy certifies that the trainee,<br>'
            + `<b>${esc(nameEn)}.</b><br>`
            + `has successfully completed all the requirements <b>of the ${esc(subjectEn)}</b> within the framework of an accredited training program`
            + `${hours ? `, with a total of <b>${hours} training hours</b>` : ''}, in accordance with the highest accredited professional training standards.`;
        return { ar, en };
    }

    // The whole A4 landscape sheet (297 x 210 mm) as HTML
    function sheet(cert, design) {
        const d = design || {};
        const p = paragraphs(cert, d);
        const bg = d.background || SHEETS.professional;
        const voided = cert.status && cert.status !== 'Valid' ? `<div class="ncert__void">${esc(cert.status)}</div>` : '';
        return `<div class="ncert">
  <img class="ncert__bg" src="${esc(bg)}" alt="" crossorigin="anonymous">
  <div class="ncert__title">${esc(d.titleEn || 'CERTIFICATE')}</div>
  <div class="ncert__subtitle">${esc(d.subtitleEn || 'Professional Accreditation')}</div>
  <div class="ncert__number">certificate NU :&nbsp; ${esc(cert.cert_num)}</div>
  <p class="ncert__en" dir="ltr">${p.en}</p>
  <p class="ncert__ar" dir="rtl">${p.ar}</p>
  <div class="ncert__date">${longDate(cert.issue_date)}</div>
  ${voided}
</div>`;
    }

    const api = { sheet, paragraphs, longDate, SHEETS, DOC_TYPES, LAYOUT: 'nibras' };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.NibrasCertificate = api;
}(typeof window !== 'undefined' ? window : null));
