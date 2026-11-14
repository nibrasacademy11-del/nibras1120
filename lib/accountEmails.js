// The emails of a customer's account: confirm the address, welcome, password reset, password
// changed, and the answer to a data change request. Arabic first with an English line, in the
// academy's identity (lib/brandEmail). Each returns what lib/mail.send returned.

const { brandedEmail } = require('./brandEmail');
const mail = require('./mail');
const { PROFILE_DEFAULT } = require('./academy');

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const when = (d = new Date()) => new Date(d).toLocaleString('ar-EG', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Cairo' });

async function academy() {
    try {
        const { getSetting } = require('../modules/crm/service');
        return { ...PROFILE_DEFAULT, ...((await getSetting('academy.profile')) || {}) };
    } catch {
        return { ...PROFILE_DEFAULT };
    }
}

async function deliver(kind, to, subject, parts, text) {
    const prof = await academy();
    const footer = [prof.phone, prof.email, prof.website].filter(Boolean).join(' · ');
    return mail.send({ kind, to, subject, html: brandedEmail({ ...parts, footer }), text });
}

// The fields a customer sees on their profile, as the emails name them
const FIELD_LABELS = {
    nameAr: 'الاسم بالعربي', nameEn: 'الاسم بالإنجليزي', phone: 'رقم الموبايل', email: 'الإيميل',
    country: 'الدولة', nationality: 'الجنسية', nationalId: 'رقم الهوية', passport: 'رقم الجواز', birthDate: 'تاريخ الميلاد'
};

function verifyEmail(user, link) {
    return deliver('verify-email', user.email, 'أكّد إيميلك - أكاديمية نبراس / Confirm your email', {
        heading: `أهلاً ${firstName(user.name)}`,
        lines: ['شكراً لتسجيلك في أكاديمية نبراس.', 'اضغط الزر لتأكيد إيميلك. الرابط صالح لمدة 24 ساعة.'],
        button: { url: link, label: 'تأكيد الإيميل' },
        noteEn: 'Thank you for joining Nibras Academy. Press the button to confirm your email; the link works for 24 hours.'
    }, `أهلاً ${firstName(user.name)}، أكّد إيميلك من هذا الرابط (صالح 24 ساعة): ${link}`);
}

function welcome(user, profileLink) {
    return deliver('welcome', user.email, 'أهلاً بك في أكاديمية نبراس / Welcome to Nibras Academy', {
        heading: `أهلاً بك يا ${firstName(user.name)}`,
        lines: [
            'تم تأكيد إيميلك وحسابك جاهز.',
            'من صفحتك الشخصية تكمل بياناتك، وتتابع برامجك ومحاضراتك ومدفوعاتك وشهاداتك.',
            'اكتب اسمك بالعربي والإنجليزي كما في الهوية أو الجواز بالضبط، لأنه هو الذي يُكتب على الشهادة.'
        ],
        button: { url: profileLink, label: 'افتح صفحتي' },
        noteEn: 'Your email is confirmed and your account is ready. Complete your details on your profile; your name in Arabic and English goes on your certificates exactly as written.'
    }, `أهلاً بك في أكاديمية نبراس. صفحتك: ${profileLink}`);
}

function resetPassword(user, link) {
    return deliver('reset-password', user.email, 'إعادة تعيين كلمة المرور - أكاديمية نبراس / Reset your password', {
        heading: 'إعادة تعيين كلمة المرور',
        lines: [
            'وصلنا طلب لتغيير كلمة المرور لحسابك.',
            'الرابط صالح لمدة 10 دقائق ويعمل مرة واحدة فقط.',
            'إذا لم تطلب ذلك، تجاهل هذه الرسالة ولن تتغير كلمة المرور الحالية.'
        ],
        button: { url: link, label: 'اختر كلمة مرور جديدة' },
        noteEn: 'We received a request to reset your password. The link works once, for 10 minutes. If it was not you, ignore this email.'
    }, `لتغيير كلمة المرور افتح هذا الرابط (صالح 10 دقائق): ${link}`);
}

function passwordChanged(user, forgotLink) {
    return deliver('password-changed', user.email, 'تم تغيير كلمة المرور - أكاديمية نبراس / Your password was changed', {
        heading: 'تم تغيير كلمة المرور',
        lines: [
            `تم تغيير كلمة مرور حسابك يوم ${when()}.`,
            'وتم تسجيل الخروج من كل الأجهزة الأخرى.',
            'إذا لم تكن أنت من غيّرها، غيّرها فوراً من الزر أدناه وتواصل معنا.'
        ],
        button: { url: forgotLink, label: 'لست أنا: غيّر كلمة المرور' },
        noteEn: 'Your password was changed and other devices were signed out. If this was not you, reset it now and contact us.'
    }, `تم تغيير كلمة مرور حسابك. إذا لم تكن أنت: ${forgotLink}`);
}

// request: { status, changes: [{ field, to }], decisionNote }; reissued: certificate numbers
function profileDecision(user, request, { profileLink, reissued = [] }) {
    const approved = request.status === 'approved';
    const lines = approved
        ? [
            'تمت الموافقة على طلب تعديل بياناتك، وأصبحت البيانات الجديدة:',
            ...request.changes.map((c) => `${FIELD_LABELS[c.field] || c.field}: ${c.to}`),
            reissued.length ? `وأُعيد إصدار شهاداتك بالبيانات الجديدة (${reissued.join('، ')}).` : ''
        ]
        : ['لم تتم الموافقة على طلب تعديل بياناتك.', request.decisionNote ? `السبب: ${request.decisionNote}` : '', 'يمكنك إرسال طلب جديد من صفحتك.'];
    return deliver('profile-decision', user.email, approved ? 'تم تعديل بياناتك - أكاديمية نبراس / Your details were updated' : 'طلب تعديل البيانات - أكاديمية نبراس / Your change request', {
        heading: approved ? 'تم تعديل بياناتك' : 'بخصوص طلب تعديل بياناتك',
        lines,
        button: { url: profileLink, label: 'افتح صفحتي' },
        noteEn: approved ? 'Your change request was approved and your details are updated.' : 'Your change request was not approved. You can send a new one from your profile.'
    }, lines.filter(Boolean).join('\n'));
}

module.exports = { verifyEmail, welcome, resetPassword, passwordChanged, profileDecision, FIELD_LABELS };
