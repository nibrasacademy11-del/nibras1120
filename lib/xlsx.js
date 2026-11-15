const zlib = require('zlib');

// A small .xlsx writer: one sheet, a bold header row, numbers as numbers, dates as dates,
// right-to-left for Arabic. No dependency: the file is a ZIP of a few XML parts.

const esc = (s) => String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colName(i) {
    let s = '';
    let n = i + 1;
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

// Excel stores dates as days since 1899-12-30
const excelDate = (d) => (d.getTime() / 86400000) + 25569;

// A cell that looks like a formula is written as text, so an exported name like "=HYPERLINK(...)"
// can never run when the file is opened
const safeText = (v) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

function cell(ref, value, style) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${value}</v></c>`;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return `<c r="${ref}" s="2"><v>${excelDate(value)}</v></c>`;
    if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(safeText(String(value)))}</t></is></c>`;
}

function sheetXml({ columns, rows, rtl, title }) {
    const widths = columns.map((c) => `<col min="${columns.indexOf(c) + 1}" max="${columns.indexOf(c) + 1}" width="${c.width || Math.min(Math.max(String(c.label).length + 4, 12), 50)}" customWidth="1"/>`).join('');
    const lines = [];
    let r = 1;
    if (title) {
        lines.push(`<row r="${r}">${cell(`A${r}`, title, 3)}</row>`);
        r += 2;
    }
    const headerRow = r;
    lines.push(`<row r="${r}">${columns.map((c, i) => cell(`${colName(i)}${r}`, c.label, 1)).join('')}</row>`);
    for (const row of rows) {
        r += 1;
        lines.push(`<row r="${r}">${columns.map((c, i) => {
            let v = row[c.key];
            if (c.type === 'date' && v && !(v instanceof Date)) v = new Date(v);
            return cell(`${colName(i)}${r}`, v, c.type === 'money' ? 4 : undefined);
        }).join('')}</row>`);
    }
    const lastRef = `${colName(Math.max(columns.length - 1, 0))}${r}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths}</cols>
<sheetData>${lines.join('')}</sheetData>
<autoFilter ref="A${headerRow}:${lastRef}"/>
</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF5A020E"/><name val="Arial"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5A020E"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;

function parts({ sheetName = 'Report', ...sheet }) {
    const name = esc(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report');
    return {
        '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
        '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView${sheet.rtl ? ' rightToLeft="1"' : ''}/></bookViews><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        'xl/styles.xml': STYLES,
        'xl/worksheets/sheet1.xml': sheetXml(sheet)
    };
}

// ---- ZIP ----

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const [name, content] of Object.entries(files)) {
        const nameBuf = Buffer.from(name, 'utf8');
        const data = Buffer.from(content, 'utf8');
        const deflated = zlib.deflateRawSync(data);
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);      // UTF-8 names
        local.writeUInt16LE(8, 8);           // deflate
        local.writeUInt32LE(0, 10);          // time/date
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(deflated.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, nameBuf, deflated);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt32LE(0, 12);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(deflated.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBuf);
        offset += 30 + nameBuf.length + deflated.length;
    }
    const centralSize = centrals.reduce((a, b) => a + b.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(files).length, 8);
    end.writeUInt16LE(Object.keys(files).length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, ...centrals, end]);
}

// columns: [{ key, label, type: 'text'|'number'|'money'|'date' }], rows: [{ key: value }]
function buildXlsx(sheet) {
    return zip(parts(sheet));
}

module.exports = { buildXlsx, colName, crc32, excelDate, _parts: parts };
