// Fills an EMPTY test database with a realistic, made-up academy: staff and teams, programs and
// modules, a group with Zoom lectures, customers at every stage, enrollments, installments,
// payments, commissions, certificates, tasks, complaints, attendance and website requests.
// Used for training, the user guide's screenshots and trying the system end to end.
//
//   node tools/seed-demo.js --uri <mongodb uri of a TEST database>
//
// It refuses the live database (.env MONGO_URI) and any database that already has users.
// Every name, phone and email is invented; emails use example.com, which never receives mail.

const path = require('path');
const fs = require('fs');

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : ''; };
const uri = arg('--uri') || process.env.DEMO_MONGO_URI || '';
function liveUri() {
    try {
        const m = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.*)$/m);
        return m ? m[1].trim() : '';
    } catch {
        return '';
    }
}
if (!uri) { console.error('Give the test database: --uri <mongodb uri>'); process.exit(1); }
if (uri === liveUri()) { console.error('This is the live database. Refusing.'); process.exit(1); }

// The app reads these at start; nothing here may reach real people or the live data
process.env.MONGO_URI = uri;
process.env.MONGO_URI_FALLBACK = '';
process.env.JWT_SECRET = process.env.JWT_SECRET_DEMO || 'demo-only-secret-0123456789abcdef0123456789';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASS = '';
// The server creates an admin from these at start; the demo makes its own accounts
process.env.ADMIN_EMAIL = '';
process.env.ADMIN_PASSWORD = '';
process.env.NODE_ENV = 'development';

// Demo sign-ins (local test data only)
const PASSWORD = 'Demo-Nibras-2026';
const ACCOUNTS = {
    owner: { name: 'مدير النظام (تجريبي)', email: 'owner@demo.nibras', role: 'super_admin' },
    leader: { name: 'منى فاروق', email: 'mona@demo.nibras', role: 'team_leader', job: 'قائدة فريق المبيعات' },
    ahmed: { name: 'أحمد سمير', email: 'ahmed@demo.nibras', role: 'employee', job: 'مستشار تعليمي' },
    khaled: { name: 'خالد يوسف', email: 'khaled@demo.nibras', role: 'employee', job: 'مستشار تعليمي' },
    noura: { name: 'نورا سعيد', email: 'noura@demo.nibras', role: 'customer_support', job: 'خدمة العملاء' },
    learner: { name: 'محمد علي حسن', email: 'learner@demo.nibras', role: 'customer' }
};

const day = 864e5;
const ago = (n) => new Date(Date.now() - n * day);
const iso = (d) => d.toISOString();

async function main() {
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');
    const app = require('../server.js');
    await require('../config/db')();
    const User = require('../models/User');
    if (await User.estimatedDocumentCount()) { console.error('This database already has data. Use an empty test database.'); process.exit(1); }
    const Team = require('../models/Team');
    const Department = require('../models/Department');
    const Employee = require('../models/Employee');
    const Course = require('../models/Course');
    const Customer = require('../models/Customer');
    const { AttendanceRecord, Shift } = require('../models/attendance');

    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const client = () => {
        const jar = {};
        return async (method, url, body) => {
            const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
            for (const c of res.headers.getSetCookie()) {
                const [pair] = c.split(';');
                const [k, v] = pair.split('=');
                if (v === '') delete jar[k];
                else jar[k] = v;
            }
            let data = null;
            try { data = await res.json(); } catch { data = null; }
            if (res.status >= 400) console.warn(`  ! ${method} ${url} → ${res.status} ${data && data.message ? data.message : ''}`);
            return data;
        };
    };

    // ---- people ----
    const hash = await bcrypt.hash(PASSWORD, 10);
    const users = {};
    for (const [k, a] of Object.entries(ACCOUNTS)) users[k] = await User.create({ name: a.name, email: a.email, password: hash, role: a.role, phone: '' });
    const sales = await Department.create({ nameAr: 'المبيعات والقبول', nameEn: 'Sales & Admissions' });
    const academic = await Department.create({ nameAr: 'الشؤون الأكاديمية', nameEn: 'Academic Affairs' });
    const team = await Team.create({ nameAr: 'فريق المبيعات - القاهرة', nameEn: 'Sales team - Cairo', leader: users.leader._id, department: sales._id });
    let n = 1;
    for (const k of ['leader', 'ahmed', 'khaled', 'noura']) {
        await Employee.create({ user: users[k]._id, employeeNo: `EMP-${String(n++).padStart(4, '0')}`, nameAr: ACCOUNTS[k].name, jobTitle: ACCOUNTS[k].job, department: k === 'noura' ? academic._id : sales._id, team: k === 'noura' ? null : team._id, hireDate: ago(400), status: 'active', phone: `0100000000${n}` });
    }
    const login = async (k) => { const c = client(); await c('POST', '/api/auth/login', { email: ACCOUNTS[k].email, password: PASSWORD }); return c; };
    const owner = await login('owner');
    const ahmed = await login('ahmed');
    const khaled = await login('khaled');
    console.log('people ✓');

    // ---- settings ----
    await owner('PUT', '/api/v2/settings', { reason: 'بيانات تجريبية', settings: {
        'academy.profile': { nameAr: 'أكاديمية نبراس للتدريب والتأهيل المهني', nameEn: 'Nibras Academy for Training & Professional Development', address: 'الشيخ زايد، الجيزة، مصر', phone: '+20 111 222 0796', email: 'info@nibras-ac.com', website: 'www.nibras-ac.com', taxNumber: '123-456-789', commercialRegister: '98765', vatRate: 14, pricesIncludeVat: true }
    } });
    const acct = {};
    for (const a of [['CASH-EGP', 'خزنة المكتب', 'cash', 'EGP', true], ['BM-EGP', 'بنك مصر - الحساب الجاري', 'bank', 'EGP', false], ['SAR-1', 'حساب الريال', 'bank', 'SAR', false]]) {
        acct[a[0]] = (await owner('POST', '/api/v2/finance/accounts', { code: a[0], nameAr: a[1], type: a[2], currency: a[3], allowEmployees: a[4] })).item;
    }
    await owner('POST', '/api/v2/commissions/rates', { user: users.ahmed._id, kind: 'employee', rate: 5, effectiveFrom: iso(ago(200)), reason: 'العقد' });
    await owner('POST', '/api/v2/commissions/rates', { user: users.khaled._id, kind: 'employee', rate: 5, effectiveFrom: iso(ago(200)), reason: 'العقد' });
    await owner('POST', '/api/v2/commissions/rates', { user: users.leader._id, kind: 'team_leader', rate: 1, effectiveFrom: iso(ago(200)), reason: 'العقد' });
    await Shift.create({ name: 'الدوام الرسمي', days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00', graceMinutes: 15, earlyLeaveGraceMinutes: 5, isDefault: true });
    console.log('settings ✓');

    // ---- programs ----
    const mba = await Course.create({ titleAr: 'ماجستير إدارة الأعمال التنفيذي', titleEn: 'Executive MBA', slug: 'demo-executive-mba', type: 'master', specialty: 'إدارة الأعمال', price: 45000, currency: 'EGP', status: 'available', featured: true, duration: '12 شهر', descriptionAr: 'برنامج ماجستير مهني للقادة والمديرين.', modulesRequired: 0 });
    const pm = await Course.create({ titleAr: 'دبلوم إدارة المشاريع الاحترافية', titleEn: 'Professional Project Management Diploma', slug: 'demo-pm-diploma', type: 'diploma', specialty: 'إدارة المشاريع', price: 1500, currency: 'SAR', status: 'available', duration: '4 شهور' });
    await Course.create({ titleAr: 'دورة مهارات القيادة', titleEn: 'Leadership Skills', slug: 'demo-leadership', type: 'course', specialty: 'القيادة والإدارة', price: 3500, currency: 'EGP', status: 'coming_soon', duration: '6 أسابيع' });
    const mbaModules = [['القيادة الاستراتيجية', 'Strategic Leadership'], ['التسويق الرقمي', 'Digital Marketing'], ['الإدارة المالية', 'Financial Management'], ['مشروع التخرج', 'Capstone Project']];
    for (const [ar, en] of mbaModules) await owner('POST', `/api/v2/programs/${mba._id}/modules`, { titleAr: ar, titleEn: en, hours: 36, requirements: ['حضور المحاضرات', 'تسليم التكليف'] });
    for (const [ar, en] of [['أساسيات إدارة المشاريع', 'PM Fundamentals'], ['إدارة المخاطر', 'Risk Management'], ['التحضير لاختبار PMP', 'PMP Preparation']]) await owner('POST', `/api/v2/programs/${pm._id}/modules`, { titleAr: ar, titleEn: en, hours: 24 });
    const mods = (await owner('GET', `/api/v2/programs/${mba._id}`)).modules;
    await owner('POST', '/api/v2/certificate-templates', { name: 'قالب شهادة المحور', kind: 'module', isDefault: true, titleAr: 'شهادة إتمام محور', titleEn: 'Module Completion Certificate', signatures: [{ nameAr: 'د. أحمد سالم', nameEn: 'Dr. Ahmed Salem', titleAr: 'المدير الأكاديمي', titleEn: 'Academic Director' }, { nameAr: 'أ. منى فاروق', nameEn: 'Mona Farouk', titleAr: 'مدير الأكاديمية', titleEn: 'Academy Director' }] });
    await owner('POST', '/api/v2/certificate-templates', { name: 'قالب الشهادة النهائية', kind: 'program', isDefault: true, titleAr: 'شهادة إتمام برنامج', titleEn: 'Program Completion Certificate' });
    console.log('programs ✓');

    // ---- customers (made by the employees, so they own them) ----
    const people = [
        ['محمد علي حسن', 'Mohamed Ali Hassan', 'ahmed', 'website', '29801011234567'],
        ['سارة محمود إبراهيم', 'Sara Mahmoud', 'ahmed', 'facebook', '29905151234568'],
        ['عمر خالد عبد الله', 'Omar Khaled', 'khaled', 'referral', '29703101234569'],
        ['ريم أحمد سليمان', 'Reem Ahmed', 'khaled', 'whatsapp', '30001011234570'],
        ['يوسف إبراهيم مصطفى', 'Youssef Ibrahim', 'ahmed', 'tiktok', '29612121234571'],
        ['هبة سامي عادل', 'Heba Samy', 'khaled', 'instagram', '29808081234572'],
        ['كريم طارق فؤاد', 'Karim Tarek', 'ahmed', 'phone', ''],
        ['ليلى حسن عمر', 'Laila Hassan', 'khaled', 'facebook', ''],
        ['مازن عبد الرحمن', 'Mazen Abdelrahman', 'ahmed', 'website', ''],
        ['دينا فتحي سعيد', 'Dina Fathy', 'khaled', 'event', '']
    ];
    const cust = [];
    for (let i = 0; i < people.length; i++) {
        const [ar, en, by, source, nid] = people[i];
        const c = by === 'ahmed' ? ahmed : khaled;
        const status = i < 6 ? 'customer' : i < 8 ? 'interested' : 'lead';
        const r = await c('POST', '/api/v2/customers', { nameAr: ar, nameEn: en, source, status, country: 'مصر', contact: { phone: `01${(10 + i) % 3}${String(20000000 + i * 1111111).slice(0, 8)}`, email: `demo${i + 1}@example.com` }, identity: nid ? { nationalId: nid } : {}, confirmNotDuplicate: true });
        cust.push(r.item);
    }
    // The first customer has a portal account
    await Customer.updateOne({ _id: cust[0].id }, { $set: { user: users.learner._id } });
    console.log('customers ✓');

    // ---- the group, members, lectures ----
    const g = (await owner('POST', `/api/v2/programs/${mba._id}/cohorts`, { nameAr: 'مجموعة نوفمبر 2026 - الماجستير', nameEn: 'November 2026 cohort', startDate: iso(ago(40)), endDate: iso(ago(-120)), instructor: 'د. أحمد سالم', schedule: 'السبت والثلاثاء 8 مساءً', capacity: 40, status: 'running', delivery: 'online' })).item;
    await owner('POST', `/api/v2/groups/${g._id}/members`, { customers: cust.slice(0, 6).map((c) => c.id), enroll: true });
    const at = (daysFromNow, hour) => { const d = new Date(Date.now() + daysFromNow * day); d.setUTCHours(hour - 2, 0, 0, 0); return iso(d); };
    const lectures = [
        ['مقدمة في القيادة الاستراتيجية', 0, -21], ['أنماط القيادة', 0, -14], ['بناء الرؤية والرسالة', 0, -7],
        ['القيادة والتغيير', 0, 2], ['مدخل إلى التسويق الرقمي', 1, 5], ['قنوات التسويق الرقمي', 1, 9]
    ];
    const lec = [];
    for (const [title, m, d] of lectures) {
        const r = await owner('POST', `/api/v2/groups/${g._id}/lectures`, { titleAr: title, module: mods[m]._id, startsAt: at(d, 20), durationMin: 90, mode: 'manual', joinUrl: 'https://zoom.us/j/81234567890?pwd=DemoPass', passcode: '271828', materials: d < 0 ? [{ title: 'شرائح المحاضرة', url: 'https://example.com/slides.pdf' }] : [] });
        lec.push(r.item);
    }
    // Attendance for the three past lectures (some missed)
    for (let li = 0; li < 3; li++) {
        for (let ci = 0; ci < 6; ci++) {
            const present = !(ci === 4 && li > 0) && !(ci === 5 && li === 2);
            await owner('POST', `/api/v2/lectures/${lec[li]._id}/attendance`, { customer: cust[ci].id, present });
        }
    }
    await owner('POST', `/api/v2/groups/${g._id}/approve-module`, { module: mods[0]._id, note: 'اجتياز التكليف الأول' });
    await owner('PUT', `/api/v2/groups/${g._id}/certificate-rule`, { mode: 'manual', issue: 'both', minAttendance: 50, sendEmail: true });
    console.log('group and lectures ✓');

    // ---- money: charges with installments, payments ----
    const enrolls = (await owner('GET', `/api/v2/enrollments?program=${mba._id}&limit=50`)).items;
    const enrollOf = (cid) => enrolls.find((e) => String(e.customer?._id || e.customer) === String(cid));
    const charges = [];
    for (let i = 0; i < 6; i++) {
        const e = enrollOf(cust[i].id);
        const r = await owner('POST', '/api/v2/charges', { customer: cust[i].id, enrollment: e && e._id, description: 'رسوم ماجستير إدارة الأعمال التنفيذي', currency: 'EGP', listAmount: 45000, installments: { count: 4, firstDue: iso(ago(75)), everyMonths: 1 } });
        charges.push(r.item);
    }
    const pay = async (as, i, amount, daysAgo, account = acct['BM-EGP'], method = 'bank_transfer') => as('POST', '/api/v2/payments', { customer: cust[i].id, charge: charges[i]._id, account: account._id, method, amount, paidAt: iso(ago(daysAgo)), reference: method === 'bank_transfer' ? `TRX-${50000 + i * 7 + daysAgo}` : '' });
    // Customer 1 paid everything (certificate ready), 2 and 3 are on time, 4 is late, 5 paid once, 6 nothing
    for (const d of [74, 45, 15, 5]) await pay(owner, 0, 11250, d);
    for (const d of [74, 44, 14]) await pay(owner, 1, 11250, d, acct['CASH-EGP'], 'cash');
    for (const d of [73, 43, 13]) await pay(owner, 2, 11250, d);
    await pay(owner, 3, 11250, 72);
    await pay(owner, 4, 11250, 70, acct['CASH-EGP'], 'cash');
    await pay(ahmed, 1, 2000, 1, acct['CASH-EGP'], 'cash');   // recorded by an employee: waits for confirmation
    // A diploma customer paying in riyals
    const pmEnroll = (await owner('POST', '/api/v2/enrollments', { customer: cust[6].id, program: pm._id })).item;
    const sarCharge = (await owner('POST', '/api/v2/charges', { customer: cust[6].id, enrollment: pmEnroll && pmEnroll._id, description: 'رسوم دبلوم إدارة المشاريع', currency: 'SAR', listAmount: 1500, installments: { count: 2, firstDue: iso(ago(20)), everyMonths: 1 } })).item;
    await owner('POST', '/api/v2/payments', { customer: cust[6].id, charge: sarCharge._id, account: acct['SAR-1']._id, method: 'bank_transfer', amount: 750, paidAt: iso(ago(19)) });
    for (const [cat, amount, payee, d] of [['إيجار', 25000, 'مالك المقر', 20], ['إعلانات', 8000, 'Meta', 12], ['مرتبات', 60000, 'الموظفين', 10], ['ضيافة', 1200, 'كافيه', 3]]) {
        await owner('POST', '/api/v2/expenses', { account: acct['BM-EGP']._id, category: cat, amount, payee, description: `${cat} - بيانات تجريبية`, date: iso(ago(d)), program: cat === 'إعلانات' ? mba._id : undefined });
    }
    console.log('money ✓');

    // ---- certificates ----
    const e0 = enrollOf(cust[0].id);
    const cert = (await owner('POST', '/api/v2/certificates/issue', { enrollment: e0._id, module: mods[0]._id })).item;
    if (cert) {
        await owner('POST', `/api/v2/certificates/${cert._id}/delivery`, { step: 'printed' });
        await owner('POST', `/api/v2/certificates/${cert._id}/delivery`, { step: 'ready' });
    }
    console.log('certificates ✓');

    // ---- follow-ups, notes, contacts, complaints, requests ----
    const tasks = [[ahmed, 6, 'اتصال لمتابعة الاهتمام بالدبلوم', 1], [ahmed, 8, 'إرسال عرض الأسعار', 0], [khaled, 7, 'متابعة بعد الندوة', 2], [khaled, 3, 'تذكير بالقسط المتأخر', -2], [ahmed, 4, 'متابعة الحضور', 3]];
    for (const [c, i, title, d] of tasks) await c('POST', '/api/v2/tasks', { title, customer: cust[i].id, dueAt: iso(ago(-d)), kind: 'follow_up' });
    for (const [c, i, channel, outcome, summary] of [[ahmed, 0, 'call', 'enrolled', 'تم التسجيل في الماجستير ودفع القسط الأول'], [ahmed, 6, 'whatsapp', 'interested', 'مهتم بالدبلوم ويسأل عن التقسيط'], [khaled, 7, 'call', 'callback', 'طلب الاتصال بعد أسبوع'], [khaled, 3, 'call', 'no_answer', 'لم يرد بخصوص القسط المتأخر']]) {
        await c('POST', `/api/v2/customers/${cust[i].id}/communications`, { channel, direction: 'outbound', outcome, summary });
    }
    await ahmed('POST', `/api/v2/customers/${cust[0].id}/notes`, { body: 'عميل ملتزم ويفضّل التواصل بالواتساب مساءً.' });
    const learner = await login('learner');
    await learner('POST', '/api/v2/complaints', { subject: 'تأخر رفع تسجيل المحاضرة', description: 'تسجيل محاضرة أنماط القيادة لم يظهر بعد.', category: 'other' });
    const pub = client();
    await pub('POST', '/api/inquiries', { name: 'نادين مجدي', phone: '01055566677', email: 'nadeen@example.com', message: 'أرغب في معرفة مواعيد الدفعة القادمة من الماجستير.', inquiryType: 'استفسار عام', subject: 'مواعيد الماجستير' });
    await pub('POST', '/api/inquiries', { name: 'شريف عادل', phone: '01244455566', email: 'sherif@example.com', message: 'هل يوجد تقسيط لدبلوم إدارة المشاريع؟', inquiryType: 'استفسار عام', subject: 'التقسيط' });
    await ahmed('POST', '/api/v2/leaves', { type: 'annual', from: iso(ago(-8)).slice(0, 10), to: iso(ago(-10)).slice(0, 10), reason: 'إجازة عائلية' });
    console.log('activity ✓');

    // ---- attendance of the last two weeks (Sunday to Thursday) ----
    for (let d = 14; d >= 1; d--) {
        const date = ago(d);
        if ([5, 6].includes(date.getUTCDay())) continue;
        const ymd = date.toISOString().slice(0, 10);
        for (const [k, late] of [['leader', 0], ['ahmed', d % 4 === 0 ? 25 : 3], ['khaled', 8], ['noura', d % 5 === 0 ? 40 : 0]]) {
            const inAt = new Date(`${ymd}T07:${String(Math.min(late, 59)).padStart(2, '0')}:00Z`);
            const outAt = new Date(`${ymd}T15:${String(5 + (d % 20)).padStart(2, '0')}:00Z`);
            await AttendanceRecord.create({ user: users[k]._id, team: k === 'noura' ? null : team._id, date: ymd, checkIn: { at: inAt, method: 'qr' }, checkOut: { at: outAt, method: 'qr' }, scans: 2 });
        }
    }
    console.log('attendance ✓');

    server.close();
    await mongoose.disconnect();
    console.log(`\nDone. Sign in with any of these (password ${PASSWORD}):`);
    for (const a of Object.values(ACCOUNTS)) console.log(`  ${a.email}  (${a.role})`);
}

main().catch((err) => { console.error(err); process.exit(1); });
