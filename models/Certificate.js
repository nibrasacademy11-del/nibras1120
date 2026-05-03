const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
    cert_num: { type: String, required: true, unique: true },
    trainee_name: { type: String, required: true },
    program_name: { type: String, required: true },
    field: { type: String, default: '' },
    issue_date: { type: String, required: true },
    pdf_url: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Certificate', certificateSchema);
