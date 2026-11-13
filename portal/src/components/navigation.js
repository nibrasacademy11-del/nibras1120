// The admin panel's map: sections, their pages, and what each page needs.
// The sidebar and the "My access" page both read it, so they always agree.
//
// item fields:
//   to, key (label), icon, end (exact match)
//   permission + minScope: shown when the user holds it at that scope or wider
//   resource: the permission resource shown on "My access" (defaults to the permission's resource)
//   staffOnly / customerOnly / adminOnly / superOnly, hideWith (hidden from those who hold it for all)
//   desc: the label key of a one-line description

export const SECTIONS = [
  {
    key: 'sec_home',
    items: [
      { to: '/', key: 'dashboard', icon: '⌂', end: true, staffOnly: true, desc: 'd_dashboard' },
      { to: '/my-profile', key: 'mp_title', icon: '☺', staffOnly: true, desc: 'd_myProfile' },
      { to: '/my-team', key: 'mt_title', icon: '⚑', permission: 'teams.invite', minScope: 'team', desc: 'd_myTeam' },
      { to: '/my-access', key: 'myAccessNav', icon: '◎', staffOnly: true, desc: 'd_myAccess' }
    ]
  },
  {
    key: 'sec_customer',
    customerOnly: true,
    items: [
      { to: '/', key: 'myPrograms', icon: '▤', end: true, customerOnly: true, desc: 'd_myPrograms' },
      { to: '/my-lectures', key: 'myLectures', icon: '▶', customerOnly: true, desc: 'd_myLectures' },
      { to: '/my-payments', key: 'myPayments', icon: '¤', customerOnly: true, desc: 'd_myPayments' },
      { to: '/my-certificates', key: 'myCertificates', icon: '✪', customerOnly: true, desc: 'd_myCertificates' },
      { to: '/my-complaints', key: 'myComplaints', icon: '✉', customerOnly: true, desc: 'd_myComplaints' }
    ]
  },
  {
    key: 'sec_crm',
    items: [
      { to: '/customers', key: 'customers', icon: '◉', permission: 'customers.view', desc: 'd_customers' },
      { to: '/leads', key: 'leadsNav', icon: '▥', permission: 'customers.view', staffOnly: true, desc: 'd_leads' },
      { to: '/lookup', key: 'lookup', icon: '⌕', permission: 'customer_lookup.view', desc: 'd_lookup' },
      { to: '/tasks', key: 'tasks', icon: '✓', permission: 'tasks.view', desc: 'd_tasks' },
      { to: '/complaints', key: 'complaintsNav', icon: '✉', permission: 'complaints.view', staffOnly: true, desc: 'd_complaints' },
      { to: '/access-requests', key: 'accessRequests', icon: '⇄', permission: 'access_requests.view', desc: 'd_accessRequests' },
      { to: '/duplicates', key: 'duplicates', icon: '⧉', permission: 'customers.manage', minScope: 'all', desc: 'd_duplicates' }
    ]
  },
  {
    key: 'sec_learning',
    items: [
      { to: '/programs', key: 'programsNav', icon: '▤', permission: 'programs.view', staffOnly: true, desc: 'd_programs' },
      { to: '/groups', key: 'groupsNav', icon: '▶', permission: 'programs.view', staffOnly: true, desc: 'd_groups' },
      { to: '/enrollments', key: 'enrollmentsNav', icon: '❖', permission: 'enrollments.view', staffOnly: true, desc: 'd_enrollments' },
      { to: '/reviews', key: 'reviews', icon: '✔', permission: 'enrollments.approve', minScope: 'team', desc: 'd_reviews' },
      { to: '/certificates', key: 'certificatesNav', icon: '✪', permission: 'certificates.view', staffOnly: true, desc: 'd_certificates' }
    ]
  },
  {
    key: 'sec_finance',
    items: [
      { to: '/finance', key: 'fhTitle', icon: '¤', permission: 'payments.view', minScope: 'all', desc: 'd_finance' },
      { to: '/payments', key: 'paymentsNav', icon: '⊕', permission: 'payments.view', staffOnly: true, hideWith: 'payments.view', desc: 'd_payments' },
      { to: '/commissions', key: 'commissionsNav', icon: '%', permission: 'commissions.view', desc: 'd_commissions' }
    ]
  },
  {
    key: 'sec_hr',
    items: [
      { to: '/employees', key: 'employees', icon: '☺', permission: 'employees.view', minScope: 'team', desc: 'd_employees' },
      { to: '/teams', key: 'teams', icon: '▦', permission: 'teams.view', minScope: 'team', desc: 'd_teams' },
      { to: '/attendance', key: 'attendanceNav', icon: '◷', permission: 'attendance.view', desc: 'd_attendance' },
      { to: '/leaves', key: 'leavesNav', icon: '☂', permission: 'leaves.view', desc: 'd_leaves' },
      { to: '/payroll', key: 'payrollNav', icon: '₤', permission: 'payroll.view', minScope: 'all', desc: 'd_payroll' },
      { to: '/performance', key: 'reviewsNav', icon: '★', permission: 'reviews.create', minScope: 'team', desc: 'd_reviews' },
      { to: '/my-performance', key: 'myReviewsNav', icon: '☆', permission: 'reviews.view', staffOnly: true, desc: 'd_myReviews' },
      { to: '/my-payslips', key: 'myPayslipsNav', icon: '₤', permission: 'payroll.view', staffOnly: true, hideWith: 'payroll.view', desc: 'd_myPayslips' }
    ]
  },
  {
    key: 'sec_reports',
    items: [
      { to: '/reports', key: 'reportsNav', icon: '▤', staffOnly: true, resource: 'reports', desc: 'd_reports' },
      { to: '/analytics', key: 'analyticsNav', icon: '◔', permission: 'reports.view', minScope: 'team', desc: 'd_analytics' }
    ]
  },
  {
    key: 'sec_system',
    items: [
      { to: '/website', key: 'websiteNav', icon: '◍', permission: 'website.manage', minScope: 'all', zones: ['all', 'cms'], desc: 'd_website' },
      { to: '/user-accounts', key: 'userAccountsNav', icon: '⚇', adminOnly: true, zones: ['all', 'staff'], desc: 'd_userAccounts' },
      { to: '/settings', key: 'settings', icon: '⚙', permission: 'settings.manage', minScope: 'all', desc: 'd_settings' },
      { to: '/roles', key: 'roles', icon: '◈', permission: 'roles.view', minScope: 'all', desc: 'd_roles' },
      { to: '/audit', key: 'audit', icon: '☰', permission: 'audit.view', minScope: 'all', desc: 'd_audit' },
      { to: '/print-samples', key: 'printSamplesNav', icon: '⎙', adminOnly: true, desc: 'd_printSamples' },
      { to: '/system', key: 'systemNav', icon: '♥', superOnly: true, desc: 'd_system' }
    ]
  },
  {
    key: 'sec_account',
    items: [
      { to: '/attend', key: 'navAttend', icon: '◷', staffOnly: true, desc: 'd_attend' },
      { to: '/security', key: 'security', icon: '⚿', desc: 'd_security' }
    ]
  }
];

const RANK = { own: 1, team: 2, department: 3, all: 4 };

// Whether a user with these grants and this role sees the item
// zone: where the portal is open (all, staff, cms, site). On cms only the website pages and the
// account's own security show; the website editor is not part of the staff menu.
const CMS_PAGES = ['/website', '/security'];
export function itemVisible(item, { role, isStaff, grants, zone = 'all' }) {
  const can = (perm, min = 'own') => !!grants && !!grants[perm] && RANK[grants[perm]] >= RANK[min];
  if (zone === 'cms' && !CMS_PAGES.includes(item.to)) return false;
  if (item.zones && !item.zones.includes(zone === 'site' ? 'all' : zone)) return false;
  if (item.staffOnly && !isStaff) return false;
  if (item.customerOnly && isStaff) return false;
  if (item.superOnly && role !== 'super_admin') return false;
  if (item.adminOnly && !['super_admin', 'admin'].includes(role)) return false;
  if (item.hideWith && can(item.hideWith, 'all')) return false;
  if (item.permission && !can(item.permission, item.minScope)) return false;
  return true;
}

export function visibleSections(user) {
  return SECTIONS
    .filter((s) => !(s.customerOnly && user.isStaff))
    .map((s) => ({ ...s, items: s.items.filter((i) => itemVisible(i, user)) }))
    .filter((s) => s.items.length);
}

export const ACTIONS = ['view', 'create', 'update', 'archive', 'approve', 'export', 'print', 'manage'];
export const resourceOf = (item) => item.resource || (item.permission ? item.permission.split('.')[0] : null);

// What a user can do on a resource, grouped by reach: { all: [...actions], team: [...], own: [...] }
export function actionsOn(resource, grants) {
  const out = { all: [], team: [], own: [] };
  if (!resource || !grants) return out;
  for (const a of ACTIONS) {
    const scope = grants[`${resource}.${a}`];
    if (scope && out[scope]) out[scope].push(a);
  }
  return out;
}
