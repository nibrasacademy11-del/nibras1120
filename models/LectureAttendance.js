const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// A member's record for one lecture: the personal Zoom link given to them, their clicks on
// "join", and the minutes Zoom reports they stayed (or a manual mark by staff).
const lectureAttendanceSchema = new mongoose.Schema({
    lecture: { type: ObjectId, ref: 'Lecture', required: true },
    cohort: { type: ObjectId, ref: 'Cohort', required: true, index: true },
    customer: { type: ObjectId, ref: 'Customer', required: true, index: true },
    registrantId: { type: String, default: '' },
    personalJoinUrl: { type: String, default: '', maxlength: 1000 },
    clicks: { type: Number, default: 0 },
    firstClickAt: { type: Date, default: null },
    lastClickAt: { type: Date, default: null },
    // The first entry that counts toward the module (from the lecture's time, or a recording):
    // "entered" in the learning path (PLAN-V2 decision 3)
    enteredAt: { type: Date, default: null },
    enteredVia: { type: String, enum: ['', 'live', 'recording', 'staff'], default: '' },
    minutes: { type: Number, default: 0 },
    joinedAt: { type: Date, default: null },
    leftAt: { type: Date, default: null },
    present: { type: Boolean, default: false },
    source: { type: String, enum: ['none', 'zoom', 'manual'], default: 'none' },
    markedBy: { type: ObjectId, ref: 'User', default: null }
}, { timestamps: true });

lectureAttendanceSchema.index({ lecture: 1, customer: 1 }, { unique: true });

module.exports = mongoose.model('LectureAttendance', lectureAttendanceSchema);
