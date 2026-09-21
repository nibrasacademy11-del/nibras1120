const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, required: true },
    inquiryType: { 
        type: String, 
        default: 'استفسار عام' 
    },
    programOrService: { type: String, default: '' },
    subject: { type: String, default: '' },
    message: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['New', 'In Progress', 'Replied', 'Closed'], 
        default: 'New',
        index: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Inquiry', inquirySchema);
