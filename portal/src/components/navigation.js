// The menu of each role (16 Nov 2026): a short list that is always open, a handful of items each.
// Pages that belong together sit under one item and show as tabs at the top of the page
// (Customers: the customers, their sign-in accounts, data change requests, data access requests).
// The server still checks every request on its own; a tab the role cannot open is not listed.
//
// item fields: to (where the item opens), key (label), icon, end (exact match), tabs [{ to, key }]

const T = (to, key) => ({ to, key });

const HOME = { to: '/', key: 'nv_home', icon: '⌂', end: true, tabs: [T('/', 'nv_dashboard'), T('/reports', 'reportsNav')] };
const CUSTOMERS = { to: '/customers', key: 'customers', icon: '◉', tabs: [T('/customers', 'customers'), T('/customer-accounts', 'ca_title'), T('/profile-requests', 'prq_title'), T('/access-requests', 'nv_access')] };
const FOLLOW_UP = { to: '/tasks', key: 'nv_followUp', icon: '✓', tabs: [T('/tasks', 'tasks'), T('/complaints', 'complaintsNav')] };
const LEARNING = { to: '/programs', key: 'nv_learning', icon: '▤', tabs: [T('/programs', 'programsNav'), T('/groups', 'groupsNav'), T('/enrollments', 'enrollmentsNav'), T('/certificates', 'certificatesNav')] };
const MONEY = { to: '/finance', key: 'nv_money', icon: '¤', tabs: [T('/finance', 'fhTitle'), T('/commissions', 'commissionsNav')] };

// a staff member's own things: their file, entitlements, review and account security
const mine = (extra = []) => ({ to: '/my-profile', key: 'nv_mine', icon: '☺', tabs: [T('/my-profile', 'mp_title'), ...extra, T('/security', 'security')] });

export const MENUS = {
  // The owner: everything
  super_admin: [
    HOME,
    CUSTOMERS,
    FOLLOW_UP,
    LEARNING,
    MONEY,
    { to: '/employees', key: 'nv_team', icon: '▦', tabs: [T('/employees', 'employees'), T('/teams', 'teams'), T('/attendance', 'attendanceNav'), T('/leaves', 'leavesNav'), T('/payroll', 'payrollNav'), T('/performance', 'reviewsNav'), T('/my-team', 'mt_invitations')] },
    { to: '/settings', key: 'nv_settings', icon: '⚙', tabs: [T('/settings', 'settings'), T('/website', 'websiteNav'), T('/user-accounts', 'userAccountsNav'), T('/audit', 'audit'), T('/security', 'security')] }
  ],
  // The assistant: the owner's work without the money (no accounts, commissions, payroll, audit, settings)
  assistant: [
    HOME,
    CUSTOMERS,
    FOLLOW_UP,
    LEARNING,
    { to: '/employees', key: 'nv_team', icon: '▦', tabs: [T('/employees', 'employees'), T('/teams', 'teams'), T('/attendance', 'attendanceNav'), T('/leaves', 'leavesNav'), T('/performance', 'reviewsNav'), T('/my-team', 'mt_invitations')] },
    { to: '/website', key: 'nv_site', icon: '◍', tabs: [T('/website', 'websiteNav'), T('/user-accounts', 'userAccountsNav')] },
    mine([T('/my-payslips', 'myPayslipsNav')])
  ],
  // A team leader: their own work and their team
  team_leader: [
    { to: '/', key: 'navMyDay', icon: '⌂', end: true },
    { to: '/customers', key: 'navMyCustomers', icon: '◉', tabs: [T('/customers', 'navMyCustomers'), T('/lookup', 'nv_lookup'), T('/access-requests', 'nv_access')] },
    { to: '/my-team', key: 'mt_title', icon: '⚑', tabs: [T('/my-team', 'mt_title'), T('/performance', 'reviewsNav')] },
    { to: '/tasks', key: 'tasks', icon: '✓' },
    { to: '/attendance', key: 'navMyAttendance', icon: '◷', tabs: [T('/attendance', 'navMyAttendance'), T('/leaves', 'navMyLeaves')] },
    mine([T('/my-payslips', 'myPayslipsNav'), T('/my-performance', 'nv_myReview')])
  ],
  // An employee: their own customers and work
  employee: [
    { to: '/', key: 'navMyDay', icon: '⌂', end: true },
    { to: '/customers', key: 'navMyCustomers', icon: '◉', tabs: [T('/customers', 'navMyCustomers'), T('/lookup', 'nv_lookup'), T('/access-requests', 'nv_access')] },
    { to: '/tasks', key: 'tasks', icon: '✓' },
    { to: '/attendance', key: 'navMyAttendance', icon: '◷', tabs: [T('/attendance', 'navMyAttendance'), T('/leaves', 'navMyLeaves')] },
    mine([T('/my-payslips', 'myPayslipsNav'), T('/my-performance', 'nv_myReview')])
  ],
  customer: [
    { to: '/', key: 'myPrograms', icon: '▤', end: true },
    { to: '/my-lectures', key: 'myLectures', icon: '▶' },
    { to: '/my-payments', key: 'myPayments', icon: '¤' },
    { to: '/my-certificates', key: 'myCertificates', icon: '✪' },
    { to: '/my-complaints', key: 'myComplaints', icon: '✉' },
    { to: '/security', key: 'security', icon: '⚿' }
  ]
};

// Roles that no longer exist are read as their replacement (see lib/permissions.js)
const ROLE_OF = { student: 'customer', user: 'customer', admin: 'employee', hr_manager: 'employee', finance_manager: 'employee', accountant: 'employee', cms_manager: 'employee', customer_support: 'assistant' };
export const menuRole = (role) => (MENUS[role] ? role : ROLE_OF[role] || 'customer');

const matches = (to, path, end) => (end || to === '/' ? path === to : path === to || path.startsWith(`${to}/`));

export function menuItems({ role, zone = 'all' }) {
  const items = MENUS[menuRole(role)];
  if (zone === 'cms') return [{ to: '/website', key: 'websiteNav', icon: '◍' }, { to: '/security', key: 'security', icon: '⚿' }];
  return items;
}

// The menu item a page belongs to (its own link, or one of its tabs); the longest match wins
export function itemFor(items, path) {
  let found = null;
  let len = -1;
  for (const i of items) {
    for (const x of [{ to: i.to, end: i.end }, ...(i.tabs || [])]) {
      if (matches(x.to, path, x.end) && x.to.length > len) { found = i; len = x.to.length; }
    }
  }
  return found;
}

// Kept for older callers and tests: the menu as one section
export function visibleSections({ role, zone = 'all' }) {
  return [{ key: 'menu', items: menuItems({ role, zone }) }];
}
