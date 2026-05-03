const Inquiry = require('../models/Inquiry');

exports.createInquiry = async (req, res) => {
    try {
        const inquiry = new Inquiry(req.body);
        await inquiry.save();
        res.status(201).json({ message: 'Inquiry submitted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while submitting inquiry.' });
    }
};

exports.getAllInquiries = async (req, res) => {
    try {
        const inquiries = await Inquiry.find().sort({ createdAt: -1 });
        res.json({ inquiries });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.deleteInquiry = async (req, res) => {
    try {
        const inquiry = await Inquiry.findByIdAndDelete(req.params.id);
        if (!inquiry) return res.status(404).json({ message: 'Inquiry not found.' });
        res.json({ message: 'Inquiry deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting inquiry.' });
    }
};
