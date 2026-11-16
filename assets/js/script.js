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

// Contact details for links the script builds; static pages carry the same values
const NIBRAS_CONTACT = { whatsapp: '201112220796', phone: '01112220796', email: 'info@nibras-ac.com' };

function whatsappLink(text) {
    return `https://wa.me/${NIBRAS_CONTACT.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const isEN = document.documentElement.lang === 'en';
    cleanupDuplicateIds(['cartSidebar', 'cartOverlay', 'cartItems', 'cartTotal', 'cartBadge']);
    initLayout();
    initSiteContent(isEN);
    initCounters();
    initReveal();
    updateCartBadge();
    initContactPrefill();
    initFeaturedPrograms(isEN);
    initCheckout(isEN);
    initVerifyForm(isEN);
    initPublicAuth(isEN);
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

// Counts each .counter up to its data-target once it scrolls into view
function initCounters(root = document) {
    const statNumbers = root.querySelectorAll('.counter');
    const format = (n) => n.toLocaleString('en-US');
    const animateCounter = (el) => {
        const target = parseInt(el.getAttribute('data-target'), 10);
        if (Number.isNaN(target)) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            el.textContent = format(target);
            return;
        }
        const duration = 1600;
        const startTime = performance.now();
        function update(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            // Ease out so the last digits settle gently
            el.textContent = format(Math.round((1 - (1 - progress) ** 3) * target));
            if (progress < 1) requestAnimationFrame(update);
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
    const items = document.querySelectorAll('.why-feature-card, .why-card, .step-card, .experience-pillar, .feature, .step, .specialty-card');
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
        const error = new Error(payload.message || 'Request failed');
        error.status = response.status;
        error.payload = payload;
        throw error;
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

// The customer's own page on the website
const profilePage = (isEN) => (isEN ? '/pages/en/profile.html' : '/pages/ar/profile.html');

// Where to go after signing in: a same-site ?next= link if one was given, otherwise the
// customer's profile (staff work in the management portal)
function afterLoginUrl(user, isEN) {
    const next = new URLSearchParams(window.location.search).get('next') || '';
    if (next.startsWith('/') && !next.startsWith('//')) return next;
    if (user && user.isStaff) return '/portal/';
    return profilePage(isEN);
}

function initPublicAuth(isEN) {
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = (document.getElementById('regNameAr') || document.getElementById('regName'))?.value.trim();
            const nameEn = document.getElementById('regNameEn')?.value.trim() || '';
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
                    body: JSON.stringify({ nameAr: name, nameEn, email, phone, password, lang: isEN ? 'en' : 'ar' })
                });
                showToast(isEN ? 'Account created. Check your email to confirm it.' : 'تم إنشاء الحساب. افتح إيميلك لتأكيده.');
                if (data.user && data.user.name) {
                    localStorage.setItem('nibras_user_name', data.user.name);
                }
                setTimeout(() => {
                    window.location.href = `${profilePage(isEN)}?welcome=1`;
                }, 900);
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
                // Accounts with two-factor sign-in finish in the portal, which asks for the code
                if (data.twoFactorRequired) {
                    window.location.href = '/portal/';
                    return;
                }
                showToast(isEN ? 'Login successful.' : 'تم تسجيل الدخول بنجاح.');
                if (data.user && data.user.name) {
                    localStorage.setItem('nibras_user_name', data.user.name);
                }
                setTimeout(() => {
                    window.location.href = afterLoginUrl(data.user, isEN);
                }, 500);
            } catch (error) {
                // Staff accounts sign in on staff.nibras-ac.com: say so and take them there
                if (error.payload && error.payload.code === 'WRONG_PORTAL' && error.payload.url) {
                    const parts = String(error.message).split(' / ');
                    showToast(isEN ? (parts[1] || parts[0]) : parts[0], true);
                    setTimeout(() => { window.location.href = error.payload.url; }, 1800);
                    return;
                }
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
                    body: JSON.stringify({ token, password, lang: isEN ? 'en' : 'ar' })
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
    // The QR code on a certificate opens this page with ?code=NUMBER and verifies at once
    const codeFromLink = new URLSearchParams(window.location.search).get('code');
    if (codeFromLink && document.getElementById('certNumber')) {
        document.getElementById('certNumber').value = codeFromLink.slice(0, 60);
        setTimeout(() => verifyForm.requestSubmit(), 0);
    }

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
                replaced: { badge: isEN ? 'Replaced' : 'مستبدلة', title: isEN ? 'Replaced by a newer version' : 'استُبدلت بإصدار أحدث', note: cert.replacedByNumber ? (isEN ? `This certificate was reissued under number ${esc(cert.replacedByNumber)}. Please verify that number.` : `أعيد إصدار هذه الشهادة برقم ${esc(cert.replacedByNumber)}. يرجى التحقق من الرقم الجديد.`) : (isEN ? 'This certificate was replaced by a newer version.' : 'استُبدلت هذه الشهادة بإصدار أحدث.'), icon: 'fa-arrows-rotate', box: 'verify-warning' },
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
                    ${row('fa-briefcase', cert.moduleName ? (isEN ? 'Module' : 'المحور') : (isEN ? 'Specialty / Field' : 'التخصص'), esc(cert.field || '—'))}
                    ${cert.hours ? row('fa-clock', isEN ? 'Training Hours' : 'الساعات التدريبية', esc(String(cert.hours))) : ''}
                    ${(cert.accreditations || []).length ? row('fa-award', isEN ? 'Accreditations' : 'الاعتمادات', esc(cert.accreditations.map((a) => (isEN && a.nameEn ? a.nameEn : a.nameAr) + (a.number ? ` (${a.number})` : '')).join(' · '))) : ''}
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
                    <p>${error.status === 429
                        ? esc(error.message)
                        : (isEN
                            ? `Please verify the certificate number as printed on your document. If you require further assistance, contact us at ${NIBRAS_CONTACT.phone} or ${NIBRAS_CONTACT.email}`
                            : `يرجى التأكد من كتابة رقم الشهادة كما هو موضح في الوثيقة بدون فراغات زائدة. إذا استمرت المشكلة، يرجى التواصل مع فريق الأكاديمية عبر هاتف: ${NIBRAS_CONTACT.phone} أو ${NIBRAS_CONTACT.email}`)}</p>
                </div>
            `;
        }
    });
}

window.logout = async () => {
    try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {}
    localStorage.removeItem('nibras_user_name');
    window.location.href = document.documentElement.lang === 'en' ? '/pages/en/login.html' : '/pages/ar/login.html';
};

// Signed in: the header shows the customer's initial and first name, opening their profile.
// Staff accounts see the way into the management portal.
async function updateNavAuth(isEN) {
    if (!localStorage.getItem('nibras_user_name')) return;
    let me;
    try {
        me = await apiFetch('/api/auth/me');
    } catch (e) {
        localStorage.removeItem('nibras_user_name');
        return;
    }
    const user = me.user || {};
    const isStaff = !!me.isStaff;
    const firstName = String(user.name || '').trim().split(/\s+/)[0] || '';
    const initial = esc(firstName.charAt(0) || '؟');
    const href = isStaff ? '/portal/' : profilePage(isEN);
    const title = isStaff ? (isEN ? 'Staff portal' : 'بوابة الموظفين') : (isEN ? 'My profile' : 'صفحتي');
    const desktop = isStaff
        ? `<a href="${href}" class="nav-btn nav-btn--admin"><i class="fas fa-gauge-high"></i> ${title}</a>`
        : `<a href="${href}" class="nav-user" title="${title}"><span class="nav-user__avatar" aria-hidden="true">${initial}</span><span class="nav-user__name">${esc(firstName)}</span></a>`;
    const mobile = `<a href="${href}" class="mobile-btn">${isStaff ? '<i class="fas fa-gauge-high"></i>' : `<span class="nav-user__avatar nav-user__avatar--sm" aria-hidden="true">${initial}</span>`} ${title}</a>`;

    let navAuth = document.getElementById('navAuth');
    if (!navAuth) {
        const loginLinks = Array.from(document.querySelectorAll('.nav-links a[href*="login.html"]'));
        const desktopLogin = loginLinks.find(l => !l.classList.contains('mobile-btn') && !l.classList.contains('lang-switch-btn'));
        if (desktopLogin) navAuth = desktopLogin.parentElement;
    }
    let mobileNavAuth = document.getElementById('mobileNavAuth');
    if (!mobileNavAuth) {
        const mobileLoginLinks = Array.from(document.querySelectorAll('.mobile-menu a[href*="login.html"], .mobile-menu .mobile-btn'));
        const mobileLogin = mobileLoginLinks.find(l => !l.classList.contains('lang-switch-btn') && !l.href.includes('program-detail'));
        if (mobileLogin) mobileNavAuth = mobileLogin.parentElement;
    }
    // Never overwrite a language switcher
    if (navAuth && !navAuth.querySelector('.lang-switch-btn') && !navAuth.classList.contains('lang-switch-btn')) navAuth.innerHTML = desktop;
    if (mobileNavAuth && !mobileNavAuth.querySelector('.lang-switch-btn') && !mobileNavAuth.classList.contains('lang-switch-btn')) mobileNavAuth.innerHTML = mobile;
}

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

// The cart only remembers which programs were chosen. Names and prices are refreshed from
// the server, and programs that were removed or closed drop out.
async function refreshCart() {
    const cart = getCart();
    if (!cart.length) return cart;
    const isEN = document.documentElement.lang === 'en';
    try {
        const data = await apiFetch(`/api/courses?status=available&limit=50&ids=${cart.map((item) => encodeURIComponent(item.id)).join(',')}`);
        const byId = new Map((data.courses || []).map((c) => [c._id, c]));
        const fresh = cart.filter((item) => byId.has(item.id)).map((item) => {
            const course = byId.get(item.id);
            return { id: item.id, name: (isEN && course.titleEn) || course.titleAr, price: course.finalPrice, qty: 1 };
        });
        if (fresh.length < cart.length) {
            showToast(isEN ? 'Programs that are no longer available were removed from your cart.' : 'تمت إزالة برامج لم تعد متاحة من السلة.');
        }
        saveCart(fresh);
        updateCartBadge();
        return fresh;
    } catch (err) {
        return cart;
    }
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
        refreshCart().then(renderCart);
    }
};

// Adds a program as the API returned it, at the price after any discount
window.addCourseToCart = (course) => {
    const isEN = document.documentElement.lang === 'en';
    window.addToCart(course._id, (isEN && course.titleEn) || course.titleAr, course.finalPrice ?? course.price);
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

// Bump after re-rendering covers with tools/specialty-covers/render.py
const COVER_VERSION = 1;

function coverOf(item) {
    // The old specialty illustrations count as no image, so they give way to the covers
    if (item.image && !item.image.startsWith('/assets/img/specialties/')) return item.image;
    const lang = document.documentElement.lang === 'en' ? 'en' : 'ar';
    return `/assets/img/covers/${lang}/${specialtyOf(item).key}.webp?v=${COVER_VERSION}`;
}

function formatAmount(amount) {
    return `${Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} US$`;
}

// Price with the original struck through when a discount applies
function priceHtml(item) {
    const final = item.finalPrice ?? item.price;
    return item.discountPercent > 0
        ? `<span class="program-price"><del>${formatAmount(item.price)}</del> ${formatAmount(final)}</span>`
        : `<span class="program-price">${formatAmount(final)}</span>`;
}

function programCard(item, isEN) {
    const title = (isEN && item.titleEn) || item.titleAr || item.title || '';
    const desc = (isEN && item.descriptionEn) || item.descriptionAr || item.description || '';
    const lang = isEN ? 'en' : 'ar';
    const spec = specialtyOf(item);
    const level = LEVELS[item.type] ? LEVELS[item.type][lang] : '';
    const url = `/pages/${lang}/program-detail.html?slug=${encodeURIComponent(item.slug || item._id)}`;
    const canBuy = !item.status || item.status === 'available';
    const notAvailable = item.status === 'coming_soon' ? (isEN ? 'Coming soon' : 'قريباً') : (isEN ? 'Unavailable' : 'غير متاح');

    return `
        <article class="program-card">
            <a class="program-cover" href="${url}" tabindex="-1" aria-hidden="true">
                <img src="${safeUrl(coverOf(item))}" alt="" loading="lazy" width="800" height="500" />
                <span class="program-level">${esc(level)}</span>
                ${item.discountPercent > 0 ? `<span class="program-discount">${isEN ? `${item.discountPercent}% off` : `خصم ${item.discountPercent}%`}</span>` : ''}
            </a>
            <div class="program-body">
                <div class="program-specialty">${esc(spec[lang])}</div>
                <h3><a href="${url}">${esc(title)}</a></h3>
                <p class="program-desc">${esc(desc)}</p>
                <div class="program-foot">
                    ${priceHtml(item)}
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

// Catalog pages: a search box over the programs of one track (or all of them).
// A specialty can still arrive from a specialty card's link and shows as a removable chip.
window.initCatalogPage = async ({ type, gridId, searchId, areaId, countId }) => {
    const isEN = document.documentElement.lang === 'en';
    const grid = document.getElementById(gridId);
    const search = document.getElementById(searchId);
    const area = areaId ? document.getElementById(areaId) : null;
    const count = countId ? document.getElementById(countId) : null;
    const requested = new URLSearchParams(window.location.search).get('specialty');
    let specialty = NIBRAS_SPECIALTIES.find((s) => s.key === requested) || null;
    let courses = [];

    try {
        const data = await apiFetch(`/api/courses?limit=500${type ? `&type=${type}` : ''}`);
        courses = data.courses || [];
    } catch (err) {
        grid.innerHTML = `<p class="empty-state"><i class="fas fa-triangle-exclamation"></i>${isEN ? 'Could not load programs. Please try again.' : 'تعذر تحميل البرامج. يرجى إعادة المحاولة.'}</p>`;
        return;
    }

    const chip = document.createElement('div');
    chip.className = 'specialty-chip-row';
    search.closest('.search-box-wrapper').after(chip);

    function renderChip() {
        chip.innerHTML = specialty
            ? `<button type="button" class="specialty-chip" aria-label="${isEN ? 'Remove specialty filter' : 'إزالة تصفية التخصص'}">
                   <i class="fas ${specialty.icon}"></i> ${esc(isEN ? specialty.en : specialty.ar)} <i class="fas fa-xmark"></i>
               </button>`
            : '';
    }

    function apply() {
        const q = search.value.toLowerCase().trim();
        if (area) area.classList.toggle('hidden', !specialty && !q);
        const list = courses.filter((c) => {
            const spec = specialtyOf(c);
            const text = [c.titleAr, c.titleEn, c.specialty, c.descriptionAr, c.descriptionEn, spec.ar, spec.en].join(' ').toLowerCase();
            return (!specialty || spec.key === specialty.key) && (!q || text.includes(q));
        });
        if (count) count.textContent = list.length;
        grid.innerHTML = list.length
            ? list.map((c) => programCard(c, isEN)).join('')
            : `<p class="empty-state"><i class="fas fa-magnifying-glass"></i>${isEN ? 'No programs match your search.' : 'لا توجد برامج مطابقة لبحثك.'}</p>`;
    }

    chip.addEventListener('click', (e) => {
        if (!e.target.closest('.specialty-chip')) return;
        specialty = null;
        history.replaceState(null, '', window.location.pathname);
        renderChip();
        apply();
    });
    search.addEventListener('input', apply);
    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-add]');
        if (!btn) return;
        const course = courses.find((c) => c._id === btn.dataset.add);
        if (course) window.addCourseToCart(course);
    });
    window.resetCatalog = () => {
        specialty = null;
        search.value = '';
        history.replaceState(null, '', window.location.pathname);
        renderChip();
        apply();
    };

    renderChip();
    apply();
    if (area && specialty) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// --- Admin-managed content (page images, pathways, numbers, cards, testimonials) ---
const SITE_CACHE_KEY = 'nibras_site_v1';

function readCachedSite() {
    try {
        return JSON.parse(localStorage.getItem(SITE_CACHE_KEY) || 'null');
    } catch (e) {
        return null;
    }
}

// Pages paint at once from the last copy seen (or the built-in defaults), then refresh from the server
function initSiteContent(isEN) {
    const selector = '[data-hero], [data-pathways], [data-stats], [data-guide-cards], [data-service-cards], [data-testimonials], .social-links, [data-master-compare]';
    if (typeof NIBRAS_CONTENT === 'undefined' || !document.querySelector(selector)) return;
    const cached = readCachedSite();
    renderSiteContent(cached || NIBRAS_CONTENT, isEN);
    apiFetch('/api/site').then((data) => {
        const fresh = JSON.stringify(data);
        if (cached && JSON.stringify(cached) === fresh) return;
        try { localStorage.setItem(SITE_CACHE_KEY, fresh); } catch (e) {}
        renderSiteContent(data, isEN);
    }).catch(() => {});
}

function renderSiteContent(data, isEN) {
    const lang = isEN ? 'en' : 'ar';
    renderSiteLinks(data);
    renderMasterCompare(data, isEN);
    const pick = (item, field) => (isEN && item[`${field}En`]) || item[`${field}Ar`] || '';
    const trackUrl = (key) => `/pages/${lang}/${NIBRAS_CONTENT.trackPages[key]}`;
    const media = (item, cls) => item.image
        ? `<div class="${cls}"><img src="${safeUrl(item.image)}" alt="" loading="lazy" /></div>`
        : `<div class="${cls} ${cls}--icon"><i class="fas ${esc(item.icon || 'fa-star')}" aria-hidden="true"></i></div>`;
    // "Label: text" shows its label in bold
    const point = (text) => {
        const i = text.indexOf(':');
        return i > 0 && i < 40 ? `<strong>${esc(text.slice(0, i))}:</strong>${esc(text.slice(i + 1))}` : esc(text);
    };
    const arrow = `<i class="fas fa-arrow-left" aria-hidden="true"></i>`;

    document.querySelectorAll('[data-hero]').forEach((el) => {
        const url = data.heroes && data.heroes[el.dataset.hero];
        el.classList.toggle('has-image', !!url);
        if (url) el.style.setProperty('--hero-image', `url("${safeUrl(url)}")`);
        else el.style.removeProperty('--hero-image');
    });

    document.querySelectorAll('[data-pathways]').forEach((el) => {
        el.innerHTML = (data.pathways || []).map((p, i) => `
            <a class="path-card" href="${trackUrl(p.key)}">
                ${media(p, 'path-media')}
                <div class="path-body">
                    <span class="path-num">0${i + 1}</span>
                    <h3>${esc(pick(p, 'title'))}</h3>
                    <p class="path-tag">${esc(pick(p, 'tagline'))}</p>
                    <p class="path-desc">${esc(pick(p, 'desc'))}</p>
                    <span class="path-link">${isEN ? 'Explore this track' : 'استكشف المسار'} ${arrow}</span>
                </div>
            </a>`).join('');
    });

    document.querySelectorAll('[data-stats]').forEach((el) => {
        const stats = data.stats || [];
        const section = el.closest('section');
        if (section) section.hidden = !stats.length;
        el.innerHTML = stats.map((s) => `
            <div class="stat">
                <i class="fas ${esc(s.icon)}" aria-hidden="true"></i>
                <span class="stat-value"><span class="counter" data-target="${Number(s.value) || 0}">0</span>${s.suffix ? `<em>${esc(s.suffix)}</em>` : ''}</span>
                <span class="stat-label">${esc(pick(s, 'label'))}</span>
            </div>`).join('');
        initCounters(el);
    });

    document.querySelectorAll('[data-guide-cards]').forEach((el) => {
        el.innerHTML = (data.guideCards || []).map((c) => `
            <a class="guide-card" href="${trackUrl(c.key)}">
                ${media(c, 'guide-media')}
                <div class="guide-body">
                    <h3>${esc(pick(c, 'title'))}</h3>
                    <p>${esc(pick(c, 'text'))}</p>
                    <span class="path-link">${esc(pick(c, 'link'))} ${arrow}</span>
                </div>
            </a>`).join('');
    });

    document.querySelectorAll('[data-service-cards]').forEach((el) => {
        el.innerHTML = (data.serviceCards || []).map((c) => `
            <article class="service-card${c.key === 'companies' ? ' service-card--accent' : ''}">
                ${media(c, 'service-media')}
                <div class="service-body">
                    <h3>${esc(pick(c, 'title'))}</h3>
                    <h5 class="text-gold">${esc(pick(c, 'subtitle'))}</h5>
                    <p>${esc(pick(c, 'text'))}</p>
                    <ul class="check-list">${(isEN && c.pointsEn && c.pointsEn.length ? c.pointsEn : c.pointsAr || []).map((p) => `<li>${point(p)}</li>`).join('')}</ul>
                    <a class="${c.key === 'companies' ? 'btn-primary' : 'btn-outline'}" href="${esc(c.href.startsWith('#') ? c.href : `/pages/${lang}/${c.href}`)}">${esc(pick(c, 'link'))} ${arrow}</a>
                </div>
            </article>`).join('');
    });

    document.querySelectorAll('[data-testimonials]').forEach((section) => {
        const list = data.testimonials || [];
        section.hidden = !list.length;
        section.querySelector('.quotes').innerHTML = list.map((t) => `
            <figure class="quote">
                <blockquote>${esc(pick(t, 'quote'))}</blockquote>
                <figcaption>
                    ${t.image ? `<img src="${safeUrl(t.image)}" alt="" loading="lazy" />` : `<span class="quote-avatar" aria-hidden="true">${esc(pick(t, 'name').charAt(0))}</span>`}
                    <span><strong>${esc(pick(t, 'name'))}</strong>${pick(t, 'role') ? `<span>${esc(pick(t, 'role'))}</span>` : ''}</span>
                </figcaption>
            </figure>`).join('');
    });
}

// --- Home page: featured programs ---
// Programs the admin marks as featured come first. Without any, one program per track stands in.
async function initFeaturedPrograms(isEN) {
    const grid = document.getElementById('featuredPrograms');
    if (!grid) return;
    const section = grid.closest('section');
    const types = ['course', 'diploma', 'master', 'phd'];
    let picks = [];

    try {
        const featured = await apiFetch('/api/courses?featured=true&status=available&limit=6');
        picks = featured.courses || [];
        if (!picks.length) {
            const byType = await Promise.all(types.map((t) => apiFetch(`/api/courses?type=${t}&status=available&limit=6`)));
            byType.forEach(({ courses = [] }) => {
                if (picks.length >= 3) return;
                const fresh = courses.filter((c) => !picks.some((p) => p._id === c._id));
                const course = fresh.find((c) => !picks.some((p) => specialtyOf(p).key === specialtyOf(c).key)) || fresh[0];
                if (course) picks.push(course);
            });
        }
    } catch (err) {
        section.remove();
        return;
    }
    if (!picks.length) {
        section.remove();
        return;
    }

    grid.innerHTML = picks.map((c) => programCard(c, isEN)).join('');
    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-add]');
        if (!btn) return;
        const course = picks.find((c) => c._id === btn.dataset.add);
        if (course) window.addCourseToCart(course);
    });
}

function initContactPrefill() {
    const subject = new URLSearchParams(window.location.search).get('subject');
    const field = document.querySelector('input[name="subject"], input[name="programOrService"]');
    if (subject && field) field.value = subject.slice(0, 200);
}

// Checkout shows current prices from the server and sends program ids only.
// The server prices the order, saves it for the admin and returns the WhatsApp message.
async function initCheckout(isEN) {
    const form = document.getElementById('checkoutForm');
    if (!form) return;
    const list = document.getElementById('checkoutItems');
    const totalEl = document.getElementById('checkoutTotal');
    const button = form.querySelector('button[type="submit"]');

    function render(cart) {
        const total = cart.reduce((sum, item) => sum + item.price, 0);
        totalEl.textContent = formatPrice(total);
        button.disabled = !cart.length;
        list.innerHTML = cart.length
            ? cart.map((item) => `
                <div class="order-summary-item">
                    <strong>${esc(item.name)}</strong>
                    <span>${formatPrice(item.price)}</span>
                </div>`).join('')
            : `<p class="cart-empty">${isEN ? 'Your cart is empty. Please add a program first.' : 'السلة فارغة. يرجى إضافة برنامج أولاً.'}</p>`;
    }

    render(getCart());
    render(await refreshCart());

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = (id) => document.getElementById(id).value.trim();
        const original = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${isEN ? 'Sending...' : 'جاري الإرسال...'}`;
        try {
            const data = await apiFetch('/api/inquiries/enrollment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: value('chkName'),
                    email: value('chkEmail'),
                    phone: value('chkPhone'),
                    country: value('chkCountry'),
                    courseIds: getCart().map((item) => item.id),
                    lang: isEN ? 'en' : 'ar'
                })
            });
            saveCart([]);
            updateCartBadge();
            window.location.href = whatsappLink(data.whatsappText);
        } catch (err) {
            showToast(err.message, true);
            // The cart held programs that closed in the meantime: show what is left
            if (err.status === 409) render(await refreshCart());
            button.disabled = !getCart().length;
            button.innerHTML = original;
        }
    });
}

// The footer links of every page, as the owner set them (Website → Links): platform icon + address
function renderSiteLinks(data) {
    const links = data && data.links;
    const platforms = (data && data.platforms) || (typeof NIBRAS_CONTENT !== 'undefined' ? NIBRAS_CONTENT.platforms : []) || [];
    if (!Array.isArray(links) || !links.length) return;
    const iconOf = (key) => (platforms.find((p) => p.key === key) || { icon: 'fas fa-globe' }).icon;
    const html = links.map((l) => {
        const external = /^https?:/i.test(l.url);
        const href = /^(https?:\/\/|mailto:|tel:)/i.test(l.url) ? esc(l.url) : '#';
        return `<a href="${href}" class="social-link" aria-label="${esc(l.label || l.platform)}" title="${esc(l.label || l.platform)}"${external ? ' target="_blank" rel="noopener"' : ''}><i class="${esc(iconOf(l.platform))}" aria-hidden="true"></i></a>`;
    }).join('');
    document.querySelectorAll('.social-links').forEach((el) => { el.innerHTML = html; });
}

// Professional or academic master's (the masters page): the owner writes it in Website → Master's
function renderMasterCompare(data, isEN) {
    const box = document.querySelector('[data-master-compare]');
    const c = data && data.masterCompare;
    if (!box) return;
    if (!c || c.visible === false || !Array.isArray(c.rows) || !c.rows.length) { box.hidden = true; return; }
    const p = (k) => (isEN && c[`${k}En`]) || c[`${k}Ar`] || '';
    const r = (row, k) => (isEN && row[`${k}En`]) || row[`${k}Ar`] || '';
    const contact = isEN ? '/pages/en/contact.html' : '/pages/ar/contact.html';
    box.hidden = false;
    box.innerHTML = `
        <div class="container">
            <div class="section-header">
                <h2 class="section-title">${esc(p('title'))}</h2>
                ${p('intro') ? `<p class="section-subtitle">${esc(p('intro'))}</p>` : ''}
            </div>
            <div class="mc">
                <div class="mc__head">
                    <span></span>
                    <span class="mc__col mc__col--pro"><i class="fas fa-briefcase" aria-hidden="true"></i> ${esc(p('professional'))}</span>
                    <span class="mc__col mc__col--aca"><i class="fas fa-book-open" aria-hidden="true"></i> ${esc(p('academic'))}</span>
                </div>
                ${c.rows.map((row) => `
                <div class="mc__row">
                    <span class="mc__aspect">${esc(r(row, 'aspect'))}</span>
                    <span class="mc__cell mc__cell--pro" data-label="${esc(p('professional'))}">${esc(r(row, 'professional'))}</span>
                    <span class="mc__cell mc__cell--aca" data-label="${esc(p('academic'))}">${esc(r(row, 'academic'))}</span>
                </div>`).join('')}
            </div>
            ${p('note') ? `<p class="mc__note"><i class="fas fa-circle-info" aria-hidden="true"></i> ${esc(p('note'))}</p>` : ''}
            ${p('cta') ? `<div class="mc__cta"><a class="btn-primary" href="${contact}">${esc(p('cta'))}</a></div>` : ''}
        </div>`;
}
