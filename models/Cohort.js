const mongoose = require('mongoose');

// A training group (مجموعة) of a program: a start date, a schedule and a capacity.
// Enrollment is continuous, so an enrollment may also have no group.
const cohortSchema = new mongoose.Schema({
    program: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    nameAr: { type: String, required: true, trim: true, maxlength: 160 },
    nameEn: { type: String, default: '', trim: true, maxlength: 160 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    schedule: { type: String, default: '', maxlength: 300 },
    instructor: { type: String, default: '', maxlength: 160 },
    delivery: { type: String, enum: ['online', 'onsite', 'hybrid'], default: 'online' },
    capacity: { type: Number, default: 0, min: 0, max: 10000 },   // 0 = unlimited
    status: { type: String, enum: ['planned', 'open', 'running', 'finished', 'cancelled'], default: 'open', index: true },
    notes: { type: String, default: '', maxlength: 1000 },
    // The modules this group studies; empty means the whole program
    modules: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProgramModule' }],
    // When the group's certificates are issued (see lib/certificateRules.js)
    certificateRule: {
        mode: { type: String, enum: ['manual', 'on_approval', 'on_date', 'after_end'], default: 'manual' },
        issue: { type: String, enum: ['modules', 'program', 'both'], default: 'both' },
        date: { type: Date, default: null },
        daysAfterEnd: { type: Number, default: 0 },
        minAttendance: { type: Number, default: 0 },
        sendEmail: { type: Boolean, default: true },
        template: { type: mongoose.Schema.Types.ObjectId, ref: 'CertificateTemplate', default: null }
    }
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('Cohort', cohortSchema);
