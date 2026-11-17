const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const D = require('../lib/certificateDesign');
const Certificate = require('../models/Certificate');

test('placeholders are filled, unknown ones are left alone', () => {
    assert.equal(D.fill('{name} — {program} {unknown}', { name: 'سارة', program: 'PMP' }), 'سارة — PMP {unknown}');
    assert.equal(D.fill('', {}), '');
});

test('the classic design falls back to defaults and English names to Arabic ones', () => {
    const d = D.buildDesign({ layout: 'classic' }, { kind: 'module', name: 'سارة علي', program: 'دبلوم', module: 'المحور 1', date: '2026-11-10', number: 'NC-0000001', hours: 12 });
    assert.match(d.bodyAr, /المحور 1/);
    assert.match(d.bodyEn, /المحور 1/, 'missing English module name falls back to Arabic');
    assert.equal(d.showHours, true);
    assert.equal(d.primaryColor, '#5a020e');
    const p = D.buildDesign({ name: 'Gold', layout: 'classic', titleAr: 'شهادة {program}', showHours: true }, { kind: 'program', name: 'x', program: 'دبلوم', hours: 0 });
    assert.equal(p.titleAr, 'شهادة دبلوم');
    assert.equal(p.showHours, false, 'no hours line when there are no hours');
    assert.match(p.bodyAr, /جميع متطلبات/);
});

test('reissued numbers carry the version', () => {
    assert.equal(D.versionedNumber('NC-0000007', 1), 'NC-0000007');
    assert.equal(D.versionedNumber('NC-0000007', 3), 'NC-0000007-3');
});

test('the public view hides ids, the design and PDFs of invalid certificates', () => {
    const v = D.publicView({ _id: 'x', cert_num: 'NC-1', trainee_name: 'A', program_name: 'P', status: 'Cancelled', pdf_url: '/api/x', customer: 'c', design: { a: 1 }, accreditations: [{ nameAr: 'X', logo: 'l', _id: 'q' }] });
    assert.equal(v.pdf_url, null);
    assert.equal(v.customer, undefined);
    assert.equal(v.design, undefined);
    assert.deepEqual(Object.keys(v.accreditations[0]).sort(), ['body', 'nameAr', 'nameEn', 'number']);
    assert.equal(D.publicView({ cert_num: 'NC-2', status: 'Valid', pdf_url: '/api/y' }).pdf_url, '/api/y');
});

test('certificates cannot be deleted, and issued ones cannot be edited', async () => {
    await assert.rejects(Certificate.deleteOne({ _id: new mongoose.Types.ObjectId() }), /cannot be deleted/);
    const issued = Certificate.hydrate({ _id: new mongoose.Types.ObjectId(), cert_num: 'NC-9', trainee_name: 'A', program_name: 'P', issue_date: '2026-01-01', kind: 'module', status: 'Valid' });
    issued.trainee_name = 'B';
    await assert.rejects(issued.$__schema.s.hooks.execPre('save', issued, []), /cannot be edited/);
    const legacy = Certificate.hydrate({ _id: new mongoose.Types.ObjectId(), cert_num: 'L-1', trainee_name: 'A', program_name: 'P', issue_date: '2026-01-01', kind: 'legacy', status: 'Valid' });
    legacy.trainee_name = 'B';
    await legacy.$__schema.s.hooks.execPre('save', legacy, []);
});

test('the academy design (17 Nov 2026) is the default, with the gender and the subject', () => {
    const d = D.buildDesign(null, { kind: 'program', name: 'فوزيه', program: 'دورة إدارة الموارد البشرية', programEn: 'Human Resources Management Course', docType: 'course', gender: 'female', hours: 60 });
    assert.equal(d.layout, 'nibras');
    assert.equal(d.subjectEn, 'Human Resources Management Course');
    assert.equal(require('../assets/js/cert-nibras').sheetOf(d).key, 'professional');
    const m = D.buildDesign(undefined, { kind: 'module', program: 'ماجستير', programEn: 'Master', module: 'محور', moduleEn: 'Unit', docType: 'nope' });
    assert.equal(m.docType, 'course', 'an unknown kind prints as a course');
    assert.equal(m.gender, 'male');
    assert.equal(m.subjectAr, 'محور ضمن ماجستير');
});

test('the academy sheet writes the sample text, escapes names and drops missing hours', () => {
    const N = require('../assets/js/cert-nibras');
    const cert = { cert_num: 'MT-B2589', trainee_name: 'فوزيه عبدالله جده حكمي', nameEn: 'Fawziah <b>Hakami</b>', hours: 60, issue_date: '2026-11-02', status: 'Valid' };
    const html = N.sheet(cert, { gender: 'female', subjectAr: 'دورة إدارة الموارد البشرية', subjectEn: 'Human Resources Management Course' });
    assert.match(html, /certificate NU :&nbsp; MT-B2589/);
    assert.match(html, /بأن المتدربة/);
    assert.match(html, /قد أتمت بنجاح/);
    assert.match(html, /بإجمالي 60 ساعة تدريبية/);
    assert.ok(html.includes('with a total of <b>60 training hours</b>'));
    assert.match(html, /2 November , 2026/);
    assert.ok(html.includes('Fawziah &lt;b&gt;Hakami&lt;/b&gt;'), 'names are escaped');
    const male = N.paragraphs({ ...cert, hours: 0 }, { gender: 'male', subjectAr: 'x', subjectEn: 'y' });
    assert.match(male.ar, /بأن المتدرب<br>/);
    assert.doesNotMatch(male.ar, /ساعة/);
    assert.doesNotMatch(male.en, /training hours/);
});

test('the academy sheet carries the verification QR code, and the file is named after the trainee', () => {
    const N = require('../assets/js/cert-nibras');
    const cert = { cert_num: 'MT-B2589', trainee_name: 'فوزيه عبدالله.', program_name: 'x', issue_date: '2026-11-02', status: 'Valid' };
    assert.match(N.sheet(cert, {}, { qr: 'data:image/png;base64,AAA' }), /<img class="ncert__qr" src="data:image\/png;base64,AAA"/);
    assert.doesNotMatch(N.sheet(cert, {}), /ncert__qr/);
    assert.equal(N.verifyUrl('MT-B2589'), 'https://www.nibras-ac.com/pages/ar/verify.html?code=MT-B2589');
    assert.equal(N.fileName(cert, { docType: 'phd', subjectAr: 'دكتوراه/القيادة' }), 'فوزيه عبدالله - دكتوراه مهنية - دكتوراه القيادة');
});

test('a diploma prints on the portrait sheet for his or her, with the name, the diploma, the serial and the hours', () => {
    const N = require('../assets/js/cert-nibras');
    const cert = { cert_num: 'MT-M2511', trainee_name: 'لما', nameEn: 'Lama Yahya Tawfiq Bilbeisi', hours: 60, status: 'Valid' };
    const her = N.sheet(cert, { docType: 'diploma', gender: 'female', subjectEn: 'Diploma in Strategic Planning' }, { qr: 'q.png' });
    assert.match(her, /ncert--portrait/);
    assert.match(her, /nibras-diploma-f\.jpg/);
    assert.match(her, /Lama Yahya Tawfiq Bilbeisi/);
    assert.match(her, /Diploma in Strategic Planning/);
    assert.match(her, /SERIAL NUMBER : MT-M2511/);
    assert.match(her, /CREDIT HOURS : 60 HOUR/);
    assert.match(her, /ncert__qr ncert__qr--diploma/);
    const his = N.sheet({ ...cert, hours: 0 }, { docType: 'diploma', gender: 'male' });
    assert.match(his, /nibras-diploma-m\.jpg/);
    assert.doesNotMatch(his, /CREDIT HOURS/);
    assert.equal(N.isPortrait({ docType: 'diploma' }), true);
    assert.equal(N.fileName({ trainee_name: 'Sss / x' }, { docType: 'diploma', subjectAr: 'دبلوم التخطيط' }), 'Sss x - دبلوم مهني - دبلوم التخطيط');
});
