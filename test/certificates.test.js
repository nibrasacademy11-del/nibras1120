const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const D = require('../lib/certificateDesign');
const Certificate = require('../models/Certificate');

test('placeholders are filled, unknown ones are left alone', () => {
    assert.equal(D.fill('{name} — {program} {unknown}', { name: 'سارة', program: 'PMP' }), 'سارة — PMP {unknown}');
    assert.equal(D.fill('', {}), '');
});

test('design falls back to defaults and English names to Arabic ones', () => {
    const d = D.buildDesign(null, { kind: 'module', name: 'سارة علي', program: 'دبلوم', module: 'المحور 1', date: '2026-11-10', number: 'NC-0000001', hours: 12 });
    assert.match(d.bodyAr, /المحور 1/);
    assert.match(d.bodyEn, /المحور 1/, 'missing English module name falls back to Arabic');
    assert.equal(d.showHours, true);
    assert.equal(d.primaryColor, '#5a020e');
    const p = D.buildDesign({ name: 'Gold', titleAr: 'شهادة {program}', showHours: true }, { kind: 'program', name: 'x', program: 'دبلوم', hours: 0 });
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
