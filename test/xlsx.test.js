const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const X = require('../lib/xlsx');

// Reads the files back out of the ZIP, to check the writer without any library
function unzip(buf) {
    const files = {};
    let p = 0;
    while (buf.readUInt32LE(p) === 0x04034b50) {
        const size = buf.readUInt32LE(p + 18);
        const nameLen = buf.readUInt16LE(p + 26);
        const extra = buf.readUInt16LE(p + 28);
        const name = buf.slice(p + 30, p + 30 + nameLen).toString('utf8');
        const data = buf.slice(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
        const raw = zlib.inflateRawSync(data);
        files[name] = { text: raw.toString('utf8'), crc: buf.readUInt32LE(p + 14), raw };
        p += 30 + nameLen + extra + size;
    }
    return files;
}

test('column names', () => {
    assert.equal(X.colName(0), 'A');
    assert.equal(X.colName(25), 'Z');
    assert.equal(X.colName(26), 'AA');
    assert.equal(X.colName(701), 'ZZ');
});

test('crc32 matches the standard check value', () => {
    assert.equal(X.crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('a workbook is a valid zip with the expected parts and data', () => {
    const buf = X.buildXlsx({
        sheetName: 'تقرير/العملاء',
        title: 'تقرير العملاء',
        rtl: true,
        columns: [{ key: 'no', label: 'رقم' }, { key: 'name', label: 'الاسم' }, { key: 'amount', label: 'المبلغ', type: 'money' }, { key: 'at', label: 'التاريخ', type: 'date' }],
        rows: [{ no: 'NB-000001', name: 'سارة & <علي>', amount: 1500.5, at: '2026-11-10T00:00:00Z' }, { no: 'NB-000002', name: '=HYPERLINK("http://x")', amount: 0 }]
    });
    assert.equal(buf.readUInt32LE(0), 0x04034b50);
    const files = unzip(buf);
    assert.deepEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
    for (const f of Object.values(files)) assert.equal(f.crc, X.crc32(f.raw));
    const sheet = files['xl/worksheets/sheet1.xml'].text;
    assert.match(sheet, /rightToLeft="1"/);
    assert.match(sheet, /سارة &amp; &lt;علي&gt;/);
    assert.match(sheet, /<v>1500.5<\/v>/);
    assert.match(sheet, new RegExp(`<v>${X.excelDate(new Date('2026-11-10T00:00:00Z'))}</v>`));
    assert.match(sheet, /'=HYPERLINK/, 'formulas are written as text');
    assert.match(files['xl/workbook.xml'].text, /name="تقرير العملاء"/);
});
