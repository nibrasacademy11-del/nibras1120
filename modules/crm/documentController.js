const CustomerDocument = require('../../models/CustomerDocument');
const audit = require('../../lib/audit');
const storage = require('../../lib/storage');
const { HttpError, assertVersion } = require('../../lib/http');
const { addEvent } = require('./service');
const { _loadCustomer: loadCustomer } = require('./customerController');

// Customer documents. Each upload is a new version; older versions stay downloadable.

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cleanName = (name) => String(name || 'file').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 150);

function summary(doc) {
    const o = doc.toObject ? doc.toObject() : doc;
    const current = o.versions[o.versions.length - 1];
    return { ...o, current, versions: o.versions.map(({ storageKey, ...v }) => v) };
}

exports.list = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    if (!access.sections.documents) throw new HttpError(403, 'Forbidden.');
    const docs = await CustomerDocument.find({ customer: customer._id, archived: req.query.archived === 'true' }).populate('versions.uploadedBy', 'name').sort({ updatedAt: -1 });
    res.json({ items: docs.map(summary) });
};

async function checkUpload(req) {
    if (!req.file) throw new HttpError(400, 'اختر ملفاً. / Choose a file.');
    const problem = storage.validate(req.file.buffer, req.file.mimetype);
    if (problem) throw new HttpError(400, problem);
}

exports.upload = async (req, res) => {
    const { customer, access } = await loadCustomer(req, req.params.id, { minLevel: 'file' });
    if (!access.sections.documents || !access.canEditSection.documents) throw new HttpError(403, 'Forbidden.');
    await checkUpload(req);
    const title = str(req.body.title) || cleanName(req.file.originalname);
    const stored = await storage.put(req.file.buffer);
    const doc = await CustomerDocument.create({
        customer: customer._id,
        title,
        category: CustomerDocument.CATEGORIES.includes(req.body.category) ? req.body.category : 'other',
        visibleToCustomer: req.body.visibleToCustomer === 'true',
        createdBy: req.user.id,
        versions: [{ version: 1, storageKey: stored.key, filename: cleanName(req.file.originalname), mimetype: stored.mimetype, size: stored.size, sha256: stored.sha256, uploadedBy: req.user.id, note: str(req.body.note, 300) }]
    });
    await addEvent(req, customer._id, 'document', `Document added: ${title}`, { section: 'documents' });
    await audit.record(req, { action: 'document.uploaded', resource: 'customer_documents', resourceId: doc._id, summary: `${customer.customerNo}: ${title}` });
    res.status(201).json({ item: summary(doc) });
};

exports.addVersion = async (req, res) => {
    const doc = await CustomerDocument.findById(req.params.docId);
    if (!doc) throw new HttpError(404, 'Not found.');
    const { customer, access } = await loadCustomer(req, doc.customer, { minLevel: 'file' });
    if (!access.sections.documents || !access.canEditSection.documents) throw new HttpError(403, 'Forbidden.');
    assertVersion(doc, req.body.__v);
    await checkUpload(req);
    const stored = await storage.put(req.file.buffer);
    const version = doc.versions.length + 1;
    doc.versions.push({ version, storageKey: stored.key, filename: cleanName(req.file.originalname), mimetype: stored.mimetype, size: stored.size, sha256: stored.sha256, uploadedBy: req.user.id, note: str(req.body.note, 300) });
    await doc.save();
    await addEvent(req, customer._id, 'document', `New version ${version} of ${doc.title}`, { section: 'documents' });
    await audit.record(req, { action: 'document.version_added', resource: 'customer_documents', resourceId: doc._id, summary: `${doc.title} v${version}` });
    res.json({ item: summary(doc) });
};

exports.update = async (req, res) => {
    const doc = await CustomerDocument.findById(req.params.docId);
    if (!doc) throw new HttpError(404, 'Not found.');
    const { access } = await loadCustomer(req, doc.customer, { minLevel: 'file' });
    if (!access.canEditSection.documents) throw new HttpError(403, 'Forbidden.');
    assertVersion(doc, req.body.__v);
    if (req.body.title !== undefined) doc.title = str(req.body.title) || doc.title;
    if (CustomerDocument.CATEGORIES.includes(req.body.category)) doc.category = req.body.category;
    if (req.body.visibleToCustomer !== undefined) doc.visibleToCustomer = req.body.visibleToCustomer === true;
    if (req.body.archived !== undefined) {
        doc.archived = req.body.archived === true;
        await audit.record(req, { action: doc.archived ? 'document.archived' : 'document.restored', resource: 'customer_documents', resourceId: doc._id, summary: doc.title, reason: str(req.body.reason, 300) });
    }
    await doc.save();
    res.json({ item: summary(doc) });
};

exports.download = async (req, res) => {
    const doc = await CustomerDocument.findById(req.params.docId);
    if (!doc) throw new HttpError(404, 'Not found.');
    const { access } = await loadCustomer(req, doc.customer, { minLevel: 'file' });
    if (!access.sections.documents) throw new HttpError(404, 'Not found.');
    const n = parseInt(req.params.version, 10) || doc.versions.length;
    const v = doc.versions.find((x) => x.version === n);
    if (!v) throw new HttpError(404, 'Not found.');
    const file = await storage.get(v.storageKey);
    if (!file) throw new HttpError(404, 'Not found.');
    await audit.record(req, { action: 'document.downloaded', resource: 'customer_documents', resourceId: doc._id, summary: `${doc.title} v${n}` });
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(v.filename)}`);
    res.send(file.data);
};
