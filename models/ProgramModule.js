const mongoose = require('mongoose');

// A module (محور) of a training program. Programs are the Course catalog entries.
// Retired modules stay (active: false) so enrollments that include them keep their history.
const programModuleSchema = new mongoose.Schema({
    program: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    order: { type: Number, default: 0 },
    code: { type: String, default: '', trim: true, maxlength: 30 },
    titleAr: { type: String, required: true, trim: true, maxlength: 200 },
    titleEn: { type: String, default: '', trim: true, maxlength: 200 },
    descriptionAr: { type: String, default: '', maxlength: 4000 },
    descriptionEn: { type: String, default: '', maxlength: 4000 },
    // What the learner must deliver or pass for the module to be approved
    requirements: [{ type: String, trim: true, maxlength: 300 }],
    hours: { type: Number, default: 0, min: 0, max: 2000 },
    // Counts toward the program's final certificate
    required: { type: Boolean, default: true },
    // A separate certificate is issued for this module once it is approved
    certificate: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    // The one module made for a program without modules (a course): the customer never sees the word "module"
    auto: { type: Boolean, default: false },
    // The owner pressed "the module is finished": everyone who entered all its lectures completes it
    // and gets its certificate (PLAN-V2, 15 Nov). Until then nobody completes it by entering lectures.
    finishedAt: { type: Date, default: null },
    finishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, optimisticConcurrency: true });

programModuleSchema.index({ program: 1, order: 1 });

module.exports = mongoose.model('ProgramModule', programModuleSchema);
