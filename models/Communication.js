const mongoose = require('mongoose');

const CHANNELS = ['call', 'whatsapp', 'email', 'sms', 'meeting', 'social', 'other'];
const OUTCOMES = ['', 'reached', 'no_answer', 'busy', 'wrong_number', 'interested', 'not_interested', 'callback', 'enrolled'];

// Every call, message or meeting with a customer
const communicationSchema = new mongoose.Schema({
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    channel: { type: String, enum: CHANNELS, required: true },
    direction: { type: String, enum: ['outbound', 'inbound'], default: 'outbound' },
    outcome: { type: String, enum: OUTCOMES, default: '' },
    summary: { type: String, default: '', trim: true, maxlength: 3000 },
    at: { type: Date, default: Date.now, index: true },
    durationMinutes: { type: Number, default: 0, min: 0, max: 600 },
    // Empty for messages that came in through the website
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    inquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Inquiry', default: null }
}, { timestamps: true });

communicationSchema.statics.CHANNELS = CHANNELS;
communicationSchema.statics.OUTCOMES = OUTCOMES;

module.exports = mongoose.model('Communication', communicationSchema);
