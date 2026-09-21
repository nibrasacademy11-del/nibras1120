const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
    cert_num: { type: String, required: true, unique: true, index: true },
    trainee_name: { type: String, required: true },
    program_name: { type: String, required: true },
    program_type: { type: String, default: 'برنامج مهني' },
    field: { type: String, default: '' },
    issue_date: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['Valid', 'Suspended', 'Cancelled', 'Expired'], 
        default: 'Valid' 
    },
    pdf_url: { type: String, default: null },
    pdf_data: { type: Buffer, default: null },
    pdf_mimetype: { type: String, default: 'application/pdf' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Compatibility Virtuals
certificateSchema.virtual('certificateNumber').get(function() { return this.cert_num; });
certificateSchema.virtual('holderName').get(function() { return this.trainee_name; });
certificateSchema.virtual('programName').get(function() { return this.program_name; });
certificateSchema.virtual('specialty').get(function() { return this.field; });
certificateSchema.virtual('issueDate').get(function() { return this.issue_date; });

module.exports = mongoose.model('Certificate', certificateSchema);
