// Role-based permissions, enforced on the server against the data itself.
// A grant maps "resource.action" to a scope: own (records the user is responsible for),
// team (records of the teams the user belongs to or leads) or all.
// The rules here are pure so they can be unit tested; models/RolePolicy.js stores admin overrides.

// Four staff accounts and the customer (decided 16 Nov 2026): the owner; the assistant, who does
// everything the owner does except the money figures (collected, net, owed, expenses, payroll,
// commissions) and the finance and audit reports; the team leader, with employees under them;
// and the employee, who works on their own customers only.
const ROLES = [
    'super_admin',
    'assistant',
    'team_leader',
    'employee',
    'customer'
];

// Roles that no longer exist are read as their replacement until tools/migrations/005 rewrites them
const LEGACY_ROLES = {
    student: 'customer',
    user: 'customer',
    admin: 'employee',
    hr_manager: 'employee',
    finance_manager: 'employee',
    accountant: 'employee',
    cms_manager: 'employee',
    // customer service became the assistant (16 Nov 2026)
    customer_support: 'assistant'
};

const ROLE_LABELS = {
    super_admin: { ar: 'المالك', en: 'Owner' },
    team_leader: { ar: 'قائد فريق', en: 'Team Leader' },
    employee: { ar: 'موظف', en: 'Employee' },
    assistant: { ar: 'المساعد', en: 'Assistant' },
    customer: { ar: 'عميل', en: 'Customer' }
};

const ACTIONS = ['view', 'create', 'update', 'archive', 'approve', 'export', 'print', 'manage', 'assign', 'invite', 'publish'];

const ACTION_LABELS = {
    view: { ar: 'مشاهدة', en: 'View' },
    create: { ar: 'إنشاء', en: 'Create' },
    update: { ar: 'تعديل', en: 'Update' },
    archive: { ar: 'أرشفة', en: 'Archive' },
    approve: { ar: 'اعتماد', en: 'Approve' },
    export: { ar: 'تصدير', en: 'Export' },
    print: { ar: 'طباعة', en: 'Print' },
    manage: { ar: 'إدارة', en: 'Manage' },
    assign: { ar: 'إسناد', en: 'Assign' },
    invite: { ar: 'دعوة', en: 'Invite' },
    publish: { ar: 'نشر', en: 'Publish' }
};

const RESOURCES = {
    customers: { ar: 'ملفات العملاء', en: 'Customer files' },
    customer_lookup: { ar: 'البحث عن عميل (بيانات أساسية)', en: 'Customer lookup (basic card)' },
    customer_identity: { ar: 'بيانات الهوية', en: 'Identity data' },
    customer_contact: { ar: 'بيانات التواصل', en: 'Contact data' },
    customer_financial: { ar: 'البيانات المالية للعميل', en: 'Customer financial data' },
    customer_documents: { ar: 'مستندات العميل', en: 'Customer documents' },
    customer_notes: { ar: 'الملاحظات الداخلية', en: 'Internal notes' },
    profile_requests: { ar: 'طلبات تعديل بيانات العملاء', en: 'Customer data change requests' },
    customer_accounts: { ar: 'حسابات دخول العملاء (وإعادة كلمة المرور)', en: 'Customer sign-in accounts (password resets)' },
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
    settings: { ar: 'إعدادات النظام', en: 'System settings' },
    website: { ar: 'إدارة الموقع الإلكتروني (cms)', en: 'Website editing (cms)' },
    payroll: { ar: 'المرتبات والسلف', en: 'Payroll & advances' },
    reviews: { ar: 'تقييم الأداء', en: 'Performance reviews' }
};

// own: my records (or shared with me by an approved request) · team: my teams · department: every team
// of my department · all: the whole academy
const SCOPES = ['own', 'team', 'department', 'all'];
const SCOPE_RANK = { own: 1, team: 2, department: 3, all: 4 };

function normalizeRole(role) {
    if (LEGACY_ROLES[role]) return LEGACY_ROLES[role];
    return ROLES.includes(role) ? role : 'customer';
}

const isStaffRole = (role) => normalizeRole(role) !== 'customer';
// Only the owner is an admin now
const isAdminRole = (role) => normalizeRole(role) === 'super_admin';

function grant(map, resources, actions, scope) {
    for (const r of [].concat(resources)) {
        for (const a of [].concat(actions)) map[`${r}.${a}`] = scope;
    }
    return map;
}

const EVERY_ACTION = ACTIONS;
const READ = ['view', 'print', 'export'];

function buildDefaults() {
    const d = {};
    // the owner (super_admin) always has everything; see effectiveGrants

    // Employee: their own customers and work, their own attendance, leave, money and reviews.
    // No academy-wide search, no identity numbers, nobody else's customers.
    d.employee = grant({}, ['customers'], ['view', 'create', 'update', 'print'], 'own');
    grant(d.employee, ['customer_contact', 'customer_financial', 'customer_documents', 'customer_notes'], ['view', 'create', 'update'], 'own');
    grant(d.employee, ['customer_identity'], ['create'], 'own');
    grant(d.employee, ['enrollments'], ['view', 'create', 'update', 'print'], 'own');
    grant(d.employee, ['payments'], ['view', 'create', 'print'], 'own');
    grant(d.employee, ['commissions', 'certificates'], 'view', 'own');
    grant(d.employee, ['tasks', 'complaints'], ['view', 'create', 'update'], 'own');
    grant(d.employee, ['attendance', 'leaves'], ['view', 'create'], 'own');
    grant(d.employee, ['programs'], 'view', 'all');
    grant(d.employee, ['employees', 'teams'], 'view', 'own');
    grant(d.employee, ['payroll', 'reviews'], ['view', 'print'], 'own');
    // Searching any customer shows only the name and who they are with; the rest of a file that is
    // not theirs opens by a request to its employee (or their team leader, the owner, the assistant)
    grant(d.employee, ['customer_lookup'], 'view', 'all');
    grant(d.employee, ['access_requests'], ['view', 'create', 'approve'], 'own');

    // Team leader: an employee who also sees their team (names, stages and progress; no pay and
    // no private data), invites members, gives team tasks and reviews the team every month.
    d.team_leader = { ...d.employee };
    grant(d.team_leader, ['teams'], ['view', 'invite'], 'team');
    grant(d.team_leader, ['tasks'], ['view', 'create', 'update', 'print'], 'team');
    grant(d.team_leader, ['attendance'], 'view', 'team');
    grant(d.team_leader, ['reviews'], ['view', 'create', 'update', 'print'], 'team');
    grant(d.team_leader, ['access_requests'], ['view', 'create', 'approve'], 'team');

    // The assistant: everything the owner does, on the whole academy, except money. They record
    // and see a customer's payments, but never the academy's figures: no expenses, cash accounts,
    // currencies, period closing, payment approvals, commissions or payroll (their own only), no
    // audit log, no roles and no system settings (they hold commission rates and payment rules). (The dashboard and the reports drop the money figures for them.)
    d.assistant = {};
    const OWNER_ONLY = ['expenses', 'accounts', 'currencies', 'commissions', 'payroll', 'audit', 'roles', 'settings'];
    for (const r of Object.keys(RESOURCES)) if (!OWNER_ONLY.includes(r)) grant(d.assistant, [r], ACTIONS, 'all');
    grant(d.assistant, ['payments'], ['view', 'create', 'update', 'print', 'export'], 'all');
    delete d.assistant['payments.approve'];
    delete d.assistant['payments.manage'];
    delete d.assistant['payments.archive'];
    grant(d.assistant, ['commissions'], 'view', 'own');
    grant(d.assistant, ['payroll'], ['view', 'print'], 'own');

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
// Extra permissions the owner gave one person, on top of their role; the wider scope wins
function withExtras(grants, extras) {
    const out = { ...grants };
    for (const [key, scope] of Object.entries(sanitizeGrants(extras))) {
        if (!out[key] || SCOPE_RANK[scope] > SCOPE_RANK[out[key]]) out[key] = scope;
    }
    return out;
}

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
    if (scope === 'team' || scope === 'department') {
        const teams = (scope === 'department' ? actor.departmentTeamIds || actor.teamIds || [] : actor.teamIds || []).map(String);
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
    if (scope === 'team' || scope === 'department') {
        const teams = (scope === 'department' ? actor.departmentTeamIds || actor.teamIds || [] : actor.teamIds || []).map(String);
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

// The four levels the home page is built for. Permissions still come from the role itself.
const LEVELS = {
    super_admin: 'owner',
    team_leader: 'manager',
    employee: 'employee',
    assistant: 'owner',
    customer: 'customer'
};
const roleLevel = (role) => LEVELS[normalizeRole(role)] || 'customer';

// The academy's money figures (collected, net, owed, expenses, payroll): the owner only
const seesMoney = (grants) => (grants && grants['accounts.view']) === 'all';

module.exports = {
    seesMoney,
    withExtras,
    roleLevel,
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
