const mongoose = require('mongoose');

// The HR file of a staff member. The sign-in account (role, password, 2FA) stays in User.
const historySchema = new mongoose.Schema({
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    jobTitle: String,
    from: { type: Date, required: true },
    to: { type: Date, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String
}, { _id: false });

const employeeSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    employeeNo: { type: String, required: true, unique: true },
    nameAr: { type: String, required: true, trim: true, maxlength: 160 },
    nameEn: { type: String, default: '', trim: true, maxlength: 160 },
    jobTitle: { type: String, default: '', trim: true, maxlength: 120 },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null, index: true },
    phone: { type: String, default: '', trim: true, maxlength: 30 },
    hireDate: { type: Date, default: null },
    // active, or left (account disabled, customers transferred, history kept)
    status: { type: String, enum: ['active', 'left'], default: 'active', index: true },
    leftAt: { type: Date, default: null },
    leftReason: { type: String, default: '' },
    history: [historySchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('Employee', employeeSchema);
