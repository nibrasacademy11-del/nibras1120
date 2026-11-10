const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const P = require('../lib/permissions');
const { customerAccess, serializeCustomer, basicCard, partialName } = require('../lib/customerAccess');
const data = require('../lib/customerData');
const storage = require('../lib/storage');
const fc = require('../lib/fieldCrypto');

const emp = { id: 'e1', teamIds: [] };
const other = { id: 'e2', teamIds: [] };
const leader = { id: 'tl', teamIds: ['t1'] };
const customer = {
    _id: 'c1', customerNo: 'NB-000001', nameAr: 'محمد أحمد فتحي', nameEn: 'Mohamed', owner: { _id: 'e1', name: 'Sara' }, team: { _id: 't1', nameAr: 'فريق 1' },
    status: 'customer', country: 'Egypt', source: 'website', tags: ['vip'],
    contact: { phone: '01112220796', email: 'm@x.com' },
    identity: { nationality: 'EG', nationalIdLast4: '4567', nationalIdEnc: 'v1.secret', passportLast4: '' }
};

const grants = (role) => P.effectiveGrants(role);

test('the owner sees the whole file but not the full identity number', () => {
    const a = customerAccess({ actor: emp, grants: grants('employee'), customer });
    assert.equal(a.level, 'full');
    assert.deepEqual(a.sections, { contact: true, identity: true, financial: true, documents: true, notes: true });
    assert.equal(a.canRevealIdentity, false);
    assert.equal(a.canEdit, true);
    assert.equal(a.canManage, false);
    const out = serializeCustomer(customer, a);
    assert.equal(out.contact.phone, '01112220796');
    assert.equal(out.identity.nationalId, '••••••••••4567');
    assert.ok(!JSON.stringify(out).includes('v1.secret'));
});

test('another employee only gets the basic card', () => {
    const a = customerAccess({ actor: other, grants: grants('employee'), customer });
    assert.equal(a.level, 'basic');
    assert.equal(a.canLookup, true);
    assert.equal(Object.values(a.sections).some(Boolean), false);
    const out = serializeCustomer(customer, a, { namePolicy: 'partial', programs: ['PMP'] });
    assert.equal(out.name, 'محمد أ.');
    assert.equal(out.owner.name, 'Sara');
    assert.deepEqual(out.programs, ['PMP']);
    for (const k of ['contact', 'identity', 'nameAr', 'tags', 'source', 'country']) assert.equal(out[k], undefined, k);
});

test('an approved request opens only the requested sections', () => {
    const a = customerAccess({ actor: other, grants: grants('employee'), customer, approvedSections: ['contact'] });
    assert.equal(a.level, 'granted');
    assert.equal(a.sections.contact, true);
    assert.equal(a.sections.identity, false);
    assert.equal(a.sections.notes, false);
    assert.equal(a.canEdit, false);
    const out = serializeCustomer(customer, a);
    assert.equal(out.contact.email, 'm@x.com');
    assert.equal(out.identity, undefined);
    assert.equal(out.nameAr, customer.nameAr);
    const withId = customerAccess({ actor: other, grants: grants('employee'), customer, approvedSections: ['identity'] });
    assert.equal(withId.canRevealIdentity, true);
});

test('team leader sees the team file and can transfer it; admin reveals identity', () => {
    const tl = customerAccess({ actor: leader, grants: grants('team_leader'), customer });
    assert.equal(tl.level, 'full');
    assert.equal(tl.canManage, true);
    const outsider = customerAccess({ actor: leader, grants: grants('team_leader'), customer: { ...customer, team: { _id: 't9' } } });
    assert.equal(outsider.level, 'basic');
    const admin = customerAccess({ actor: { id: 'a', teamIds: [] }, grants: grants('admin'), customer });
    assert.equal(admin.canRevealIdentity, true);
    assert.equal(admin.canArchive, true);
});

test('customers and roles without lookup see nothing', () => {
    const a = customerAccess({ actor: { id: 'x', teamIds: [] }, grants: grants('customer'), customer });
    assert.equal(a.level, 'basic');
    assert.equal(a.canLookup, false);
    const hr = customerAccess({ actor: { id: 'h', teamIds: [] }, grants: grants('hr_manager'), customer });
    assert.equal(hr.inFile, false);
});

test('full name policy shows the whole name on the card', () => {
    const a = customerAccess({ actor: other, grants: grants('employee'), customer });
    assert.equal(basicCard(customer, a, { namePolicy: 'full' }).name, customer.nameAr);
    assert.equal(partialName('Ali'), 'Ali');
    assert.equal(partialName(''), '');
});

test('phones normalise across formats', () => {
    assert.equal(data.normalizePhone('01112220796'), '112220796');
    assert.equal(data.normalizePhone('+20 111 222 0796'), '112220796');
    assert.equal(data.normalizePhone('00201112220796'), '112220796');
    assert.equal(data.normalizePhone('٠١١١٢٢٢٠٧٩٦'), '112220796');
    assert.equal(data.normalizePhone('+966 50 123 4567'), '501234567');
    assert.equal(data.normalizePhone('0501234567'), '501234567');
    assert.equal(data.normalizePhone(''), '');
    assert.equal(data.normalizeEmail(' A@B.Com '), 'a@b.com');
    assert.equal(data.normalizeEmail('nope'), '');
});

test('identity numbers are stored encrypted with a search hash and last 4', () => {
    const f = data.identityFields('national_id', '298 0101 1234567');
    assert.equal(f.nationalIdLast4, '4567');
    assert.equal(fc.decrypt(f.nationalIdEnc), '29801011234567');
    assert.equal(f.nationalIdIdx, fc.blindIndex('29801011234567', 'national_id'));
    assert.deepEqual(data.identityFields('passport', ''), { passportEnc: '', passportIdx: '', passportLast4: '' });
});

test('duplicate keys and explanations', () => {
    const keys = data.duplicateKeys({ phone: '01112220796', email: 'a@b.com', nationalId: '29801011234567' });
    assert.deepEqual(keys.map((k) => k.kind), ['phone', 'email', 'national_id']);
    const q = data.duplicateQuery(keys, 'self');
    assert.equal(q.$or.length, 3);
    assert.deepEqual(q._id, { $ne: 'self' });
    assert.equal(data.duplicateQuery([], null), null);
    const idx = keys[2].value;
    const m = data.explainMatches(keys, [
        { contact: { phoneNorm: '112220796', email: '' }, identity: {} },
        { contact: { phoneNorm: '', email: 'a@b.com' }, identity: { nationalIdIdx: idx } },
        { contact: { phoneNorm: '999' }, identity: {} }
    ]);
    assert.equal(m.length, 2);
    assert.equal(m[0].strong, true);
    assert.deepEqual(m[0].matched.sort(), ['email', 'national_id']);
    assert.deepEqual(m[1].matched, ['phone']);
});

test('merge fills only empty fields and reports conflicts', () => {
    const target = { status: 'lead', tags: ['a'], registeredAt: new Date('2026-05-01'), country: 'Egypt', contact: { phone: '0111', email: '' }, identity: { nationalIdEnc: '' } };
    const source = { status: 'customer', tags: ['b', 'a'], registeredAt: new Date('2025-01-01'), country: 'KSA', contact: { phone: '0122', email: 'x@y.com' }, identity: { nationalIdEnc: 'v1.zz', nationalIdIdx: 'h', nationalIdLast4: '1234' } };
    const { set, conflicts } = data.planMerge(target, source);
    assert.equal(set['contact.email'], 'x@y.com');
    assert.equal(set['identity.nationalIdEnc'], 'v1.zz');
    assert.equal(set['country'], undefined);
    assert.deepEqual(set.tags, ['a', 'b']);
    assert.equal(set.status, 'customer');
    assert.deepEqual(set.registeredAt, new Date('2025-01-01'));
    assert.deepEqual(conflicts.map((c) => c.field).sort(), ['contact.phone', 'country']);
});

test('uploads are checked by content, not by name', () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100)]);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);
    assert.equal(storage.validate(pdf, 'application/pdf'), null);
    assert.equal(storage.validate(png, 'image/png'), null);
    assert.match(storage.validate(png, 'application/pdf'), /does not match/);
    assert.match(storage.validate(Buffer.from('<script>alert(1)</script>'), 'application/pdf'), /Only PDF/);
    assert.match(storage.validate(Buffer.alloc(0)), /empty/);
    assert.match(storage.validate(Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(5 * 1024 * 1024)])), /4MB/);
});
