const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// One lecture of a training group, usually a Zoom meeting.
// With the Zoom connection set up the meeting is created on Zoom and every member joins with a
// personal link; without it the admin pastes the meeting link and passcode.
// The general join link is never sent to customers: they join through the portal, which checks
// membership and records the click, then forwards them to Zoom.
const recordingSchema = new mongoose.Schema({
    title: { type: String, default: '', maxlength: 200 },
    url: { type: String, required: true, maxlength: 1000 },
    passcode: { type: String, default: '', maxlength: 100 },
    source: { type: String, enum: ['zoom', 'manual'], default: 'manual' },
    zoomFileId: { type: String, default: '' },
    addedAt: { type: Date, default: Date.now }
}, { _id: true });

const materialSchema = new mongoose.Schema({
    title: { type: String, required: true, maxlength: 200 },
    url: { type: String, required: true, maxlength: 1000 }
}, { _id: true });

const lectureSchema = new mongoose.Schema({
    // null: a lecture of the program, for everyone enrolled in it (PLAN-V2). Older lectures belong to a group.
    cohort: { type: ObjectId, ref: 'Cohort', default: null, index: true },
    program: { type: ObjectId, ref: 'Course', required: true, index: true },
    module: { type: ObjectId, ref: 'ProgramModule', default: null, index: true },
    order: { type: Number, default: 0 },
    titleAr: { type: String, required: true, trim: true, maxlength: 200 },
    titleEn: { type: String, default: '', trim: true, maxlength: 200 },
    startsAt: { type: Date, required: true, index: true },
    durationMin: { type: Number, default: 90, min: 5, max: 600 },
    status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled', index: true },
    cancelReason: { type: String, default: '', maxlength: 300 },
    zoom: {
        managed: { type: Boolean, default: false },       // created and updated through the Zoom connection
        meetingId: { type: String, default: '', index: true },
        joinUrl: { type: String, default: '', maxlength: 1000 },
        passcode: { type: String, default: '', maxlength: 100 },
        registration: { type: Boolean, default: false },  // members get personal links
        lastError: { type: String, default: '', maxlength: 500 }
    },
    recordings: [recordingSchema],
    materials: [materialSchema],
    notes: { type: String, default: '', maxlength: 1000 },
    remindedAt: { type: Date, default: null },
    // the reminder about an hour before (needs the reminder job to run hourly)
    remindedSoonAt: { type: Date, default: null },
    attendanceSyncedAt: { type: Date, default: null },
    createdBy: { type: ObjectId, ref: 'User', default: null }
}, { timestamps: true, optimisticConcurrency: true });

lectureSchema.index({ cohort: 1, startsAt: 1 });

module.exports = mongoose.model('Lecture', lectureSchema);
