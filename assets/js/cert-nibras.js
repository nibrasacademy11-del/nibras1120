// The academy's certificate designs (17 Nov 2026): the blank sheets the academy designed, with
// the text laid on them. One file for the website (the customer's download) and the staff portal
// (print and preview), so both always show the same certificate. Plain script:
// window.NibrasCertificate in a browser, require() in Node.
//
//   professional: courses, professional masters and doctorates (A4 landscape, Arabic + English)
//   diploma:      professional diplomas (A4 portrait, English), one sheet for "his", one for "her"
//   transcript:   the grades of a degree (A4 portrait, English), drawn here, with as many rows as needed
//
// Fonts: the academy's sheets use Canva Sans, Siwa and Symphony, which are not free web fonts, so
// the closest free ones stand in (Figtree, Almarai, Pinyon Script) until the font files are added
// to /assets/fonts (cert-nibras.css then uses them first). Roboto and Open Sans are the real ones.

(function (root) {
    const IMG = '/assets/img/certificates/';
    // The sheets the academy designed. A kind without a sheet yet (academic degrees) cannot be
    // issued by hand until its design is added.
    const SHEETS = {
        professional: { male: `${IMG}nibras-professional.jpg`, female: `${IMG}nibras-professional.jpg`, portrait: false },
        diploma: { male: `${IMG}nibras-diploma-m.jpg`, female: `${IMG}nibras-diploma-f.jpg`, portrait: true },
        transcript: { male: '', female: '', portrait: true }
    };
    const DOC_TYPES = {
        course: { ar: 'دورة تدريبية', en: 'Course', sheet: 'professional' },
        master: { ar: 'ماجستير مهني', en: 'Professional Master', sheet: 'professional' },
        phd: { ar: 'دكتوراه مهنية', en: 'Professional Doctorate', sheet: 'professional' },
        diploma: { ar: 'دبلوم مهني', en: 'Professional Diploma', sheet: 'diploma' },
        degree: { ar: 'كشف درجات', en: 'Academic Transcript', sheet: 'transcript' }
    };
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const trimDot = (s) => String(s || '').trim().replace(/[.،,]+$/, '');
    const hoursOf = (cert) => (Number(cert.hours) > 0 ? Number(cert.hours) : 0);

    // Which designed sheet a certificate is printed on (an unknown kind prints as a course)
    function sheetOf(design, cert) {
        const d = design || {};
        const type = DOC_TYPES[d.docType || (cert && cert.docType)] || DOC_TYPES.course;
        const key = type.sheet || 'professional';
        return { key, ...SHEETS[key] };
    }

    // 2026-11-02 -> "2 November , 2026" (as on the academy's sheet)
    function longDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        if (!m) return esc(iso);
        return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} , ${m[1]}`;
    }

    // The two paragraphs of the professional sheet. Bold: the name, the program and the hours.
    function paragraphs(cert, d) {
        const female = d.gender === 'female';
        const nameAr = trimDot(cert.trainee_name);
        const nameEn = trimDot(cert.nameEn || cert.trainee_name);
        const subjectAr = trimDot(d.subjectAr || cert.program_name);
        const subjectEn = trimDot(d.subjectEn || cert.programNameEn || cert.program_name);
        const hours = hoursOf(cert);
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

    // The name a saved certificate gets: the trainee, the kind and the program,
    // e.g. "فوزيه عبدالله - دورة تدريبية - دورة إدارة الموارد البشرية"
    function fileName(cert, design) {
        const d = design || {};
        const type = DOC_TYPES[d.docType || cert.docType];
        const parts = [trimDot(cert.trainee_name), type ? type.ar : cert.program_type, trimDot(d.subjectAr || cert.program_name)];
        const name = parts.filter(Boolean).filter((p, i, a) => a.indexOf(p) === i).join(' - ');
        // characters a file name cannot hold (\ / : * ? " < > | and control characters)
        const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
        return safe || `Nibras-certificate-${cert.cert_num}`;
    }

    // A grade from a percentage, when none is written: A+ 97+, A 90+, B+ 85+, B 80+, C+ 75+, C 70+, D 60+, F
    function gradeOf(percent) {
        const p = Number(percent);
        if (!Number.isFinite(p) || String(percent).trim() === '') return '';
        return p >= 97 ? 'A+' : p >= 90 ? 'A' : p >= 85 ? 'B+' : p >= 80 ? 'B' : p >= 75 ? 'C+' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F';
    }
    const monthYear = (iso) => {
        const m = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
        return m ? `${MONTHS[Number(m[2]) - 1]}, ${m[1]}` : esc(iso);
    };

    const qrTag = (opts, extra = '') => (opts.qr ? `<img class="ncert__qr${extra}" src="${esc(opts.qr)}" alt="QR">` : '');
    const voidTag = (cert) => (cert.status && cert.status !== 'Valid' ? `<div class="ncert__void">${esc(cert.status)}</div>` : '');

    // A4 landscape: courses, masters, doctorates
    function professional(cert, d, opts, bg) {
        const p = paragraphs(cert, d);
        return `<div class="ncert">
  <img class="ncert__bg" src="${esc(bg)}" alt="" crossorigin="anonymous">
  ${qrTag(opts)}
  <div class="ncert__title">${esc(d.titleEn || 'CERTIFICATE')}</div>
  <div class="ncert__subtitle">${esc(d.subtitleEn || 'Professional Accreditation')}</div>
  <div class="ncert__number">certificate NU :&nbsp; ${esc(cert.cert_num)}</div>
  <p class="ncert__en" dir="ltr">${p.en}</p>
  <p class="ncert__ar" dir="rtl">${p.ar}</p>
  <div class="ncert__date">${longDate(cert.issue_date)}</div>
  ${voidTag(cert)}
</div>`;
    }

    // A4 portrait: diplomas. The sheet already says "his"/"her"; the name, the diploma, the serial
    // number and the hours are written on it.
    function diploma(cert, d, opts, bg) {
        const hours = hoursOf(cert);
        const subject = trimDot(d.subjectEn || cert.programNameEn || cert.program_name);
        const name = trimDot(cert.nameEn || cert.trainee_name);
        // a long name gets smaller so it stays on the line (about 28 letters fit at full size)
        const nameSize = name.length > 28 ? ` style="font-size:${Math.max(8, 13 * 28 / name.length).toFixed(2)}mm"` : '';
        const subjectSize = subject.length > 46 ? ` style="font-size:${Math.max(3.2, 4.55 * 46 / subject.length).toFixed(2)}mm"` : '';
        return `<div class="ncert ncert--portrait">
  <img class="ncert__bg" src="${esc(bg)}" alt="" crossorigin="anonymous">
  ${qrTag(opts, ' ncert__qr--diploma')}
  <div class="ndip__name" dir="ltr"${nameSize}>${esc(name)}</div>
  <div class="ndip__subject" dir="ltr"${subjectSize}>${esc(subject)}</div>
  <div class="ndip__serial" dir="ltr">SERIAL NUMBER : ${esc(cert.cert_num)}</div>
  ${hours ? `<div class="ndip__hours" dir="ltr">CREDIT HOURS : ${hours} HOUR</div>` : ''}
  ${voidTag(cert)}
</div>`;
    }

    // A4 portrait: the grades of a degree (an academic transcript). Everything is drawn here: the
    // frame, the logo, the details, one row per module (as many as there are; more rows, smaller
    // rows), the date and the statement.
    function transcript(cert, d, opts) {
        const t = d.transcript || {};
        const female = d.gender === 'female';
        const rows = Array.isArray(t.rows) ? t.rows : [];
        // the table has about 120 mm: up to 6 rows keep the sample's height, more rows share it
        const rowMm = Math.max(6.8, Math.min(16.7, (rows.length > 6 ? 104 : 112) / Math.max(rows.length, 1)));
        const textMm = rowMm < 10 ? 3.7 : 4.5;
        const program = trimDot(t.programEn || d.subjectEn || cert.programNameEn || cert.program_name);
        const body = rows.map((r) => {
            const pct = r.percentage === '' || r.percentage == null ? '' : `${esc(r.percentage)}%`;
            return `<tr style="height:${rowMm.toFixed(2)}mm"><td>${esc(r.module)}</td><td class="ntr__num">${pct}</td><td class="ntr__num">${esc(r.grade || gradeOf(r.percentage))}</td></tr>`;
        }).join('');
        return `<div class="ncert ncert--portrait ntr" style="--ntr-text:${textMm}mm">
  <div class="ntr__frame"></div>
  <img class="ntr__mark" src="/assets/img/logo.png" alt="" crossorigin="anonymous">
  ${qrTag(opts, ' ncert__qr--transcript')}
  <div class="ntr__page">
    <img class="ntr__logo" src="/assets/img/logo.png" alt="" crossorigin="anonymous">
    <dl class="ntr__facts" dir="ltr">
      <div><dt>Name:</dt><dd>${esc(trimDot(cert.nameEn || cert.trainee_name))}</dd></div>
      <div><dt>Specialization :</dt><dd>${esc(t.specialization || '')}</dd></div>
      <div><dt>Degree :</dt><dd>${esc(t.degree || '')}</dd></div>
    </dl>
    <table class="ntr__table" dir="ltr">
      <thead><tr><th>Module Name</th><th>Percentage</th><th>Grade</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="ntr__date" dir="ltr"><b>Date:</b> ${monthYear(cert.issue_date)}</div>
    <div class="ntr__text" dir="ltr">
      <p>This is to certify that the student has attended the following Courses as per the below details :</p>
      <p>${female ? 'She' : 'He'} was admitted as a full-time student to the <b>(${esc(program)})</b> in the year ${esc(t.admittedYear || '')}.<br>
      With enrollment no. <b>${esc(cert.cert_num)}</b>, and the degree was conferred in the year ${esc(t.conferredYear || '')}. ${female ? 'Her' : 'His'} certificate has been issued upon the student's request to be presented to whomever it may concern.</p>
    </div>
    <div class="ntr__site" dir="ltr"><span class="ntr__globe" aria-hidden="true"></span>www.nibras-ac.com</div>
  </div>
  ${voidTag(cert)}
</div>`;
    }

    // The whole sheet as HTML. opts.qr: an image (data URL) of the QR code that opens the
    // website's verification with this certificate's number.
    function sheet(cert, design, opts = {}) {
        const d = design || {};
        const s = sheetOf(d, cert);
        const bg = s[d.gender === 'female' ? 'female' : 'male'];
        if (s.key === 'transcript') return transcript(cert, d, opts);
        return s.key === 'diploma' ? diploma(cert, d, opts, bg) : professional(cert, d, opts, d.background || bg);
    }

    // The page of the website that verifies a certificate by its number (what the QR code opens)
    const verifyUrl = (num, lang = 'ar', site = 'https://www.nibras-ac.com') => `${site}/pages/${lang}/verify.html?code=${encodeURIComponent(num)}`;
    const isPortrait = (design, cert) => !!sheetOf(design, cert).portrait;
    // the QR code's colour: the academy's wine on the landscape sheet, a deep gold-brown on the diploma
    const qrColor = (design, cert) => (sheetOf(design, cert).key === 'diploma' ? '#6b4e1f' : '#5a0f1b');

    const api = { sheet, sheetOf, isPortrait, qrColor, gradeOf, monthYear, paragraphs, fileName, verifyUrl, longDate, SHEETS, DOC_TYPES, LAYOUT: 'nibras' };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.NibrasCertificate = api;
}(typeof window !== 'undefined' ? window : null));
