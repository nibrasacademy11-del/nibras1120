// End-to-end test of Phase 1 (HR, customer files, lookup, access requests, transfer, merge, tasks).
// Runs only with TEST_MONGO_URI pointing at a TEST database, like security-flow.test.js.

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

test('CRM flow', { skip }, async (t) => {
    process.env.MONGO_URI = TEST_URI;
    process.env.JWT_SECRET = 'integration-' + Math.random();
    // No real emails from tests: empty (not deleted), so loading .env cannot fill them back in
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';
    process.env.ADMIN_EMAIL = '';
    process.env.ADMIN_PASSWORD = '';
    process.env.CRON_SECRET = 'cron-' + Math.random();
    delete process.env.MONGO_URI_FALLBACK;
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../../server.js');
    const User = require('../../models/User');
    const RateHit = require('../../models/RateHit');
    await require('../../config/db')();
    await RateHit.deleteMany({});

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const tag = Date.now().toString(36);
    const num = String(Date.now()).slice(-4);
    const pw = 'Test-password-123';
    const hash = await bcrypt.hash(pw, 10);
    const adminEmail = `crm-admin-${tag}@test.local`;
    await User.create({ name: 'CRM Admin', email: adminEmail, password: hash, role: 'super_admin' });

    const client = () => {
        const jar = {};
        return async (method, url, body) => {
            const res = await fetch(base + url, {
                method,
                headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
                body: body ? JSON.stringify(body) : undefined
            });
            for (const c of res.headers.getSetCookie()) {
                const [pair] = c.split(';');
                const [k, v] = pair.split('=');
                if (/Expires=Thu, 01 Jan 1970/.test(c) || v === '') delete jar[k];
                else jar[k] = v;
            }
            let data = null;
            try { data = await res.json(); } catch { data = null; }
            return { status: res.status, data };
        };
    };
    const login = async (email, password = pw) => {
        const c = client();
        const r = await c('POST', '/api/auth/login', { email, password });
        assert.equal(r.status, 200, `login ${email}`);
        return c;
    };

    const created = { customers: [], users: [] };
    try {
        const admin = await login(adminEmail);
        let team;
        let emp1;
        let emp2;
        const emails = { e1: `crm-e1-${tag}@test.local`, e2: `crm-e2-${tag}@test.local`, tl: `crm-tl-${tag}@test.local` };

        await t.test('HR: team and employees who choose their password from a link (PLAN-V2 §6)', async () => {
            const tr = await admin('POST', '/api/v2/teams', { nameAr: `فريق ${tag}` });
            assert.equal(tr.status, 200);
            team = tr.data.item;
            const a = await admin('POST', '/api/v2/employees', { nameAr: 'موظف أول', email: emails.e1, role: 'employee', team: team._id });
            assert.equal(a.status, 201);
            assert.equal(a.data.temporaryPassword, undefined, 'no password is ever shown');
            assert.match(a.data.setupLink, /reset-password\.html\?token=[a-f0-9]{64}$/, 'without email the owner gets the link once');
            const b = await admin('POST', '/api/v2/employees', { nameAr: 'موظف ثاني', email: emails.e2, role: 'employee' });
            const l = await admin('POST', '/api/v2/employees', { nameAr: 'قائد', email: emails.tl, role: 'team_leader', team: team._id });
            assert.equal((await admin('PUT', `/api/v2/teams/${team._id}`, { nameAr: team.nameAr, leader: l.data.item.user, __v: team.__v })).status, 200);
            created.users.push(a.data.item.user, b.data.item.user, l.data.item.user);

            const choose = async (res) => {
                const token = res.data.setupLink.split('token=')[1];
                assert.equal((await fetch(`${base}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: pw }) })).status, 200);
            };
            await choose(a);
            await choose(b);
            emp1 = await login(emails.e1, pw);
            assert.equal((await emp1('GET', '/api/v2/customers')).status, 200, 'works at once, no forced change');
            emp2 = await login(emails.e2, pw);
        });

        let cust;
        await t.test('employee creates a customer; duplicates are caught', async () => {
            const r = await emp1('POST', '/api/v2/customers', { nameAr: 'عميل تجريبي', contact: { phone: `+20 100 ${num.slice(-3)} 1234`, email: `c-${tag}@test.local` }, identity: { nationalId: `2980101${num}999` }, source: 'phone' });
            assert.equal(r.status, 201, JSON.stringify(r.data));
            cust = r.data.item;
            created.customers.push(cust.id);
            assert.match(cust.customerNo, /^NB-\d{6}$/);
            assert.equal(cust.owner.name !== undefined, true);
            // the identity number is stored (encrypted) but an employee never sees it back (RBAC-MATRIX)
            assert.equal(cust.identity, undefined);

            const dupPhone = await emp2('POST', '/api/v2/customers', { nameAr: 'نفس الرقم', contact: { phone: `0100${num.slice(-3)}1234` } });
            assert.equal(dupPhone.status, 409);
            assert.equal(dupPhone.data.code, 'POSSIBLE_DUPLICATE');
            assert.equal(dupPhone.data.matches[0].customerNo, cust.customerNo);
            assert.equal(dupPhone.data.matches[0].nameAr, undefined, 'no private data in duplicate warnings');
            const dupId = await emp2('POST', '/api/v2/customers', { nameAr: 'نفس الهوية', contact: { phone: '0555' }, identity: { nationalId: `2980101${num}999` }, confirmNotDuplicate: true });
            assert.equal(dupId.data.code, 'DUPLICATE');
        });

        await t.test('another employee sees nothing; with search allowed by the owner, a basic card and an access request', async () => {
            assert.equal((await emp2('GET', '/api/v2/customers')).data.items.some((c) => c.id === cust.id), false);
            assert.equal((await emp2('GET', `/api/v2/customers/${cust.id}`)).status, 404, 'a direct link opens nothing');
            assert.equal((await emp2('GET', `/api/v2/customers/lookup?q=${cust.customerNo}`)).status, 403, 'no academy-wide search by default');
            const e2 = await User.findOne({ email: emails.e2 });
            // search and access requests are not part of the employee role; the owner can open them for one person
            assert.equal((await admin('PUT', `/api/v2/users/${e2._id}/extra-grants`, { grants: { 'customer_lookup.view': 'all', 'access_requests.view': 'own', 'access_requests.create': 'own' }, reason: 'customer service duty' })).status, 200);
            const e1u = await User.findOne({ email: emails.e1 });
            assert.equal((await admin('PUT', `/api/v2/users/${e1u._id}/extra-grants`, { grants: { 'access_requests.view': 'own', 'access_requests.approve': 'own' }, reason: 'answers access requests' })).status, 200);
            const look = await emp2('GET', `/api/v2/customers/lookup?q=${encodeURIComponent(`2980101${num}999`)}`);
            assert.equal(look.status, 200);
            assert.equal(look.data.items[0].customerNo, cust.customerNo);
            assert.equal(look.data.items[0].access, 'basic');
            const card = await emp2('GET', `/api/v2/customers/${cust.id}`);
            assert.equal(card.data.item.contact, undefined);
            assert.equal((await emp2('GET', `/api/v2/customers/${cust.id}/timeline`)).status, 404);
            assert.equal((await emp2('PUT', `/api/v2/customers/${cust.id}`, { nameAr: 'x', __v: 0 })).status, 404);
            assert.equal((await emp2('POST', `/api/v2/customers/${cust.id}/reveal-identity`, {})).status, 404);

            const req = await emp2('POST', `/api/v2/customers/${cust.id}/access-requests`, { sections: ['contact'], purpose: 'Follow up on payment', durationHours: 2 });
            assert.equal(req.status, 201);
            const inbox = await emp1('GET', '/api/v2/access-requests?box=incoming');
            const r = inbox.data.items.find((x) => x._id === req.data.item._id);
            assert.ok(r);
            assert.equal((await emp2('POST', `/api/v2/access-requests/${r._id}/decide`, { decision: 'approve', __v: r.__v })).status, 403, 'requester cannot approve');
            const ok = await emp1('POST', `/api/v2/access-requests/${r._id}/decide`, { decision: 'approve', __v: r.__v, durationHours: 1 });
            assert.equal(ok.status, 200);

            const granted = await emp2('GET', `/api/v2/customers/${cust.id}`);
            assert.equal(granted.data.item.access, 'granted');
            assert.ok(granted.data.item.contact.email);
            assert.equal(granted.data.item.identity, undefined);
            assert.equal((await emp2('GET', `/api/v2/customers/${cust.id}/notes`)).status, 403);

            await emp1('POST', `/api/v2/access-requests/${r._id}/revoke`, {});
            assert.equal((await emp2('GET', `/api/v2/customers/${cust.id}`)).data.item.access, 'basic');
        });

        await t.test('notes, contact log with follow-up, and tasks', async () => {
            assert.equal((await emp1('POST', `/api/v2/customers/${cust.id}/notes`, { body: 'Prefers WhatsApp' })).status, 201);
            const due = new Date(Date.now() - 3600 * 1000).toISOString();
            const comm = await emp1('POST', `/api/v2/customers/${cust.id}/communications`, { channel: 'call', outcome: 'callback', summary: 'Call again', followUpAt: due });
            assert.equal(comm.status, 201);
            assert.ok(comm.data.followUp);
            const tasks = await emp1('GET', '/api/v2/tasks?mine=1&due=overdue');
            assert.ok(tasks.data.items.some((x) => x._id === comm.data.followUp._id));
            const cron = await fetch(`${base}/api/v2/cron/reminders`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
            assert.equal(cron.status, 200);
            assert.equal((await fetch(`${base}/api/v2/cron/reminders`)).status, 401);
            const notes = await emp1('GET', '/api/v2/notifications');
            assert.ok(notes.data.items.some((n) => n.type === 'follow_up_due'));
            const timeline = await emp1('GET', `/api/v2/customers/${cust.id}/timeline`);
            assert.ok(timeline.data.items.length >= 4);
        });

        await t.test('stale edits are refused', async () => {
            const cur = (await emp1('GET', `/api/v2/customers/${cust.id}`)).data.item;
            assert.equal((await emp1('PUT', `/api/v2/customers/${cust.id}`, { status: 'interested', __v: cur.__v })).status, 200);
            assert.equal((await emp1('PUT', `/api/v2/customers/${cust.id}`, { status: 'customer', __v: cur.__v })).status, 409);
            assert.equal((await emp1('PUT', `/api/v2/customers/${cust.id}`, { status: 'lost', __v: cur.__v + 1 })).data.code, 'REASON_REQUIRED');
        });

        await t.test('admin reveals identity, merges a duplicate, and an employee leaves', async () => {
            const rev = await admin('POST', `/api/v2/customers/${cust.id}/reveal-identity`, {});
            assert.equal(rev.data.nationalId, `2980101${num}999`);

            const dup = await emp2('POST', '/api/v2/customers', { nameAr: 'عميل تجريبي مكرر', contact: { phone: '0100' + num.slice(-3) + '1234', whatsapp: '0100' }, confirmNotDuplicate: true, tags: ['vip'] });
            assert.equal(dup.status, 201);
            created.customers.push(dup.data.item.id);
            const groups = await admin('GET', '/api/v2/customers/duplicates');
            assert.ok(groups.data.groups.some((g) => g.customers.some((c) => c.id === dup.data.item.id)));
            const target = (await admin('GET', `/api/v2/customers/${cust.id}`)).data.item;
            const merged = await admin('POST', `/api/v2/customers/${cust.id}/merge`, { sourceId: dup.data.item.id, reason: 'same person', __v: target.__v });
            assert.equal(merged.status, 200, JSON.stringify(merged.data));
            assert.ok(merged.data.filled.includes('contact.whatsapp'));

            const emps = await admin('GET', '/api/v2/employees?status=active');
            const e1 = emps.data.items.find((e) => e.user.email === emails.e1);
            const e2 = emps.data.items.find((e) => e.user.email === emails.e2);
            const off = await admin('POST', `/api/v2/employees/${e1._id}/offboard`, { transferTo: e2.user._id, reason: 'resigned' });
            assert.equal(off.status, 200);
            assert.ok(off.data.moved.customers >= 1);
            assert.equal((await emp1('GET', '/api/v2/me')).status, 401, 'signed out');
            const now = await emp2('GET', `/api/v2/customers/${cust.id}`);
            assert.equal(now.data.item.access, 'full', 'the new owner has the file');
        });
    } finally {
        const Customer = require('../../models/Customer');
        const Employee = require('../../models/Employee');
        const Team = require('../../models/Team');
        const Task = require('../../models/Task');
        const ids = created.customers;
        await Customer.deleteMany({ _id: { $in: ids } });
        await Task.deleteMany({ customer: { $in: ids } });
        await Employee.deleteMany({ user: { $in: created.users } });
        await Team.deleteMany({ nameAr: new RegExp(tag) });
        await User.deleteMany({ email: new RegExp(`crm-.*-${tag}@test.local`) });
        server.close();
        await mongoose.disconnect();
    }
});
