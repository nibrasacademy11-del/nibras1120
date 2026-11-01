/* ============================================
   Nibras Academy - Frontend Script (API Version)
   ============================================ */

// Escapes anything from the database or the user before it enters innerHTML
function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Only http(s) and same-site links may be placed in href attributes
function safeUrl(url) {
    const value = String(url || '').trim();
    return /^(https?:\/\/|\/)/i.test(value) ? esc(value) : '#';
}

document.addEventListener('DOMContentLoaded', () => {
    const isEN = document.documentElement.lang === 'en';
    const path = window.location.pathname.toLowerCase();
    const isAdminPagePath = path.endsWith('/admin.html');

    cleanupDuplicateIds(['cartSidebar', 'cartOverlay', 'cartItems', 'cartTotal', 'cartBadge']);
    initLayout();
    initCounters();
    initReveal();
    updateCartBadge();
    initContactPrefill();
    initCheckout(isEN);
    initVerifyForm(isEN);
    initPublicAuth(isEN, isAdminPagePath);
    if (isAdminPagePath) initAdminPanel(isEN);
    updateNavAuth(isEN);
});



function initLayout() {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    const mobileMenu = document.getElementById('mobileMenu');
    const preloader = document.getElementById('preloader');

    if (preloader) {
        setTimeout(() => {
            preloader.style.opacity = '0';
            setTimeout(() => preloader.remove(), 500);
        }, 1000);
    }

    // Ensure mobile overlay backdrop exists in DOM
    let mobileOverlay = document.getElementById('mobileOverlay');
    if (!mobileOverlay) {
        mobileOverlay = document.createElement('div');
        mobileOverlay.id = 'mobileOverlay';
        mobileOverlay.className = 'mobile-overlay';
        document.body.appendChild(mobileOverlay);
    }

    function closeMobileMenu() {
        if (hamburger) hamburger.classList.remove('active');
        if (navLinks) navLinks.classList.remove('active');
        if (mobileMenu) mobileMenu.classList.remove('active');
        if (mobileOverlay) mobileOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    function openMobileMenu() {
        if (hamburger) hamburger.classList.add('active');
        if (navLinks) navLinks.classList.add('active');
        if (mobileMenu) mobileMenu.classList.add('active');
        if (mobileOverlay) mobileOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function toggleMobileMenu() {
        if (mobileMenu && mobileMenu.classList.contains('active')) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    }

    if (hamburger) {
        hamburger.onclick = (e) => {
            e.stopPropagation();
            toggleMobileMenu();
        };
    }

    if (mobileOverlay) {
        mobileOverlay.onclick = () => {
            closeMobileMenu();
        };
    }

    if (mobileMenu) {
        // Prevent clicks inside drawer from bubbling to overlay
        mobileMenu.onclick = (e) => {
            e.stopPropagation();
        };

        // Add clean header with Close button (×) if not already present
        if (!mobileMenu.querySelector('.mobile-menu-header')) {
            const isEN = document.documentElement.lang === 'en';
            const brandTitle = isEN ? 'Nibras Academy' : 'أكاديمية نبراس';
            const logoImg = document.querySelector('.nav-logo img')?.getAttribute('src') || '/assets/img/logo.png';
            const homeHref = isEN ? '/en/index.html' : '/index.html';

            const headerEl = document.createElement('div');
            headerEl.className = 'mobile-menu-header';
            headerEl.innerHTML = `
                <a href="${homeHref}" class="mobile-menu-brand">
                    <img src="${logoImg}" alt="${brandTitle}" />
                    <span>${brandTitle}</span>
                </a>
                <button class="mobile-close-btn" aria-label="إغلاق">&times;</button>
            `;
            mobileMenu.insertBefore(headerEl, mobileMenu.firstChild);

            const closeBtn = headerEl.querySelector('.mobile-close-btn');
            if (closeBtn) {
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    closeMobileMenu();
                };
            }
        }

        // Close menu when any internal link or button is clicked
        mobileMenu.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
                const href = a.getAttribute('href');
                if (!href || href.startsWith('#') || a.getAttribute('onclick')) {
                    closeMobileMenu();
                }
            });
        });
    }

    // Close mobile menu on Escape key press
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileMenu && mobileMenu.classList.contains('active')) {
            closeMobileMenu();
        }
    });

    window.addEventListener('scroll', () => {
        const scrollTopBtn = document.getElementById('scrollTop');
        if (scrollTopBtn) scrollTopBtn.classList.toggle('show', window.scrollY > 400);
    }, { passive: true });

    const scrollTopBtn = document.getElementById('scrollTop');
    if (scrollTopBtn) {
        scrollTopBtn.onclick = () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
    }
}

function initCounters() {
    const statNumbers = document.querySelectorAll('.stat-number, .counter');
    const animateCounter = (el) => {
        const targetSource = el.getAttribute('data-target')
            || el.closest('[data-target]')?.getAttribute('data-target')
            || el.textContent;
        const target = parseInt(targetSource, 10);
        if (Number.isNaN(target)) return;
        const duration = 2000;
        const startTime = performance.now();
        function update(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            el.textContent = Math.floor(progress * target);
            if (progress < 1) requestAnimationFrame(update);
            else el.textContent = target;
        }
        requestAnimationFrame(update);
    };

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    statNumbers.forEach((num) => counterObserver.observe(num));
}

function initReveal() {
    const items = document.querySelectorAll('.why-feature-card, .why-card, .track, .step-card, .experience-pillar, .feature, .step, .specialty-card');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });
    items.forEach((item) => {
        item.classList.add('reveal-on');
        observer.observe(item);
    });
}

function cleanupDuplicateIds(ids) {
    ids.forEach((id) => {
        const nodes = document.querySelectorAll(`#${id}`);
        if (nodes.length <= 1) return;
        nodes.forEach((node, index) => {
            if (index > 0) node.remove();
        });
    });
}

async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'include',
        ...options
    });
    let payload = {};
    try {
        payload = await response.json();
    } catch (e) {
        payload = {};
    }
    if (!response.ok) {
        throw new Error(payload.message || 'Request failed');
    }
    return payload;
}

function formatAuthError(msg, isEN) {
    if (isEN) return msg || 'An unexpected error occurred.';
    if (!msg) return 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.';
    if (msg.includes('Invalid email or password')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    if (msg.includes('Server error during login')) return 'حدث خطأ في الخادم أثناء تسجيل الدخول. يرجى المحاولة لاحقاً.';
    if (msg.includes('Server error during registration')) return 'حدث خطأ في الخادم أثناء إنشاء الحساب. يرجى المحاولة لاحقاً.';
    if (msg.includes('Database connection')) return 'تعذر الاتصال بقاعدة البيانات حالياً، يرجى المحاولة بعد قليل.';
    if (msg.includes('This email is already registered')) return 'هذا البريد الإلكتروني مسجل بالفعل.';
    if (msg.includes('Email and password are required')) return 'البريد الإلكتروني وكلمة المرور مطلوبان.';
    if (msg.includes('Name, email and password are required')) return 'الاسم، البريد الإلكتروني وكلمة المرور مطلوبة.';
    if (msg.includes('Password must be at least')) return 'يجب ألا تقل كلمة المرور عن 8 أحرف.';
    if (msg.includes('valid email')) return 'يرجى إدخال بريد إلكتروني صحيح.';
    return msg;
}

function initPublicAuth(isEN, isAdminPagePath) {
    if (isAdminPagePath) return;
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const homeUrl = isEN ? '/en/index.html' : '/index.html';
    const langPath = isEN ? '/pages/en/' : '/pages/ar/';

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('regName')?.value.trim();
            const email = document.getElementById('regEmail')?.value.trim();
            const phone = document.getElementById('regPhone')?.value.trim();
            const password = document.getElementById('regPassword')?.value;
            const confirmPassword = document.getElementById('regConfirmPassword')?.value;
            if (password !== confirmPassword) {
                showToast(isEN ? 'Passwords do not match.' : 'كلمتا المرور غير متطابقتين.', true);
                return;
            }
            if (password.length < 8) {
                showToast(formatAuthError('Password must be at least', isEN) && (isEN ? 'Password must be at least 8 characters.' : 'يجب ألا تقل كلمة المرور عن 8 أحرف.'), true);
                return;
            }
            try {
                const data = await apiFetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, phone, password })
                });
                showToast(isEN ? 'Account created successfully.' : 'تم إنشاء الحساب بنجاح.');
                if (data.user && data.user.name) {
                    localStorage.setItem('nibras_user_name', data.user.name);
                }
                setTimeout(() => {
                    window.location.href = homeUrl;
                }, 600);
            } catch (error) {
                showToast(formatAuthError(error.message, isEN), true);
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail')?.value.trim();
            const password = document.getElementById('loginPassword')?.value;
            try {
                const data = await apiFetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                showToast(isEN ? 'Login successful.' : 'تم تسجيل الدخول بنجاح.');
                if (data.user && data.user.name) {
                    localStorage.setItem('nibras_user_name', data.user.name);
                }
                setTimeout(() => {
                    if (data.user && data.user.role === 'admin') {
                        // Admin is Arabic only as requested - always redirect to Arabic admin
                        window.location.href = '/pages/ar/admin.html';
                    } else {
                        // Redirect student to their profile
                        window.location.href = `${langPath}profile.html`;
                    }
                }, 500);
            } catch (error) {
                showToast(formatAuthError(error.message, isEN), true);
            }
        });
    }

    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');

    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgotEmail').value.trim();
            const btn = forgotPasswordForm.querySelector('button');
            const originalText = btn.textContent;
            btn.textContent = isEN ? 'Sending...' : 'جاري الإرسال...';
            btn.disabled = true;
            try {
                await apiFetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, lang: isEN ? 'en' : 'ar' })
                });
                showToast(isEN ? 'If this email is registered, a reset link is on its way.' : 'إذا كان البريد مسجلاً لدينا، فسيصلك رابط إعادة التعيين.');
                forgotPasswordForm.reset();
            } catch (error) {
                showToast(error.message, true);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('resetPassword').value;
            const confirmPassword = document.getElementById('resetConfirmPassword').value;
            
            if (password !== confirmPassword) {
                showToast(isEN ? 'Passwords do not match.' : 'كلمتا المرور غير متطابقتين.', true);
                return;
            }

            if (password.length < 8) {
                showToast(isEN ? 'Password must be at least 8 characters.' : 'يجب ألا تقل كلمة المرور عن 8 أحرف.', true);
                return;
            }

            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');

            if (!token) {
                showToast(isEN ? 'Invalid or missing token.' : 'رابط الاستعادة غير صالح أو مفقود.', true);
                return;
            }

            try {
                await apiFetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, password })
                });
                showToast(isEN ? 'Password updated successfully.' : 'تم تغيير كلمة المرور بنجاح.');
                setTimeout(() => window.location.href = 'login.html', 1500);
            } catch (error) {
                showToast(formatAuthError(error.message, isEN), true);
            }
        });
    }
}

function initVerifyForm(isEN) {
    const verifyForm = document.getElementById('verifyForm');
    if (!verifyForm) return;

    verifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('certNumber').value.trim();
        const resultDiv = document.getElementById('verifyResult');
        if (!code || !resultDiv) return;
        resultDiv.classList.remove('hidden');
        resultDiv.className = 'verify-result';
        resultDiv.innerHTML = `
            <div class="verify-head">
                <i class="fas fa-spinner fa-spin text-gold"></i>
                <p>${isEN ? 'Searching official records...' : 'جاري التحقق من سجلات الشهادات...'}</p>
            </div>
        `;
        try {
            const data = await apiFetch(`/api/certificates/${encodeURIComponent(code)}`);
            const cert = data.certificate;
            const statusKey = (cert.status || 'Valid').toLowerCase();
            const states = {
                valid: { badge: isEN ? 'Valid' : 'معتمدة وصالحة', title: isEN ? 'Verified Certificate' : 'شهادة موثّقة ومعتمدة', note: isEN ? 'This certificate is authentic and registered in the records of Nibras Academy.' : 'هذه الشهادة صحيحة ومسجلة رسمياً في سجلات أكاديمية نبراس.', icon: 'fa-circle-check', box: 'verify-success' },
                suspended: { badge: isEN ? 'Suspended' : 'معلقة', title: isEN ? 'Certificate Suspended' : 'الشهادة معلقة حالياً', note: isEN ? 'This certificate exists in our records but is currently suspended.' : 'هذه الشهادة مسجلة لدينا لكنها معلقة حالياً.', icon: 'fa-circle-pause', box: 'verify-warning' },
                expired: { badge: isEN ? 'Expired' : 'منتهية الصلاحية', title: isEN ? 'Certificate Expired' : 'انتهت صلاحية الشهادة', note: isEN ? 'This certificate exists in our records but is no longer valid.' : 'هذه الشهادة مسجلة لدينا لكن صلاحيتها انتهت.', icon: 'fa-clock', box: 'verify-warning' },
                cancelled: { badge: isEN ? 'Cancelled' : 'ملغاة', title: isEN ? 'Certificate Cancelled' : 'الشهادة ملغاة', note: isEN ? 'This certificate has been cancelled and is not valid.' : 'تم إلغاء هذه الشهادة وهي غير سارية.', icon: 'fa-circle-xmark', box: 'verify-error-result' }
            };
            const state = states[statusKey] || states.valid;
            const row = (icon, label, value, tag = 'span') => `
                <div class="verify-data-item">
                    <span class="verify-data-label"><i class="fas ${icon}"></i> ${label}</span>
                    <${tag} class="verify-data-value">${value}</${tag}>
                </div>`;

            resultDiv.className = `verify-result ${state.box}`;
            resultDiv.innerHTML = `
                <div class="verify-head">
                    <i class="fas ${state.icon}"></i>
                    <h3>${state.title}</h3>
                    <p>${state.note}</p>
                </div>
                <div class="verify-data-grid">
                    ${row('fa-user', isEN ? 'Holder Name' : 'اسم حامل الشهادة', esc(cert.trainee_name), 'strong')}
                    ${row('fa-graduation-cap', isEN ? 'Program' : 'اسم البرنامج', esc(cert.program_name), 'strong')}
                    ${row('fa-layer-group', isEN ? 'Credential Type' : 'نوع الشهادة', esc(cert.program_type || (isEN ? 'Professional Certificate' : 'شهادة مهنية')))}
                    ${row('fa-briefcase', isEN ? 'Specialty / Field' : 'التخصص', esc(cert.field || '—'))}
                    ${row('fa-hashtag', isEN ? 'Certificate No.' : 'رقم الشهادة', `<bdi>${esc(cert.cert_num)}</bdi>`)}
                    ${row('fa-calendar-days', isEN ? 'Issue Date' : 'تاريخ الإصدار', esc(cert.issue_date))}
                    ${row('fa-shield-halved', isEN ? 'Status' : 'حالة الشهادة', `<span class="badge-status ${esc(statusKey)}">${state.badge}</span>`)}
                </div>
                ${cert.pdf_url && statusKey === 'valid' ? `
                <div class="btn-row btn-row--center" style="margin-top:18px;">
                    <a href="${safeUrl(cert.pdf_url)}" target="_blank" rel="noopener" class="btn-primary">
                        <i class="fas fa-file-pdf"></i> ${isEN ? 'Download Official Electronic PDF' : 'تنزيل النسخة الإلكترونية الرسمية (PDF)'}
                    </a>
                </div>` : ''}
            `;
        } catch (error) {
            resultDiv.className = 'verify-result verify-error-result';
            resultDiv.innerHTML = `
                <div class="verify-head">
                    <i class="fas fa-circle-xmark"></i>
                    <h3>${isEN ? 'Certificate Not Found' : 'لم يتم العثور على سجل مطابق لرقم الشهادة'}</h3>
                    <p>${isEN ? 'Please verify the certificate number as printed on your document. If you require further assistance, contact us at 01112220796 or info@nibras-ac.com' : 'يرجى التأكد من كتابة رقم الشهادة كما هو موضح في الوثيقة بدون فراغات زائدة. إذا استمرت المشكلة، يرجى التواصل مع فريق الأكاديمية عبر هاتف: 01112220796 أو info@nibras-ac.com'}</p>
                </div>
            `;
        }
    });
}

// Global state for Admin Panel
let adminAllPrograms = [];
let adminAllArticles = [];
let adminAllInquiries = [];
let adminAllCertificates = [];
let allAdminUsers = [];

async function initAdminPanel(isEN) {
    const loginForm = document.getElementById('loginForm');
    const loginPage = document.getElementById('loginPage');
    const dashboard = document.getElementById('dashboard');

    try {
        const data = await apiFetch('/api/auth/me');
        if (data.user && data.user.role === 'admin') {
            if (loginPage) loginPage.style.display = 'none';
            if (dashboard) dashboard.style.display = 'flex';
            const adminUserEl = document.getElementById('adminUser');
            if (adminUserEl) adminUserEl.textContent = data.user.name || 'المسؤول';
            
            // Load all sections
            await Promise.allSettled([
                renderAdminPrograms(isEN),
                renderAdminArticles(isEN),
                renderAdminInquiries(isEN),
                renderAdminCerts(isEN),
                renderAdminUsers(isEN)
            ]);
        }
    } catch (error) {
        if (loginPage) loginPage.style.display = 'flex';
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            try {
                const data = await apiFetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                if (!data.user || data.user.role !== 'admin') {
                    showToast(isEN ? 'Unauthorized: Admin privileges required.' : 'ليس لديك صلاحيات الأدمن للدخول.', true);
                    return;
                }
                window.location.reload();
            } catch (error) {
                showToast(formatAuthError(error.message, isEN), true);
            }
        });
    }

    // 1. Program Form Submit
    const adminProgramForm = document.getElementById('adminProgramForm');
    if (adminProgramForm) {
        adminProgramForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnSaveProg');
            const orig = btn.innerHTML;
            const editId = document.getElementById('progEditId').value;
            
            const payload = {
                titleAr: document.getElementById('progTitleAr').value.trim(),
                titleEn: document.getElementById('progTitleEn').value.trim(),
                type: document.getElementById('progType').value,
                specialty: document.getElementById('progSpecialty').value.trim(),
                image: document.getElementById('progImage').value.trim(),
                price: parseFloat(document.getElementById('progPrice').value) || 0,
                status: document.getElementById('progStatus').value,
                duration: document.getElementById('progDuration').value.trim(),
                deliveryMethod: document.getElementById('progDelivery').value.trim(),
                descriptionAr: document.getElementById('progDescAr').value.trim(),
                topicsAr: document.getElementById('progTopicsAr').value.split(/[;\n]+/).map(s => s.trim()).filter(Boolean)
            };

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

                if (editId) {
                    await apiFetch(`/api/courses/${editId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    showToast(isEN ? 'Program updated successfully.' : 'تم تحديث البرنامج بنجاح.');
                } else {
                    await apiFetch('/api/courses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    showToast(isEN ? 'Program added successfully.' : 'تمت إضافة البرنامج بنجاح.');
                }

                cancelProgEdit();
                await renderAdminPrograms(isEN);
            } catch (err) {
                showToast(err.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = orig;
            }
        });
    }

    // 2. Article Form Submit
    const adminArticleForm = document.getElementById('adminArticleForm');
    if (adminArticleForm) {
        adminArticleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnSaveArt');
            const orig = btn.innerHTML;
            const editId = document.getElementById('artEditId').value;

            const payload = {
                titleAr: document.getElementById('artTitleAr').value.trim(),
                category: document.getElementById('artCategory').value,
                sourceUrl: document.getElementById('artSourceUrl').value.trim(),
                author: document.getElementById('artAuthor').value.trim(),
                image: document.getElementById('artImage').value.trim(),
                contentAr: document.getElementById('artContentAr').value.trim(),
                summaryAr: document.getElementById('artContentAr').value.trim().slice(0, 240),
                status: document.getElementById('artPublished').checked ? 'published' : 'draft'
            };

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

                if (editId) {
                    await apiFetch(`/api/articles/${editId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    showToast(isEN ? 'Article updated successfully.' : 'تم تحديث المقال بنجاح.');
                } else {
                    await apiFetch('/api/articles', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    showToast(isEN ? 'Article created successfully.' : 'تمت إضافة المقال بنجاح.');
                }

                cancelArtEdit();
                await renderAdminArticles(isEN);
            } catch (err) {
                showToast(err.message, true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = orig;
            }
        });
    }

    // 3. Certificate Form Submit
    const adminCertForm = document.getElementById('adminCertForm');
    if (adminCertForm) {
        adminCertForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.append('certNum', document.getElementById('adminCertNum').value.trim());
            formData.append('traineeName', document.getElementById('adminTraineeName').value.trim());
            formData.append('programType', document.getElementById('adminProgramType').value);
            formData.append('status', document.getElementById('adminCertStatus').value);
            formData.append('programName', document.getElementById('adminProgramName').value.trim());
            formData.append('field', document.getElementById('adminField').value.trim());
            formData.append('issueDate', document.getElementById('adminIssueDate').value);
            
            const pdfInput = document.getElementById('adminPdfFile');
            if (pdfInput && pdfInput.files && pdfInput.files[0]) {
                formData.append('pdf', pdfInput.files[0]);
            }
            formData.append('userId', document.getElementById('adminCertUserId')?.value || '');

            const editId = document.getElementById('certEditId').value;
            try {
                await apiFetch(editId ? `/api/admin/certificates/${editId}` : '/api/admin/certificates', {
                    method: editId ? 'PUT' : 'POST',
                    body: formData
                });
                window.cancelCertEdit();
                showToast(editId ? 'تم تحديث بيانات الشهادة.' : 'تمت إضافة بيانات الشهادة بنجاح.');
                await renderAdminCerts(isEN);
                await renderAdminUsers(isEN);
            } catch (error) {
                showToast(error.message, true);
            }
        });
    }

    // 4. Edit User Form Submit
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = editUserForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            
            const id = document.getElementById('editUserId').value;
            const payload = {
                name: document.getElementById('editUserName').value.trim(),
                email: document.getElementById('editUserEmail').value.trim(),
                phone: document.getElementById('editUserPhone').value.trim(),
                role: document.getElementById('editUserRole').value,
                enrolledCourses: document.getElementById('editUserCourses').value.split(',').map(s => s.trim()).filter(Boolean)
            };

            try {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
                
                await apiFetch(`/api/auth/users/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                showToast(isEN ? 'User updated successfully.' : 'تم تحديث بيانات العميل بنجاح.');
                if (window.closeEditModal) window.closeEditModal();
                await renderAdminUsers(isEN);
            } catch (error) {
                showToast(error.message, true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }

    // Event Delegation for Users Table
    const usersContainer = document.getElementById('usersTableContainer');
    if (usersContainer) {
        usersContainer.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-user-btn');
            const deleteBtn = e.target.closest('.delete-user-btn');
            if (editBtn) {
                const id = editBtn.getAttribute('data-id');
                window.editUser(id);
            } else if (deleteBtn) {
                const id = deleteBtn.getAttribute('data-id');
                window.deleteUser(id);
            }
        });
    }
}

// -------------------------------------------------------------
// Admin Programs Management
// -------------------------------------------------------------
async function renderAdminPrograms(isEN) {
    const container = document.getElementById('programsTableContainer');
    if (!container) return;
    try {
        const data = await apiFetch('/api/courses?limit=500');
        adminAllPrograms = data.courses || [];
        const countEl = document.getElementById('totalProgramsCount');
        if (countEl) countEl.textContent = adminAllPrograms.length;
        displayAdminPrograms(adminAllPrograms, isEN);
    } catch (err) {
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${esc(err.message)}</p>`;
    }
}

function displayAdminPrograms(list, isEN) {
    const container = document.getElementById('programsTableContainer');
    if (!container) return;

    if (!list.length) {
        container.innerHTML = `<p style="text-align:center; padding:30px;">${isEN ? 'No programs found.' : 'لا توجد برامج مسجلة.'}</p>`;
        return;
    }

    const typeNames = {
        master: 'ماجستير مهني',
        phd: 'دكتوراه مهنية',
        diploma: 'دبلوم مهني',
        course: 'دورة تدريبية'
    };

    const rows = list.map(p => {
        const title = p.titleAr || p.title || p.titleEn;
        const typeName = typeNames[p.type] || p.type;
        const status = p.status || 'available';
        const statusBadgeClass = status === 'coming_soon' ? 'coming_soon' : (status === 'unavailable' ? 'unavailable' : (status === 'hidden' ? 'hidden-status' : 'available'));
        const statusLabel = status === 'coming_soon' ? 'قريباً' : (status === 'unavailable' ? 'غير متاح' : (status === 'hidden' ? 'مخفي' : 'متاح'));

        return `
            <tr>
                <td data-label="اسم البرنامج" style="font-weight:600; color:var(--primary);">${esc(title)}</td>
                <td data-label="المسار"><span class="badge" style="background:#eef4fb; color:var(--primary); font-size:0.8rem; padding:4px 8px; border-radius:8px;">${esc(typeName)}</span></td>
                <td data-label="التخصص">${esc(p.specialty || '—')}</td>
                <td data-label="السعر" style="font-weight:700;">${esc(p.price || 0)} US$</td>
                <td data-label="الحالة"><span class="badge-status ${statusBadgeClass}">${statusLabel}</span></td>
                <td data-label="إدارة" style="white-space:nowrap;">
                    <button onclick="window.editProgram('${p._id}')" class="btn-save" style="padding:5px 10px; font-size:0.8rem; background:var(--accent); color:var(--primary-dark);" title="تعديل"><i class="fas fa-edit"></i></button>
                    <button onclick="window.toggleProgramStatus('${p._id}', '${status === 'available' ? 'hidden' : 'available'}')" class="btn-save" style="padding:5px 10px; font-size:0.8rem; background:#f2f4f7; color:#475467;" title="تغيير الظهور"><i class="fas fa-eye${status === 'hidden' ? '-slash' : ''}"></i></button>
                    <button onclick="window.deleteProgram('${p._id}')" class="btn-save" style="padding:5px 10px; font-size:0.8rem; background:#fff0f0; color:#b42318; border:1px solid #ffd6d6;" title="حذف"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>اسم البرنامج</th>
                    <th>المسار</th>
                    <th>التخصص</th>
                    <th>السعر</th>
                    <th>الحالة</th>
                    <th>إدارة</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

window.filterAdminPrograms = () => {
    const type = document.getElementById('adminProgTypeFilter')?.value || 'all';
    const query = document.getElementById('adminProgSearch')?.value.toLowerCase().trim() || '';

    let filtered = adminAllPrograms;
    if (type !== 'all') {
        filtered = filtered.filter(p => p.type === type);
    }
    if (query) {
        filtered = filtered.filter(p => 
            (p.titleAr && p.titleAr.toLowerCase().includes(query)) ||
            (p.titleEn && p.titleEn.toLowerCase().includes(query)) ||
            (p.specialty && p.specialty.toLowerCase().includes(query))
        );
    }
    displayAdminPrograms(filtered, false);
};

window.editProgram = (id) => {
    const prog = adminAllPrograms.find(p => p._id === id);
    if (!prog) return;

    document.getElementById('progEditId').value = prog._id;
    document.getElementById('progTitleAr').value = prog.titleAr || prog.title || '';
    document.getElementById('progTitleEn').value = prog.titleEn || '';
    document.getElementById('progType').value = prog.type || 'master';
    const specialtyKey = prog.specialtyKey || NIBRAS_SPECIALTIES.keyFor(prog.titleAr, prog.specialty);
    document.getElementById('progSpecialty').value = NIBRAS_SPECIALTIES.byKey(specialtyKey).ar;
    document.getElementById('progImage').value = prog.image || '';
    document.getElementById('progPrice').value = prog.price || 0;
    document.getElementById('progStatus').value = prog.status || 'available';
    document.getElementById('progDuration').value = prog.duration || '';
    document.getElementById('progDelivery').value = prog.deliveryMethod || '';
    document.getElementById('progDescAr').value = prog.descriptionAr || prog.description || '';
    document.getElementById('progTopicsAr').value = Array.isArray(prog.topicsAr) ? prog.topicsAr.join(';\n') : '';

    document.getElementById('btnSaveProg').textContent = 'تحديث بيانات البرنامج';
    document.getElementById('btnCancelProgEdit').style.display = 'inline-block';

    window.scrollTo({ top: document.getElementById('adminProgramForm').offsetTop - 80, behavior: 'smooth' });
};

window.cancelProgEdit = () => {
    document.getElementById('progEditId').value = '';
    document.getElementById('adminProgramForm').reset();
    document.getElementById('btnSaveProg').textContent = 'حفظ البرنامج';
    document.getElementById('btnCancelProgEdit').style.display = 'none';
};

window.deleteProgram = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا البرنامج؟')) return;
    try {
        await apiFetch(`/api/courses/${id}`, { method: 'DELETE' });
        showToast('تم حذف البرنامج بنجاح.');
        await renderAdminPrograms(false);
    } catch (err) {
        showToast(err.message, true);
    }
};

window.toggleProgramStatus = async (id, newStatus) => {
    try {
        await apiFetch(`/api/courses/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        showToast(newStatus === 'hidden' ? 'تم إخفاء البرنامج من الموقع.' : 'تم إظهار البرنامج في الموقع.');
        await renderAdminPrograms(false);
    } catch (err) {
        showToast(err.message, true);
    }
};

// -------------------------------------------------------------
// Admin Articles & Media Management
// -------------------------------------------------------------
async function renderAdminArticles(isEN) {
    const container = document.getElementById('articlesTableContainer');
    if (!container) return;
    try {
        const data = await apiFetch('/api/articles?limit=200');
        adminAllArticles = data.articles || [];
        const countEl = document.getElementById('totalArticlesCount');
        if (countEl) countEl.textContent = adminAllArticles.length;
        displayAdminArticles(adminAllArticles, isEN);
    } catch (err) {
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${esc(err.message)}</p>`;
    }
}

function displayAdminArticles(list, isEN) {
    const container = document.getElementById('articlesTableContainer');
    if (!container) return;

    if (!list.length) {
        container.innerHTML = `<p style="text-align:center; padding:30px;">${isEN ? 'No articles found.' : 'لا توجد مقالات أو تغطيات منشورة.'}</p>`;
        return;
    }

    const rows = list.map(a => `
        <tr>
            <td data-label="العنوان" style="font-weight:600; color:var(--primary);">${esc(a.titleAr || a.title)}</td>
            <td data-label="التصنيف"><span class="badge" style="background:#eef4fb; color:var(--primary); font-size:0.8rem; padding:4px 8px; border-radius:8px;">${{ media_coverage: 'تغطية إعلامية', article: 'مقال', news: 'خبر' }[a.category] || esc(a.category)}</span></td>
            <td data-label="المصدر">${a.sourceUrl ? `<a href="${safeUrl(a.sourceUrl)}" target="_blank" rel="noopener" style="color:var(--primary); text-decoration:underline;">رابط المصدر <i class="fas fa-external-link-alt"></i></a>` : esc(a.author || 'نبراس')}</td>
            <td data-label="الحالة"><span class="badge-status ${a.status === 'published' ? 'available' : 'hidden-status'}">${a.status === 'published' ? 'منشور' : (a.status === 'archived' ? 'مؤرشف' : 'مسودة')}</span></td>
            <td data-label="إدارة" style="white-space:nowrap;">
                <button onclick="window.editArticle('${a._id}')" class="btn-save" style="padding:5px 10px; font-size:0.8rem; background:var(--accent); color:var(--primary-dark);"><i class="fas fa-edit"></i></button>
                <button onclick="window.deleteArticle('${a._id}')" class="btn-save" style="padding:5px 10px; font-size:0.8rem; background:#fff0f0; color:#b42318; border:1px solid #ffd6d6;"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>العنوان</th>
                    <th>التصنيف</th>
                    <th>المصدر / الكاتب</th>
                    <th>الحالة</th>
                    <th>إدارة</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

window.editArticle = (id) => {
    const art = adminAllArticles.find(a => a._id === id);
    if (!art) return;

    document.getElementById('artEditId').value = art._id;
    document.getElementById('artTitleAr').value = art.titleAr || art.title || '';
    document.getElementById('artCategory').value = art.category || 'media_coverage';
    document.getElementById('artImage').value = art.image || '';
    document.getElementById('artSourceUrl').value = art.sourceUrl || '';
    document.getElementById('artAuthor').value = art.author || '';
    document.getElementById('artContentAr').value = art.contentAr || art.content || '';
    document.getElementById('artPublished').checked = art.status === 'published';

    document.getElementById('btnSaveArt').textContent = 'تحديث المقال';
    document.getElementById('btnCancelArtEdit').style.display = 'inline-block';
    window.scrollTo({ top: document.getElementById('adminArticleForm').offsetTop - 80, behavior: 'smooth' });
};

window.cancelArtEdit = () => {
    document.getElementById('artEditId').value = '';
    document.getElementById('adminArticleForm').reset();
    document.getElementById('btnSaveArt').textContent = 'حفظ المقال';
    document.getElementById('btnCancelArtEdit').style.display = 'none';
};

window.deleteArticle = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا المقال؟')) return;
    try {
        await apiFetch(`/api/articles/${id}`, { method: 'DELETE' });
        showToast('تم حذف المقال بنجاح.');
        await renderAdminArticles(false);
    } catch (err) {
        showToast(err.message, true);
    }
};

// -------------------------------------------------------------
// Admin Inquiries Management
// -------------------------------------------------------------
async function renderAdminInquiries(isEN) {
    const container = document.getElementById('inquiriesTableContainer');
    if (!container) return;
    try {
        const data = await apiFetch('/api/inquiries');
        adminAllInquiries = data.inquiries || [];
        const countEl = document.getElementById('totalInquiriesCount');
        if (countEl) countEl.textContent = adminAllInquiries.length;
        displayAdminInquiries(adminAllInquiries, isEN);
    } catch (err) {
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${esc(err.message)}</p>`;
    }
}

function displayAdminInquiries(list, isEN) {
    const container = document.getElementById('inquiriesTableContainer');
    if (!container) return;

    if (!list.length) {
        container.innerHTML = `<p style="text-align:center; padding:30px;">${isEN ? 'No messages found.' : 'لا توجد رسائل تواصل جديدة.'}</p>`;
        return;
    }

    const rows = list.map(m => {
        const dateStr = m.createdAt ? new Date(m.createdAt).toLocaleDateString('ar-SA') : '—';
        const status = m.status || 'New';
        const badgeClass = status === 'New' ? 'new' : (status === 'In Progress' ? 'in_progress' : (status === 'Replied' ? 'replied' : 'closed'));

        return `
            <tr>
                <td data-label="المرسل">
                    <strong>${esc(m.name)}</strong><br>
                    <small dir="ltr" style="color:var(--text-muted);">${esc(m.phone)}</small>
                    ${m.email ? `<br><small style="color:var(--text-muted);">${esc(m.email)}</small>` : ''}
                </td>
                <td data-label="نوع الاستفسار">
                    <span class="badge" style="background:#eef4fb; color:var(--primary); font-size:0.8rem; padding:4px 8px; border-radius:8px;">${esc(m.inquiryType || 'عام')}</span>
                    ${m.programOrService ? `<br><small style="color:var(--text-muted);">${esc(m.programOrService)}</small>` : ''}
                </td>
                <td data-label="الرسالة" style="max-width:300px; font-size:0.9rem; line-height:1.5; white-space:pre-line;">${esc(m.message)}</td>
                <td data-label="التاريخ"><small>${dateStr}</small></td>
                <td data-label="الحالة">
                    <select onchange="window.updateInquiryStatus('${m._id}', this.value)" style="padding:4px 8px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:0.85rem;">
                        <option value="New" ${status === 'New' ? 'selected' : ''}>جديدة (New)</option>
                        <option value="In Progress" ${status === 'In Progress' ? 'selected' : ''}>قيد المتابعة</option>
                        <option value="Replied" ${status === 'Replied' ? 'selected' : ''}>تم الرد</option>
                        <option value="Closed" ${status === 'Closed' ? 'selected' : ''}>مغلقة</option>
                    </select>
                </td>
                <td data-label="إدارة">
                    <a href="https://wa.me/${(m.phone || '').replace(/[^0-9]/g, '')}" target="_blank" class="btn-save" style="background:#e6f9ed; color:#12b76a; border:1px solid #a6f4c5; padding:5px 8px; font-size:0.8rem; text-decoration:none; display:inline-block;" title="مراسلة واتساب"><i class="fab fa-whatsapp"></i></a>
                    <button onclick="window.deleteInquiry('${m._id}')" class="btn-save" style="padding:5px 8px; font-size:0.8rem; background:#fff0f0; color:#b42318; border:1px solid #ffd6d6;" title="حذف"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>المرسل</th>
                    <th>نوع الاستفسار</th>
                    <th>الرسالة</th>
                    <th>التاريخ</th>
                    <th>الحالة</th>
                    <th>إدارة</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

window.filterAdminInquiries = () => {
    const status = document.getElementById('inquiryStatusFilter')?.value || 'all';
    if (status === 'all') {
        displayAdminInquiries(adminAllInquiries, false);
    } else {
        displayAdminInquiries(adminAllInquiries.filter(m => m.status === status), false);
    }
};

window.updateInquiryStatus = async (id, newStatus) => {
    try {
        await apiFetch(`/api/inquiries/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        showToast('تم تحديث حالة الرسالة.');
    } catch (err) {
        showToast(err.message, true);
    }
};

window.deleteInquiry = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذه الرسالة؟')) return;
    try {
        await apiFetch(`/api/inquiries/${id}`, { method: 'DELETE' });
        showToast('تم حذف الرسالة بنجاح.');
        await renderAdminInquiries(false);
    } catch (err) {
        showToast(err.message, true);
    }
};

// -------------------------------------------------------------
// Admin Certificates Management
// -------------------------------------------------------------
async function renderAdminCerts(isEN) {
    const container = document.getElementById('certsTableContainer') || document.getElementById('addedCertsContainer');
    if (!container) return;
    try {
        const data = await apiFetch('/api/admin/certificates');
        adminAllCertificates = data.certificates || [];
    } catch (error) {
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${esc(error.message)}</p>`;
        return;
    }

    const totalCertsEl = document.getElementById('totalCertsCount');
    if (totalCertsEl) totalCertsEl.textContent = adminAllCertificates.length;

    if (!adminAllCertificates.length) {
        container.innerHTML = `<p style="text-align:center; padding:20px;">${isEN ? 'No certificates found.' : 'لا توجد شهادات مسجلة حالياً.'}</p>`;
        return;
    }

    const rows = adminAllCertificates.map((c) => {
        const statusKey = (c.status || 'Valid').toLowerCase();
        const badgeClass = statusKey === 'suspended' ? 'suspended' : (statusKey === 'cancelled' ? 'cancelled' : (statusKey === 'expired' ? 'expired' : 'valid'));
        const statusLabel = statusKey === 'suspended' ? 'معلقة' : (statusKey === 'cancelled' ? 'ملغاة' : (statusKey === 'expired' ? 'منتهية' : 'معتمدة'));

        return `
            <tr>
                <td data-label="اسم المتدرب" style="font-weight:600; color:var(--primary);">${esc(c.trainee_name)}</td>
                <td data-label="البرنامج">${esc(c.program_name)}</td>
                <td data-label="رقم الشهادة" style="font-weight:700; color:#7a1c28;" dir="ltr">${esc(c.cert_num)}</td>
                <td data-label="الحالة"><span class="badge-status ${badgeClass}">${statusLabel}</span></td>
                <td data-label="التاريخ">${esc(c.issue_date)}</td>
                <td data-label="PDF">${c.pdf_url ? `<a href="${safeUrl(c.pdf_url)}" target="_blank" download style="color:#0f766e; text-decoration:none; font-weight:600;"><i class="fas fa-file-pdf"></i> ${isEN ? 'Download' : 'تحميل'}</a>` : `<span style="color:#999;">${isEN ? 'N/A' : 'غير مرفق'}</span>`}</td>
                <td data-label="إدارة">
                    <button onclick="window.editCert('${c._id}')" class="btn-save" style="background:var(--accent); color:var(--primary-dark); padding:6px 12px; font-size:0.85rem;"><i class="fas fa-edit"></i></button>
                    <button onclick="window.deleteCert('${c._id}')" class="btn-save" style="background:#fff0f0; color:#b42318; border:1px solid #ffd6d6; padding:6px 12px; font-size:0.85rem;">
                        <i class="fas fa-trash-alt"></i> ${isEN ? 'Delete' : 'حذف'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>اسم المتدرب</th>
                    <th>البرنامج</th>
                    <th>رقم الشهادة</th>
                    <th>الحالة</th>
                    <th>التاريخ</th>
                    <th>PDF</th>
                    <th>إدارة</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

window.editCert = (id) => {
    const cert = adminAllCertificates.find((c) => c._id === id);
    if (!cert) return;
    document.getElementById('certEditId').value = cert._id;
    document.getElementById('adminCertNum').value = cert.cert_num || '';
    document.getElementById('adminTraineeName').value = cert.trainee_name || '';
    document.getElementById('adminProgramType').value = cert.program_type || 'دورة تدريبية';
    document.getElementById('adminCertStatus').value = cert.status || 'Valid';
    document.getElementById('adminProgramName').value = cert.program_name || '';
    document.getElementById('adminField').value = cert.field || '';
    document.getElementById('adminCertUserId').value = cert.userId || '';
    document.getElementById('adminIssueDate').value = cert.issue_date || '';
    document.getElementById('btnSaveCert').textContent = 'تحديث بيانات الشهادة';
    document.getElementById('btnCancelCertEdit').style.display = 'inline-block';
    document.getElementById('adminCertForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.cancelCertEdit = () => {
    document.getElementById('certEditId').value = '';
    document.getElementById('adminCertForm').reset();
    document.getElementById('btnSaveCert').textContent = 'حفظ بيانات الشهادة';
    document.getElementById('btnCancelCertEdit').style.display = 'none';
};

// Global refresh hooks
window.refreshAdminPrograms = () => renderAdminPrograms(false);
window.refreshAdminArticles = () => renderAdminArticles(false);
window.refreshAdminInquiries = () => renderAdminInquiries(false);
window.refreshAdminCerts = () => renderAdminCerts(false);


// allAdminUsers declared in global admin state


async function renderAdminUsers(isEN) {
    const container = document.getElementById('usersTableContainer');
    if (!container) return;

    try {
        const data = await apiFetch('/api/auth/users');
        allAdminUsers = data.users || [];
        displayUsers(allAdminUsers, isEN);
    } catch (error) {
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${esc(error.message)}</p>`;
    }
}

function displayUsers(users, isEN) {
    const container = document.getElementById('usersTableContainer');
    if (!container) return;

    // Populate User Dropdown in Cert Form (always use full list)
    const certUserSelect = document.getElementById('adminCertUserId');
    if (certUserSelect && allAdminUsers.length > 0) {
        const currentVal = certUserSelect.value;
        certUserSelect.innerHTML = '<option value="">--- اختر مستخدم ---</option>' + 
            allAdminUsers.map(u => `<option value="${esc(u._id)}">${esc(u.name)} (${esc(u.email)})</option>`).join('');
        certUserSelect.value = currentVal;
    }

    if (!users.length) {
        container.innerHTML = `<p style="text-align:center; padding:20px;">${isEN ? 'No matching users.' : 'لا يوجد عملاء مطابقين للبحث.'}</p>`;
        return;
    }

    const rows = users.map(u => {
        const roleClass = u.role === 'admin' ? 'admin' : 'user';
        const roleName = u.role === 'admin' ? (isEN ? 'Admin' : 'مدير') : (isEN ? 'Student' : 'طالب');
        return `
            <tr>
                <td data-label="${isEN ? 'Name' : 'الاسم'}">${esc(u.name)}</td>
                <td data-label="${isEN ? 'Email' : 'البريد'}">${esc(u.email)}</td>
                <td data-label="${isEN ? 'Phone' : 'الهاتف'}">${esc(u.phone || '—')}</td>
                <td data-label="${isEN ? 'Role' : 'الدور'}"><span class="badge ${roleClass}">${roleName}</span></td>
                <td data-label="${isEN ? 'Actions' : 'إدارة'}">
                    <button class="btn-save edit-user-btn" data-id="${u._id}" style="padding:6px 10px; font-size:0.8rem; background: var(--accent); color: var(--primary-dark);"><i class="fas fa-edit"></i></button>
                    <button class="btn-save delete-user-btn" data-id="${u._id}" style="padding:6px 10px; font-size:0.8rem; background: #fff0f0; color: #b42318; border:1px solid #ffd6d6;"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    const totalUsersEl = document.getElementById('totalUsersCount');
    if (totalUsersEl) totalUsersEl.textContent = allAdminUsers.length;

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>${isEN ? 'Name' : 'الاسم'}</th>
                    <th>${isEN ? 'Email' : 'البريد'}</th>
                    <th>${isEN ? 'Phone' : 'الهاتف'}</th>
                    <th>${isEN ? 'Role' : 'الدور'}</th>
                    <th>${isEN ? 'Actions' : 'إدارة'}</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

window.editUser = async (id) => {
    try {
        // Direct fetch to be 100% sure we have fresh, correct data
        const data = await apiFetch(`/api/auth/users/${id}`);
        const user = (data && data.user) ? data.user : data;

        if (!user || !user._id) {
            throw new Error("بيانات العميل غير مكتملة");
        }

        document.getElementById('editUserId').value = user._id;
        document.getElementById('editUserName').value = user.name || '';
        document.getElementById('editUserEmail').value = user.email || '';
        document.getElementById('editUserPhone').value = user.phone || '';
        document.getElementById('editUserRole').value = user.role || 'student';
        
        let courses = '';
        if (Array.isArray(user.enrolledCourses)) {
            courses = user.enrolledCourses.join(', ');
        } else if (typeof user.enrolledCourses === 'string') {
            courses = user.enrolledCourses;
        }
        
        document.getElementById('editUserCourses').value = courses;
        
        const modal = document.getElementById('editUserModal');
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        
    } catch (err) {
        console.error("Critical Edit Error:", err);
        showToast(document.documentElement.lang === 'en' ? 'Failed to load user data.' : 'فشل تحميل بيانات العميل.', true);
    }
};

window.deleteUser = async (id) => {
    const isEN = document.documentElement.lang === 'en';
    if (!confirm(isEN ? 'Delete user?' : 'هل تريد حذف المستخدم؟')) return;
    try {
        await apiFetch(`/api/auth/users/${id}`, { method: 'DELETE' });
        showToast(isEN ? 'User deleted.' : 'تم حذف المستخدم.');
        await renderAdminUsers(isEN);
    } catch (error) {
        showToast(error.message, true);
    }
};

window.filterUsers = () => {
    const isEN = document.documentElement.lang === 'en';
    const query = document.getElementById('userSearchInput').value.toLowerCase().trim();
    if (!query) {
        displayUsers(allAdminUsers, isEN);
        return;
    }
    const filtered = allAdminUsers.filter(u => 
        u.email.toLowerCase().includes(query) || 
        u.name.toLowerCase().includes(query)
    );
    displayUsers(filtered, isEN);
};

window.refreshUsers = async () => {
    const isEN = document.documentElement.lang === 'en';
    await renderAdminUsers(isEN);
};

window.logout = async () => {
    try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch(err) {}
    localStorage.removeItem('nibras_user_name');
    // Admin logout → go back to admin login
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith('/admin.html')) {
        window.location.reload();
    } else {
        window.location.href = document.documentElement.lang === 'en' ? '/pages/en/login.html' : '/pages/ar/login.html';
    }
};

async function updateNavAuth(isEN) {
    if (!localStorage.getItem('nibras_user_name')) return;
    let userName = '';
    try {
        const data = await apiFetch('/api/auth/me');
        userName = data.user.name;
    } catch (e) {
        localStorage.removeItem('nibras_user_name');
        return;
    }

    const firstName = userName.split(' ')[0];
    const profileUrl = isEN ? '/pages/en/profile.html' : '/pages/ar/profile.html';
    
    // 1. Desktop Nav Auth
    let navAuth = document.getElementById('navAuth');
    if (!navAuth) {
        const loginLinks = Array.from(document.querySelectorAll('.nav-links a[href*="login.html"]'));
        const desktopLogin = loginLinks.find(l => !l.classList.contains('mobile-btn') && !l.classList.contains('lang-switch-btn'));
        if (desktopLogin) navAuth = desktopLogin.parentElement;
    }
    
    // 2. Mobile Nav Auth
    let mobileNavAuth = document.getElementById('mobileNavAuth');
    if (!mobileNavAuth) {
        const mobileLoginLinks = Array.from(document.querySelectorAll('.mobile-menu a[href*="login.html"], .mobile-menu .mobile-btn'));
        const mobileLogin = mobileLoginLinks.find(l => !l.classList.contains('lang-switch-btn') && !l.href.includes('program-detail'));
        if (mobileLogin) mobileNavAuth = mobileLogin.parentElement;
    }

    // Safeguard: NEVER overwrite a language switcher button!
    if (navAuth && !navAuth.querySelector('.lang-switch-btn') && !navAuth.classList.contains('lang-switch-btn')) {
        navAuth.innerHTML = `<a href="${profileUrl}" class="nav-btn"><i class="fas fa-user-circle"></i> ${esc(firstName)}</a>`;
    }
    if (mobileNavAuth && !mobileNavAuth.querySelector('.lang-switch-btn') && !mobileNavAuth.classList.contains('lang-switch-btn')) {
        mobileNavAuth.innerHTML = `<a href="${profileUrl}" class="mobile-btn"><i class="fas fa-user-circle"></i> ${esc(firstName)}</a>`;
    }
}

window.deleteCert = async (id) => {
    const isEN = document.documentElement.lang === 'en';
    if (!confirm(isEN ? 'Delete this certificate?' : 'هل تريد حذف هذه الشهادة؟')) return;
    try {
        await apiFetch(`/api/admin/certificates/${id}`, { method: 'DELETE' });
        await renderAdminCerts(isEN);
    } catch (error) {
        showToast(error.message, true);
    }
};

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) {
        alert(message);
        return;
    }
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// --- Cart & Modal Logic ---
function getCart() {
    try {
        const cart = JSON.parse(localStorage.getItem('nibras_cart') || '[]');
        return Array.isArray(cart) ? cart : [];
    } catch (e) {
        return [];
    }
}

function saveCart(cart) {
    localStorage.setItem('nibras_cart', JSON.stringify(cart));
}

function formatPrice(amount) {
    return `${Number(amount).toFixed(2)} US$`;
}

function updateCartBadge() {
    const cart = getCart();
    const totalQty = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
    document.querySelectorAll('#cartBadge, .cart-badge, .floating-cart-badge').forEach((badge) => {
        badge.textContent = totalQty;
    });
}

function renderCart() {
    const cart = getCart();
    const cartItemsEls = document.querySelectorAll('#cartItems');
    const cartTotalEls = document.querySelectorAll('#cartTotal');
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    const isEN = document.documentElement.lang === 'en';
    cartItemsEls.forEach((el) => {
        if (!cart.length) {
            el.innerHTML = `<p class="cart-empty">${isEN ? 'Your cart is empty.' : 'السلة فارغة.'}</p>`;
            return;
        }

        el.innerHTML = cart.map(item => `
            <div class="cart-row">
                <div>
                    <strong>${esc(item.name)}</strong>
                    <small>${formatPrice(item.price)} x ${esc(item.qty)}</small>
                </div>
                <button class="cart-remove" onclick="removeFromCart('${esc(item.id)}')" aria-label="${isEN ? 'Remove' : 'حذف'}">×</button>
            </div>
        `).join('');
    });

    cartTotalEls.forEach((el) => {
        el.textContent = formatPrice(total);
    });
}

window.toggleCart = (event) => {
    if (event) event.preventDefault();
    const sidebars = document.querySelectorAll('#cartSidebar');
    const overlays = document.querySelectorAll('#cartOverlay');

    if (!sidebars.length) return;
    const shouldOpen = !sidebars[0].classList.contains('open');
    sidebars.forEach((el) => el.classList.toggle('open', shouldOpen));
    overlays.forEach((el) => el.classList.toggle('open', shouldOpen));

    if (shouldOpen) {
        renderCart();
    }
};

window.addToCart = (id, name, price) => {
    const cart = getCart();
    const existing = cart.find(item => item.id === id);
    if (existing) {
        // A program can only be joined once per person
        showToast(document.documentElement.lang === 'en' ? 'Already in your cart' : 'البرنامج موجود في السلة بالفعل');
        return;
    } else {
        cart.push({ id, name, price: Number(price) || 0, qty: 1 });
    }
    saveCart(cart);
    updateCartBadge();
    renderCart();
    showToast(document.documentElement.lang === 'en' ? 'Added to cart' : 'تمت الإضافة إلى السلة');
};

window.removeFromCart = (id) => {
    const cart = getCart().filter(item => item.id !== id);
    saveCart(cart);
    updateCartBadge();
    renderCart();
};

window.openModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
};

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('nibras-modal')) {
        event.target.classList.remove('show');
        document.body.style.overflow = '';
    }
});


window.handleContact = async (event) => {
    event.preventDefault();
    const form = event.target;
    const btn = form.querySelector('button[type="submit"]');
    const isEN = document.documentElement.lang === 'en';
    
    const name = form.querySelector('input[name="name"], input[placeholder*="الاسم"], input[placeholder*="name"]')?.value.trim() || '';
    const email = form.querySelector('input[name="email"], input[placeholder*="البريد"], input[placeholder*="email"]')?.value.trim() || '';
    const phone = form.querySelector('input[name="phone"], input[placeholder*="الجوال"], input[placeholder*="الهاتف"], input[placeholder*="phone"]')?.value.trim() || '';
    const inquiryType = form.querySelector('select[name="inquiryType"]')?.value || '';
    const programOrService = form.querySelector('input[name="programOrService"]')?.value.trim() || '';
    const subject = form.querySelector('input[name="subject"], input[placeholder*="موضوع"], input[placeholder*="subject"]')?.value.trim() || 
                    (inquiryType ? (isEN ? `Inquiry regarding ${inquiryType}` : `استفسار بخصوص ${inquiryType}`) : (isEN ? 'New Website Inquiry' : 'استفسار جديد من الموقع'));
    const message = form.querySelector('textarea[name="message"], textarea')?.value.trim() || '';

    // Validation (Requirement 27: Name, Phone, Message required; Email validated if provided)
    if (!name) {
        showToast(isEN ? 'Please enter your full name.' : 'يرجى إدخال الاسم الكامل.', true);
        return;
    }
    if (!phone) {
        showToast(isEN ? 'Please enter your contact phone number.' : 'يرجى إدخال رقم الجوال للتواصل.', true);
        return;
    }
    if (!message) {
        showToast(isEN ? 'Please enter your inquiry or message.' : 'يرجى كتابة رسالتك أو استفسارك.', true);
        return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        showToast(isEN ? 'Please enter a valid email address.' : 'صيغة البريد الإلكتروني غير صحيحة.', true);
        return;
    }

    // UI Feedback
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = isEN ? '<i class="fas fa-spinner fa-spin"></i> Sending...' : '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

    // Save to database and trigger email notification
    try {
        await apiFetch('/api/inquiries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                email,
                phone,
                inquiryType,
                programOrService,
                subject,
                message
            })
        });
        
        showToast(isEN ? 'Message sent successfully! Our advisor will contact you soon.' : 'تم إرسال استفسارك بنجاح! سيتواصل معك فريق نبراس قريباً.');
        form.reset();
    } catch (err) {
        console.error('Failed to submit inquiry:', err);
        showToast(isEN ? 'Failed to send message. Please try again or reach us via WhatsApp.' : 'فشل إرسال الرسالة. يرجى المحاولة لاحقاً أو التواصل عبر واتساب.', true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};



// --- Program catalog (shared by all program pages) ---
const LEVELS = {
    master: { ar: 'ماجستير مهني', en: 'Professional Master' },
    phd: { ar: 'دكتوراه مهنية', en: 'Professional Doctorate' },
    diploma: { ar: 'دبلوم مهني', en: 'Professional Diploma' },
    course: { ar: 'دورة تدريبية', en: 'Training Course' }
};

function specialtyOf(item) {
    return NIBRAS_SPECIALTIES.byKey(item.specialtyKey || NIBRAS_SPECIALTIES.keyFor(item.titleAr, item.specialty));
}

function coverOf(item) {
    return item.image || `/assets/img/specialties/${specialtyOf(item).key}.svg?v=2`;
}

function programCard(item, isEN) {
    const title = (isEN && item.titleEn) || item.titleAr || item.title || '';
    const desc = (isEN && item.descriptionEn) || item.descriptionAr || item.description || '';
    const lang = isEN ? 'en' : 'ar';
    const spec = specialtyOf(item);
    const level = LEVELS[item.type] ? LEVELS[item.type][lang] : '';
    const url = `program-detail.html?slug=${encodeURIComponent(item.slug || item._id)}`;
    const price = `${Number(item.price || 0).toLocaleString('en-US')} US$`;
    const canBuy = !item.status || item.status === 'available';
    const notAvailable = item.status === 'coming_soon' ? (isEN ? 'Coming soon' : 'قريباً') : (isEN ? 'Unavailable' : 'غير متاح');

    return `
        <article class="program-card">
            <a class="program-cover" href="${url}" tabindex="-1" aria-hidden="true">
                <img src="${safeUrl(coverOf(item))}" alt="" loading="lazy" width="800" height="500" />
                <span class="program-level">${esc(level)}</span>
            </a>
            <div class="program-body">
                <div class="program-specialty">${esc(spec[lang])}</div>
                <h3><a href="${url}">${esc(title)}</a></h3>
                <p class="program-desc">${esc(desc)}</p>
                <div class="program-foot">
                    <span class="program-price">${price}</span>
                    <div class="program-actions">
                        <a class="program-link" href="${url}">${isEN ? 'Details' : 'التفاصيل'}</a>
                        ${canBuy
                            ? `<button class="program-add" data-add="${esc(item._id)}" aria-label="${isEN ? 'Add to cart' : 'إضافة إلى السلة'}"><i class="fas fa-cart-plus"></i></button>`
                            : `<span class="badge">${notAvailable}</span>`}
                    </div>
                </div>
            </div>
        </article>
    `;
}

window.initCatalogPage = async ({ type, gridId, searchId, filterId, areaId, countId }) => {
    const isEN = document.documentElement.lang === 'en';
    const grid = document.getElementById(gridId);
    const search = document.getElementById(searchId);
    const filters = document.getElementById(filterId);
    const area = areaId ? document.getElementById(areaId) : null;
    const count = countId ? document.getElementById(countId) : null;
    const params = new URLSearchParams(window.location.search);
    let courses = [];
    let activeKey = params.get('specialty') || 'all';

    try {
        const data = await apiFetch(`/api/courses?limit=500${type ? `&type=${type}` : ''}`);
        courses = data.courses || [];
    } catch (err) {
        grid.innerHTML = `<p class="empty-state"><i class="fas fa-triangle-exclamation"></i>${isEN ? 'Could not load programs. Please try again.' : 'تعذر تحميل البرامج. يرجى إعادة المحاولة.'}</p>`;
        return;
    }

    if (!NIBRAS_SPECIALTIES.some((s) => s.key === activeKey)) {
        activeKey = 'all';
    }

    const counts = {};
    courses.forEach((c) => {
        const key = specialtyOf(c).key;
        counts[key] = (counts[key] || 0) + 1;
    });
    const label = (s) => (isEN ? s.en : s.ar);
    const tag = (key, icon, text, n) => `<button type="button" class="filter-tag${key === activeKey ? ' active' : ''}" data-key="${key}"><i class="fas ${icon}"></i> ${esc(text)} <small>${n}</small></button>`;
    filters.innerHTML = tag('all', 'fa-table-cells-large', isEN ? 'All' : 'الكل', courses.length)
        + NIBRAS_SPECIALTIES.filter((s) => counts[s.key]).map((s) => tag(s.key, s.icon, label(s), counts[s.key])).join('');

    function apply() {
        const q = search.value.toLowerCase().trim();
        if (area) area.classList.toggle('hidden', activeKey === 'all' && !q);
        const list = courses.filter((c) => {
            const inSpecialty = activeKey === 'all' || specialtyOf(c).key === activeKey;
            const text = [c.titleAr, c.titleEn, c.specialty, c.descriptionAr, c.descriptionEn, label(specialtyOf(c))].join(' ').toLowerCase();
            return inSpecialty && (!q || text.includes(q));
        });
        if (count) count.textContent = list.length;
        grid.innerHTML = list.length
            ? list.map((c) => programCard(c, isEN)).join('')
            : `<p class="empty-state"><i class="fas fa-magnifying-glass"></i>${isEN ? 'No programs match your search.' : 'لا توجد برامج مطابقة لبحثك.'}</p>`;
    }

    filters.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-tag');
        if (!btn) return;
        activeKey = btn.dataset.key;
        filters.querySelectorAll('.filter-tag').forEach((b) => b.classList.toggle('active', b === btn));
        apply();
    });
    search.addEventListener('input', apply);
    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-add]');
        if (!btn) return;
        const course = courses.find((c) => c._id === btn.dataset.add);
        if (course) window.addToCart(course._id, (isEN && course.titleEn) || course.titleAr, course.price);
    });
    window.resetCatalog = () => {
        activeKey = 'all';
        search.value = '';
        filters.querySelectorAll('.filter-tag').forEach((b) => b.classList.toggle('active', b.dataset.key === 'all'));
        apply();
    };

    apply();
    if (area && activeKey !== 'all') area.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function initContactPrefill() {
    const subject = new URLSearchParams(window.location.search).get('subject');
    const field = document.querySelector('input[name="subject"], input[name="programOrService"]');
    if (subject && field) field.value = subject.slice(0, 200);
}

function initCheckout(isEN) {
    const form = document.getElementById('checkoutForm');
    if (!form) return;
    const list = document.getElementById('checkoutItems');
    const totalEl = document.getElementById('checkoutTotal');
    const button = form.querySelector('button[type="submit"]');
    const cart = getCart();
    const total = cart.reduce((sum, item) => sum + item.price * (item.qty || 1), 0);

    totalEl.textContent = formatPrice(total);
    if (!cart.length) {
        list.innerHTML = `<p class="cart-empty">${isEN ? 'Your cart is empty. Please add a program first.' : 'السلة فارغة. يرجى إضافة برنامج أولاً.'}</p>`;
        button.disabled = true;
        return;
    }
    list.innerHTML = cart.map((item) => `
        <div class="order-summary-item">
            <strong>${esc(item.name)}</strong>
            <span>${formatPrice(item.price * (item.qty || 1))}</span>
        </div>
    `).join('');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = (id) => document.getElementById(id).value.trim();
        const programs = cart.map((item, i) => `${i + 1}- ${item.name} (${formatPrice(item.price * (item.qty || 1))})`).join('\n');
        const message = isEN
            ? `New enrollment request:\n\n*Trainee details:*\n- Name: ${value('chkName')}\n- Email: ${value('chkEmail')}\n- Phone: ${value('chkPhone')}\n- Country: ${value('chkCountry')}\n\n*Selected programs:*\n${programs}\n\n*Total: ${formatPrice(total)}*`
            : `طلب اشتراك جديد من الأكاديمية:\n\n*بيانات المتدرب:*\n- الاسم: ${value('chkName')}\n- البريد: ${value('chkEmail')}\n- الهاتف: ${value('chkPhone')}\n- الدولة: ${value('chkCountry')}\n\n*البرامج المختارة:*\n${programs}\n\n*الإجمالي الكلي: ${formatPrice(total)}*`;

        button.disabled = true;
        try {
            // Keep a copy in the admin panel in case the visitor never sends the WhatsApp message
            await apiFetch('/api/inquiries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: value('chkName'),
                    email: value('chkEmail'),
                    phone: value('chkPhone'),
                    inquiryType: 'طلب تسجيل',
                    programOrService: cart.map((item) => item.name).join('، '),
                    subject: 'طلب تسجيل من صفحة الدفع',
                    message
                })
            });
        } catch (err) {
            console.error('Could not save the order:', err);
        }
        window.location.href = `https://wa.me/201112220796?text=${encodeURIComponent(message)}`;
    });
}
