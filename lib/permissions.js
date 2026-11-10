// Role-based permissions, enforced on the server against the data itself.
// A grant maps "resource.action" to a scope: own (records the user is responsible for),
// team (records of the teams the user belongs to or leads) or all.
// The rules here are pure so they can be unit tested; models/RolePolicy.js stores admin overrides.

const ROLES = [
    'super_admin',
    'admin',
    'hr_manager',
    'finance_manager',
    'team_leader',
    'employee',
    'accountant',
    'customer_support',
    'customer'
];

// Older accounts were created with these roles; they are customers
const LEGACY_ROLES = { student: 'customer', user: 'customer' };

const ROLE_LABELS = {
    super_admin: { ar: 'مدير النظام', en: 'Super Admin' },
    admin: { ar: 'مدير', en: 'Admin' },
    hr_manager: { ar: 'مدير الموارد البشرية', en: 'HR Manager' },
    finance_manager: { ar: 'المدير المالي', en: 'Finance Manager' },
    team_leader: { ar: 'قائد فريق', en: 'Team Leader' },
    employee: { ar: 'موظف', en: 'Employee' },
    accountant: { ar: 'محاسب', en: 'Accountant' },
    customer_support: { ar: 'خدمة العملاء', en: 'Customer Support' },
    customer: { ar: 'عميل', en: 'Customer' }
};

const ACTIONS = ['view', 'create', 'update', 'archive', 'approve', 'export', 'print', 'manage'];

const ACTION_LABELS = {
    view: { ar: 'مشاهدة', en: 'View' },
    create: { ar: 'إنشاء', en: 'Create' },
    update: { ar: 'تعديل', en: 'Update' },
    archive: { ar: 'أرشفة', en: 'Archive' },
    approve: { ar: 'اعتماد', en: 'Approve' },
    export: { ar: 'تصدير', en: 'Export' },
    print: { ar: 'طباعة', en: 'Print' },
    manage: { ar: 'إدارة', en: 'Manage' }
};

const RESOURCES = {
    customers: { ar: 'ملفات العملاء', en: 'Customer files' },
    customer_lookup: { ar: 'البحث عن عميل (بيانات أساسية)', en: 'Customer lookup (basic card)' },
    customer_identity: { ar: 'بيانات الهوية', en: 'Identity data' },
    customer_contact: { ar: 'بيانات التواصل', en: 'Contact data' },
    customer_financial: { ar: 'البيانات المالية للعميل', en: 'Customer financial data' },
    customer_documents: { ar: 'مستندات العميل', en: 'Customer documents' },
    customer_notes: { ar: 'الملاحظات الداخلية', en: 'Internal notes' },
    access_requests: { ar: 'طلبات التصريح', en: 'Access requests' },
    users: { ar: 'حسابات المستخدمين', en: 'User accounts' },
    employees: { ar: 'الموظفون', en: 'Employees' },
    teams: { ar: 'الأقسام والفرق', en: 'Departments & teams' },
    attendance: { ar: 'الحضور والانصراف', en: 'Attendance' },
    leaves: { ar: 'الإجازات والاستئذان', en: 'Leaves' },
    programs: { ar: 'البرامج والمحاور', en: 'Programs & modules' },
    enrollments: { ar: 'التسجيلات', en: 'Enrollments' },
    certificates: { ar: 'الشهادات', en: 'Certificates' },
    payments: { ar: 'المدفوعات', en: 'Payments' },
    expenses: { ar: 'المصروفات', en: 'Expenses' },
    accounts: { ar: 'الخزائن والحسابات', en: 'Cash & bank accounts' },
    currencies: { ar: 'العملات وأسعار الصرف', en: 'Currencies & rates' },
    commissions: { ar: 'العمولات', en: 'Commissions' },
    tasks: { ar: 'المهام والمتابعات', en: 'Tasks & follow-ups' },
    complaints: { ar: 'الشكاوى', en: 'Complaints' },
    reports: { ar: 'التقارير', en: 'Reports' },
    audit: { ar: 'سجل العمليات', en: 'Audit log' },
    roles: { ar: 'الأدوار والصلاحيات', en: 'Roles & permissions' },
    settings: { ar: 'إعدادات النظام', en: 'System settings' }
};

const SCOPES = ['own', 'team', 'all'];
const SCOPE_RANK = { own: 1, team: 2, all: 3 };

function normalizeRole(role) {
    if (LEGACY_ROLES[role]) return LEGACY_ROLES[role];
    return ROLES.includes(role) ? role : 'customer';
}

const isStaffRole = (role) => normalizeRole(role) !== 'customer';
const isAdminRole = (role) => ['super_admin', 'admin'].includes(normalizeRole(role));

function grant(map, resources, actions, scope) {
    for (const r of [].concat(resources)) {
        for (const a of [].concat(actions)) map[`${r}.${a}`] = scope;
    }
    return map;
}

const EVERY_ACTION = ACTIONS;
const READ = ['view', 'print', 'export'];

function buildDefaults() {
    const all = Object.keys(RESOURCES);
    const d = {};

    // Admin: everything, except editing role definitions, which stays with the super admin
    d.admin = grant({}, all, EVERY_ACTION, 'all');
    delete d.admin['roles.manage'];
    delete d.admin['roles.update'];
    delete d.admin['roles.create'];
    delete d.admin['roles.archive'];

    d.hr_manager = grant({}, ['employees', 'teams', 'attendance', 'leaves'], EVERY_ACTION, 'all');
    grant(d.hr_manager, ['users'], ['view', 'create', 'update'], 'all');
    grant(d.hr_manager, ['customers'], 'manage', 'all'); // moves the customers of a departing employee
    grant(d.hr_manager, ['tasks'], ['view', 'create', 'update'], 'all');
    grant(d.hr_manager, ['reports'], READ, 'all');
    grant(d.hr_manager, ['programs', 'customer_lookup'], 'view', 'all');

    d.finance_manager = grant({}, ['payments', 'expenses', 'accounts', 'currencies', 'commissions'], EVERY_ACTION, 'all');
    grant(d.finance_manager, ['customers', 'customer_financial', 'enrollments', 'programs', 'customer_lookup', 'customer_contact'], READ, 'all');
    grant(d.finance_manager, ['customer_financial'], ['create', 'update', 'approve'], 'all');
    grant(d.finance_manager, ['reports'], READ, 'all');
    grant(d.finance_manager, ['audit'], 'view', 'all');
    grant(d.finance_manager, ['attendance', 'leaves'], ['view', 'create'], 'own');

    d.accountant = grant({}, ['payments'], ['view', 'create', 'update', 'print', 'export'], 'all'); // update = confirm payments recorded by employees
    grant(d.accountant, ['expenses'], ['view', 'create', 'print'], 'all');
    grant(d.accountant, ['accounts', 'currencies', 'commissions'], ['view', 'print'], 'all');
    grant(d.accountant, ['customers', 'customer_financial', 'enrollments', 'programs', 'customer_lookup'], ['view', 'print'], 'all');
    grant(d.accountant, ['customer_financial'], ['create', 'update'], 'all');
    grant(d.accountant, ['reports'], READ, 'all');
    grant(d.accountant, ['attendance', 'leaves'], ['view', 'create'], 'own');

    d.team_leader = grant({}, ['customers'], ['view', 'create', 'update', 'print', 'export', 'manage'], 'team');
    grant(d.team_leader, ['teams'], 'view', 'team');
    grant(d.team_leader, ['customer_contact', 'customer_financial', 'customer_documents', 'customer_notes'], ['view', 'create', 'update', 'print'], 'team');
    grant(d.team_leader, ['customer_identity'], ['view', 'create', 'update'], 'team');
    grant(d.team_leader, ['enrollments'], ['view', 'create', 'update', 'approve', 'print', 'export', 'manage'], 'team');
    grant(d.team_leader, ['payments'], ['view', 'create', 'print'], 'team');
    grant(d.team_leader, ['commissions', 'employees', 'attendance', 'certificates'], ['view', 'print'], 'team');
    grant(d.team_leader, ['leaves'], ['view', 'approve'], 'team');
    grant(d.team_leader, ['tasks', 'complaints'], ['view', 'create', 'update', 'print'], 'team');
    grant(d.team_leader, ['access_requests'], ['view', 'create', 'approve'], 'own');
    grant(d.team_leader, ['reports'], READ, 'team');
    grant(d.team_leader, ['programs', 'customer_lookup'], 'view', 'all');
    grant(d.team_leader, ['attendance', 'leaves'], 'create', 'own');

    d.employee = grant({}, ['customers'], ['view', 'create', 'update', 'print'], 'own');
    grant(d.employee, ['customer_contact', 'customer_financial', 'customer_documents', 'customer_notes'], ['view', 'create', 'update'], 'own');
    grant(d.employee, ['customer_identity'], ['view', 'create', 'update'], 'own');
    grant(d.employee, ['enrollments'], ['view', 'create', 'update', 'print'], 'own');
    grant(d.employee, ['payments'], ['view', 'create', 'print'], 'own');
    grant(d.employee, ['commissions', 'certificates'], 'view', 'own');
    grant(d.employee, ['tasks', 'complaints'], ['view', 'create', 'update'], 'own');
    grant(d.employee, ['attendance', 'leaves'], ['view', 'create'], 'own');
    grant(d.employee, ['access_requests'], ['view', 'create', 'approve'], 'own');
    grant(d.employee, ['programs', 'customer_lookup'], 'view', 'all');
    grant(d.employee, ['employees', 'teams'], 'view', 'own');

    d.customer_support = grant({}, ['customers', 'customer_contact'], ['view'], 'all');
    grant(d.customer_support, ['complaints'], EVERY_ACTION, 'all');
    grant(d.customer_support, ['customer_notes'], ['view', 'create'], 'all');
    grant(d.customer_support, ['tasks'], ['view', 'create', 'update'], 'own');
    grant(d.customer_support, ['enrollments', 'programs', 'certificates', 'customer_lookup'], 'view', 'all');
    grant(d.customer_support, ['attendance', 'leaves'], ['view', 'create'], 'own');
    grant(d.customer_support, ['access_requests'], ['view', 'create'], 'own');

    // Customers only ever see their own records
    d.customer = grant({}, ['enrollments', 'payments', 'certificates', 'customer_documents'], ['view', 'print'], 'own');
    grant(d.customer, ['complaints'], ['view', 'create'], 'own');
    grant(d.customer, ['programs'], 'view', 'all');

    return d;
}

const DEFAULT_GRANTS = Object.freeze(buildDefaults());

function allGrants() {
    return grant({}, Object.keys(RESOURCES), ACTIONS, 'all');
}

// Keeps only known permissions with valid scopes, so a bad save cannot widen access
function sanitizeGrants(input) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    for (const [key, scope] of Object.entries(input)) {
        const [resource, action, extra] = String(key).split('.');
        if (extra !== undefined || !RESOURCES[resource] || !ACTIONS.includes(action)) continue;
        if (!SCOPES.includes(scope)) continue;
        out[`${resource}.${action}`] = scope;
    }
    return out;
}

// overrides: { [role]: grants } saved by the super admin. The super admin itself can never be limited.
function effectiveGrants(role, overrides = {}) {
    const r = normalizeRole(role);
    if (r === 'super_admin') return allGrants();
    if (overrides && overrides[r]) return sanitizeGrants(overrides[r]);
    return { ...(DEFAULT_GRANTS[r] || {}) };
}

// Returns the scope the user holds for a permission, or null
function scopeFor(grants, permission) {
    return (grants && grants[permission]) || null;
}

function hasScope(granted, required = 'own') {
    return !!granted && SCOPE_RANK[granted] >= SCOPE_RANK[required];
}

// Builds the MongoDB filter that limits a query to what the scope allows.
// fields: the record's owner field and team field. A missing scope matches nothing.
function scopeFilter(scope, actor, fields = {}) {
    const ownerField = fields.owner || 'owner';
    const teamField = fields.team || 'team';
    const nothing = { _id: { $exists: false } };
    if (!actor || !actor.id) return nothing;
    if (scope === 'all') return {};
    if (scope === 'team') {
        const teams = (actor.teamIds || []).map(String);
        const or = [{ [ownerField]: actor.id }];
        if (teams.length) or.push({ [teamField]: { $in: teams } });
        return { $or: or };
    }
    if (scope === 'own') return { [ownerField]: actor.id };
    return nothing;
}

// Checks one record against a scope, for single-record reads and writes
function recordInScope(scope, actor, record, fields = {}) {
    if (!actor || !record) return false;
    if (scope === 'all') return true;
    const owner = record[fields.owner || 'owner'];
    const team = record[fields.team || 'team'];
    const isOwner = owner != null && String(owner._id || owner) === String(actor.id);
    if (scope === 'own') return isOwner;
    if (scope === 'team') {
        const teams = (actor.teamIds || []).map(String);
        return isOwner || (team != null && teams.includes(String(team._id || team)));
    }
    return false;
}

// Shows only the last few characters of an identifier, for users without full access
function maskIdentifier(value, visible = 4) {
    const s = String(value || '');
    if (!s) return '';
    if (s.length <= visible) return '•'.repeat(s.length);
    return '•'.repeat(s.length - visible) + s.slice(-visible);
}

module.exports = {
    ROLES,
    LEGACY_ROLES,
    ROLE_LABELS,
    ACTIONS,
    ACTION_LABELS,
    RESOURCES,
    SCOPES,
    DEFAULT_GRANTS,
    normalizeRole,
    isStaffRole,
    isAdminRole,
    sanitizeGrants,
    effectiveGrants,
    scopeFor,
    hasScope,
    scopeFilter,
    recordInScope,
    maskIdentifier
};
