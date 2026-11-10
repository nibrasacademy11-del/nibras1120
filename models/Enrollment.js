const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const MODULE_STATUSES = ['not_started', 'in_progress', 'ready_for_review', 'approved', 'rejected', 'certificate_issued'];
const ENROLLMENT_STATUSES = ['active', 'on_hold', 'completed', 'withdrawn', 'cancelled'];
const OPEN_STATUSES = ['active', 'on_hold'];

const reviewSchema = new mongoose.Schema({
    stage: { type: String, enum: ['team_leader', 'admin'], required: true },
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    note: { type: String, default: '', maxlength: 1000 },
    by: { type: ObjectId, ref: 'User', required: true },
    byName: String,
    at: { type: Date, default: Date.now }
}, { _id: false });

const historySchema = new mongoose.Schema({
    from: String,
    to: String,
    note: { type: String, default: '', maxlength: 1000 },
    by: { type: ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now }
}, { _id: false });

// Each module of the enrollment progresses on its own. Titles are copied when the module is added,
// so a later rename of the program's module does not rewrite what the learner was enrolled in.
const moduleProgressSchema = new mongoose.Schema({
    module: { type: ObjectId, ref: 'ProgramModule', required: true },
    order: { type: Number, default: 0 },
    titleAr: { type: String, required: true },
    titleEn: { type: String, default: '' },
    required: { type: Boolean, default: true },
    certificate: { type: Boolean, default: true },
    status: { type: String, enum: MODULE_STATUSES, default: 'not_started' },
    startedAt: Date,
    submittedAt: Date,
    // The team leader's review of the current submission; cleared when the module is resubmitted
    teamLeaderReview: { type: reviewSchema, default: null },
    approvedAt: Date,
    approvedBy: { type: ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: '' },
    reviews: [reviewSchema],
    history: [historySchema]
}, { _id: false });

// A customer's registration in one program. A customer can hold several, one open per program.
const enrollmentSchema = new mongoose.Schema({
    enrollmentNo: { type: String, required: true, unique: true },
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    customerUser: { type: ObjectId, ref: 'User', default: null, index: true },   // the customer's portal account
    program: { type: ObjectId, ref: 'Course', required: true, index: true },
    programTitleAr: { type: String, required: true },
    programTitleEn: { type: String, default: '' },
    cohort: { type: ObjectId, ref: 'Cohort', default: null, index: true },
    owner: { type: ObjectId, ref: 'User', default: null, index: true },   // employee responsible for this enrollment
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    ownerHistory: [{ _id: false, owner: { type: ObjectId, ref: 'User' }, team: { type: ObjectId, ref: 'Team' }, from: Date, to: Date, by: { type: ObjectId, ref: 'User' }, reason: String }],
    status: { type: String, enum: ENROLLMENT_STATUSES, default: 'active', index: true },
    statusReason: { type: String, default: '' },
    enrolledAt: { type: Date, default: Date.now, index: true },
    completedAt: { type: Date, default: null },
    modules: [moduleProgressSchema],
    // The program's rule when enrolling: how many required modules complete it (0 = all of them)
    modulesRequired: { type: Number, default: 0 },
    eligibleForFinalCertificate: { type: Boolean, default: false },
    notes: { type: String, default: '', maxlength: 2000 },
    createdBy: { type: ObjectId, ref: 'User' },
    legacy: { type: mongoose.Schema.Types.Mixed, default: undefined }
}, { timestamps: true, optimisticConcurrency: true });

// Only one open enrollment per customer and program
enrollmentSchema.index(
    { customer: 1, program: 1 },
    { unique: true, partialFilterExpression: { status: { $in: OPEN_STATUSES } } }
);
enrollmentSchema.index({ 'modules.status': 1 });

enrollmentSchema.statics.MODULE_STATUSES = MODULE_STATUSES;
enrollmentSchema.statics.ENROLLMENT_STATUSES = ENROLLMENT_STATUSES;
enrollmentSchema.statics.OPEN_STATUSES = OPEN_STATUSES;

module.exports = mongoose.model('Enrollment', enrollmentSchema);
