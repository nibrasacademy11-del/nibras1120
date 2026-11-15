const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { EJSON, ObjectId } = require('bson');
const { encrypt } = require('../tools/backup-now');
const { decrypt, parse } = require('../tools/restore-backup');

test('a backup decrypts with its passphrase only, and keeps types', () => {
    const id = new ObjectId();
    const lines = [JSON.stringify({ meta: { db: 'x', at: 'now', counts: { users: 1 } } }), EJSON.stringify({ c: 'users', d: { _id: id, at: new Date('2026-01-01'), n: 1.5 } }, { relaxed: false })];
    const file = encrypt(zlib.gzipSync(Buffer.from(lines.join('\n'))), 'correct horse battery');
    const out = parse(file, 'correct horse battery');
    assert.deepEqual(out.meta.counts, { users: 1 });
    assert.ok(out.docs[0].d._id.equals(id));
    assert.ok(out.docs[0].d.at instanceof Date);
    assert.throws(() => decrypt(file, 'wrong passphrase'));
    const tampered = Buffer.from(file);
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => decrypt(tampered, 'correct horse battery'));
    assert.throws(() => decrypt(Buffer.from('nonsense'), 'x'), /Not a Nibras backup/);
});
