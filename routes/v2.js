const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authRequired, requirePermission } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const validId = require('../middleware/validId');
const { handle } = require('../lib/http');
const security = require('../modules/core/securityController');
const admin = require('../modules/core/adminController');
const hr = require('../modules/hr/hrController');
const customers = require('../modules/crm/customerController');
const activity = require('../modules/crm/activityController');
const access = require('../modules/crm/accessController');
const documents = require('../modules/crm/documentController');
const home = require('../modules/crm/homeController');
const programs = require('../modules/learning/programController');
const enrollments = require('../modules/learning/enrollmentController');
const finSetup = require('../modules/finance/setupController');
const money = require('../modules/finance/moneyController');
const commissions = require('../modules/commission/commissionController');

// Management system API. Every route checks the signed-in user's permissions on the server.

const tooMany = 'عدد كبير من المحاولات، يرجى المحاولة لاحقاً. / Too many attempts, please try again later.';
const sensitive = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: tooMany });
// Looking customers up by identity number is limited, so numbers cannot be tried in bulk
const lookupLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: tooMany });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 10 } });
const uploadFile = (req, res, next) => upload.single('file')(req, res, (err) => (err ? next(err) : next()));

const can = requirePermission;
const all = (perm) => requirePermission(perm, 'all');

// The reminder job is called by Vercel Cron with its own secret, not a user session
router.get('/cron/reminders', handle(home.cronReminders));

router.use(authRequired);

// ---- the signed-in user's own account ----
router.get('/me', handle(security.me));
router.post('/me/password', sensitive, handle(security.changePassword));
router.post('/me/2fa/setup', sensitive, handle(security.twoFactorSetup));
router.post('/me/2fa/enable', sensitive, handle(security.twoFactorEnable));
router.post('/me/2fa/disable', sensitive, handle(security.twoFactorDisable));
router.post('/me/2fa/recovery-codes', sensitive, handle(security.regenerateRecoveryCodes));
router.get('/me/sessions', handle(security.listSessions));
router.post('/me/sessions/revoke-others', handle(security.revokeOtherSessions));
router.delete('/me/sessions/:id', validId(), handle(security.revokeSession));
router.get('/me/login-history', handle(security.loginHistory));
router.get('/dashboard', handle(home.dashboard));
router.get('/notifications', handle(home.notifications));
router.post('/notifications/read', handle(home.markRead));

// ---- accounts (admin side) ----
router.get('/users/:id/sessions', validId(), all('users.manage'), handle(security.adminListSessions));
router.post('/users/:id/sessions/revoke', validId(), all('users.manage'), handle(security.adminRevokeSessions));
router.post('/users/:id/2fa/reset', validId(), all('users.manage'), handle(security.adminResetTwoFactor));
router.get('/login-attempts', all('audit.view'), handle(security.adminLoginAttempts));

// ---- roles, settings, audit ----
router.get('/roles', all('roles.view'), handle(admin.listRoles));
router.put('/roles/:role', all('roles.manage'), handle(admin.updateRole));
router.get('/settings', all('settings.view'), handle(home.getSettings));
router.put('/settings', all('settings.manage'), handle(home.updateSettings));
router.get('/audit', all('audit.view'), handle(admin.listAudit));

// ---- HR ----
router.get('/staff', can('customer_lookup.view'), handle(hr.staffDirectory));
router.get('/departments', can('teams.view'), handle(hr.listDepartments));
router.post('/departments', all('teams.create'), handle(hr.saveDepartment));
router.put('/departments/:id', validId(), all('teams.update'), handle(hr.saveDepartment));
router.get('/teams', can('teams.view'), handle(hr.listTeams));
router.post('/teams', all('teams.create'), handle(hr.saveTeam));
router.put('/teams/:id', validId(), all('teams.update'), handle(hr.saveTeam));
router.get('/employees', can('employees.view'), handle(hr.listEmployees));
router.post('/employees', all('employees.create'), handle(hr.createEmployee));
router.get('/employees/:id', validId(), can('employees.view'), handle(hr.getEmployee));
router.put('/employees/:id', validId(), can('employees.update'), handle(hr.updateEmployee));
router.post('/employees/:id/offboard', validId(), all('employees.manage'), handle(hr.offboardEmployee));

// ---- customers ----
router.get('/customers/meta', can('customer_lookup.view'), handle(customers.meta));
router.get('/customers/lookup', lookupLimit, can('customer_lookup.view'), handle(customers.lookup));
router.post('/customers/check-duplicates', can('customers.create'), handle(customers.checkDuplicates));
router.get('/customers/duplicates', all('customers.manage'), handle(customers.duplicateGroups));
router.post('/customers/assign', can('customers.manage', 'team'), handle(customers.assign));
router.get('/customers', can('customers.view'), handle(customers.list));
router.post('/customers', can('customers.create'), handle(customers.create));
router.get('/customers/:id', validId(), can('customer_lookup.view'), handle(customers.get));
router.put('/customers/:id', validId(), can('customers.view'), handle(customers.update));
router.post('/customers/:id/archive', validId(), can('customers.archive'), handle(customers.setArchived));
router.post('/customers/:id/reveal-identity', validId(), sensitive, can('customer_lookup.view'), handle(customers.revealIdentity));
router.get('/customers/:id/timeline', validId(), can('customer_lookup.view'), handle(customers.timeline));
router.post('/customers/:id/transfer', validId(), can('customers.manage'), handle(customers.transfer));
router.post('/customers/:id/merge', validId(), all('customers.manage'), handle(customers.merge));

router.get('/customers/:id/notes', validId(), can('customer_lookup.view'), handle(activity.listNotes));
router.post('/customers/:id/notes', validId(), can('customer_notes.create'), handle(activity.addNote));
router.put('/notes/:noteId', validId('noteId'), can('customer_notes.update'), handle(activity.updateNote));
router.get('/customers/:id/communications', validId(), can('customer_lookup.view'), handle(activity.listCommunications));
router.post('/customers/:id/communications', validId(), can('customers.update'), handle(activity.addCommunication));

router.get('/customers/:id/documents', validId(), can('customer_lookup.view'), handle(documents.list));
router.post('/customers/:id/documents', validId(), can('customer_documents.create'), uploadFile, handle(documents.upload));
router.post('/documents/:docId/versions', validId('docId'), can('customer_documents.update'), uploadFile, handle(documents.addVersion));
router.put('/documents/:docId', validId('docId'), can('customer_documents.update'), handle(documents.update));
router.get('/documents/:docId/versions/:version', validId('docId'), can('customer_lookup.view'), handle(documents.download));

// ---- access requests ----
router.post('/customers/:id/access-requests', validId(), can('access_requests.create'), handle(access.create));
router.get('/access-requests', can('access_requests.view'), handle(access.list));
router.post('/access-requests/:requestId/decide', validId('requestId'), can('access_requests.view'), handle(access.decide));
router.post('/access-requests/:requestId/revoke', validId('requestId'), can('access_requests.view'), handle(access.revoke));

// ---- programs, modules, groups ----
router.get('/programs', can('programs.view'), handle(programs.list));
router.get('/programs/:id', validId(), can('programs.view'), handle(programs.get));
router.put('/programs/:id/rules', validId(), all('programs.update'), handle(programs.updateRules));
router.post('/programs/:id/modules', validId(), all('programs.create'), handle(programs.addModule));
router.post('/programs/:id/modules/order', validId(), all('programs.update'), handle(programs.reorderModules));
router.put('/modules/:moduleId', validId('moduleId'), all('programs.update'), handle(programs.updateModule));
router.get('/cohorts', can('programs.view'), handle(programs.listCohorts));
router.post('/programs/:id/cohorts', validId(), all('programs.create'), handle(programs.addCohort));
router.put('/cohorts/:cohortId', validId('cohortId'), all('programs.update'), handle(programs.updateCohort));

// ---- enrollments and module reviews ----
router.get('/my/enrollments', handle(enrollments.mine));
router.get('/reviews', can('enrollments.approve', 'team'), handle(enrollments.reviews));
router.get('/enrollments', can('enrollments.view'), handle(enrollments.list));
router.post('/enrollments', can('enrollments.create'), handle(enrollments.create));
router.get('/enrollments/:id', validId(), can('enrollments.view'), handle(enrollments.get));
router.put('/enrollments/:id', validId(), can('enrollments.update'), handle(enrollments.update));
router.post('/enrollments/:id/sync-modules', validId(), can('enrollments.update'), handle(enrollments.syncModules));
router.post('/enrollments/:id/modules/:moduleId', validId(), validId('moduleId'), can('enrollments.view'), handle(enrollments.transition));
router.get('/customers/:id/enrollments', validId(), can('enrollments.view'), handle(enrollments.forCustomer));

// ---- finance: setup ----
router.get('/finance/currencies', can('payments.view'), handle(finSetup.listCurrencies));
router.post('/finance/currencies', all('currencies.manage'), handle(finSetup.saveCurrency));
router.post('/finance/base-currency', all('currencies.manage'), handle(finSetup.setBaseCurrency));
router.get('/finance/rates', all('currencies.view'), handle(finSetup.listRates));
router.post('/finance/rates', all('currencies.update'), handle(finSetup.addRate));
router.get('/finance/accounts', can('payments.create'), handle(finSetup.listAccounts));
router.post('/finance/accounts', all('accounts.create'), handle(finSetup.saveAccount));
router.put('/finance/accounts/:id', validId(), all('accounts.update'), handle(finSetup.saveAccount));
router.get('/finance/accounts/:id/statement', validId(), all('accounts.view'), handle(finSetup.accountStatement));
router.get('/finance/periods', all('accounts.view'), handle(finSetup.listPeriods));
router.post('/finance/periods/:key', all('accounts.approve'), handle(finSetup.setPeriod));

// ---- finance: customer money ----
router.get('/my/finance', handle(money.myFinance));
router.get('/customers/:id/finance', validId(), can('customer_financial.view'), handle(money.customerFinance));
router.post('/charges', can('customer_financial.create'), handle(money.createCharge));
router.post('/charges/:id/discount', validId(), can('customer_financial.update'), handle(money.requestDiscount));
router.post('/charges/:id/cancel', validId(), all('payments.approve'), handle(money.cancelCharge));
router.get('/payments', can('payments.view'), handle(money.listPayments));
router.post('/payments', can('payments.create'), handle(money.createPayment));
router.get('/payments/:id', validId(), handle(money.getPayment));
router.post('/payments/:id/confirm', validId(), all('payments.update'), handle(money.confirmPayment));
router.post('/payments/:id/void', validId(), can('payments.view'), handle(money.requestVoid));
router.post('/payments/:id/refunds', validId(), can('payments.view'), handle(money.requestRefund));
router.get('/approvals', can('payments.view'), handle(money.listApprovals));
router.post('/approvals/:id/decide', validId(), all('payments.approve'), handle(money.decideApproval));

// ---- finance: academy money ----
router.get('/expenses', all('expenses.view'), handle(money.listExpenses));
router.post('/expenses', all('expenses.create'), handle(money.createExpense));
router.post('/expenses/:id/void', validId(), all('expenses.view'), handle(money.requestExpenseVoid));
router.post('/transfers', all('accounts.update'), handle(money.createTransfer));
router.get('/finance/summary', all('payments.view'), handle(money.summary));

// ---- commissions ----
router.get('/commissions/rates', can('commissions.view'), handle(commissions.listRates));
router.post('/commissions/rates', all('commissions.manage'), handle(commissions.setRate));
router.get('/commissions/lines', can('commissions.view'), handle(commissions.listLines));
router.get('/commissions/statement', can('commissions.view'), handle(commissions.statement));
router.get('/commissions/overview', can('commissions.view', 'team'), handle(commissions.overview));
router.post('/commissions/approve', all('commissions.approve'), handle(commissions.approve));
router.post('/commissions/lines/:id/cancel', validId(), all('commissions.manage'), handle(commissions.cancelLine));
router.post('/commissions/adjustments', all('commissions.manage'), handle(commissions.addAdjustment));
router.get('/commissions/payouts', can('commissions.view'), handle(commissions.listPayouts));
router.post('/commissions/payouts', all('commissions.manage'), handle(commissions.createPayout));
router.post('/commissions/generate', all('commissions.manage'), handle(commissions.generateMissing));
router.get('/enrollments/:id/commission-split', validId(), all('commissions.view'), handle(commissions.getSplit));
router.put('/enrollments/:id/commission-split', validId(), all('commissions.manage'), handle(commissions.setSplit));

// ---- tasks and follow-ups ----
router.get('/tasks', can('tasks.view'), handle(activity.listTasks));
router.post('/tasks', can('tasks.create'), handle(activity.createTask));
router.put('/tasks/:taskId', validId('taskId'), can('tasks.update'), handle(activity.updateTask));

router.use((req, res) => res.status(404).json({ message: 'Not found.' }));

module.exports = router;
