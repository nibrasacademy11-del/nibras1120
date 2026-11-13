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
    // The academy's primary owner (info@nibras-ac.com). Set only by tools/promote-super-admin.js
    // --primary on the server, never from the portal; nobody can demote, disable or delete it there.
    // The role decides permissions; this flag only adds protection (the email alone proves nothing).
    isPrimaryOwner: { type: Boolean, default: false, index: true },
    // Extra permissions the owner gave this person on top of their role ({ key, scope } pairs).
    // Only the owner changes them (roles.manage); they add access, never remove it.
    extraGrants: { type: [{ key: String, scope: { type: String, enum: ['own', 'team', 'department', 'all'] }, _id: false }], default: [] },
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
    // Set for accounts created with a temporary password; the portal asks for a new one first
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: Date
}, { timestamps: true });

// Fields never sent to the browser
userSchema.statics.PRIVATE_FIELDS = '-password -resetPasswordToken -resetPasswordExpire -tokenVersion -twoFactor';

module.exports = mongoose.model('User', userSchema);
