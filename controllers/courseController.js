const Course = require('../models/Course');
const mongoose = require('mongoose');

exports.getAllCourses = async (req, res) => {
    try {
        const { type, specialty, status, search, featured, limit, page } = req.query;
        const query = {};

        if (type) {
            const t = type.toLowerCase().trim();
            if (t === 'masters' || t === 'master') {
                query.type = { $in: ['master', 'masters'] };
            } else if (t === 'courses' || t === 'course') {
                query.type = { $in: ['course', 'courses'] };
            } else if (t === 'diplomas' || t === 'diploma') {
                query.type = { $in: ['diploma', 'diplomas'] };
            } else if (t === 'phd' || t === 'doctorate') {
                query.type = { $in: ['phd', 'doctorate'] };
            } else {
                query.type = type;
            }
        }
        if (specialty) query.specialty = specialty;
        
        // Non-admin queries default to available / coming_soon unless status specified
        if (status) {
            query.status = status;
        } else if (!req.user || req.user.role !== 'admin') {
            query.status = { $ne: 'hidden' };
        }

        if (featured === 'true') query.featured = true;

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { titleAr: regex },
                { titleEn: regex },
                { title: regex },
                { specialty: regex },
                { descriptionAr: regex },
                { descriptionEn: regex }
            ];
        }

        const lim = parseInt(limit, 10) || 100;
        const p = parseInt(page, 10) || 1;
        const skip = (p - 1) * lim;

        const total = await Course.countDocuments(query);
        const courses = await Course.find(query)
            .sort({ featured: -1, createdAt: -1 })
            .skip(skip)
            .limit(lim);

        res.json({ courses, total, page: p, totalPages: Math.ceil(total / lim) });
    } catch (error) {
        console.error('Error in getAllCourses:', error);
        res.status(500).json({ message: 'Server error while fetching programs.' });
    }
};

exports.getCourseById = async (req, res) => {
    try {
        const identifier = req.params.id;
        let course = null;

        if (mongoose.Types.ObjectId.isValid(identifier)) {
            course = await Course.findById(identifier);
        }
        
        if (!course) {
            course = await Course.findOne({ slug: identifier });
        }

        if (!course) return res.status(404).json({ message: 'Program not found.' });
        res.json({ course });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.createCourse = async (req, res) => {
    try {
        const data = { ...req.body };
        if (!data.slug && data.titleAr) {
            data.slug = data.titleAr
                .toLowerCase()
                .replace(/[^\u0621-\u064A0-9a-zA-Z]+/g, '-')
                .replace(/^-|-$/g, '') || ('prog-' + Date.now());
        }
        const course = new Course(data);
        await course.save();
        res.status(201).json({ message: 'Program created successfully.', course });
    } catch (error) {
        console.error('Error creating program:', error);
        res.status(500).json({ message: error.message || 'Server error while creating program.' });
    }
};

exports.updateCourse = async (req, res) => {
    try {
        const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!course) return res.status(404).json({ message: 'Program not found.' });
        res.json({ message: 'Program updated successfully.', course });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Server error while updating program.' });
    }
};

exports.deleteCourse = async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.id);
        if (!course) return res.status(404).json({ message: 'Program not found.' });
        res.json({ message: 'Program deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting program.' });
    }
};
