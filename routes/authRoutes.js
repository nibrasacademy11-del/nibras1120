const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authRequired, adminRequired } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

const tooMany = 'عدد كبير من المحاولات، يرجى المحاولة لاحقاً. / Too many attempts, please try again later.';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: tooMany });

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/logout', authController.logout);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);
router.get('/me', authRequired, authController.getMe);
router.get('/profile', authRequired, authController.getUserProfile);
router.get('/users', authRequired, adminRequired, authController.getAllUsers);
router.get('/users/:id', authRequired, adminRequired, authController.getSingleUser);
router.put('/users/:id', authRequired, adminRequired, authController.updateUser);
router.delete('/users/:id', authRequired, adminRequired, authController.deleteUser);

module.exports = router;
