// The customer's page on the website (PLAN-V2 §3): personal data (locked once recorded, changed
// by request), the learning path, lectures, payments, certificates, requests and account security.
// Uses apiFetch, esc and showToast from script.js, which loads first.

(function () {
    const isEN = document.documentElement.lang === 'en';
    const locale = isEN ? 'en-GB' : 'ar-EG';
    const L = isEN ? 'en' : 'ar';

    const T = isEN ? {
        hello: 'Welcome back', customerNo: 'Customer no.', logout: 'Sign out', loading: 'Loading…', error: 'Something went wrong. Reload the page.',
        tabs: { data: 'My details', path: 'My path', lectures: 'My lectures', payments: 'My payments', certificates: 'My certificates', requests: 'My requests', security: 'Security' },
        verifyTitle: 'Confirm your email', verifyText: (e) => `Open the confirmation link sent to ${e}. If it did not arrive, ask for a new one.`, resend: 'Send me a new link', resent: 'We sent a new link to your email.',
        welcomeTitle: 'Your account is ready', welcomeText: 'Complete your details below: your name in Arabic and English is written on your certificates exactly as recorded here.',
        noFile: 'Your account is not linked to a customer file yet. Please contact us and we will link it.',
        dataTitle: 'My personal details', lockedNote: 'These details are printed on your certificates. Once recorded they change only by a request that the academy approves.',
        notYet: 'Not filled yet', lockedTip: 'Locked: changes by request', askChange: 'Request a change',
        fields: { nameAr: 'Name in Arabic', nameEn: 'Name in English', phone: 'Mobile', email: 'Email', country: 'Country', nationality: 'Nationality', nationalId: 'National ID no.', passport: 'Passport no.', birthDate: 'Date of birth' },
        completeTitle: 'Complete your details', completeHint: 'Fill these once. After saving they are locked like the rest.',
        idKind: 'Document', idNational: 'National ID', idPassport: 'Passport', idNumber: 'Number',
        confirmCheck: 'I confirm these details match my ID or passport exactly, and that they change only by request after saving.',
        save: 'Save my details', saved: 'Your details are saved.',
        pendingTitle: 'Your request is under review', pendingText: 'The academy will review it and email you the answer.', cancelReq: 'Cancel the request', cancelled: 'The request was cancelled.',
        historyTitle: 'Earlier requests', reqStatus: { pending: 'Under review', approved: 'Approved', rejected: 'Not approved', cancelled: 'Cancelled' },
        changeTitle: 'Request a change to your details', changeHint: 'Write the new value only for what you want to change.', current: 'Now', newValue: 'New value',
        reason: 'Why do you need the change?', reasonPh: 'For example: my name is spelled differently in my passport', send: 'Send the request', sentReq: 'Your request was sent. We will email you the answer.', close: 'Close',
        pathEmpty: 'You are not enrolled in a program yet.', browse: 'Browse the programs', enrolled: 'Enrolled', group: 'Group', progress: 'Progress', modules: 'Modules',
        moduleStatus: { not_started: 'Not started', in_progress: 'In progress', ready_for_review: 'Under review', approved: 'Completed', rejected: 'To redo', certificate_issued: 'Completed' },
        nextLecture: 'Next lecture', lecturesEntered: (a, b) => `Lectures: entered ${a} of ${b}`, noLectures: 'No lectures yet',
        countsLater: 'Counts when you enter it at its time', moduleDone: (t) => `Well done! You completed ${t}.`,
        waiting: 'You are on the list for the next group of this program. We will tell you as soon as it starts.',
        lecturesEmpty: 'No lectures yet. When your group starts, its lectures appear here.', join: 'Enter the lecture', recording: 'Watch the recording', cancelledL: 'Cancelled',
        state: { upcoming: 'Upcoming', open: 'Open now', ended: 'Held', cancelled: 'Cancelled' }, attended: 'You entered',
        passTitle: 'The lecture passcode', passText: 'Zoom may ask for this passcode. Copy it, then continue to Zoom.', copy: 'Copy', copied: 'Copied', goZoom: 'Continue to Zoom', minutes: 'min',
        remaining: 'Remaining', paid: 'Paid', installments: 'Installments', payments: 'Payments', noPayments: 'No payments yet.', print: 'Print', receipt: 'Receipt',
        instStatus: { paid: 'Paid', partial: 'Partly paid', due: 'Due', overdue: 'Overdue' },
        method: { cash: 'Cash', bank_transfer: 'Bank transfer', card: 'Card', wallet: 'Wallet', gateway: 'Online payment', cheque: 'Cheque', other: 'Other' },
        certsEmpty: 'Your certificates appear here when they are issued.', openCert: 'View and download PDF', verifyCert: 'Verify', certNo: 'Certificate no.', issued: 'Issued', certKind: { module: 'Module certificate', program: 'Program certificate', legacy: 'Certificate' },
        complaintsTitle: 'My requests and complaints', newComplaint: 'New request', noComplaints: 'No requests yet.', subject: 'Subject', category: 'About', details: 'Details',
        categories: { service: 'Service', program: 'The program', trainer: 'The trainer', finance: 'Payments', certificate: 'Certificates', technical: 'A technical problem', other: 'Other' },
        cStatus: { open: 'Open', in_progress: 'Being handled', resolved: 'Resolved', closed: 'Closed' }, sentComplaint: 'Your request was sent.',
        pwTitle: 'Change the password', pwCurrent: 'Current password', pwNew: 'New password', pwConfirm: 'Confirm the new password', pwSave: 'Change the password', pwDone: 'Password changed. We emailed you about it.',
        pwMismatch: 'The new passwords do not match.', pwShort: 'At least 8 characters.', devicesTitle: 'Other devices', devicesText: 'Signed in on a device you no longer use? Sign it out.', devicesBtn: 'Sign out other devices', devicesDone: (n) => `${n} device(s) signed out.`
    } : {
        hello: 'أهلاً بك', customerNo: 'رقم العميل', logout: 'تسجيل الخروج', loading: 'جارٍ التحميل…', error: 'حدث خطأ. أعد تحميل الصفحة.',
        tabs: { data: 'بياناتي', path: 'مساري', lectures: 'محاضراتي', payments: 'مدفوعاتي', certificates: 'شهاداتي', requests: 'طلباتي', security: 'الأمان' },
        verifyTitle: 'أكّد إيميلك', verifyText: (e) => `افتح رابط التأكيد المرسل إلى ${e}. إن لم يصلك، اطلب رابطاً جديداً.`, resend: 'أرسل لي رابطاً جديداً', resent: 'أرسلنا رابطاً جديداً إلى إيميلك.',
        welcomeTitle: 'حسابك جاهز', welcomeText: 'أكمل بياناتك بالأسفل: اسمك بالعربي والإنجليزي يُكتب على شهاداتك كما هو مسجل هنا بالضبط.',
        noFile: 'حسابك غير مرتبط بملف عميل بعد. تواصل معنا وسنربطه لك.',
        dataTitle: 'بياناتي الشخصية', lockedNote: 'هذه البيانات تُكتب على شهاداتك. بعد تسجيلها لا تتغير إلا بطلب تعديل توافق عليه الأكاديمية.',
        notYet: 'لم تُكتب بعد', lockedTip: 'مقفول: يتغير بطلب تعديل', askChange: 'طلب تعديل',
        fields: { nameAr: 'الاسم بالعربي', nameEn: 'الاسم بالإنجليزي', phone: 'رقم الموبايل', email: 'الإيميل', country: 'الدولة', nationality: 'الجنسية', nationalId: 'رقم الهوية', passport: 'رقم الجواز', birthDate: 'تاريخ الميلاد' },
        completeTitle: 'أكمل بياناتك', completeHint: 'تُكتب مرة واحدة، وبعد الحفظ تُقفل مثل باقي البيانات.',
        idKind: 'المستند', idNational: 'بطاقة الهوية', idPassport: 'جواز السفر', idNumber: 'الرقم',
        confirmCheck: 'أؤكد أن هذه البيانات مطابقة لهويتي أو جوازي بالضبط، وأنها لا تتغير بعد الحفظ إلا بطلب تعديل.',
        save: 'حفظ بياناتي', saved: 'تم حفظ بياناتك.',
        pendingTitle: 'طلبك قيد المراجعة', pendingText: 'ستراجعه الأكاديمية وتصلك الإجابة على إيميلك.', cancelReq: 'إلغاء الطلب', cancelled: 'تم إلغاء الطلب.',
        historyTitle: 'طلبات سابقة', reqStatus: { pending: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'لم تتم الموافقة', cancelled: 'ملغى' },
        changeTitle: 'طلب تعديل بياناتك', changeHint: 'اكتب القيمة الجديدة فقط في الخانة التي تريد تغييرها.', current: 'الحالي', newValue: 'القيمة الجديدة',
        reason: 'لماذا تحتاج التعديل؟', reasonPh: 'مثلاً: اسمي مكتوب بشكل مختلف في الجواز', send: 'إرسال الطلب', sentReq: 'تم إرسال طلبك، وستصلك الإجابة على إيميلك.', close: 'إغلاق',
        pathEmpty: 'لم تُسجَّل في أي برنامج بعد.', browse: 'تصفح البرامج', enrolled: 'تاريخ التسجيل', group: 'المجموعة', progress: 'التقدم', modules: 'المحاور',
        moduleStatus: { not_started: 'لم يبدأ', in_progress: 'جارٍ', ready_for_review: 'قيد المراجعة', approved: 'مكتمل', rejected: 'يحتاج إعادة', certificate_issued: 'مكتمل' },
        nextLecture: 'المحاضرة القادمة', lecturesEntered: (a, b) => `المحاضرات: دخلت ${a} من ${b}`, noLectures: 'لا توجد محاضرات بعد',
        countsLater: 'تُحسب عندما تدخلها في موعدها', moduleDone: (t) => `أحسنت! أكملت ${t}.`,
        waiting: 'أنت في قائمة المجموعة القادمة لهذا البرنامج، وسنبلغك فور بدئها.',
        lecturesEmpty: 'لا توجد محاضرات بعد. عندما تبدأ مجموعتك تظهر محاضراتها هنا.', join: 'ادخل المحاضرة', recording: 'شاهد التسجيل', cancelledL: 'ملغاة',
        state: { upcoming: 'قادمة', open: 'متاحة الآن', ended: 'انعقدت', cancelled: 'ملغاة' }, attended: 'دخلتها',
        passTitle: 'كود دخول المحاضرة', passText: 'قد يطلب زوم هذا الكود. انسخه ثم تابع إلى زوم.', copy: 'نسخ', copied: 'تم النسخ', goZoom: 'المتابعة إلى زوم', minutes: 'دقيقة',
        remaining: 'المتبقي', paid: 'المدفوع', installments: 'الأقساط', payments: 'المدفوعات', noPayments: 'لا توجد مدفوعات بعد.', print: 'طباعة', receipt: 'إيصال',
        instStatus: { paid: 'مدفوع', partial: 'مدفوع جزئياً', due: 'مستحق', overdue: 'متأخر' },
        method: { cash: 'نقدي', bank_transfer: 'تحويل بنكي', card: 'بطاقة', wallet: 'محفظة', gateway: 'دفع إلكتروني', cheque: 'شيك', other: 'أخرى' },
        certsEmpty: 'تظهر شهاداتك هنا عند صدورها.', openCert: 'عرض وتحميل PDF', verifyCert: 'تحقق', certNo: 'رقم الشهادة', issued: 'تاريخ الإصدار', certKind: { module: 'شهادة محور', program: 'شهادة إتمام البرنامج', legacy: 'شهادة' },
        complaintsTitle: 'طلباتي وشكاواي', newComplaint: 'طلب جديد', noComplaints: 'لا توجد طلبات بعد.', subject: 'الموضوع', category: 'بخصوص', details: 'التفاصيل',
        categories: { service: 'الخدمة', program: 'البرنامج', trainer: 'المحاضر', finance: 'المدفوعات', certificate: 'الشهادات', technical: 'مشكلة تقنية', other: 'أخرى' },
        cStatus: { open: 'مفتوح', in_progress: 'قيد المعالجة', resolved: 'تم الحل', closed: 'مغلق' }, sentComplaint: 'تم إرسال طلبك.',
        pwTitle: 'تغيير كلمة المرور', pwCurrent: 'كلمة المرور الحالية', pwNew: 'كلمة المرور الجديدة', pwConfirm: 'تأكيد كلمة المرور الجديدة', pwSave: 'تغيير كلمة المرور', pwDone: 'تم تغيير كلمة المرور، وأرسلنا لك إيميلاً بذلك.',
        pwMismatch: 'كلمتا المرور الجديدتان غير متطابقتين.', pwShort: '8 أحرف على الأقل.', devicesTitle: 'الأجهزة الأخرى', devicesText: 'دخلت من جهاز لم تعد تستخدمه؟ سجّل خروجه.', devicesBtn: 'تسجيل الخروج من الأجهزة الأخرى', devicesDone: (n) => `تم تسجيل الخروج من ${n} جهاز.`
    };

    const COUNTRIES = isEN
        ? ['Egypt', 'Saudi Arabia', 'United Arab Emirates', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Jordan', 'Iraq', 'Libya', 'Sudan', 'Yemen', 'Palestine', 'Lebanon', 'Syria', 'Morocco', 'Algeria', 'Tunisia']
        : ['مصر', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'البحرين', 'عُمان', 'الأردن', 'العراق', 'ليبيا', 'السودان', 'اليمن', 'فلسطين', 'لبنان', 'سوريا', 'المغرب', 'الجزائر', 'تونس'];
    const TABS = [
        { id: 'data', icon: 'fa-id-card' }, { id: 'path', icon: 'fa-route' }, { id: 'lectures', icon: 'fa-video' },
        { id: 'payments', icon: 'fa-wallet' }, { id: 'certificates', icon: 'fa-award' }, { id: 'requests', icon: 'fa-headset' },
        { id: 'security', icon: 'fa-shield-halved' }
    ];

    // ---- small helpers ----
    const $ = (id) => document.getElementById(id);
    const h = (v) => esc(v == null ? '' : String(v));
    const fmtDay = (d) => (d ? new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
    const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : '');
    const money = (amount, currency) => {
        try { return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(Number(amount) || 0); } catch { return `${Number(amount) || 0} ${h(currency)}`; }
    };
    const pick = (ar, en) => (isEN ? en || ar : ar || en) || '';
    const pill = (text, tone = '') => `<span class="pf-pill${tone ? ` pf-pill--${tone}` : ''}">${h(text)}</span>`;
    const empty = (icon, text, extra = '') => `<div class="pf-empty"><i class="fas ${icon}" aria-hidden="true"></i><p>${h(text)}</p>${extra}</div>`;
    const errText = (e) => {
        const m = (e && e.message) || T.error;
        const parts = String(m).split(' / ');
        return isEN ? (parts[1] || parts[0]) : parts[0];
    };
    const busy = (btn, on) => { if (!btn) return; btn.disabled = on; btn.classList.toggle('is-busy', on); };
    const post = (url, body) => apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(body || {}), lang: L }) });

    let me = null;
    let profile = null;

    // ---- the page ----
    async function boot() {
        try {
            me = await apiFetch('/api/auth/me');
        } catch (e) {
            window.location.replace(`/pages/${L}/login.html?next=${encodeURIComponent(window.location.pathname)}`);
            return;
        }
        if (me.isStaff) { window.location.replace('/portal/'); return; }
        try { localStorage.setItem('nibras_user_name', me.user.name || ''); } catch {}
        hero();
        notices();
        tabs();
        window.addEventListener('hashchange', show);
        show();
    }

    function hero() {
        const name = me.user.name || '';
        $('pfAvatar').textContent = (name.trim().charAt(0) || '؟');
        $('pfHello').textContent = T.hello;
        $('pfName').textContent = name;
        $('pfMeta').textContent = me.user.email || '';
        const out = $('pfLogout');
        out.querySelector('span').textContent = T.logout;
        out.addEventListener('click', () => window.logout());
    }

    function notices() {
        const box = $('pfNotice');
        const parts = [];
        if (new URLSearchParams(window.location.search).get('welcome')) {
            parts.push(`<div class="pf-alert pf-alert--ok"><i class="fas fa-circle-check" aria-hidden="true"></i><div><strong>${h(T.welcomeTitle)}</strong><p>${h(T.welcomeText)}</p></div></div>`);
        }
        if (!me.user.emailVerifiedAt) {
            parts.push(`<div class="pf-alert pf-alert--warn"><i class="fas fa-envelope-circle-check" aria-hidden="true"></i><div><strong>${h(T.verifyTitle)}</strong><p>${h(T.verifyText(me.user.email))}</p></div><button type="button" class="pf-btn pf-btn--ghost" id="pfResend">${h(T.resend)}</button></div>`);
        }
        box.innerHTML = parts.join('');
        const resend = $('pfResend');
        if (resend) resend.addEventListener('click', async () => {
            busy(resend, true);
            try { await post('/api/auth/resend-verification'); showToast(T.resent); } catch (e) { showToast(errText(e), true); } finally { busy(resend, false); }
        });
    }

    function tabs() {
        $('pfTabs').innerHTML = TABS.map((t) => `<a href="#${t.id}" class="pf-tab" role="tab" data-tab="${t.id}"><i class="fas ${t.icon}" aria-hidden="true"></i><span>${h(T.tabs[t.id])}</span></a>`).join('');
    }

    const current = () => {
        const id = window.location.hash.replace('#', '');
        return TABS.some((t) => t.id === id) ? id : 'data';
    };

    async function show() {
        const id = current();
        document.querySelectorAll('.pf-tab').forEach((a) => {
            const on = a.dataset.tab === id;
            a.classList.toggle('is-active', on);
            a.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        // on a phone the tab bar scrolls sideways: bring the open tab into it
        const bar = $('pfTabs');
        const act = bar && bar.querySelector('.pf-tab.is-active');
        if (act) {
            const r = act.getBoundingClientRect();
            const b = bar.getBoundingClientRect();
            if (r.left < b.left || r.right > b.right) bar.scrollLeft += (r.left + r.width / 2) - (b.left + b.width / 2);
        }
        const panel = $('pfPanel');
        panel.innerHTML = `<div class="pf-loading"><span class="pf-spinner" aria-hidden="true"></span>${h(T.loading)}</div>`;
        try {
            await RENDER[id](panel);
        } catch (e) {
            panel.innerHTML = e && e.payload && e.payload.code === 'NO_FILE' ? empty('fa-link-slash', T.noFile) : empty('fa-triangle-exclamation', errText(e));
        }
        panel.classList.remove('pf-enter');
        void panel.offsetWidth;
        panel.classList.add('pf-enter');
    }

    // ---- my details ----
    async function renderData(panel) {
        profile = await apiFetch('/api/v2/my/profile');
        // one identity number is enough: the empty other one is not shown
        const shown = profile.fields.filter((x) => !(profile.idGiven && !x.value && ['nationalId', 'passport'].includes(x.field)));
        const rows = shown.map((x) => `
            <div class="pf-field">
                <dt>${h(T.fields[x.field])}</dt>
                <dd${['nameEn', 'email', 'phone', 'nationalId', 'passport'].includes(x.field) ? ' dir="ltr"' : ''}>${x.value ? h(x.field === 'birthDate' ? fmtDay(x.value) : x.value) : `<span class="pf-unset">${h(T.notYet)}</span>`}</dd>
                ${x.locked ? `<i class="fas fa-lock pf-lock" title="${h(T.lockedTip)}" aria-label="${h(T.lockedTip)}"></i>` : '<span></span>'}
            </div>`).join('');

        // empty fields the customer fills once; one identity number is enough
        const open = profile.fields.filter((x) => !x.locked && x.field !== 'email' && !(profile.idGiven && ['nationalId', 'passport'].includes(x.field)));
        const needsId = !profile.idGiven;
        const openPlain = open.filter((x) => !['nationalId', 'passport'].includes(x.field));
        const complete = (openPlain.length || needsId) && !profile.pending ? `
            <section class="pf-card pf-card--accent">
                <h3><i class="fas fa-pen-to-square" aria-hidden="true"></i> ${h(T.completeTitle)}</h3>
                <p class="pf-muted">${h(T.completeHint)}</p>
                <form id="pfComplete" class="pf-form" novalidate>
                    ${openPlain.map((x) => inputFor(x.field, `c_${x.field}`)).join('')}
                    ${needsId ? `
                    <div class="pf-row2">
                        <label class="pf-label">${h(T.idKind)}
                            <select id="c_idKind"><option value="nationalId">${h(T.idNational)}</option><option value="passport">${h(T.idPassport)}</option></select>
                        </label>
                        <label class="pf-label">${h(T.idNumber)}<input id="c_idNumber" dir="ltr" autocomplete="off" inputmode="text" maxlength="30" /></label>
                    </div>` : ''}
                    <label class="pf-check"><input type="checkbox" id="c_confirm" /> <span>${h(T.confirmCheck)}</span></label>
                    <button type="submit" class="pf-btn">${h(T.save)}</button>
                </form>
            </section>` : '';

        const pending = profile.pending ? `
            <section class="pf-card pf-card--pending">
                <h3><i class="fas fa-hourglass-half" aria-hidden="true"></i> ${h(T.pendingTitle)}</h3>
                <p class="pf-muted">${h(T.pendingText)}</p>
                ${changesList(profile.pending.changes)}
                <p class="pf-small">${h(fmtDay(profile.pending.createdAt))} · ${h(profile.pending.reason)}</p>
                <button type="button" class="pf-btn pf-btn--ghost" id="pfCancelReq">${h(T.cancelReq)}</button>
            </section>` : '';

        const done = profile.history.filter((r) => r.status !== 'pending');
        const history = done.length ? `
            <section class="pf-card">
                <h3><i class="fas fa-clock-rotate-left" aria-hidden="true"></i> ${h(T.historyTitle)}</h3>
                <ul class="pf-list">${done.map((r) => `
                    <li><div>${changesList(r.changes)}<p class="pf-small">${h(fmtDay(r.decidedAt || r.createdAt))}${r.decisionNote ? ` · ${h(r.decisionNote)}` : ''}</p></div>
                    ${pill(T.reqStatus[r.status], { approved: 'ok', rejected: 'bad', cancelled: '' }[r.status])}</li>`).join('')}
                </ul>
            </section>` : '';

        panel.innerHTML = `
            <div class="pf-grid${pending || complete || history ? '' : ' pf-grid--one'}">
                <section class="pf-card">
                    <div class="pf-card__head">
                        <h2><i class="fas fa-id-card" aria-hidden="true"></i> ${h(T.dataTitle)}</h2>
                        <span class="pf-chip">${h(T.customerNo)} <b dir="ltr">${h(profile.customerNo)}</b></span>
                    </div>
                    <p class="pf-note"><i class="fas fa-lock" aria-hidden="true"></i> ${h(T.lockedNote)}</p>
                    <dl class="pf-fields">${rows}</dl>
                    ${profile.pending ? '' : `<button type="button" class="pf-btn pf-btn--ghost" id="pfAsk"><i class="fas fa-pen" aria-hidden="true"></i> ${h(T.askChange)}</button>`}
                </section>
                ${pending || complete || history ? `<div class="pf-stack">${pending}${complete}${history}</div>` : ''}
            </div>`;

        const form = $('pfComplete');
        if (form) form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const values = {};
            for (const x of openPlain) values[x.field] = $(`c_${x.field}`).value.trim();
            if (needsId && $('c_idNumber').value.trim()) values[$('c_idKind').value] = $('c_idNumber').value.trim();
            const btn = form.querySelector('button[type=submit]');
            busy(btn, true);
            try {
                await post('/api/v2/my/profile', { values, confirm: $('c_confirm').checked });
                showToast(T.saved);
                show();
            } catch (e) { showToast(errText(e), true); } finally { busy(btn, false); }
        });
        const cancel = $('pfCancelReq');
        if (cancel) cancel.addEventListener('click', async () => {
            busy(cancel, true);
            try { await post(`/api/v2/my/profile/requests/${profile.pending._id}/cancel`); showToast(T.cancelled); show(); } catch (e) { showToast(errText(e), true); busy(cancel, false); }
        });
        const ask = $('pfAsk');
        if (ask) ask.addEventListener('click', changeDialog);
    }

    // hint: the current value, shown under the box (a placeholder would mix directions)
    function inputFor(field, id, hint = '') {
        const ph = '';
        const tip = hint ? `<small class="pf-small pf-current">${h(T.current)}: <bdi>${h(hint)}</bdi></small>` : '';
        if (field === 'birthDate') return `<label class="pf-label">${h(T.fields[field])}<input type="date" id="${id}" max="${new Date().toISOString().slice(0, 10)}" />${tip}</label>`;
        if (field === 'country' || field === 'nationality') {
            return `<label class="pf-label">${h(T.fields[field])}<input id="${id}" list="pfCountries" maxlength="80"${ph} />${tip}</label>`;
        }
        const ltr = ['nameEn', 'email', 'phone', 'nationalId', 'passport'].includes(field) ? ' dir="ltr"' : '';
        const type = field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text';
        return `<label class="pf-label">${h(T.fields[field])}<input type="${type}" id="${id}"${ltr} maxlength="200"${ph} />${tip}</label>`;
    }

    const changesList = (changes) => `<ul class="pf-changes">${changes.map((c) => `<li><b>${h(T.fields[c.field] || c.field)}:</b> <bdi class="pf-from">${h(c.from || '—')}</bdi> <i class="fas fa-arrow-${isEN ? 'right' : 'left'}" aria-hidden="true"></i> <bdi class="pf-to">${h(c.to)}</bdi></li>`).join('')}</ul>`;

    // The change request: the locked fields with an empty "new value" box each, and a reason
    function changeDialog() {
        const locked = profile.fields.filter((x) => x.locked);
        const dlg = document.createElement('dialog');
        dlg.className = 'pf-dialog';
        dlg.innerHTML = `
            <form method="dialog" class="pf-form" id="pfChangeForm" novalidate>
                <h3><i class="fas fa-pen-to-square" aria-hidden="true"></i> ${h(T.changeTitle)}</h3>
                <p class="pf-muted">${h(T.changeHint)}</p>
                ${locked.map((x) => inputFor(x.field, `r_${x.field}`, x.field === 'birthDate' ? fmtDay(x.value) : x.value)).join('')}
                <label class="pf-label">${h(T.reason)}<textarea id="r_reason" rows="3" maxlength="500" placeholder="${h(T.reasonPh)}"></textarea></label>
                <div class="pf-dialog__actions">
                    <button type="submit" class="pf-btn" value="send">${h(T.send)}</button>
                    <button type="button" class="pf-btn pf-btn--ghost" data-close>${h(T.close)}</button>
                </div>
            </form>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => dlg.remove());
        dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
        dlg.querySelector('form').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const changes = {};
            for (const x of locked) {
                const v = dlg.querySelector(`#r_${x.field}`).value.trim();
                if (v) changes[x.field] = v;
            }
            const btn = dlg.querySelector('button[type=submit]');
            busy(btn, true);
            try {
                await post('/api/v2/my/profile/requests', { changes, reason: dlg.querySelector('#r_reason').value.trim() });
                dlg.close();
                showToast(T.sentReq);
                show();
            } catch (e) { showToast(errText(e), true); busy(btn, false); }
        });
        dlg.showModal();
    }

    // ---- my path: the program, each module's lectures entered, the next lecture ----
    const bar = (pct) => `<span class="pf-bar" role="img" aria-label="${pct}%"><span style="width:${pct}%"></span></span>`;
    const when = (d) => `${fmtDay(d)} · ${fmtTime(d)}`;

    async function renderPath(panel) {
        const { items } = await apiFetch('/api/v2/my/enrollments');
        if (!items.length) {
            panel.innerHTML = empty('fa-route', T.pathEmpty, `<a class="pf-btn" href="/pages/${L}/programs.html">${h(T.browse)}</a>`);
            return;
        }
        panel.innerHTML = items.map((e) => {
            const p = e.path || { modules: {}, percent: (e.progress && e.progress.percent) || 0, lectures: { total: 0, entered: 0 } };
            const pct = p.percent || 0;
            const next = p.next ? `
                <div class="pf-next">
                    <i class="fas fa-calendar-check" aria-hidden="true"></i>
                    <div><small>${h(T.nextLecture)}</small><b>${h(pick(p.next.titleAr, p.next.titleEn))}</b><span>${h(when(p.next.startsAt))}</span></div>
                    <button type="button" class="pf-btn" data-join="${h(p.next._id)}"><i class="fas fa-video" aria-hidden="true"></i> ${h(T.join)}</button>
                </div>` : '';
            const body = p.single
                ? `<div class="pf-single"><span>${p.lectures.total ? h(T.lecturesEntered(p.lectures.entered, p.lectures.total)) : h(T.noLectures)}</span>${bar(pct)}</div>`
                : `<ol class="pf-modules">${(e.modules || []).map((m, i) => {
                    const done = ['approved', 'certificate_issued'].includes(m.status);
                    const r = p.modules[String(m.module)] || { total: 0, entered: 0, percent: 0 };
                    const mp = done ? 100 : r.percent;
                    return `<li class="pf-module${done ? ' is-done' : ''}">
                        <span class="pf-module__no">${done ? '<i class="fas fa-check" aria-hidden="true"></i>' : i + 1}</span>
                        <span class="pf-module__title">${h(pick(m.titleAr, m.titleEn))}<small>${r.total ? h(T.lecturesEntered(r.entered, r.total)) : h(T.noLectures)}</small>${bar(mp)}</span>
                        ${done ? pill(T.moduleStatus.approved, 'ok') : pill(`${mp}%`, mp ? 'info' : '')}
                    </li>`;
                }).join('')}</ol>`;
            return `
            <section class="pf-card pf-program">
                <div class="pf-program__head">
                    <div>
                        <h2>${h(pick(e.programTitleAr, e.programTitleEn))}</h2>
                        <p class="pf-small">${h(T.enrolled)}: ${h(fmtDay(e.enrolledAt))}${e.cohort ? ` · ${h(T.group)}: ${h(pick(e.cohort.nameAr, e.cohort.nameEn))}${e.cohort.schedule ? ` (${h(e.cohort.schedule)})` : ''}` : ''}</p>
                    </div>
                    <div class="pf-ring" style="--p:${pct}" role="img" aria-label="${h(T.progress)} ${pct}%"><span>${pct}%</span></div>
                </div>
                ${e.waitingSince && !e.cohort ? `<p class="pf-note"><i class="fas fa-hourglass-half" aria-hidden="true"></i> ${h(T.waiting)}</p>` : ''}
                ${next}
                ${body}
            </section>`;
        }).join('');
        panel.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => join(b)));
    }

    // ---- my lectures: all open, in any order (PLAN-V2 decision 4) ----
    async function renderLectures(panel) {
        const { groups } = await apiFetch('/api/v2/my/lectures');
        const all = groups.flatMap((g) => g.lectures);
        if (!all.length) { panel.innerHTML = empty('fa-video', T.lecturesEmpty); return; }
        panel.innerHTML = groups.filter((g) => g.lectures.length).map((g) => `
            <section class="pf-section">
                <h2 class="pf-section__title">${h(pick(g.program && g.program.titleAr, g.program && g.program.titleEn))} <small>${h(pick(g.nameAr, g.nameEn))}</small></h2>
                <div class="pf-lectures">${g.lectures.map((l) => lectureCard(l)).join('')}</div>
            </section>`).join('');
        panel.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => join(b)));
        panel.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => join(b, `/api/v2/my/lectures/${b.dataset.lecture}/recordings/${b.dataset.rec}`)));
    }

    function lectureCard(l) {
        const d = new Date(l.startsAt);
        const tone = { open: 'ok', upcoming: 'info', ended: '', cancelled: 'bad' }[l.state];
        const rec = (l.recordings || [])[0];
        let action = '';
        if (l.state !== 'cancelled') {
            if (rec) action = `<button type="button" class="pf-btn pf-btn--ghost" data-rec="${h(rec._id)}" data-lecture="${h(l._id)}"><i class="fas fa-circle-play" aria-hidden="true"></i> ${h(T.recording)}</button>`;
            else if (l.hasLink) action = `<button type="button" class="pf-btn" data-join="${h(l._id)}"><i class="fas fa-video" aria-hidden="true"></i> ${h(T.join)}</button>`;
        }
        const hint = l.state === 'upcoming' && !l.entered && !l.counts ? `<p class="pf-hint"><i class="fas fa-circle-info" aria-hidden="true"></i> ${h(T.countsLater)}</p>` : '';
        return `
            <article class="pf-lecture pf-lecture--${h(l.state)}${l.entered ? ' is-entered' : ''}">
                <div class="pf-date"><b>${d.toLocaleDateString(locale, { day: 'numeric' })}</b><span>${h(d.toLocaleDateString(locale, { month: 'short' }))}</span></div>
                <div class="pf-lecture__body">
                    <h3>${h(pick(l.titleAr, l.titleEn))}</h3>
                    <p class="pf-small">${l.module ? `${h(pick(l.module.titleAr, l.module.titleEn))} · ` : ''}${h(fmtTime(l.startsAt))} · ${h(l.durationMin)} ${h(T.minutes)}</p>
                    ${hint}
                    <div class="pf-lecture__foot">${pill(T.state[l.state] || l.state, tone)}${l.entered ? pill(T.attended, 'ok') : ''}${action}</div>
                </div>
            </article>`;
    }

    // Join a lecture (or open its recording): the server checks membership, counts the entry and
    // gives the link; a module completed by this entry is celebrated
    async function join(btn, url) {
        busy(btn, true);
        try {
            const r = await post(url || `/api/v2/my/lectures/${btn.dataset.join}/join`);
            if (r.completed && r.completed.length) showToast(T.moduleDone(r.completed.map((c) => pick(c.titleAr, c.titleEn)).join('، ')));
            openZoom(r.url, r.passcode, () => show());
        } catch (e) { showToast(errText(e), true); } finally { busy(btn, false); }
    }

    // The link itself is never shown: with a passcode, a card to copy it first, then Zoom
    function openZoom(url, passcode, after) {
        if (!url) return;
        if (!passcode) { window.location.assign(url); return; }
        const dlg = document.createElement('dialog');
        dlg.className = 'pf-dialog pf-dialog--small';
        dlg.innerHTML = `
            <h3><i class="fas fa-key" aria-hidden="true"></i> ${h(T.passTitle)}</h3>
            <p class="pf-muted">${h(T.passText)}</p>
            <div class="pf-pass"><code dir="ltr">${h(passcode)}</code><button type="button" class="pf-btn pf-btn--ghost" data-copy><i class="fas fa-copy" aria-hidden="true"></i> ${h(T.copy)}</button></div>
            <div class="pf-dialog__actions">
                <a class="pf-btn" href="${h(url)}" target="_blank" rel="noopener noreferrer" data-go><i class="fas fa-video" aria-hidden="true"></i> ${h(T.goZoom)}</a>
                <button type="button" class="pf-btn pf-btn--ghost" data-close>${h(T.close)}</button>
            </div>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => { dlg.remove(); if (after) after(); });
        dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
        dlg.querySelector('[data-go]').addEventListener('click', () => setTimeout(() => dlg.close(), 300));
        dlg.querySelector('[data-copy]').addEventListener('click', async (ev) => {
            try { await navigator.clipboard.writeText(passcode); ev.currentTarget.innerHTML = `<i class="fas fa-check" aria-hidden="true"></i> ${h(T.copied)}`; } catch { /* the code stays visible to copy by hand */ }
        });
        dlg.showModal();
    }

    // ---- my payments ----
    async function renderPayments(panel) {
        const d = await apiFetch('/api/v2/my/finance');
        const totals = d.byCurrency.length ? `<div class="pf-stats">${d.byCurrency.map((x) => `
            <div class="pf-stat"><small>${h(T.remaining)}</small><b>${h(money(x.remaining, x.currency))}</b><span>${h(T.paid)}: ${h(money(x.paid, x.currency))}</span></div>`).join('')}</div>` : '';
        const inst = d.charges.length ? d.charges.map((c) => `
            <div class="pf-charge"><h3>${h(c.description)}</h3>
                <ul class="pf-list">${(c.installmentStatus || []).map((i) => `<li><span>${h(fmtDay(i.dueDate))}</span><span class="pf-row">${h(money(i.remaining || i.amount, c.currency))} ${pill(T.instStatus[i.status] || i.status, { paid: 'ok', overdue: 'bad', partial: 'info', due: '' }[i.status])}</span></li>`).join('')}</ul>
            </div>`).join('') : `<p class="pf-muted">${h(T.noPayments)}</p>`;
        const pays = d.payments.length ? `<ul class="pf-list">${d.payments.map((p) => `
            <li><span><b dir="ltr">${h(p.receiptNo)}</b><br><span class="pf-small">${h(fmtDay(p.paidAt))} · ${h(T.method[p.method] || p.method)}</span></span><b>${h(money(p.amount, p.currency))}</b></li>`).join('')}</ul>` : `<p class="pf-muted">${h(T.noPayments)}</p>`;
        panel.innerHTML = `
            <div class="pf-toolbar"><button type="button" class="pf-btn pf-btn--ghost" onclick="window.print()"><i class="fas fa-print" aria-hidden="true"></i> ${h(T.print)}</button></div>
            ${totals}
            <div class="pf-grid pf-grid--even">
                <section class="pf-card"><h2><i class="fas fa-calendar-days" aria-hidden="true"></i> ${h(T.installments)}</h2>${inst}</section>
                <section class="pf-card"><h2><i class="fas fa-receipt" aria-hidden="true"></i> ${h(T.payments)}</h2>${pays}</section>
            </div>`;
    }

    // ---- my certificates: only issued ones (a certificate waiting for payment is not shown) ----
    async function renderCertificates(panel) {
        const { items } = await apiFetch('/api/v2/my/certificates');
        if (!items.length) { panel.innerHTML = empty('fa-award', T.certsEmpty); return; }
        panel.innerHTML = `<div class="pf-certs">${items.map((c) => `
            <article class="pf-cert">
                <div class="pf-cert__seal" aria-hidden="true"><i class="fas fa-award"></i></div>
                <div class="pf-cert__body">
                    <small>${h(T.certKind[c.kind] || T.certKind.legacy)}</small>
                    <h3>${h(c.kind === 'module' ? pick(c.moduleName, c.moduleNameEn) : pick(c.program_name, c.programNameEn))}</h3>
                    ${c.kind === 'module' ? `<p class="pf-small">${h(pick(c.program_name, c.programNameEn))}</p>` : ''}
                    <p class="pf-small">${h(T.certNo)} <b dir="ltr">${h(c.cert_num)}</b> · ${h(T.issued)} ${h(fmtDay(c.issuedAt || c.issue_date))}</p>
                </div>
                <div class="pf-row">
                    <a class="pf-btn pf-btn--ghost" href="/pages/${L}/verify.html?code=${encodeURIComponent(c.cert_num)}"><i class="fas fa-shield-halved" aria-hidden="true"></i> ${h(T.verifyCert)}</a>
                    ${c.kind !== 'legacy' ? `<a class="pf-btn" href="/pages/${L}/certificate.html?id=${encodeURIComponent(c._id)}"><i class="fas fa-file-arrow-down" aria-hidden="true"></i> ${h(T.openCert)}</a>` : ''}
                </div>
            </article>`).join('')}</div>`;
    }

    // ---- my requests and complaints ----
    async function renderRequests(panel) {
        const { items } = await apiFetch('/api/v2/complaints');
        const list = items.length ? `<ul class="pf-list">${items.map((c) => `
            <li><span><b>${h(c.subject)}</b> <span class="pf-small" dir="ltr">${h(c.complaintNo)}</span><br><span class="pf-small">${h(fmtDay(c.createdAt))}${c.resolution ? ` · ${h(c.resolution)}` : ''}</span></span>
            ${pill(T.cStatus[c.status] || c.status, { resolved: 'ok', closed: '', open: 'info', in_progress: 'info' }[c.status])}</li>`).join('')}</ul>` : empty('fa-inbox', T.noComplaints);
        panel.innerHTML = `
            <div class="pf-grid">
                <section class="pf-card"><h2><i class="fas fa-headset" aria-hidden="true"></i> ${h(T.complaintsTitle)}</h2>${list}</section>
                <section class="pf-card pf-card--accent">
                    <h3><i class="fas fa-plus" aria-hidden="true"></i> ${h(T.newComplaint)}</h3>
                    <form id="pfComplaint" class="pf-form">
                        <label class="pf-label">${h(T.category)}<select id="q_cat">${Object.entries(T.categories).map(([k, v]) => `<option value="${k}">${h(v)}</option>`).join('')}</select></label>
                        <label class="pf-label">${h(T.subject)}<input id="q_subject" maxlength="200" required /></label>
                        <label class="pf-label">${h(T.details)}<textarea id="q_desc" rows="4" maxlength="5000"></textarea></label>
                        <button type="submit" class="pf-btn">${h(T.send)}</button>
                    </form>
                </section>
            </div>`;
        $('pfComplaint').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const btn = ev.target.querySelector('button');
            busy(btn, true);
            try {
                await post('/api/v2/complaints', { category: $('q_cat').value, subject: $('q_subject').value.trim(), description: $('q_desc').value.trim() });
                showToast(T.sentComplaint);
                show();
            } catch (e) { showToast(errText(e), true); busy(btn, false); }
        });
    }

    // ---- security ----
    async function renderSecurity(panel) {
        panel.innerHTML = `
            <div class="pf-grid pf-grid--even">
                <section class="pf-card">
                    <h2><i class="fas fa-key" aria-hidden="true"></i> ${h(T.pwTitle)}</h2>
                    <form id="pfPw" class="pf-form">
                        <label class="pf-label">${h(T.pwCurrent)}<input type="password" id="s_cur" autocomplete="current-password" required /></label>
                        <label class="pf-label">${h(T.pwNew)}<input type="password" id="s_new" autocomplete="new-password" minlength="8" required /><small class="pf-small">${h(T.pwShort)}</small></label>
                        <label class="pf-label">${h(T.pwConfirm)}<input type="password" id="s_new2" autocomplete="new-password" minlength="8" required /></label>
                        <button type="submit" class="pf-btn">${h(T.pwSave)}</button>
                    </form>
                </section>
                <section class="pf-card">
                    <h2><i class="fas fa-laptop-mobile" aria-hidden="true"></i> ${h(T.devicesTitle)}</h2>
                    <p class="pf-muted">${h(T.devicesText)}</p>
                    <button type="button" class="pf-btn pf-btn--ghost" id="pfDevices">${h(T.devicesBtn)}</button>
                </section>
            </div>`;
        $('pfPw').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            if ($('s_new').value !== $('s_new2').value) { showToast(T.pwMismatch, true); return; }
            if ($('s_new').value.length < 8) { showToast(T.pwShort, true); return; }
            const btn = ev.target.querySelector('button');
            busy(btn, true);
            try {
                await post('/api/v2/me/password', { currentPassword: $('s_cur').value, newPassword: $('s_new').value });
                ev.target.reset();
                showToast(T.pwDone);
            } catch (e) { showToast(errText(e), true); } finally { busy(btn, false); }
        });
        $('pfDevices').addEventListener('click', async (ev) => {
            const btn = ev.currentTarget;
            busy(btn, true);
            try { const r = await post('/api/v2/me/sessions/revoke-others'); showToast(T.devicesDone(r.revoked || 0)); } catch (e) { showToast(errText(e), true); } finally { busy(btn, false); }
        });
    }

    const RENDER = { data: renderData, path: renderPath, lectures: renderLectures, payments: renderPayments, certificates: renderCertificates, requests: renderRequests, security: renderSecurity };

    // countries for the country and nationality boxes
    document.addEventListener('DOMContentLoaded', () => {
        if (!document.getElementById('pf')) return;
        const dl = document.createElement('datalist');
        dl.id = 'pfCountries';
        dl.innerHTML = COUNTRIES.map((c) => `<option value="${h(c)}"></option>`).join('');
        document.body.appendChild(dl);
        boot();
    });
})();
