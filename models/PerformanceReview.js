const mongoose = require('mongoose');

const ObjectId = mongoose.Schema.Types.ObjectId;

// A monthly performance review of one employee: the system's numbers for the month (attendance,
// tasks, new customers, collections) and the reviewer's 1-5 scores on the academy's criteria.
// draft (reviewer only) -> submitted (the employee sees it) -> acknowledged (the employee read it).
const reviewSchema = new mongoose.Schema({
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    name: String,
    employeeNo: String,
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/, index: true },
    metrics: {
        workingDays: { type: Number, default: 0 },
        present: { type: Number, default: 0 },
        absent: { type: Number, default: 0 },
        lateMinutes: { type: Number, default: 0 },
        attendanceRate: { type: Number, default: null },
        tasksDone: { type: Number, default: 0 },
        tasksOnTime: { type: Number, default: 0 },
        tasksOverdue: { type: Number, default: 0 },
        newCustomers: { type: Number, default: 0 },
        becameCustomers: { type: Number, default: 0 },
        collections: [{ currency: String, amount: Number, _id: false }]
    },
    scores: [{ key: String, ar: String, en: String, score: { type: Number, min: 1, max: 5 }, _id: false }],
    average: { type: Number, default: null },
    strengths: { type: String, default: '', maxlength: 1500 },
    improve: { type: String, default: '', maxlength: 1500 },
    notes: { type: String, default: '', maxlength: 1500 },
    reviewer: { type: ObjectId, ref: 'User', required: true },
    reviewerName: String,
    status: { type: String, enum: ['draft', 'submitted', 'acknowledged'], default: 'draft', index: true },
    submittedAt: { type: Date, default: null },
    acknowledgedAt: { type: Date, default: null },
    employeeComment: { type: String, default: '', maxlength: 1500 }
}, { timestamps: true, optimisticConcurrency: true });

reviewSchema.index({ user: 1, month: 1 }, { unique: true });

module.exports = mongoose.models.PerformanceReview || mongoose.model('PerformanceReview', reviewSchema);
