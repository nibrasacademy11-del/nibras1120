const mongoose = require('mongoose');
const { ROLES, LEGACY_ROLES } = require('../lib/permissions');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    password: { type: String, required: true },
    // student and user are the roles of accounts created before the management system; both are customers
    role: { type: String, enum: [...ROLES, ...Object.keys(LEGACY_ROLES)], default: 'student' },
    // A disabled account cannot sign in, and its records stay for transfer to another employee
    status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
    enrolledCourses: [{ type: String }],
    // Bumped to sign the user out everywhere: issued tokens carry the value they were signed with
    tokenVersion: { type: Number, default: 0 },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    twoFactor: {
        enabled: { type: Boolean, default: false },
        secretEnc: { type: String, default: '' },        // encrypted with lib/fieldCrypto
        pendingSecretEnc: { type: String, default: '' }, // set during enrollment, until the first code is confirmed
        lastStep: { type: Number, default: -1 },         // last accepted time step, blocks code replay
        recoveryCodes: [{ type: String }],               // sha256 hashes, each usable once
        enabledAt: Date
    },
    lastLoginAt: Date
}, { timestamps: true });

// Fields never sent to the browser
userSchema.statics.PRIVATE_FIELDS = '-password -resetPasswordToken -resetPasswordExpire -tokenVersion -twoFactor';

module.exports = mongoose.model('User', userSchema);
