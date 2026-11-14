const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authRequired, adminRequired } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const validId = require('../middleware/validId');

const tooMany = 'عدد كبير من المحاولات، يرجى المحاولة لاحقاً. / Too many attempts, please try again later.';
// Per email and address: the whole academy signs in from one internet address every morning
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: tooMany, keyBy: 'email' });
// Requests without an email (2FA step, reset links) still count per address, with room for an office
const officeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: tooMany });

router.post('/register', officeLimiter, authLimiter, authController.register);
router.post('/login', officeLimiter, authLimiter, authController.login);
router.post('/login/2fa', officeLimiter, authController.loginTwoFactor);
router.post('/logout', authController.logout);
router.post('/forgot-password', officeLimiter, authLimiter, authController.forgotPassword);
router.post('/reset-password', officeLimiter, authController.resetPassword);
router.post('/verify-email', officeLimiter, authController.verifyEmail);
// A new confirmation link: a few an hour per account
const resendLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: tooMany, keyBy: 'user' });
router.post('/resend-verification', authRequired, officeLimiter, resendLimiter, authController.resendVerification);
router.get('/me', authRequired, authController.getMe);
router.get('/zone', authController.getZone);
router.get('/profile', authRequired, authController.getUserProfile);
router.get('/users', authRequired, adminRequired, authController.getAllUsers);
router.get('/users/:id', authRequired, adminRequired, validId(), authController.getSingleUser);
router.put('/users/:id', authRequired, adminRequired, validId(), authController.updateUser);
router.delete('/users/:id', authRequired, adminRequired, validId(), authController.deleteUser);

module.exports = router;
