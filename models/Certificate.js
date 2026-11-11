const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Certificates. "legacy" ones were entered by hand with an uploaded PDF before the management system;
// "module" and "program" ones are issued from an enrollment and rendered from a template snapshot.
// The public fields (cert_num, trainee_name, program_name, program_type, field, issue_date, status)
// keep the same meaning for both, so the verify page and old links keep working.
const STATUSES = ['Valid', 'Suspended', 'Cancelled', 'Expired', 'Replaced'];

const certificateSchema = new mongoose.Schema({
    cert_num: { type: String, required: true, unique: true, index: true },
    trainee_name: { type: String, required: true },
    program_name: { type: String, required: true },
    program_type: { type: String, default: 'برنامج مهني' },
    field: { type: String, default: '' },
    issue_date: { type: String, required: true },
    status: { type: String, enum: STATUSES, default: 'Valid' },
    pdf_url: { type: String, default: null },
    pdf_data: { type: Buffer, default: null },
    pdf_mimetype: { type: String, default: 'application/pdf' },
    userId: { type: ObjectId, ref: 'User', default: null },

    // ---- management system ----
    kind: { type: String, enum: ['legacy', 'module', 'program'], default: 'legacy', index: true },
    customer: { type: ObjectId, ref: 'Customer', default: null, index: true },
    enrollment: { type: ObjectId, ref: 'Enrollment', default: null, index: true },
    module: { type: ObjectId, ref: 'ProgramModule', default: null },
    program: { type: ObjectId, ref: 'Course', default: null, index: true },
    owner: { type: ObjectId, ref: 'User', default: null, index: true },   // for permission scopes
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    nameEn: { type: String, default: '' },
    programNameEn: { type: String, default: '' },
    moduleName: { type: String, default: '' },
    moduleNameEn: { type: String, default: '' },
    hours: { type: Number, default: 0 },
    issuedAt: { type: Date, default: null },
    issuedBy: { type: ObjectId, ref: 'User', default: null },
    template: { type: ObjectId, ref: 'CertificateTemplate', default: null },
    // The design as it was when issued; later template edits never change an issued certificate
    design: { type: mongoose.Schema.Types.Mixed, default: undefined },
    accreditations: [{ _id: false, nameAr: String, nameEn: String, body: String, number: String, logo: String }],
    version: { type: Number, default: 1 },
    replaces: { type: ObjectId, ref: 'Certificate', default: null },
    replacedBy: { type: ObjectId, ref: 'Certificate', default: null },
    statusReason: { type: String, default: '' },
    statusHistory: [{ _id: false, status: String, reason: String, by: { type: ObjectId, ref: 'User' }, byName: String, at: Date }],
    // Getting the certificate to the customer: by email and in the portal, and the paper copy
    delivery: {
        emailedAt: { type: Date, default: null },
        emailedTo: { type: String, default: '' },
        emailCount: { type: Number, default: 0 },
        viewedAt: { type: Date, default: null },          // the customer first opened it in the portal
        paper: {
            status: { type: String, enum: ['none', 'printed', 'ready', 'shipped', 'delivered'], default: 'none', index: true },
            method: { type: String, enum: ['', 'pickup', 'shipping'], default: '' },
            printedAt: { type: Date, default: null },
            readyAt: { type: Date, default: null },
            shippedAt: { type: Date, default: null },
            carrier: { type: String, default: '', maxlength: 80 },
            trackingNo: { type: String, default: '', maxlength: 80 },
            deliveredAt: { type: Date, default: null },
            receivedBy: { type: String, default: '', maxlength: 160 },
            handedBy: { type: ObjectId, ref: 'User', default: null }
        },
        log: [{ _id: false, step: String, note: String, by: { type: ObjectId, ref: 'User' }, byName: String, at: Date }]
    },
    // Issued although the customer still owed money (an explicit, recorded decision)
    paymentWaiver: { type: String, default: '' }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// One valid (or suspended) certificate per module per enrollment, and one final per enrollment
certificateSchema.index(
    { enrollment: 1, module: 1, kind: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['Valid', 'Suspended'] }, kind: { $in: ['module', 'program'] } } }
);

// Certificates are never deleted. Issued certificates keep their content; only the status moves.
for (const op of ['deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove']) {
    certificateSchema.pre(op, function () {
        throw new Error('Certificates cannot be deleted; cancel them instead.');
    });
}
const ISSUED_MUTABLE = new Set(['status', 'statusReason', 'statusHistory', 'replacedBy', 'userId', 'updatedAt', 'pdf_data', 'pdf_url', 'pdf_mimetype', 'delivery']);
certificateSchema.pre('save', function () {
    if (this.isNew || this.kind === 'legacy') return;
    const bad = this.modifiedPaths().map((p) => p.split('.')[0]).filter((p) => !ISSUED_MUTABLE.has(p));
    if (bad.length) throw new Error(`An issued certificate cannot be edited (${[...new Set(bad)].join(', ')}); reissue it instead.`);
});

// Compatibility Virtuals
certificateSchema.virtual('certificateNumber').get(function () { return this.cert_num; });
certificateSchema.virtual('holderName').get(function () { return this.trainee_name; });
certificateSchema.virtual('programName').get(function () { return this.program_name; });
certificateSchema.virtual('specialty').get(function () { return this.field; });
certificateSchema.virtual('issueDate').get(function () { return this.issue_date; });

certificateSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('Certificate', certificateSchema);
