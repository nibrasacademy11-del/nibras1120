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
    country: { type: String, default: '' },
    // Enrollment requests only: the programs and prices as the server priced them
    items: [{
        _id: false,
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        title: String,
        price: Number,
        finalPrice: Number
    }],
    total: { type: Number, default: 0 },
    // The customer file this message was filed under (set by the CRM)
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    status: { 
        type: String, 
        enum: ['New', 'In Progress', 'Replied', 'Closed'], 
        default: 'New',
        index: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Inquiry', inquirySchema);
