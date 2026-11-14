// The menu of each role (PLAN-V2: five roles, a few pages each). One fixed list per role,
// so nobody sees more than their work. The server still checks every request on its own.
//
// item fields: to, key (label), icon, end (exact match), desc (one-line description label)

const MINE = {
  day: { to: '/', key: 'navMyDay', icon: '⌂', end: true, desc: 'd_dashboard' },
  customers: { to: '/customers', key: 'navMyCustomers', icon: '◉', desc: 'd_customers' },
  tasks: { to: '/tasks', key: 'tasks', icon: '✓', desc: 'd_tasks' },
  attendance: { to: '/attendance', key: 'navMyAttendance', icon: '◷', desc: 'd_attendance' },
  leaves: { to: '/leaves', key: 'navMyLeaves', icon: '☂', desc: 'd_leaves' },
  money: { to: '/my-payslips', key: 'myPayslipsNav', icon: '₤', desc: 'd_myPayslips' },
  profile: { to: '/my-profile', key: 'mp_title', icon: '☺', desc: 'd_myProfile' }
};

export const MENUS = {
  // The owner: everything, in a few clear sections
  super_admin: [
    { key: 'sec_home', items: [
      { to: '/', key: 'dashboard', icon: '⌂', end: true, desc: 'd_dashboard' },
      { to: '/reports', key: 'reportsNav', icon: '▤', desc: 'd_reports' }
    ] },
    { key: 'sec_crm', items: [
      { to: '/customers', key: 'customers', icon: '◉', desc: 'd_customers' },
      { to: '/tasks', key: 'tasks', icon: '✓', desc: 'd_tasks' },
      { to: '/complaints', key: 'complaintsNav', icon: '✉', desc: 'd_complaints' }
    ] },
    { key: 'sec_learning', items: [
      { to: '/programs', key: 'programsNav', icon: '▤', desc: 'd_programs' },
      { to: '/groups', key: 'groupsNav', icon: '▶', desc: 'd_groups' },
      { to: '/enrollments', key: 'enrollmentsNav', icon: '❖', desc: 'd_enrollments' },
      { to: '/certificates', key: 'certificatesNav', icon: '✪', desc: 'd_certificates' }
    ] },
    { key: 'sec_finance', items: [
      { to: '/finance', key: 'fhTitle', icon: '¤', desc: 'd_finance' },
      { to: '/commissions', key: 'commissionsNav', icon: '%', desc: 'd_commissions' }
    ] },
    { key: 'sec_hr', items: [
      { to: '/employees', key: 'employees', icon: '☺', desc: 'd_employees' },
      { to: '/teams', key: 'teams', icon: '▦', desc: 'd_teams' },
      { to: '/my-team', key: 'mt_invitations', icon: '⚑', desc: 'd_myTeam' },
      { to: '/attendance', key: 'attendanceNav', icon: '◷', desc: 'd_attendance' },
      { to: '/leaves', key: 'leavesNav', icon: '☂', desc: 'd_leaves' },
      { to: '/payroll', key: 'payrollNav', icon: '₤', desc: 'd_payroll' },
      { to: '/performance', key: 'reviewsNav', icon: '★', desc: 'd_reviews' }
    ] },
    { key: 'sec_system', items: [
      { to: '/website', key: 'websiteNav', icon: '◍', desc: 'd_website' },
      { to: '/settings', key: 'settings', icon: '⚙', desc: 'd_settings' },
      { to: '/user-accounts', key: 'userAccountsNav', icon: '⚇', desc: 'd_userAccounts' },
      { to: '/audit', key: 'audit', icon: '☰', desc: 'd_audit' },
      { to: '/security', key: 'security', icon: '⚿', desc: 'd_security' }
    ] }
  ],
  // A team leader: their own work, plus their team
  team_leader: [
    { key: 'sec_mine', items: [MINE.day, MINE.customers, { to: '/my-team', key: 'mt_title', icon: '⚑', desc: 'd_myTeam' }, MINE.tasks, MINE.attendance, MINE.leaves, MINE.money, MINE.profile] }
  ],
  employee: [
    { key: 'sec_mine', items: [MINE.day, MINE.customers, MINE.tasks, MINE.attendance, MINE.leaves, MINE.money, MINE.profile] }
  ],
  customer_support: [
    { key: 'sec_mine', items: [
      { to: '/customers', key: 'customers', icon: '◉', desc: 'd_customers' },
      { to: '/complaints', key: 'complaintsNav', icon: '✉', desc: 'd_complaints' },
      { to: '/groups', key: 'groupsNav', icon: '▶', desc: 'd_groups' },
      { to: '/certificates', key: 'certificatesNav', icon: '✪', desc: 'd_certificates' },
      MINE.tasks, MINE.attendance, MINE.leaves, MINE.profile
    ] }
  ],
  customer: [
    { key: 'sec_customer', items: [
      { to: '/', key: 'myPrograms', icon: '▤', end: true, desc: 'd_myPrograms' },
      { to: '/my-lectures', key: 'myLectures', icon: '▶', desc: 'd_myLectures' },
      { to: '/my-payments', key: 'myPayments', icon: '¤', desc: 'd_myPayments' },
      { to: '/my-certificates', key: 'myCertificates', icon: '✪', desc: 'd_myCertificates' },
      { to: '/my-complaints', key: 'myComplaints', icon: '✉', desc: 'd_myComplaints' },
      { to: '/security', key: 'security', icon: '⚿', desc: 'd_security' }
    ] }
  ]
};

// The roles that no longer exist are read as employee (see lib/permissions.js)
const ROLE_OF = { student: 'customer', user: 'customer', admin: 'employee', hr_manager: 'employee', finance_manager: 'employee', accountant: 'employee', cms_manager: 'employee' };
export const menuRole = (role) => (MENUS[role] ? role : ROLE_OF[role] || 'customer');

// cms.* shows only the website editor and the account's security
const CMS_PAGES = ['/website', '/security'];

export function visibleSections({ role, zone = 'all' }) {
  return MENUS[menuRole(role)]
    .map((s) => ({ ...s, items: s.items.filter((i) => zone !== 'cms' || CMS_PAGES.includes(i.to)) }))
    .filter((s) => s.items.length);
}
