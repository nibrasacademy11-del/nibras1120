const mongoose = require('mongoose');

// A sales or service team. Its leader sees the team's customers (team scope).
const teamSchema = new mongoose.Schema({
    nameAr: { type: String, required: true, trim: true, maxlength: 120 },
    nameEn: { type: String, default: '', trim: true, maxlength: 120 },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    leaderHistory: [{
        _id: false,
        leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        from: Date,
        to: Date,
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    active: { type: Boolean, default: true }
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('Team', teamSchema);
