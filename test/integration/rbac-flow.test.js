// Roles, team invitations and data isolation (docs/RBAC-MATRIX.md), end to end.
// The 17 required checks, each role on its own. Runs only with TEST_MONGO_URI on a TEST database.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_URI = process.env.TEST_MONGO_URI;
function liveUri() {
    try {
        const m = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').match(/^MONGO_URI=(.*)$/m);
        return m ? m[1].trim() : '';
    } catch {
        return '';
    }
}
const skip = !TEST_URI ? 'TEST_MONGO_URI is not set' : TEST_URI === liveUri() ? 'TEST_MONGO_URI is the live database: refusing to run' : false;

test('roles, invitations and data isolation', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    // No real emails from tests: empty (not deleted), so loading .env cannot fill them back in
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ADMIN_EMAIL = '';
    process.env.ADMIN_PASSWORD = '';
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const User = require('../../models/User');
    const Employee = require('../../models/Employee');
    const Team = require('../../models/Team');
    const Customer = require('../../models/Customer');
    const Invitation = require('../../models/TeamInvitation');
    const AuditLog = require('../../models/AuditLog');
    const { PayrollRun } = require('../../models/payroll');
    await require('../../config/db')();
    await require('../../models/RateHit').deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const mk = (role, name) => User.create({ name: name || `${role} ${tag}`, email: `rb-${role}-${name ? name.replace(/\s+/g, '-') : ''}-${tag}@test.local`.toLowerCase(), password: hash, role });
    const client = () => {
        const jar = {};
        return async (method, url, body) => {
            const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
            for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const [k, v] = pair.split('='); if (v === '') delete jar[k]; else jar[k] = v; }
            let data = null;
            try { data = await res.json(); } catch { data = null; }
            return { status: res.status, data };
        };
    };
    const login = async (u) => { const c = client(); assert.equal((await c('POST', '/api/auth/login', { email: u.email, password: pw })).status, 200, u.email); return c; };

    const owner = await mk('super_admin', 'Owner One');
    const leader = await mk('team_leader', 'Leader Mona');
    const emp1 = await mk('employee', 'Emp Ahmed');
    const emp2 = await mk('employee', 'Emp Khaled');
    const hr = await mk('super_admin', 'Owner Two'); // HR work is the owner's (PLAN-V2)
    const teamA = await Team.create({ nameAr: `فريق أ ${tag}`, leader: leader._id });
    const teamB = await Team.create({ nameAr: `فريق ب ${tag}` });
    let n = 0;
    const mkEmp = (u, team) => Employee.create({ user: u._id, employeeNo: `RB-${tag}-${++n}`, nameAr: u.name, jobTitle: 'Advisor', team: team._id, phone: `0100${String(Date.now()).slice(-6)}${n}`, salary: { basic: 9000 + n, currency: 'EGP' } });
    await mkEmp(leader, teamA); const e1 = await mkEmp(emp1, teamA); await mkEmp(emp2, teamA); await mkEmp(hr, teamB);
    const c1 = await Customer.create({ customerNo: `NB-7${String(Date.now()).slice(-8)}`, internalId: `rb1-${tag}`, nameAr: 'عميل أحمد', owner: emp1._id, team: teamA._id, status: 'lead' });
    const c2 = await Customer.create({ customerNo: `NB-6${String(Date.now()).slice(-8)}`, internalId: `rb2-${tag}`, nameAr: 'عميل خالد', owner: emp2._id, team: teamA._id, status: 'lead' });

    try {
        const O = await login(owner);
        const L = await login(leader);
        const E1 = await login(emp1);
        const E2 = await login(emp2);
        const H = await login(hr);

        await t.test('1. the owner reaches every module', async () => {
            for (const url of ['/api/v2/customers', '/api/v2/employees', '/api/v2/payroll/runs', '/api/v2/roles', '/api/v2/audit', '/api/v2/insights', '/api/v2/team-invitations', `/api/v2/customers/${c1._id}`]) {
                assert.equal((await O('GET', url)).status, 200, url);
            }
        });

        await t.test('2. a team leader cannot reach owner administration', async () => {
            for (const [m, url, body] of [['GET', '/api/v2/roles'], ['PUT', '/api/v2/roles/employee', { grants: {}, reason: 'x' }], ['GET', '/api/v2/audit'], ['GET', '/api/v2/insights'], ['GET', '/api/v2/payroll/runs'], ['GET', '/api/v2/payroll/salaries'], ['GET', '/api/v2/settings'], ['POST', '/api/v2/employees', { nameAr: 'x', email: 'x@y.z' }], [`PUT`, `/api/v2/users/${emp1._id}/extra-grants`, { grants: { 'customers.view': 'all' }, reason: 'x' }]]) {
                const r = await L(m, url, body);
                assert.ok([403, 404].includes(r.status), `${m} ${url} -> ${r.status}`);
            }
            const reports = await L('GET', '/api/v2/reports');
            // reports follow each section's own scope: their own records only, no organization-wide ones
            const ids = (reports.data.items || []).map((r) => r.id);
            for (const id of ['team_performance', 'employee_performance', 'revenue_expenses', 'audit', 'program_profit']) assert.ok(!ids.includes(id), id);
        });

        let invite; let link;
        await t.test('3-4. the team leader invites a new member; the invited person gets the invitation', async () => {
            const r = await L('POST', '/api/v2/team-invitations', { name: 'محمود عادل حسن', phone: '01123456789', email: `new-${tag}@test.local`, jobTitle: 'مستشار' });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            assert.equal(r.data.item.status, 'pending');
            assert.ok(r.data.link.includes('/portal/invite/'));
            assert.ok(r.data.whatsapp.startsWith('https://wa.me/201123456789'));
            invite = r.data.item; link = r.data.link.split('/invite/')[1];
            const pub = await client()('GET', `/api/v2/invitations/${link}`);
            assert.equal(pub.data.status, 'pending');
            assert.equal(pub.data.team, teamA.nameAr);
            assert.equal(pub.data.leader, leader.name);
            assert.ok(pub.data.academy);
            const stored = await Invitation.findById(invite._id).lean();
            assert.notEqual(stored.tokenHash, link, 'only a hash of the token is stored');
            assert.equal(r.data.item.status, 'pending');
            const forged = await L('POST', '/api/v2/team-invitations', { team: String(teamB._id), name: 'شخص تاني خالص', phone: '01198765432' });
            assert.equal(forged.status, 403, 'cannot invite to a team they do not lead');
        });

        await t.test('9. duplicate invitations are refused', async () => {
            const again = await L('POST', '/api/v2/team-invitations', { name: 'محمود عادل حسن', phone: '+20 112 345 6789' });
            assert.equal(again.status, 409);
            assert.equal(again.data.code, 'DUPLICATE');
            const staff = await L('POST', '/api/v2/team-invitations', { name: 'أحمد موجود', phone: '01000000000', email: emp2.email });
            assert.equal(staff.status, 409, JSON.stringify(staff.data));
            assert.equal(staff.data.code, 'ALREADY_STAFF');
        });

        await t.test('5. the recipient accepts; the account waits for the owner, then joins the team', async () => {
            const anon = client();
            const wrongPhone = await anon('POST', `/api/v2/invitations/${link}/accept`, { phone: '01000000001', password: 'Strong-pass-1' });
            assert.equal(wrongPhone.data.code, 'PHONE_MISMATCH');
            const ok = await anon('POST', `/api/v2/invitations/${link}/accept`, { phone: '01123456789', password: 'Strong-pass-1' });
            assert.equal(ok.status, 200, JSON.stringify(ok.data));
            assert.equal(ok.data.status, 'accepted');
            assert.equal(await User.exists({ email: `new-${tag}@test.local` }), null, 'no account before approval');
            const reuse = await anon('POST', `/api/v2/invitations/${link}/accept`, { phone: '01123456789', password: 'Strong-pass-1' });
            assert.equal(reuse.status, 410, 'the link works once');
            assert.equal((await L('POST', `/api/v2/team-invitations/${invite._id}/approve`)).status, 403, 'the leader cannot approve');
            const ap = await O('POST', `/api/v2/team-invitations/${invite._id}/approve`);
            assert.equal(ap.status, 200, JSON.stringify(ap.data));
            const user = await User.findOne({ email: `new-${tag}@test.local` });
            assert.equal(user.role, 'employee');
            const emp = await Employee.findOne({ user: user._id });
            assert.equal(String(emp.team), String(teamA._id));
            const fresh = client();
            assert.equal((await fresh('POST', '/api/auth/login', { email: user.email, password: 'Strong-pass-1' })).status, 200, 'the chosen password works');
        });

        await t.test('6-7. the recipient rejects; no membership is made', async () => {
            const r = await L('POST', '/api/v2/team-invitations', { name: 'سلمى رفض', phone: '01222333444' });
            const token = r.data.link.split('/invite/')[1];
            const rej = await client()('POST', `/api/v2/invitations/${token}/reject`, {});
            assert.equal(rej.data.status, 'rejected');
            const inv = await Invitation.findById(r.data.item._id).lean();
            assert.equal(inv.status, 'rejected');
            assert.equal(inv.employee, null);
            assert.equal(await Employee.exists({ phone: '01222333444' }), null);
            assert.equal((await client()('POST', `/api/v2/invitations/${token}/accept`, { phone: '01222333444', password: 'Strong-pass-1' })).status, 410);
        });

        await t.test('8. an expired invitation cannot be accepted', async () => {
            const r = await L('POST', '/api/v2/team-invitations', { name: 'منتهي الصلاحية', phone: '01555666777' });
            const token = r.data.link.split('/invite/')[1];
            await Invitation.updateOne({ _id: r.data.item._id }, { expiresAt: new Date(Date.now() - 1000) });
            const acc = await client()('POST', `/api/v2/invitations/${token}/accept`, { phone: '01555666777', password: 'Strong-pass-1' });
            assert.equal(acc.status, 410);
            assert.equal((await client()('GET', `/api/v2/invitations/${token}`)).data.status, 'invalid', 'expired links are closed');
            assert.equal((await Invitation.findById(r.data.item._id).lean()).status, 'expired');
        });

        await t.test('10. employees cannot see customers that are not theirs', async () => {
            assert.equal((await E1('GET', `/api/v2/customers/${c1._id}`)).status, 200, 'own customer');
            // a colleague's customer: the name and who they are with, nothing else (16 Nov 2026)
            const other = (await E1('GET', `/api/v2/customers/${c2._id}`)).data.item;
            assert.equal(other.access, 'basic', "a colleague's customer by direct link");
            for (const k of ['contact', 'identity', 'nameAr', 'status', 'team']) assert.equal(other[k], undefined, k);
            for (const sub of ['notes', 'communications', 'documents', 'timeline', 'summary']) assert.equal((await E1('GET', `/api/v2/customers/${c2._id}/${sub}`)).status, 404, sub);
            const list = await E1('GET', `/api/v2/customers?q=${encodeURIComponent('عميل')}`);
            assert.ok(list.data.items.every((x) => String(x.id || x._id) === String(c1._id)), 'search stays inside their own customers');
            assert.equal((await E1('GET', `/api/v2/customers/lookup?q=${c2.customerNo}`)).data.items[0].access, 'basic', 'a search shows the name card only');
            const own = await E1('GET', `/api/v2/customers/${c1._id}`);
            assert.equal(own.data.item.identity, undefined, 'no identity data for an employee');
            assert.equal((await E1('POST', `/api/v2/customers/${c2._id}/transfer`, { to: String(emp1._id), reason: 'x' })).status, 403, 'cannot take a customer');
        });

        await t.test('11-12. nobody sees another person\'s pay; a leader not their team\'s', async () => {
            const run = await O('POST', '/api/v2/payroll/runs', { month: '2026-01' });
            assert.equal(run.status, 201, JSON.stringify(run.data));
            const r = await PayrollRun.findById(run.data.item._id);
            await O('POST', `/api/v2/payroll/runs/${r._id}/approve`, { __v: r.__v });
            const mine = await E1('GET', '/api/v2/payroll/mine');
            assert.ok(mine.data.items.every((x) => x.line.name === emp1.name));
            assert.equal((await E1('GET', `/api/v2/payroll/runs/${r._id}/payslip/${emp2._id}`)).status, 403);
            assert.equal((await L('GET', `/api/v2/payroll/runs/${r._id}/payslip/${emp1._id}`)).status, 403, "the leader cannot open a member's payslip");
            assert.equal((await L('GET', `/api/v2/payroll/runs/${r._id}`)).status, 403);
            const team = await L('GET', '/api/v2/my-team');
            assert.equal(team.status, 200);
            const body = JSON.stringify(team.data);
            assert.ok(!/salary|basic|phone|"net"|history/i.test(body), 'the team overview carries no pay or private data');
            assert.ok(team.data.members.some((m) => m.name === emp1.name));
            const comm = await L('GET', '/api/v2/commissions/overview');
            assert.equal(comm.status, 403, "the team's commissions are private");
            assert.equal((await L('GET', `/api/v2/employees/${e1._id}`)).status, 404, "no access to a member's HR file");
        });

        await t.test('13. direct API calls cannot get around the rules', async () => {
            assert.equal((await E1('PUT', `/api/auth/users/${emp1._id}`, { role: 'super_admin' })).status, 403);
            assert.equal((await E1('POST', '/api/v2/team-invitations', { name: 'تجربة تجربة', phone: '01099988877' })).status, 403);
            assert.equal((await E1('GET', '/api/v2/my-team')).status, 403);
            assert.equal((await E2('GET', `/api/v2/customers/${c1._id}/notes`)).status, 404);
        });

        await t.test('14. a team leader cannot move people between teams; the owner can', async () => {
            const cur = await Employee.findById(e1._id);
            assert.ok([403, 404].includes((await L('PUT', `/api/v2/employees/${e1._id}`, { team: String(teamB._id), __v: cur.__v })).status));
            const moved = await H('PUT', `/api/v2/employees/${e1._id}`, { team: String(teamB._id), reason: 'إعادة توزيع', __v: cur.__v });
            assert.equal(moved.status, 200, JSON.stringify(moved.data));
            assert.equal(String((await Employee.findById(e1._id)).team), String(teamB._id));
            const back = await Employee.findById(e1._id);
            await H('PUT', `/api/v2/employees/${e1._id}`, { team: String(teamA._id), reason: 'رجوع', __v: back.__v });
        });

        await t.test('15. a permission change applies at once', async () => {
            const accessTo = async () => (await E1('GET', `/api/v2/customers/${c2._id}`)).data.item.access;
            assert.equal(await accessTo(), 'basic');
            const set = await O('PUT', `/api/v2/users/${emp1._id}/extra-grants`, { grants: { 'customers.view': 'all' }, reason: 'تغطية مؤقتة' });
            assert.equal(set.status, 200, JSON.stringify(set.data));
            assert.equal(await accessTo(), 'full', 'same session, new permission');
            await O('PUT', `/api/v2/users/${emp1._id}/extra-grants`, { grants: {}, reason: 'انتهت المدة' });
            assert.equal(await accessTo(), 'basic', 'removed at once');
            assert.equal((await O('PUT', `/api/v2/users/${emp1._id}/extra-grants`, { grants: { 'roles.manage': 'all' }, reason: 'x' })).data.extra['roles.manage'], undefined, 'role management never goes out as an extra');
        });

        await t.test('16. the audit log keeps the sensitive actions', async () => {
            for (const action of ['team.invitation_created', 'team.invitation_accepted', 'team.invitation_rejected', 'team.member_added', 'roles.extra_grants_changed', 'employee.moved', 'payroll.run_approved']) {
                assert.ok(await AuditLog.exists({ action }), action);
            }
            const entry = await AuditLog.findOne({ action: 'roles.extra_grants_changed' }).lean();
            assert.ok(entry.changes && entry.changes.extraGrants, 'before and after are kept');
            assert.ok(entry.ip !== undefined || entry.meta !== undefined || entry.actor, 'who and from where');
        });

        await t.test('17. existing records are untouched', async () => {
            assert.equal(String((await Customer.findById(c1._id)).owner), String(emp1._id));
            assert.equal(String((await Customer.findById(c2._id)).owner), String(emp2._id));
            assert.equal((await User.findById(emp2._id)).role, 'employee');
            assert.equal((await Employee.countDocuments({ team: teamA._id, status: 'active' })), 4, 'leader, two employees and the invited member');
        });
    } finally {
        await User.updateMany({ email: new RegExp(`-${tag}@test.local$`) }, { status: 'disabled' });
        server.close();
        await mongoose.disconnect();
    }
});
