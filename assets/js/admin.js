/* ============================================
   Nibras Academy - Admin panel
   Uses the shared helpers from script.js: apiFetch, esc, safeUrl, showToast, formatPrice, LEVELS, specialtyOf
   ============================================ */
(() => {
    'use strict';

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const lines = (text) => String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
    const empty = (text, icon = 'fa-inbox') => `<div class="empty"><i class="fas ${icon}"></i><p>${esc(text)}</p></div>`;
    const failed = (err) => `<div class="empty empty--error"><i class="fas fa-triangle-exclamation"></i><p>${esc(err.message || 'تعذر تحميل البيانات.')}</p></div>`;

    const SECTIONS = {
        dashboard: ['نظرة عامة', 'ملخص سريع لنشاط الموقع والطلبات'],
        programs: ['البرامج', 'إضافة البرامج وتعديلها بالكامل، والأسعار والخصومات والحالة'],
        featured: ['البرامج المميزة', 'اختر البرامج التي تظهر في الصفحة الرئيسية'],
        pathways: ['المسارات التعليمية', 'صور ونصوص المسارات الأربعة'],
        heroes: ['صور رؤوس الصفحات', 'الصورة التي تظهر في أول كل صفحة'],
        cards: ['محاور البرامج والخدمات', 'كروت صفحة البرامج والخدمات'],
        stats: ['أرقام نبراس', 'الأرقام التي تظهر في الرئيسية وصفحة عن نبراس'],
        testimonials: ['آراء العملاء', 'إضافة آراء العملاء وتعديلها وحذفها'],
        inquiries: ['الطلبات والرسائل', 'طلبات التسجيل ورسائل التواصل'],
        certificates: ['الشهادات', 'إصدار الشهادات وتعديلها'],
        users: ['المستخدمون', 'حسابات المتدربين والمديرين']
    };
    const PROGRAM_STATUS = { available: 'متاح', coming_soon: 'قريباً', unavailable: 'غير متاح', hidden: 'مخفي' };
    const INQUIRY_STATUS = { New: 'جديدة', 'In Progress': 'قيد المتابعة', Replied: 'تم الرد', Closed: 'مغلقة' };
    const CERT_STATUS = { Valid: 'صالحة', Suspended: 'معلقة', Cancelled: 'ملغاة', Expired: 'منتهية' };
    const ENROLLMENT = 'طلب تسجيل';
    const STAT_ICONS = ['fa-user-graduate', 'fa-chalkboard-teacher', 'fa-certificate', 'fa-history', 'fa-award', 'fa-graduation-cap',
        'fa-users', 'fa-building', 'fa-briefcase', 'fa-handshake', 'fa-globe', 'fa-book-open', 'fa-trophy', 'fa-chart-line', 'fa-clock', 'fa-star'];
    const IMAGE_WIDTH = { hero: 1920, card: 1280, avatar: 480 };

    // --- Data, loaded once per section and refreshed after changes ---
    const state = {};
    async function load(key, url, pick, force) {
        if (state[key] && !force) return state[key];
        state[key] = pick(await apiFetch(url));
        return state[key];
    }
    const getPrograms = (force) => load('programs', '/api/courses?limit=500', (d) => d.courses || [], force);
    const getInquiries = (force) => load('inquiries', '/api/inquiries', (d) => d.inquiries || [], force);
    const getCertificates = (force) => load('certificates', '/api/admin/certificates', (d) => d.certificates || [], force);
    const getUsers = (force) => load('users', '/api/auth/users', (d) => d.users || [], force);
    const getTestimonials = (force) => load('testimonials', '/api/admin/testimonials', (d) => d.testimonials || [], force);
    const getSite = (force) => load('site', '/api/admin/site', (d) => d, force);

    function json(method, body) {
        return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    }

    // Saved content shows on this browser's next page view instead of the copy it remembered
    function forgetSiteCache() {
        try { localStorage.removeItem('nibras_site_v1'); } catch (e) {}
    }

    function uploading() {
        if (!$('.uploader.is-busy')) return false;
        showToast('انتظر حتى يكتمل رفع الصورة.', true);
        return true;
    }

    // Reads every named field (and image) inside a card or form
    function readFields(root) {
        const out = {};
        $$('[name]', root).forEach((field) => {
            out[field.name] = field.type === 'checkbox' ? field.checked : field.value.trim();
        });
        $$('[data-uploader]', root).forEach((u) => { out[u.dataset.name] = u.dataset.value || ''; });
        return out;
    }

    function fillFields(root, values) {
        $$('[name]', root).forEach((field) => {
            const value = values[field.name];
            if (field.type === 'checkbox') field.checked = !!value;
            else if (field.type !== 'file') field.value = Array.isArray(value) ? value.join('\n') : (value ?? '');
        });
        $$('[data-uploader]', root).forEach((u) => mountUploader(u, values[u.dataset.name]));
    }

    // =============================================================
    // Image uploads: shrunk in the browser, then stored by the server
    // =============================================================
    async function shrinkImage(file, maxWidth) {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxWidth / bitmap.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84));
        if (webp && webp.type === 'image/webp') return webp;
        // Browsers that cannot write WebP get a JPEG, on white so transparent areas do not turn black
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    }

    async function uploadImage(file, maxWidth) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('اختر صورة بصيغة JPG أو PNG أو WebP.');
        const blob = await shrinkImage(file, maxWidth);
        if (blob.size > 4 * 1024 * 1024) throw new Error('الصورة كبيرة جداً حتى بعد تصغيرها.');
        const data = new FormData();
        data.append('image', blob, blob.type === 'image/webp' ? 'image.webp' : 'image.jpg');
        return (await apiFetch('/api/admin/media', { method: 'POST', body: data })).url;
    }

    function mountUploader(el, value) {
        if (!el.dataset.ready) {
            el.innerHTML = `
                <div class="uploader-preview">
                    <img alt="" hidden />
                    <span class="uploader-empty"><i class="fas fa-image"></i> لا توجد صورة</span>
                    <span class="uploader-busy"><i class="fas fa-spinner fa-spin"></i> جاري الرفع...</span>
                </div>
                <div class="uploader-actions">
                    <label class="btn btn-light btn-sm"><input type="file" accept="image/jpeg,image/png,image/webp" hidden /><i class="fas fa-upload"></i> اختيار صورة</label>
                    <button type="button" class="btn btn-ghost btn-sm" data-clear><i class="fas fa-trash-can"></i> إزالة</button>
                </div>`;
            el.dataset.ready = '1';
        }
        setUploaderValue(el, value || '');
    }

    function setUploaderValue(el, value) {
        // Old program covers pointed at the retired illustrations; they count as no image
        const url = value && !value.startsWith('/assets/img/specialties/') ? value : '';
        el.dataset.value = url;
        const img = $('img', el);
        img.hidden = !url;
        if (url) img.src = url;
        else img.removeAttribute('src');
        $('.uploader-empty', el).hidden = !!url;
        $('[data-clear]', el).hidden = !url;
    }

    function bindUploaders() {
        document.addEventListener('change', async (e) => {
            const input = e.target.closest('.uploader input[type="file"]');
            if (!input) return;
            const el = input.closest('[data-uploader]');
            const file = input.files[0];
            input.value = '';
            if (!file) return;
            el.classList.add('is-busy');
            try {
                setUploaderValue(el, await uploadImage(file, IMAGE_WIDTH[el.dataset.size] || 1280));
            } catch (err) {
                showToast(err.message, true);
            } finally {
                el.classList.remove('is-busy');
            }
        });
        document.addEventListener('click', (e) => {
            const clear = e.target.closest('[data-uploader] [data-clear]');
            if (clear) setUploaderValue(clear.closest('[data-uploader]'), '');
        });
    }

    // =============================================================
    // Shell: sections, sidebar, dialogs
    // =============================================================
    const LOADERS = {
        dashboard: loadDashboard,
        programs: renderPrograms,
        featured: renderFeatured,
        pathways: renderPathways,
        heroes: renderHeroes,
        cards: renderCards,
        stats: renderStats,
        testimonials: renderTestimonials,
        inquiries: renderInquiries,
        certificates: renderCertificates,
        users: renderUsers
    };

    function showSection(name) {
        if (!SECTIONS[name]) name = 'dashboard';
        $$('.admin-section').forEach((s) => { s.hidden = s.id !== `sec-${name}`; });
        $$('#adminNav [data-section]').forEach((b) => b.classList.toggle('active', b.dataset.section === name));
        $('#sectionTitle').textContent = SECTIONS[name][0];
        $('#sectionDesc').textContent = SECTIONS[name][1];
        history.replaceState(null, '', `#${name}`);
        toggleSidebar(false);
        LOADERS[name]();
    }

    function toggleSidebar(open) {
        $('#adminSidebar').classList.toggle('open', open);
        $('#adminOverlay').hidden = !open;
    }

    function bindShell() {
        $('#adminNav').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-section]');
            if (btn) showSection(btn.dataset.section);
        });
        document.addEventListener('click', (e) => {
            const go = e.target.closest('[data-go]');
            if (go) showSection(go.dataset.go);
            const close = e.target.closest('dialog [data-close]');
            if (close) close.closest('dialog').close();
        });
        // Back/forward and links to #section open that section
        window.addEventListener('hashchange', () => {
            const name = window.location.hash.slice(1);
            if (!$(`#sec-${name}`) || !$(`#sec-${name}`).hidden) return;
            showSection(name);
        });
        $('#adminMenuBtn').addEventListener('click', () => toggleSidebar(!$('#adminSidebar').classList.contains('open')));
        $('#adminOverlay').addEventListener('click', () => toggleSidebar(false));
        $('#logoutBtn').addEventListener('click', () => window.logout());
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-save]');
            if (btn) saveSiteSection(btn.dataset.save, btn);
        });
    }

    async function busy(button, task) {
        const original = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        try {
            return await task();
        } finally {
            button.disabled = false;
            button.innerHTML = original;
        }
    }

    // =============================================================
    // Overview
    // =============================================================
    async function loadDashboard() {
        const grid = $('#kpiGrid');
        grid.innerHTML = '<div class="kpi is-loading"></div>'.repeat(6);
        const [programs, inquiries, certs, users, testimonials] = await Promise.allSettled([
            getPrograms(true), getInquiries(true), getCertificates(true), getUsers(true), getTestimonials(true)
        ]);
        const value = (r, fn) => (r.status === 'fulfilled' ? fn(r.value) : '—');
        const kpis = [
            { go: 'programs', icon: 'fa-graduation-cap', label: 'البرامج', value: value(programs, (l) => l.length), sub: value(programs, (l) => `${l.filter((p) => p.status === 'available').length} متاح للتسجيل`) },
            { go: 'inquiries', icon: 'fa-file-signature', label: 'طلبات التسجيل الجديدة', value: value(inquiries, (l) => l.filter((i) => i.inquiryType === ENROLLMENT && i.status === 'New').length), sub: value(inquiries, (l) => `من ${l.filter((i) => i.inquiryType === ENROLLMENT).length} طلب`) },
            { go: 'inquiries', icon: 'fa-envelope', label: 'رسائل جديدة', value: value(inquiries, (l) => l.filter((i) => i.inquiryType !== ENROLLMENT && i.status === 'New').length), sub: value(inquiries, (l) => `من ${l.filter((i) => i.inquiryType !== ENROLLMENT).length} رسالة`) },
            { go: 'certificates', icon: 'fa-certificate', label: 'الشهادات', value: value(certs, (l) => l.length), sub: value(certs, (l) => `${l.filter((c) => c.status === 'Valid').length} صالحة`) },
            { go: 'users', icon: 'fa-users', label: 'المستخدمون', value: value(users, (l) => l.length), sub: value(users, (l) => `${l.filter((u) => u.role === 'admin' || u.role === 'super_admin').length} مدير`) },
            { go: 'testimonials', icon: 'fa-comment-dots', label: 'آراء العملاء', value: value(testimonials, (l) => l.length), sub: value(testimonials, (l) => `${l.filter((t) => t.visible).length} ظاهر في الموقع`) }
        ];
        grid.innerHTML = kpis.map((k) => `
            <button type="button" class="kpi" data-go="${k.go}">
                <span class="kpi-icon"><i class="fas ${k.icon}"></i></span>
                <span class="kpi-value">${esc(k.value)}</span>
                <span class="kpi-label">${esc(k.label)}</span>
                <span class="kpi-sub">${esc(k.sub)}</span>
            </button>`).join('');

        const recent = $('#recentInquiries');
        if (inquiries.status !== 'fulfilled') {
            recent.innerHTML = failed(inquiries.reason);
            return;
        }
        const list = inquiries.value.slice(0, 6);
        recent.innerHTML = list.length ? `
            <table class="table">
                <thead><tr><th>التاريخ</th><th>الاسم</th><th>النوع</th><th>الحالة</th></tr></thead>
                <tbody>${list.map((i) => `
                    <tr>
                        <td>${fmtDate(i.createdAt)}</td>
                        <td>${esc(i.name)}</td>
                        <td>${i.inquiryType === ENROLLMENT ? `<span class="pill pill--gold">طلب تسجيل · ${formatPrice(i.total || 0)}</span>` : esc(i.inquiryType)}</td>
                        <td><span class="pill status-${esc(i.status.replace(' ', '-').toLowerCase())}">${esc(INQUIRY_STATUS[i.status] || i.status)}</span></td>
                    </tr>`).join('')}</tbody>
            </table>` : empty('لا توجد طلبات أو رسائل بعد.');
        updateInquiryBadge(inquiries.value);
    }

    // =============================================================
    // Programs
    // =============================================================
    function programPrice(p) {
        return p.discountPercent > 0
            ? `<del>${formatPrice(p.price)}</del> <strong>${formatPrice(p.finalPrice)}</strong> <span class="pill pill--gold">-${p.discountPercent}%</span>`
            : `<strong>${formatPrice(p.price)}</strong>`;
    }

    async function renderPrograms() {
        const box = $('#programsTable');
        box.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
        let programs;
        try {
            programs = await getPrograms();
        } catch (err) {
            box.innerHTML = failed(err);
            return;
        }
        const q = $('#programSearch').value.trim().toLowerCase();
        const type = $('#programTypeFilter').value;
        const status = $('#programStatusFilter').value;
        const list = programs.filter((p) => (!type || p.type === type) && (!status || p.status === status)
            && (!q || `${p.titleAr} ${p.titleEn}`.toLowerCase().includes(q)));
        box.innerHTML = list.length ? `
            <p class="table-count">${list.length} من ${programs.length} برنامج</p>
            <table class="table">
                <thead><tr><th>البرنامج</th><th>المسار</th><th>السعر</th><th>الحالة</th><th>مميز</th><th></th></tr></thead>
                <tbody>${list.map((p) => `
                    <tr>
                        <td><strong>${esc(p.titleAr)}</strong><small>${esc(specialtyOf(p).ar)}</small></td>
                        <td>${esc(LEVELS[p.type] ? LEVELS[p.type].ar : p.type)}</td>
                        <td class="nowrap">${programPrice(p)}</td>
                        <td><span class="pill status-${esc(p.status)}">${esc(PROGRAM_STATUS[p.status] || p.status)}</span></td>
                        <td><button type="button" class="star-btn${p.featured ? ' on' : ''}" data-action="feature" data-id="${esc(p._id)}" aria-label="${p.featured ? 'إزالة من المميزة' : 'إضافة للمميزة'}"><i class="fa${p.featured ? 's' : 'r'} fa-star"></i></button></td>
                        <td class="row-actions">
                            <button type="button" class="icon-btn" data-action="edit" data-id="${esc(p._id)}" aria-label="تعديل"><i class="fas fa-pen"></i></button>
                            <a class="icon-btn" href="/pages/ar/program-detail.html?slug=${encodeURIComponent(p.slug || p._id)}" target="_blank" rel="noopener" aria-label="عرض في الموقع"><i class="fas fa-eye"></i></a>
                            <button type="button" class="icon-btn icon-btn--danger" data-action="delete" data-id="${esc(p._id)}" aria-label="حذف"><i class="fas fa-trash-can"></i></button>
                        </td>
                    </tr>`).join('')}</tbody>
            </table>` : empty('لا توجد برامج مطابقة.', 'fa-magnifying-glass');
    }

    async function setFeatured(id, featured) {
        const data = await apiFetch(`/api/courses/${id}`, json('PUT', { featured }));
        state.programs = state.programs.map((p) => (p._id === id ? data.course : p));
        showToast(featured ? 'تمت الإضافة للبرامج المميزة.' : 'تمت الإزالة من البرامج المميزة.');
    }

    function openProgram(course) {
        const form = $('#programForm');
        form.reset();
        const select = $('#programSpecialty');
        select.innerHTML = NIBRAS_SPECIALTIES.map((s) => `<option value="${esc(s.ar)}">${esc(s.ar)}</option>`).join('');
        // Programs saved with an older specialty name keep it selectable
        if (course && course.specialty && !NIBRAS_SPECIALTIES.some((s) => s.ar === course.specialty)) {
            select.insertAdjacentHTML('afterbegin', `<option value="${esc(course.specialty)}">${esc(course.specialty)}</option>`);
        }
        fillFields(form, course ? { ...course, id: course._id } : { status: 'available', type: 'course', discountPercent: 0, deliveryMethod: 'عن بُعد (محاضرات مباشرة ومسجلة)' });
        $('#programDialogTitle').textContent = course ? 'تعديل البرنامج' : 'برنامج جديد';
        updatePricePreview();
        $('#programDialog').showModal();
    }

    function updatePricePreview() {
        const form = $('#programForm');
        const price = Math.max(Number(form.price.value) || 0, 0);
        const discount = Math.min(Math.max(Number(form.discountPercent.value) || 0, 0), 90);
        const final = Math.round(price * (100 - discount)) / 100;
        $('#pricePreview').innerHTML = discount > 0
            ? `السعر بعد الخصم: <strong>${formatPrice(final)}</strong> بدلاً من <del>${formatPrice(price)}</del>`
            : `سعر البرنامج: <strong>${formatPrice(price)}</strong>`;
    }

    async function saveProgram(e) {
        e.preventDefault();
        if (uploading()) return;
        const form = e.target;
        const v = readFields(form);
        const price = Number(v.price);
        const discount = Number(v.discountPercent || 0);
        if (!v.titleAr) return showToast('اسم البرنامج بالعربي مطلوب.', true);
        if (v.price === '' || !(price >= 0)) return showToast('اكتب سعراً صحيحاً.', true);
        if (!(discount >= 0 && discount <= 90)) return showToast('نسبة الخصم من 0 إلى 90.', true);

        const payload = {
            titleAr: v.titleAr, titleEn: v.titleEn, type: v.type, specialty: v.specialty, status: v.status,
            featured: v.featured, price, discountPercent: Math.round(discount),
            duration: v.duration, deliveryMethod: v.deliveryMethod, certificateType: v.certificateType, image: v.image,
            descriptionAr: v.descriptionAr, descriptionEn: v.descriptionEn,
            seoTitleAr: v.seoTitleAr, seoTitleEn: v.seoTitleEn, seoDescriptionAr: v.seoDescriptionAr, seoDescriptionEn: v.seoDescriptionEn
        };
        for (const field of ['objectives', 'topics', 'audience', 'outcomes']) {
            payload[`${field}Ar`] = lines(v[`${field}Ar`]);
            payload[`${field}En`] = lines(v[`${field}En`]);
        }
        if (v.slug) payload.slug = v.slug;

        await busy(form.querySelector('[type="submit"]'), async () => {
            try {
                const data = v.id
                    ? await apiFetch(`/api/courses/${v.id}`, json('PUT', payload))
                    : await apiFetch('/api/courses', json('POST', payload));
                state.programs = v.id
                    ? state.programs.map((p) => (p._id === v.id ? data.course : p))
                    : [data.course, ...(state.programs || [])];
                $('#programDialog').close();
                showToast(v.id ? 'تم حفظ البرنامج.' : 'تمت إضافة البرنامج.');
                renderPrograms();
            } catch (err) {
                showToast(err.message, true);
            }
        });
    }

    function bindPrograms() {
        ['programSearch', 'programTypeFilter', 'programStatusFilter'].forEach((id) => $(`#${id}`).addEventListener('input', renderPrograms));
        $('#addProgramBtn').addEventListener('click', () => openProgram(null));
        $('#programForm').addEventListener('submit', saveProgram);
        $('#programForm').addEventListener('input', (e) => {
            if (e.target.name === 'price' || e.target.name === 'discountPercent') updatePricePreview();
        });
        $('#programsTable').addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const program = state.programs.find((p) => p._id === btn.dataset.id);
            if (!program) return;
            try {
                if (btn.dataset.action === 'edit') openProgram(program);
                if (btn.dataset.action === 'feature') {
                    await setFeatured(program._id, !program.featured);
                    renderPrograms();
                }
                if (btn.dataset.action === 'delete' && confirm(`حذف البرنامج "${program.titleAr}" نهائياً؟`)) {
                    await apiFetch(`/api/courses/${program._id}`, { method: 'DELETE' });
                    state.programs = state.programs.filter((p) => p._id !== program._id);
                    showToast('تم حذف البرنامج.');
                    renderPrograms();
                }
            } catch (err) {
                showToast(err.message, true);
            }
        });
    }

    // =============================================================
    // Featured programs
    // =============================================================
    async function renderFeatured() {
        const list = $('#featuredList');
        const candidates = $('#featuredCandidates');
        let programs;
        try {
            programs = await getPrograms();
        } catch (err) {
            list.innerHTML = failed(err);
            candidates.innerHTML = '';
            return;
        }
        const featured = programs.filter((p) => p.featured);
        list.innerHTML = featured.length
            ? featured.map((p, i) => `
                <div class="chip${i >= 6 ? ' chip--muted' : ''}">
                    <span><strong>${esc(p.titleAr)}</strong><small>${esc(LEVELS[p.type] ? LEVELS[p.type].ar : '')}${p.status !== 'available' ? ` · ${esc(PROGRAM_STATUS[p.status])}` : ''}${i >= 6 ? ' · لن يظهر (أول 6 فقط)' : ''}</small></span>
                    <button type="button" class="icon-btn icon-btn--danger" data-unfeature="${esc(p._id)}" aria-label="إزالة"><i class="fas fa-xmark"></i></button>
                </div>`).join('')
            : empty('لا توجد برامج مميزة. الصفحة الرئيسية تعرض برامج تلقائياً.', 'fa-star');

        const q = $('#featuredSearch').value.trim().toLowerCase();
        const pool = programs.filter((p) => !p.featured && p.status === 'available' && (!q || `${p.titleAr} ${p.titleEn}`.toLowerCase().includes(q))).slice(0, 25);
        candidates.innerHTML = pool.length ? `
            <table class="table">
                <tbody>${pool.map((p) => `
                    <tr>
                        <td><strong>${esc(p.titleAr)}</strong><small>${esc(specialtyOf(p).ar)}</small></td>
                        <td>${esc(LEVELS[p.type] ? LEVELS[p.type].ar : '')}</td>
                        <td class="nowrap">${programPrice(p)}</td>
                        <td class="row-actions"><button type="button" class="btn btn-light btn-sm" data-feature="${esc(p._id)}"><i class="fas fa-plus"></i> إضافة</button></td>
                    </tr>`).join('')}</tbody>
            </table>` : empty(q ? 'لا توجد نتائج.' : 'كل البرامج المتاحة مضافة.', 'fa-magnifying-glass');
    }

    function bindFeatured() {
        $('#featuredSearch').addEventListener('input', renderFeatured);
        $('#sec-featured').addEventListener('click', async (e) => {
            const add = e.target.closest('[data-feature]');
            const remove = e.target.closest('[data-unfeature]');
            if (!add && !remove) return;
            try {
                await setFeatured((add || remove).dataset[add ? 'feature' : 'unfeature'], !!add);
                renderFeatured();
            } catch (err) {
                showToast(err.message, true);
            }
        });
    }

    // =============================================================
    // Site content: pathways, page images, program page cards, numbers
    // =============================================================
    const field = (name, label, value, opts = {}) => {
        const attrs = `name="${name}"${opts.ltr ? ' dir="ltr"' : ''}${opts.max ? ` maxlength="${opts.max}"` : ''}`;
        const input = opts.area
            ? `<textarea ${attrs} rows="${opts.rows || 3}">${esc(Array.isArray(value) ? value.join('\n') : value)}</textarea>`
            : `<input ${attrs} value="${esc(value)}" />`;
        return `<label class="field${opts.wide ? ' field--wide' : ''}">${label}${input}</label>`;
    };
    const imageSlot = (value, size, aspect) => `<div class="uploader" data-uploader data-name="image" data-size="${size}" style="--aspect: ${aspect}" data-initial="${esc(value || '')}"></div>`;

    function mountAll(root) {
        $$('[data-uploader]', root).forEach((u) => mountUploader(u, u.dataset.initial));
    }

    async function withSite(box, render) {
        try {
            render(await getSite());
        } catch (err) {
            box.innerHTML = failed(err);
        }
    }

    function renderPathways() {
        const box = $('#pathwaysEditor');
        withSite(box, (site) => {
            box.innerHTML = site.pathways.map((p, i) => `
                <article class="editor-card" data-item data-key="${esc(p.key)}">
                    <h3><span class="editor-num">0${i + 1}</span> ${esc(p.titleAr)}</h3>
                    ${imageSlot(p.image, 'card', '16 / 10')}
                    <div class="form-grid">
                        ${field('titleAr', 'العنوان بالعربي', p.titleAr, { max: 80 })}
                        ${field('titleEn', 'Title (English)', p.titleEn, { ltr: true, max: 80 })}
                        ${field('taglineAr', 'الجملة المختصرة', p.taglineAr, { max: 120 })}
                        ${field('taglineEn', 'Tagline (English)', p.taglineEn, { ltr: true, max: 120 })}
                        ${field('descAr', 'الوصف', p.descAr, { area: true, max: 400 })}
                        ${field('descEn', 'Description (English)', p.descEn, { area: true, ltr: true, max: 400 })}
                    </div>
                </article>`).join('');
            mountAll(box);
        });
    }

    function renderHeroes() {
        const box = $('#heroesEditor');
        withSite(box, (site) => {
            box.innerHTML = site.heroPages.map((page) => `
                <article class="editor-card hero-card" data-hero-key="${esc(page.key)}">
                    <h3>${esc(page.ar)}</h3>
                    ${imageSlot(site.heroes[page.key], 'hero', '16 / 5')}
                </article>`).join('');
            mountAll(box);
        });
    }

    function renderCards() {
        const guide = $('#guideEditor');
        const services = $('#servicesEditor');
        withSite(guide, (site) => {
            guide.innerHTML = site.guideCards.map((c) => `
                <article class="editor-card" data-item data-key="${esc(c.key)}">
                    <h3>${esc(LEVELS[c.key] ? LEVELS[c.key].ar : c.key)}</h3>
                    ${imageSlot(c.image, 'card', '16 / 9')}
                    <div class="form-grid">
                        ${field('titleAr', 'العنوان', c.titleAr, { max: 100 })}
                        ${field('titleEn', 'Title (English)', c.titleEn, { ltr: true, max: 100 })}
                        ${field('textAr', 'النص', c.textAr, { area: true, max: 300 })}
                        ${field('textEn', 'Text (English)', c.textEn, { area: true, ltr: true, max: 300 })}
                        ${field('linkAr', 'نص الرابط', c.linkAr, { max: 40 })}
                        ${field('linkEn', 'Link text (English)', c.linkEn, { ltr: true, max: 40 })}
                    </div>
                </article>`).join('');
            services.innerHTML = site.serviceCards.map((c) => `
                <article class="editor-card" data-item data-key="${esc(c.key)}">
                    <h3>${esc(c.titleAr)}</h3>
                    ${imageSlot(c.image, 'card', '16 / 9')}
                    <div class="form-grid">
                        ${field('titleAr', 'العنوان', c.titleAr, { max: 100 })}
                        ${field('titleEn', 'Title (English)', c.titleEn, { ltr: true, max: 100 })}
                        ${field('subtitleAr', 'العنوان الفرعي', c.subtitleAr, { max: 120 })}
                        ${field('subtitleEn', 'Subtitle (English)', c.subtitleEn, { ltr: true, max: 120 })}
                        ${field('textAr', 'النص', c.textAr, { area: true, max: 400 })}
                        ${field('textEn', 'Text (English)', c.textEn, { area: true, ltr: true, max: 400 })}
                        ${field('pointsAr', 'النقاط (كل نقطة في سطر)', c.pointsAr, { area: true, rows: 5 })}
                        ${field('pointsEn', 'Points (one per line)', c.pointsEn, { area: true, ltr: true, rows: 5 })}
                        ${field('linkAr', 'نص الزر', c.linkAr, { max: 40 })}
                        ${field('linkEn', 'Button text (English)', c.linkEn, { ltr: true, max: 40 })}
                    </div>
                </article>`).join('');
            mountAll(guide);
            mountAll(services);
        });
    }

    // --- Numbers ---
    function statRow(s) {
        return `
            <div class="stat-row" data-item>
                <div class="stat-row-order">
                    <button type="button" class="icon-btn" data-move="-1" aria-label="لأعلى"><i class="fas fa-arrow-up"></i></button>
                    <button type="button" class="icon-btn" data-move="1" aria-label="لأسفل"><i class="fas fa-arrow-down"></i></button>
                </div>
                <label class="field">الأيقونة
                    <span class="icon-select"><i class="fas ${esc(s.icon)}"></i>
                        <select name="icon">${STAT_ICONS.map((icon) => `<option value="${icon}"${icon === s.icon ? ' selected' : ''}>${icon.replace('fa-', '')}</option>`).join('')}</select>
                    </span>
                </label>
                <label class="field">الرقم<input name="value" type="number" min="0" step="1" value="${Number(s.value) || 0}" /></label>
                <label class="field">اللاحقة<input name="suffix" maxlength="4" value="${esc(s.suffix || '')}" placeholder="+" /></label>
                <label class="field">العنوان بالعربي<input name="labelAr" maxlength="60" value="${esc(s.labelAr || '')}" /></label>
                <label class="field">Label (English)<input name="labelEn" dir="ltr" maxlength="60" value="${esc(s.labelEn || '')}" /></label>
                <button type="button" class="icon-btn icon-btn--danger" data-remove aria-label="حذف"><i class="fas fa-trash-can"></i></button>
            </div>`;
    }

    function readStats() {
        return $$('#statsEditor [data-item]').map((row) => {
            const v = readFields(row);
            return { icon: v.icon, value: Number(v.value) || 0, suffix: v.suffix, labelAr: v.labelAr, labelEn: v.labelEn };
        });
    }

    function renderStatsPreview() {
        $('#statsPreview').innerHTML = readStats().filter((s) => s.labelAr).map((s) => `
            <div class="stat-preview">
                <i class="fas ${esc(s.icon)}"></i>
                <strong>${Number(s.value).toLocaleString('en-US')}<em>${esc(s.suffix)}</em></strong>
                <span>${esc(s.labelAr)}</span>
            </div>`).join('') || empty('أضف رقماً لتظهر المعاينة.', 'fa-chart-simple');
    }

    function renderStats() {
        const box = $('#statsEditor');
        withSite(box, (site) => {
            box.innerHTML = site.stats.map(statRow).join('');
            renderStatsPreview();
        });
    }

    function bindStats() {
        const box = $('#statsEditor');
        $('#addStatBtn').addEventListener('click', () => {
            if ($$('[data-item]', box).length >= 8) return showToast('الحد الأقصى 8 أرقام.', true);
            box.insertAdjacentHTML('beforeend', statRow({ icon: 'fa-star', value: 0, suffix: '+', labelAr: '', labelEn: '' }));
            renderStatsPreview();
        });
        box.addEventListener('click', (e) => {
            const row = e.target.closest('[data-item]');
            if (!row) return;
            if (e.target.closest('[data-remove]')) row.remove();
            const move = e.target.closest('[data-move]');
            if (move) {
                const sibling = move.dataset.move === '-1' ? row.previousElementSibling : row.nextElementSibling;
                if (sibling) move.dataset.move === '-1' ? sibling.before(row) : sibling.after(row);
            }
            renderStatsPreview();
        });
        box.addEventListener('input', (e) => {
            if (e.target.name === 'icon') e.target.previousElementSibling.className = `fas ${e.target.value}`;
            renderStatsPreview();
        });
    }

    // Collects one section's editors and saves it
    async function saveSiteSection(section, button) {
        if (uploading()) return;
        let value;
        if (section === 'heroes') {
            value = Object.fromEntries($$('#heroesEditor [data-hero-key]').map((card) => [card.dataset.heroKey, $('[data-uploader]', card).dataset.value || '']));
        } else if (section === 'stats') {
            value = readStats();
            if (value.some((s) => !s.labelAr)) return showToast('اكتب العنوان بالعربي لكل رقم، أو احذف الصف الفارغ.', true);
        } else {
            const box = { pathways: '#pathwaysEditor', guideCards: '#guideEditor', serviceCards: '#servicesEditor' }[section];
            value = $$(`${box} [data-item]`).map((card) => ({ key: card.dataset.key, ...readFields(card) }));
            if (section === 'serviceCards') value.forEach((c) => { c.pointsAr = lines(c.pointsAr); c.pointsEn = lines(c.pointsEn); });
        }
        await busy(button, async () => {
            try {
                const data = await apiFetch(`/api/admin/site/${section}`, json('PUT', { value }));
                state.site = { ...state.site, ...data };
                forgetSiteCache();
                showToast('تم الحفظ. يظهر التعديل في الموقع خلال دقيقة.');
            } catch (err) {
                showToast(err.message, true);
            }
        });
    }

    // =============================================================
    // Testimonials
    // =============================================================
    async function renderTestimonials() {
        const box = $('#testimonialsTable');
        let list;
        try {
            list = await getTestimonials();
        } catch (err) {
            box.innerHTML = failed(err);
            return;
        }
        box.innerHTML = list.length ? `
            <table class="table">
                <thead><tr><th>الاسم</th><th>الرأي</th><th>الترتيب</th><th>ظاهر</th><th></th></tr></thead>
                <tbody>${list.map((t) => `
                    <tr>
                        <td><div class="person">${t.image ? `<img src="${safeUrl(t.image)}" alt="" />` : `<span class="avatar">${esc(t.nameAr.charAt(0))}</span>`}<span><strong>${esc(t.nameAr)}</strong><small>${esc(t.roleAr)}</small></span></div></td>
                        <td class="clamp">${esc(t.quoteAr)}</td>
                        <td>${Number(t.order) || 0}</td>
                        <td><button type="button" class="toggle${t.visible ? ' on' : ''}" data-action="visible" data-id="${esc(t._id)}" aria-label="${t.visible ? 'إخفاء' : 'إظهار'}"><span></span></button></td>
                        <td class="row-actions">
                            <button type="button" class="icon-btn" data-action="edit" data-id="${esc(t._id)}" aria-label="تعديل"><i class="fas fa-pen"></i></button>
                            <button type="button" class="icon-btn icon-btn--danger" data-action="delete" data-id="${esc(t._id)}" aria-label="حذف"><i class="fas fa-trash-can"></i></button>
                        </td>
                    </tr>`).join('')}</tbody>
            </table>` : empty('لا توجد آراء بعد. أضف أول رأي ليظهر القسم في الموقع.', 'fa-comment-dots');
    }

    function openTestimonial(t) {
        const form = $('#testimonialForm');
        form.reset();
        fillFields(form, t ? { ...t, id: t._id } : { visible: true, order: 0 });
        $('#testimonialDialogTitle').textContent = t ? 'تعديل الرأي' : 'رأي جديد';
        $('#testimonialDialog').showModal();
    }

    async function saveTestimonial(id, payload) {
        const data = id
            ? await apiFetch(`/api/admin/testimonials/${id}`, json('PUT', payload))
            : await apiFetch('/api/admin/testimonials', json('POST', payload));
        state.testimonials = id
            ? state.testimonials.map((t) => (t._id === id ? data.testimonial : t))
            : [...(state.testimonials || []), data.testimonial];
        state.testimonials.sort((a, b) => (a.order || 0) - (b.order || 0));
        forgetSiteCache();
    }

    function bindTestimonials() {
        $('#addTestimonialBtn').addEventListener('click', () => openTestimonial(null));
        $('#testimonialForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (uploading()) return;
            const v = readFields(e.target);
            if (!v.nameAr || !v.quoteAr) return showToast('الاسم ونص الرأي بالعربي مطلوبان.', true);
            const { id, ...payload } = v;
            payload.order = Number(payload.order) || 0;
            await busy(e.target.querySelector('[type="submit"]'), async () => {
                try {
                    await saveTestimonial(id, payload);
                    $('#testimonialDialog').close();
                    showToast('تم حفظ الرأي.');
                    renderTestimonials();
                } catch (err) {
                    showToast(err.message, true);
                }
            });
        });
        $('#testimonialsTable').addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const t = state.testimonials.find((x) => x._id === btn.dataset.id);
            if (!t) return;
            try {
                if (btn.dataset.action === 'edit') openTestimonial(t);
                if (btn.dataset.action === 'visible') {
                    await saveTestimonial(t._id, { ...t, visible: !t.visible });
                    renderTestimonials();
                }
                if (btn.dataset.action === 'delete' && confirm(`حذف رأي "${t.nameAr}"؟`)) {
                    await apiFetch(`/api/admin/testimonials/${t._id}`, { method: 'DELETE' });
                    state.testimonials = state.testimonials.filter((x) => x._id !== t._id);
                    forgetSiteCache();
                    showToast('تم حذف الرأي.');
                    renderTestimonials();
                }
            } catch (err) {
                showToast(err.message, true);
            }
        });
    }

    // =============================================================
    // Inquiries and enrollment requests
    // =============================================================
    function updateInquiryBadge(list) {
        const count = list.filter((i) => i.status === 'New').length;
        const badge = $('#newInquiriesBadge');
        badge.textContent = count;
        badge.hidden = !count;
    }

    async function renderInquiries() {
        const box = $('#inquiriesTable');
        let all;
        try {
            all = await getInquiries();
        } catch (err) {
            box.innerHTML = failed(err);
            return;
        }
        updateInquiryBadge(all);
        const type = $('#inquiryTypeFilter .active').dataset.type;
        const status = $('#inquiryStatusFilter').value;
        const q = $('#inquirySearch').value.trim().toLowerCase();
        const list = all.filter((i) => (!type || (type === 'enrollment') === (i.inquiryType === ENROLLMENT))
            && (!status || i.status === status)
            && (!q || `${i.name} ${i.phone} ${i.email}`.toLowerCase().includes(q)));
        box.innerHTML = list.length ? `
            <table class="table table--expandable">
                <thead><tr><th>التاريخ</th><th>الاسم</th><th>التواصل</th><th>النوع</th><th>الحالة</th><th></th></tr></thead>
                <tbody>${list.map((i) => {
                    const phone = String(i.phone || '').replace(/[^0-9]/g, '');
                    const isEnrollment = i.inquiryType === ENROLLMENT;
                    return `
                    <tr${i.status === 'New' ? ' class="is-new"' : ''}>
                        <td class="nowrap">${fmtDate(i.createdAt)}</td>
                        <td><strong>${esc(i.name)}</strong>${i.country ? `<small>${esc(i.country)}</small>` : ''}</td>
                        <td class="nowrap">
                            ${phone ? `<a class="contact-link" href="https://wa.me/${phone}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> ${esc(i.phone)}</a>` : ''}
                            ${i.email ? `<a class="contact-link" href="mailto:${esc(i.email)}"><i class="fas fa-envelope"></i> ${esc(i.email)}</a>` : ''}
                        </td>
                        <td>${isEnrollment ? `<span class="pill pill--gold">طلب تسجيل · ${formatPrice(i.total || 0)}</span>` : esc(i.inquiryType)}</td>
                        <td>
                            <select class="status-select" data-status="${esc(i._id)}" aria-label="الحالة">
                                ${Object.entries(INQUIRY_STATUS).map(([key, label]) => `<option value="${key}"${key === i.status ? ' selected' : ''}>${label}</option>`).join('')}
                            </select>
                        </td>
                        <td class="row-actions">
                            <button type="button" class="icon-btn" data-details="${esc(i._id)}" aria-label="التفاصيل"><i class="fas fa-chevron-down"></i></button>
                            <button type="button" class="icon-btn icon-btn--danger" data-delete="${esc(i._id)}" aria-label="حذف"><i class="fas fa-trash-can"></i></button>
                        </td>
                    </tr>
                    <tr class="details-row" data-for="${esc(i._id)}" hidden>
                        <td colspan="6">
                            ${i.programOrService ? `<p><strong>البرنامج/الخدمة:</strong> ${esc(i.programOrService)}</p>` : ''}
                            ${isEnrollment && i.items && i.items.length ? `
                                <ul class="order-items">${i.items.map((item) => `<li><span>${esc(item.title)}</span><span>${item.finalPrice < item.price ? `<del>${formatPrice(item.price)}</del> ` : ''}${formatPrice(item.finalPrice)}</span></li>`).join('')}
                                <li class="order-total"><span>الإجمالي</span><span>${formatPrice(i.total || 0)}</span></li></ul>`
                                : `<p class="message-text">${esc(i.message)}</p>`}
                        </td>
                    </tr>`;
                }).join('')}</tbody>
            </table>` : empty('لا توجد نتائج.', 'fa-inbox');
    }

    function bindInquiries() {
        $('#inquiryTypeFilter').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-type]');
            if (!btn) return;
            $$('#inquiryTypeFilter button').forEach((b) => b.classList.toggle('active', b === btn));
            renderInquiries();
        });
        $('#inquiryStatusFilter').addEventListener('input', renderInquiries);
        $('#inquirySearch').addEventListener('input', renderInquiries);
        const box = $('#inquiriesTable');
        box.addEventListener('change', async (e) => {
            const select = e.target.closest('[data-status]');
            if (!select) return;
            try {
                const data = await apiFetch(`/api/inquiries/${select.dataset.status}`, json('PUT', { status: select.value }));
                state.inquiries = state.inquiries.map((i) => (i._id === data.inquiry._id ? data.inquiry : i));
                showToast('تم تحديث الحالة.');
                renderInquiries();
            } catch (err) {
                showToast(err.message, true);
            }
        });
        box.addEventListener('click', async (e) => {
            const details = e.target.closest('[data-details]');
            if (details) {
                const row = $(`.details-row[data-for="${details.dataset.details}"]`, box);
                row.hidden = !row.hidden;
                details.classList.toggle('open', !row.hidden);
            }
            const del = e.target.closest('[data-delete]');
            if (del && confirm('حذف هذا الطلب نهائياً؟')) {
                try {
                    await apiFetch(`/api/inquiries/${del.dataset.delete}`, { method: 'DELETE' });
                    state.inquiries = state.inquiries.filter((i) => i._id !== del.dataset.delete);
                    showToast('تم الحذف.');
                    renderInquiries();
                } catch (err) {
                    showToast(err.message, true);
                }
            }
        });
    }

    // =============================================================
    // Certificates
    // =============================================================
    async function renderCertificates() {
        const box = $('#certsTable');
        getUsers().then(fillUserOptions).catch(() => {});
        let all;
        try {
            all = await getCertificates();
        } catch (err) {
            box.innerHTML = failed(err);
            return;
        }
        const q = $('#certSearch').value.trim().toLowerCase();
        const list = all.filter((c) => !q || `${c.cert_num} ${c.trainee_name} ${c.program_name}`.toLowerCase().includes(q));
        box.innerHTML = list.length ? `
            <table class="table">
                <thead><tr><th>رقم الشهادة</th><th>المتدرب</th><th>البرنامج</th><th>تاريخ الإصدار</th><th>الحالة</th><th></th></tr></thead>
                <tbody>${list.map((c) => `
                    <tr>
                        <td class="nowrap"><bdi>${esc(c.cert_num)}</bdi></td>
                        <td>${esc(c.trainee_name)}</td>
                        <td>${esc(c.program_name)}<small>${esc(c.program_type)}</small></td>
                        <td class="nowrap">${esc(c.issue_date)}</td>
                        <td><span class="pill status-${esc(String(c.status).toLowerCase())}">${esc(CERT_STATUS[c.status] || c.status)}</span></td>
                        <td class="row-actions">
                            ${c.pdf_url ? `<a class="icon-btn" href="${safeUrl(c.pdf_url)}" target="_blank" rel="noopener" aria-label="PDF"><i class="fas fa-file-pdf"></i></a>` : ''}
                            <button type="button" class="icon-btn" data-edit="${esc(c._id)}" aria-label="تعديل"><i class="fas fa-pen"></i></button>
                            <button type="button" class="icon-btn icon-btn--danger" data-delete="${esc(c._id)}" aria-label="حذف"><i class="fas fa-trash-can"></i></button>
                        </td>
                    </tr>`).join('')}</tbody>
            </table>` : empty(q ? 'لا توجد نتائج.' : 'لا توجد شهادات بعد.', 'fa-certificate');
    }

    function fillUserOptions(users) {
        const select = $('#certForm [name="userId"]');
        const current = select.value;
        select.innerHTML = '<option value="">بدون ربط</option>' + users.map((u) => `<option value="${esc(u._id)}">${esc(u.name)} (${esc(u.email)})</option>`).join('');
        select.value = current;
    }

    function resetCertForm() {
        const form = $('#certForm');
        form.reset();
        form.editId.value = '';
        $('#certFormTitle').innerHTML = '<i class="fas fa-plus-circle"></i> إضافة شهادة';
        $('#certCancelBtn').hidden = true;
    }

    function bindCertificates() {
        $('#certSearch').addEventListener('input', renderCertificates);
        $('#certCancelBtn').addEventListener('click', resetCertForm);
        $('#certForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const required = ['certNum', 'traineeName', 'programName', 'issueDate'];
            if (required.some((name) => !form[name].value.trim())) return showToast('أكمل الحقول المطلوبة.', true);
            const data = new FormData();
            ['certNum', 'traineeName', 'programType', 'status', 'programName', 'field', 'issueDate', 'userId'].forEach((name) => data.append(name, form[name].value.trim()));
            if (form.pdf.files[0]) data.append('pdf', form.pdf.files[0]);
            const id = form.editId.value;
            await busy(form.querySelector('[type="submit"]'), async () => {
                try {
                    await apiFetch(id ? `/api/admin/certificates/${id}` : '/api/admin/certificates', { method: id ? 'PUT' : 'POST', body: data });
                    showToast(id ? 'تم تحديث الشهادة.' : 'تمت إضافة الشهادة.');
                    resetCertForm();
                    await getCertificates(true);
                    renderCertificates();
                } catch (err) {
                    showToast(err.message, true);
                }
            });
        });
        $('#certsTable').addEventListener('click', async (e) => {
            const edit = e.target.closest('[data-edit]');
            const del = e.target.closest('[data-delete]');
            if (edit) {
                const c = state.certificates.find((x) => x._id === edit.dataset.edit);
                const form = $('#certForm');
                form.reset();
                form.editId.value = c._id;
                form.certNum.value = c.cert_num;
                form.traineeName.value = c.trainee_name;
                form.programType.value = c.program_type;
                form.status.value = c.status;
                form.programName.value = c.program_name;
                form.field.value = c.field || '';
                form.issueDate.value = c.issue_date;
                form.userId.value = c.userId || '';
                $('#certFormTitle').innerHTML = '<i class="fas fa-pen"></i> تعديل الشهادة';
                $('#certCancelBtn').hidden = false;
                form.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (del && confirm('حذف هذه الشهادة نهائياً؟')) {
                try {
                    await apiFetch(`/api/admin/certificates/${del.dataset.delete}`, { method: 'DELETE' });
                    state.certificates = state.certificates.filter((c) => c._id !== del.dataset.delete);
                    showToast('تم حذف الشهادة.');
                    renderCertificates();
                } catch (err) {
                    showToast(err.message, true);
                }
            }
        });
    }

    // =============================================================
    // Users
    // =============================================================
    async function renderUsers() {
        const box = $('#usersTable');
        let all;
        try {
            all = await getUsers();
        } catch (err) {
            box.innerHTML = failed(err);
            return;
        }
        const q = $('#userSearch').value.trim().toLowerCase();
        const list = all.filter((u) => !q || `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(q));
        box.innerHTML = list.length ? `
            <table class="table">
                <thead><tr><th>الاسم</th><th>البريد</th><th>الهاتف</th><th>الصلاحية</th><th>البرامج</th><th>تاريخ التسجيل</th><th></th></tr></thead>
                <tbody>${list.map((u) => `
                    <tr>
                        <td><strong>${esc(u.name)}</strong></td>
                        <td dir="ltr" class="nowrap">${esc(u.email)}</td>
                        <td dir="ltr" class="nowrap">${esc(u.phone || '—')}</td>
                        <td><span class="pill${u.role !== 'student' && u.role !== 'user' && u.role !== 'customer' ? ' pill--gold' : ''}">${esc(ROLE_NAMES[u.role] || 'متدرب')}</span></td>
                        <td>${(u.enrolledCourses || []).length}</td>
                        <td class="nowrap">${fmtDate(u.createdAt)}</td>
                        <td class="row-actions">
                            <button type="button" class="icon-btn" data-edit="${esc(u._id)}" aria-label="تعديل"><i class="fas fa-pen"></i></button>
                            <button type="button" class="icon-btn icon-btn--danger" data-delete="${esc(u._id)}" aria-label="حذف"><i class="fas fa-trash-can"></i></button>
                        </td>
                    </tr>`).join('')}</tbody>
            </table>` : empty('لا يوجد مستخدمون.', 'fa-users');
    }

    const ROLE_NAMES = {
        super_admin: 'مدير النظام', admin: 'مدير', hr_manager: 'مدير الموارد البشرية', finance_manager: 'المدير المالي',
        team_leader: 'قائد فريق', employee: 'موظف', accountant: 'محاسب', customer_support: 'خدمة العملاء',
        customer: 'عميل', student: 'متدرب', user: 'متدرب'
    };

    function bindUsers() {
        $('#userSearch').addEventListener('input', renderUsers);
        $('#usersTable').addEventListener('click', async (e) => {
            const edit = e.target.closest('[data-edit]');
            const del = e.target.closest('[data-delete]');
            if (edit) {
                const u = state.users.find((x) => x._id === edit.dataset.edit);
                const form = $('#userForm');
                form.reset();
                fillFields(form, { ...u, id: u._id, role: u.role === 'user' ? 'student' : u.role });
                $('#userDialog').showModal();
            }
            if (del) {
                const u = state.users.find((x) => x._id === del.dataset.delete);
                if (!confirm(`حذف حساب "${u.name}" نهائياً؟`)) return;
                try {
                    await apiFetch(`/api/auth/users/${u._id}`, { method: 'DELETE' });
                    state.users = state.users.filter((x) => x._id !== u._id);
                    showToast('تم حذف الحساب.');
                    renderUsers();
                } catch (err) {
                    showToast(err.message, true);
                }
            }
        });
        $('#userForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const v = readFields(e.target);
            if (!v.name || !v.email) return showToast('الاسم والبريد مطلوبان.', true);
            const current = state.users.find((x) => x._id === v.id);
            const payload = { name: v.name, email: v.email, phone: v.phone, enrolledCourses: lines(v.enrolledCourses) };
            // Send the role only when it was changed here, so an untouched form never resets it
            const currentRole = current && current.role === 'user' ? 'student' : current && current.role;
            if (v.role !== currentRole) payload.role = v.role;
            await busy(e.target.querySelector('[type="submit"]'), async () => {
                try {
                    const data = await apiFetch(`/api/auth/users/${v.id}`, json('PUT', payload));
                    state.users = state.users.map((u) => (u._id === v.id ? data.user : u));
                    $('#userDialog').close();
                    showToast('تم حفظ بيانات المستخدم.');
                    renderUsers();
                } catch (err) {
                    showToast(err.message, true);
                }
            });
        });
    }

    // =============================================================
    // Start: only an admin session gets past the gate
    // =============================================================
    async function boot() {
        let user = null;
        try {
            user = (await apiFetch('/api/auth/me')).user;
        } catch (e) {
            user = null;
        }
        if (!user || !['admin', 'super_admin'].includes(user.role)) {
            window.location.replace(`/pages/ar/login.html?next=${encodeURIComponent('/pages/ar/admin.html')}`);
            return;
        }
        try { localStorage.setItem('nibras_user_name', user.name); } catch (e) {}
        $('#adminName').textContent = user.name;
        $('#adminGate').remove();
        $('#adminShell').hidden = false;

        bindShell();
        bindUploaders();
        bindPrograms();
        bindFeatured();
        bindStats();
        bindTestimonials();
        bindInquiries();
        bindCertificates();
        bindUsers();
        const first = window.location.hash.slice(1);
        showSection(first);
        // The overview loads inquiries itself; any other first section still needs the badge
        if (first && first !== 'dashboard') getInquiries().then(updateInquiryBadge).catch(() => {});
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
