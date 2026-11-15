const mongoose = require('mongoose');

// One record per reminder sent (an installment at one stage, through one channel), so the daily
// job never sends the same reminder twice
const reminderLogSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    channel: { type: String, default: '' },
    at: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('ReminderLog', reminderLogSchema);
