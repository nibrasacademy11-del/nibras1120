const Course = require('../models/Course');

exports.getAllCourses = async (req, res) => {
    try {
        const courses = await Course.find().sort({ createdAt: -1 });
        res.json({ courses });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.getCourseById = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ message: 'Course not found.' });
        res.json({ course });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.createCourse = async (req, res) => {
    try {
        const course = new Course(req.body);
        await course.save();
        res.status(201).json({ message: 'Course created successfully.', course });
    } catch (error) {
        res.status(500).json({ message: 'Server error while creating course.' });
    }
};

exports.updateCourse = async (req, res) => {
    try {
        const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!course) return res.status(404).json({ message: 'Course not found.' });
        res.json({ message: 'Course updated successfully.', course });
    } catch (error) {
        res.status(500).json({ message: 'Server error while updating course.' });
    }
};

exports.deleteCourse = async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.id);
        if (!course) return res.status(404).json({ message: 'Course not found.' });
        res.json({ message: 'Course deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting course.' });
    }
};
