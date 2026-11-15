const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Working hours. Each employee follows one shift; the default shift covers everyone else.
const shiftSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    days: [{ type: Number, min: 0, max: 6 }],           // 0 = Sunday
    start: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    end: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    graceMinutes: { type: Number, default: 15, min: 0, max: 240 },
    earlyLeaveGraceMinutes: { type: Number, default: 5, min: 0, max: 240 },
    isDefault: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
}, { timestamps: true, optimisticConcurrency: true });

// One record per employee per local day: the first scan checks in, later scans check out
const punchSchema = new mongoose.Schema({
    at: Date,
    method: { type: String, enum: ['qr', 'local', 'manual'] },
    station: { type: ObjectId, ref: 'AttendanceStation', default: null },
    ip: String,
    device: String
}, { _id: false });

const recordSchema = new mongoose.Schema({
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    date: { type: String, required: true, index: true },   // YYYY-MM-DD in the academy's time zone
    checkIn: { type: punchSchema, default: null },
    checkOut: { type: punchSchema, default: null },
    scans: { type: Number, default: 0 },
    // Ids of scans already received from the local server, so a repeated sync adds nothing
    syncIds: [{ type: String }],
    corrections: [{ _id: false, at: Date, by: { type: ObjectId, ref: 'User' }, byName: String, field: String, from: Date, to: Date, reason: String }]
}, { timestamps: true, optimisticConcurrency: true });
recordSchema.index({ user: 1, date: 1 }, { unique: true });

const LEAVE_TYPES = ['annual', 'sick', 'unpaid', 'permission', 'other'];
const leaveSchema = new mongoose.Schema({
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    type: { type: String, enum: LEAVE_TYPES, required: true },
    from: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    to: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    hours: { type: Number, default: 0, min: 0, max: 12 },  // for a permission (استئذان)
    reason: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
    decidedBy: { type: ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: '' }
}, { timestamps: true, optimisticConcurrency: true });
leaveSchema.statics.TYPES = LEAVE_TYPES;

const holidaySchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    nameAr: { type: String, required: true, maxlength: 120 },
    nameEn: { type: String, default: '', maxlength: 120 }
}, { timestamps: true });

// A screen that shows the rotating QR code. Its key lets the kiosk page fetch codes without a sign-in;
// the secret signs the codes and never leaves the server.
const stationSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 80 },
    location: { type: String, default: '', maxlength: 160 },
    keyHash: { type: String, required: true },
    secret: { type: String, required: true },
    // Optional: scans only count from these public IP addresses (the academy's internet connection)
    allowedIps: [{ type: String }],
    active: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: null }
}, { timestamps: true, optimisticConcurrency: true });

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
    Shift: model('Shift', shiftSchema),
    AttendanceRecord: model('AttendanceRecord', recordSchema),
    LeaveRequest: model('LeaveRequest', leaveSchema),
    Holiday: model('Holiday', holidaySchema),
    AttendanceStation: model('AttendanceStation', stationSchema)
};
