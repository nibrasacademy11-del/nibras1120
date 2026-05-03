const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    content: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
