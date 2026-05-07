const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authRequired, adminRequired } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/me', authRequired, authController.getMe);
router.get('/profile', authRequired, authController.getUserProfile);
router.get('/users', authRequired, adminRequired, authController.getAllUsers);
router.get('/users/:id', authRequired, adminRequired, authController.getSingleUser);
router.put('/users/:id', authRequired, adminRequired, authController.updateUser);
router.delete('/users/:id', authRequired, adminRequired, authController.deleteUser);

module.exports = router;
