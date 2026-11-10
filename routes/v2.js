const express = require('express');
const router = express.Router();
const { authRequired, requirePermission } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const validId = require('../middleware/validId');
const { handle } = require('../lib/http');
const security = require('../modules/core/securityController');
const admin = require('../modules/core/adminController');

// Management system API. Every route checks the signed-in user's permissions on the server.

const sensitive = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'عدد كبير من المحاولات، يرجى المحاولة لاحقاً. / Too many attempts, please try again later.'
});

router.use(authRequired);

// The signed-in user's own account
router.get('/me', handle(security.me));
router.post('/me/2fa/setup', sensitive, handle(security.twoFactorSetup));
router.post('/me/2fa/enable', sensitive, handle(security.twoFactorEnable));
router.post('/me/2fa/disable', sensitive, handle(security.twoFactorDisable));
router.post('/me/2fa/recovery-codes', sensitive, handle(security.regenerateRecoveryCodes));
router.get('/me/sessions', handle(security.listSessions));
router.post('/me/sessions/revoke-others', handle(security.revokeOtherSessions));
router.delete('/me/sessions/:id', validId(), handle(security.revokeSession));
router.get('/me/login-history', handle(security.loginHistory));

// Accounts (admin side)
router.get('/users/:id/sessions', validId(), requirePermission('users.manage', 'all'), handle(security.adminListSessions));
router.post('/users/:id/sessions/revoke', validId(), requirePermission('users.manage', 'all'), handle(security.adminRevokeSessions));
router.post('/users/:id/2fa/reset', validId(), requirePermission('users.manage', 'all'), handle(security.adminResetTwoFactor));
router.get('/login-attempts', requirePermission('audit.view', 'all'), handle(security.adminLoginAttempts));

// Roles and permissions
router.get('/roles', requirePermission('roles.view', 'all'), handle(admin.listRoles));
router.put('/roles/:role', requirePermission('roles.manage', 'all'), handle(admin.updateRole));

// Audit log
router.get('/audit', requirePermission('audit.view', 'all'), handle(admin.listAudit));

router.use((req, res) => res.status(404).json({ message: 'Not found.' }));

module.exports = router;
