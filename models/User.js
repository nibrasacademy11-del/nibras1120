const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'admin', 'user'], default: 'student' },
    enrolledCourses: [{ type: String }],
    // Bumped to sign the user out everywhere: issued tokens carry the value they were signed with
    tokenVersion: { type: Number, default: 0 },
    resetPasswordToken: String,
    resetPasswordExpire: Date
}, { timestamps: true });

// Fields never sent to the browser
userSchema.statics.PRIVATE_FIELDS = '-password -resetPasswordToken -resetPasswordExpire -tokenVersion';

module.exports = mongoose.model('User', userSchema);
