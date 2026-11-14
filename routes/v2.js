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
const certs = require('../modules/learning/certificateController');
const complaints = require('../modules/crm/complaintController');
const reports = require('../modules/reports/reportController');
const analytics = require('../modules/reports/analyticsController');
const attendance = require('../modules/hr/attendanceController');
const system = require('../modules/core/systemController');
const groupsApi = require('../modules/learning/groupController');
const groupCerts = require('../modules/learning/groupCertificates');
const hub = require('../modules/finance/hubController');
const crm360 = require('../modules/crm/crm360');
const payroll = require('../modules/hr/payrollController');
const invitations = require('../modules/hr/invitationController');
const reviews = require('../modules/hr/reviewController');
const insights = require('../modules/reports/insightsController');
const profiles = require('../modules/crm/profileController');

// Management system API. Every route checks the signed-in user's permissions on the server.

const tooMany = 'عدد كبير من المحاولات، يرجى المحاولة لاحقاً. / Too many attempts, please try again later.';
const sensitive = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: tooMany, keyBy: 'user' });
// Looking customers up by identity number is limited, so numbers cannot be tried in bulk
const lookupLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: tooMany, keyBy: 'user' });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 10 } });
const uploadFile = (req, res, next) => upload.single('file')(req, res, (err) => (err ? next(err) : next()));

const can = requirePermission;
// Opening one customer: anyone who works on customers (the file itself is checked against their
// scope and approved access requests; anything outside answers "not found"), or who may search
// the academy. Searching itself stays with customer_lookup.view.
const customerReader = (req, res, next) => {
    const g = req.user && req.user.grants;
    if (g && (g['customers.view'] || g['customer_lookup.view'])) return next();
    return res.status(403).json({ message: 'ليس لديك صلاحية لهذا الإجراء. / You do not have permission for this action.', code: 'FORBIDDEN' });
};
// Names of the staff, for pickers: any staff account
const staffOnly = (req, res, next) => (req.user && req.user.isStaff ? next() : res.status(403).json({ message: 'Forbidden.', code: 'FORBIDDEN' }));
const all = (perm) => requirePermission(perm, 'all');

// The reminder job is called by Vercel Cron with its own secret, not a user session
router.get('/cron/reminders', handle(home.cronReminders));
// The kiosk screen and the local attendance server use their own keys, not user sessions
const kioskLimit = rateLimit({ windowMs: 60 * 1000, max: 30, message: tooMany });
router.get('/attendance/kiosk/:id', validId(), kioskLimit, handle(attendance.kiosk));
// Anyone holding a printed receipt can check it (the QR carries a signature)
router.get('/public/receipts/:no', rateLimit({ windowMs: 60 * 1000, max: 30, message: tooMany }), handle(money.verifyReceipt));
router.post('/attendance/sync', rateLimit({ windowMs: 60 * 1000, max: 30, message: tooMany }), handle(attendance.sync));

// The person who received a team invitation answers it from the link, without an account yet
const inviteLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: tooMany });
router.get('/invitations/:token', inviteLimit, handle(invitations.publicView));
router.post('/invitations/:token/accept', inviteLimit, handle(invitations.publicAccept));
router.post('/invitations/:token/reject', inviteLimit, handle(invitations.publicReject));

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
router.get('/academy', handle(home.academy));
router.get('/website/specialties', all('website.manage'), (req, res) => res.json({ items: require('../assets/js/specialties').map(({ key, ar, en }) => ({ key, ar, en })) }));
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
router.get('/users/:id/extra-grants', validId(), all('roles.manage'), handle(admin.getExtraGrants));
router.put('/users/:id/extra-grants', validId(), all('roles.manage'), handle(admin.setExtraGrants));
router.get('/settings', all('settings.view'), handle(home.getSettings));
router.put('/settings', all('settings.manage'), handle(home.updateSettings));
router.get('/audit', all('audit.view'), handle(admin.listAudit));

// ---- HR ----
router.get('/staff', staffOnly, handle(hr.staffDirectory));
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
router.get('/customers/meta', customerReader, handle(customers.meta));
router.get('/customers/lookup', lookupLimit, can('customer_lookup.view'), handle(customers.lookup));
router.post('/customers/check-duplicates', can('customers.create'), handle(customers.checkDuplicates));
router.get('/customers/duplicates', all('customers.manage'), handle(customers.duplicateGroups));
router.post('/customers/assign', can('customers.manage', 'team'), handle(customers.assign));
router.get('/customers', can('customers.view'), handle(customers.list));
router.get('/customers/board', can('customers.view'), handle(crm360.board));
router.get('/whatsapp-templates', customerReader, handle(crm360.templates));
router.post('/customers', can('customers.create'), handle(customers.create));
router.get('/customers/:id', validId(), customerReader, handle(customers.get));
router.put('/customers/:id', validId(), can('customers.view'), handle(customers.update));
router.post('/customers/:id/archive', validId(), can('customers.archive'), handle(customers.setArchived));
router.post('/customers/:id/reveal-identity', validId(), sensitive, customerReader, handle(customers.revealIdentity));
router.get('/customers/:id/summary', validId(), customerReader, handle(crm360.summary));
router.post('/customers/:id/whatsapp', validId(), can('customers.view'), rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: tooMany, keyBy: 'user' }), handle(crm360.whatsapp));
router.get('/customers/:id/timeline', validId(), customerReader, handle(customers.timeline));
router.post('/customers/:id/transfer', validId(), can('customers.manage'), handle(customers.transfer));
router.post('/customers/:id/merge', validId(), all('customers.manage'), handle(customers.merge));

router.get('/customers/:id/notes', validId(), customerReader, handle(activity.listNotes));
router.post('/customers/:id/notes', validId(), can('customer_notes.create'), handle(activity.addNote));
router.put('/notes/:noteId', validId('noteId'), can('customer_notes.update'), handle(activity.updateNote));
router.get('/customers/:id/communications', validId(), customerReader, handle(activity.listCommunications));
router.post('/customers/:id/communications', validId(), can('customers.update'), handle(activity.addCommunication));

router.get('/customers/:id/documents', validId(), customerReader, handle(documents.list));
router.post('/customers/:id/documents', validId(), can('customer_documents.create'), uploadFile, handle(documents.upload));
router.post('/documents/:docId/versions', validId('docId'), can('customer_documents.update'), uploadFile, handle(documents.addVersion));
router.put('/documents/:docId', validId('docId'), can('customer_documents.update'), handle(documents.update));
router.get('/documents/:docId/versions/:version', validId('docId'), customerReader, handle(documents.download));

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

// ---- groups: members, lectures, Zoom ----
router.get('/groups', can('programs.view'), handle(groupsApi.list));
router.get('/groups/:id', validId(), can('programs.view'), handle(groupsApi.get));
router.get('/groups/:id/members', validId(), can('programs.view'), handle(groupsApi.members));
router.post('/groups/:id/members/preview', validId(), all('programs.update'), lookupLimit, handle(groupsApi.previewMembers));
router.post('/groups/:id/members', validId(), all('programs.update'), handle(groupsApi.addMembers));
router.post('/groups/:id/members/:memberId/remove', validId(), validId('memberId'), all('programs.update'), handle(groupsApi.removeMember));
router.get('/groups/:id/lectures', validId(), can('programs.view'), handle(groupsApi.lectures));
router.post('/groups/:id/lectures', validId(), all('programs.update'), handle(groupsApi.addLecture));
router.put('/lectures/:id', validId(), all('programs.update'), handle(groupsApi.updateLecture));
router.post('/lectures/:id/cancel', validId(), all('programs.update'), handle(groupsApi.cancelLecture));
router.post('/lectures/:id/sync', validId(), all('programs.update'), handle(groupsApi.syncLecture));
router.get('/lectures/:id/attendance', validId(), can('programs.view'), handle(groupsApi.attendance));
router.post('/lectures/:id/attendance', validId(), (req, res, next) => { const g = req.user.grants || {}; return g['programs.update'] === 'all' || g['programs.approve'] === 'all' ? next() : res.status(403).json({ message: 'Forbidden.', code: 'FORBIDDEN' }); }, handle(groupsApi.markAttendance));
router.get('/groups/:id/certificates', validId(), can('certificates.view'), handle(groupCerts.get));
router.put('/groups/:id/certificate-rule', validId(), all('certificates.create'), handle(groupCerts.saveRule));
router.post('/groups/:id/certificates/issue', validId(), all('certificates.create'), handle(groupCerts.issue));
router.post('/groups/:id/approve-module', validId(), all('enrollments.approve'), handle(groupCerts.approveModule));
router.get('/zoom/status', all('programs.update'), handle(groupsApi.zoomStatus));
router.get('/customers/:id/groups', validId(), can('enrollments.view'), handle(groupsApi.forCustomer));
router.get('/my/lectures', handle(groupsApi.mine));

// ---- the customer's personal data (website profile) and the requests to change it ----
const profileLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: tooMany, keyBy: 'user' });
router.get('/my/profile', handle(profiles.mine));
router.post('/my/profile', profileLimit, handle(profiles.complete));
router.post('/my/profile/requests', profileLimit, handle(profiles.request));
router.post('/my/profile/requests/:id/cancel', validId(), handle(profiles.cancel));
router.get('/profile-requests', all('profile_requests.view'), handle(profiles.list));
router.post('/profile-requests/:id/decide', validId(), all('profile_requests.approve'), handle(profiles.decide));
router.post('/my/lectures/:id/join', validId(), rateLimit({ windowMs: 60 * 1000, max: 20, message: tooMany, keyBy: 'user' }), handle(groupsApi.join));

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
router.get('/finance/periods/:key/check', all('accounts.view'), handle(hub.closeCheck));
router.get('/finance/today', all('payments.view'), handle(hub.today));
router.get('/finance/receivables', can('customer_financial.view'), handle(hub.receivables));
router.post('/finance/receivables/:customerId/remind', validId('customerId'), can('customer_financial.view'), rateLimit({ windowMs: 15 * 60 * 1000, max: 150, message: tooMany, keyBy: 'user' }), handle(hub.remind));
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
router.post('/expenses/:id/receipt', validId(), all('expenses.create'), uploadFile, handle(hub.uploadExpenseReceipt));
router.get('/expenses/:id/receipt', validId(), all('expenses.view'), handle(hub.expenseReceipt));
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

// ---- certificates ----
router.get('/my/certificates', handle(certs.mine));
router.get('/certificate-templates', all('certificates.view'), handle(certs.listTemplates));
router.post('/certificate-templates', all('certificates.manage'), handle(certs.saveTemplate));
router.put('/certificate-templates/:id', validId(), all('certificates.manage'), handle(certs.saveTemplate));
router.get('/accreditations', all('certificates.view'), handle(certs.listAccreditations));
router.post('/accreditations', all('certificates.manage'), handle(certs.saveAccreditation));
router.put('/accreditations/:id', validId(), all('certificates.manage'), handle(certs.saveAccreditation));
router.get('/certificates/eligible', all('certificates.create'), handle(certs.eligible));
router.post('/certificates/issue', all('certificates.create'), handle(certs.issue));
router.post('/certificates/issue-bulk', all('certificates.create'), handle(certs.issueBulk));
router.get('/certificates', can('certificates.view'), handle(certs.list));
router.get('/certificates/:id', validId(), handle(certs.get));
router.post('/certificates/:id/status', validId(), all('certificates.archive'), handle(certs.setStatus));
router.post('/certificates/:id/email', validId(), can('certificates.update'), handle(certs.email));
router.post('/certificates/:id/delivery', validId(), can('certificates.update'), handle(certs.delivery));
router.post('/certificates/:id/reissue', validId(), all('certificates.create'), handle(certs.reissue));

// ---- complaints and satisfaction ----
router.get('/complaints/meta', handle(complaints.meta));
router.get('/complaints', can('complaints.view'), handle(complaints.list));
router.post('/complaints', can('complaints.create'), handle(complaints.create));
router.put('/complaints/:id', validId(), can('complaints.update'), handle(complaints.update));
router.post('/my/ratings', handle(complaints.rate));
router.get('/my/ratings', handle(complaints.myRatings));

// ---- reports and analytics ----
router.get('/reports', handle(reports.list));
router.get('/reports/:id', handle(reports.run));
router.get('/reports/:id/xlsx', handle(reports.exportXlsx));
router.post('/reports/printed', handle(reports.printed));
router.get('/analytics', can('reports.view', 'team'), handle(analytics.overview));

// ---- attendance and leaves ----
// No IP rate limit here: everyone in the academy shares one internet address at the morning rush
router.post('/attendance/scan', can('attendance.create'), handle(attendance.scan));
router.post('/attendance/device', can('attendance.create'), handle(attendance.deviceToken));
router.get('/attendance/me', can('attendance.view'), handle(attendance.myMonth));
router.get('/attendance/today', can('attendance.view', 'team'), handle(attendance.today));
router.get('/attendance/month', can('attendance.view', 'team'), handle(attendance.month));
router.post('/attendance/corrections', all('attendance.update'), handle(attendance.correct));
router.get('/attendance/shifts', can('attendance.view'), handle(attendance.listShifts));
router.post('/attendance/shifts', all('attendance.manage'), handle(attendance.saveShift));
router.put('/attendance/shifts/:id', validId(), all('attendance.manage'), handle(attendance.saveShift));
router.get('/attendance/holidays', can('attendance.view'), handle(attendance.listHolidays));
router.post('/attendance/holidays', all('attendance.manage'), handle(attendance.addHoliday));
router.delete('/attendance/holidays/:date', all('attendance.manage'), handle(attendance.removeHoliday));
router.get('/attendance/stations', all('attendance.manage'), handle(attendance.listStations));
router.post('/attendance/stations', all('attendance.manage'), handle(attendance.saveStation));
router.put('/attendance/stations/:id', validId(), all('attendance.manage'), handle(attendance.saveStation));
router.get('/leaves', can('leaves.view'), handle(attendance.listLeaves));
router.post('/leaves', can('leaves.create'), handle(attendance.requestLeave));
router.post('/leaves/:id/decide', validId(), can('leaves.approve', 'team'), handle(attendance.decideLeave));
router.post('/leaves/:id/cancel', validId(), can('leaves.create'), handle(attendance.cancelLeave));

// ---- my team, team invitations ----
router.get('/my-team', can('teams.view', 'team'), handle(invitations.myTeam));
router.get('/team-invitations/teams', can('teams.invite', 'team'), handle(invitations.teams));
router.get('/team-invitations', can('teams.invite', 'team'), handle(invitations.list));
router.post('/team-invitations', can('teams.invite', 'team'), rateLimit({ windowMs: 60 * 60 * 1000, max: 40, message: tooMany, keyBy: 'user' }), handle(invitations.create));
router.post('/team-invitations/:id/resend', validId(), can('teams.invite', 'team'), handle(invitations.resend));
router.post('/team-invitations/:id/cancel', validId(), can('teams.invite', 'team'), handle(invitations.cancel));
router.post('/team-invitations/:id/approve', validId(), all('teams.assign'), handle(invitations.approve));
router.post('/team-invitations/:id/decline', validId(), all('teams.assign'), handle(invitations.decline));

// ---- payroll: salaries, advances, the monthly sheet, payslips ----
router.get('/payroll/mine', can('payroll.view'), handle(payroll.myPayslips));
router.get('/payroll/my-advances', can('payroll.view'), handle(payroll.myAdvances));
router.get('/me/employee', staffOnly, handle(hr.myFile));
router.get('/payroll/runs/:id/payslip', validId(), can('payroll.view'), handle(payroll.payslip));
router.get('/payroll/runs/:id/payslip/:userId', validId(), validId('userId'), all('payroll.view'), handle(payroll.payslip));
router.get('/payroll/salaries', all('payroll.view'), handle(payroll.listSalaries));
router.put('/payroll/salaries/:id', validId(), all('payroll.update'), handle(payroll.setSalary));
router.get('/payroll/advances', all('payroll.view'), handle(payroll.listAdvances));
router.post('/payroll/advances', all('payroll.create'), handle(payroll.createAdvance));
router.post('/payroll/advances/:id/cancel', validId(), all('payroll.update'), handle(payroll.cancelAdvance));
router.get('/payroll/runs', all('payroll.view'), handle(payroll.listRuns));
router.post('/payroll/runs', all('payroll.create'), handle(payroll.createRun));
router.get('/payroll/runs/:id', validId(), all('payroll.view'), handle(payroll.getRun));
router.post('/payroll/runs/:id/refresh', validId(), all('payroll.update'), handle(payroll.refreshRun));
router.put('/payroll/runs/:id/lines/:userId', validId(), validId('userId'), all('payroll.update'), handle(payroll.updateLine));
router.post('/payroll/runs/:id/approve', validId(), all('payroll.approve'), handle(payroll.approveRun));
router.delete('/payroll/runs/:id', validId(), all('payroll.archive'), handle(payroll.deleteRun));

// ---- the owner's analytics (owner only) ----
router.get('/insights', (req, res, next) => (req.user.role === 'super_admin' ? next() : res.status(403).json({ message: 'ليس لديك صلاحية لهذا الإجراء. / You do not have permission for this action.', code: 'FORBIDDEN' })), handle(insights.overview));

// ---- monthly performance reviews ----
router.get('/performance/mine', can('reviews.view'), handle(reviews.mine));
router.get('/performance/criteria', can('reviews.view'), handle(reviews.getCriteria));
router.put('/performance/criteria', all('reviews.manage'), handle(reviews.setCriteria));
router.get('/performance/board', can('reviews.create', 'team'), handle(reviews.board));
router.get('/performance', can('reviews.view'), handle(reviews.list));
router.post('/performance', can('reviews.create', 'team'), handle(reviews.create));
router.get('/performance/:id', validId(), can('reviews.view'), handle(reviews.get));
router.put('/performance/:id', validId(), can('reviews.update', 'team'), handle(reviews.update));
router.post('/performance/:id/submit', validId(), can('reviews.update', 'team'), handle(reviews.submit));
router.post('/performance/:id/acknowledge', validId(), can('reviews.view'), handle(reviews.acknowledge));

// ---- system health ----
router.get('/system/health', (req, res, next) => (req.user.role === 'super_admin' ? next() : res.status(403).json({ message: 'Forbidden.' })), handle(system.health));
router.post('/client-errors', rateLimit({ windowMs: 60 * 1000, max: 20, message: tooMany, keyBy: 'user' }), handle(system.clientError));

// ---- tasks and follow-ups ----
router.get('/tasks', can('tasks.view'), handle(activity.listTasks));
router.post('/tasks', can('tasks.create'), handle(activity.createTask));
router.post('/tasks/bulk', can('tasks.create'), handle(crm360.bulkTasks));
router.put('/tasks/:taskId', validId('taskId'), can('tasks.update'), handle(activity.updateTask));

router.use((req, res) => res.status(404).json({ message: 'Not found.' }));

module.exports = router;
