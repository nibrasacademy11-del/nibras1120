/* ============================================
   Nibras Academy - Frontend Script (API Version)
   ============================================ */

let adminCertificates = [];

document.addEventListener('DOMContentLoaded', () => {
    const isEN = document.documentElement.lang === 'en';
    const path = window.location.pathname.toLowerCase();
    const isAdminPagePath = path.endsWith('/admin.html');

    cleanupDuplicateIds(['cartSidebar', 'cartOverlay', 'cartItems', 'cartTotal', 'cartBadge']);
    initLayout();
    initCounters();
    updateCartBadge();
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

    if (hamburger) {
        hamburger.onclick = () => {
            hamburger.classList.toggle('active');
            if (navLinks) navLinks.classList.toggle('active');
            if (mobileMenu) mobileMenu.classList.toggle('active');
        };
    }

    window.onscroll = () => {
        const header = document.getElementById('navbar');
        if (header) header.classList.toggle('scrolled', window.scrollY > 50);
        const scrollTopBtn = document.getElementById('scrollTop');
        if (scrollTopBtn) scrollTopBtn.classList.toggle('show', window.scrollY > 400);
    };

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

function initPublicAuth(isEN, isAdminPagePath) {
    if (isAdminPagePath) return;
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const homeUrl = isEN ? '../../en/index.html' : '../../index.html';

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
                showToast(error.message, true);
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
                        const currentPath = window.location.pathname;
                        if (currentPath.includes('/en/')) {
                            window.location.href = '../ar/admin.html';
                        } else if (currentPath.includes('/pages/ar/')) {
                            window.location.href = 'admin.html';
                        } else {
                            // From root or other paths
                            window.location.href = 'pages/ar/admin.html';
                        }
                    } else {
                        // Redirect student to their profile
                        window.location.href = 'profile.html';
                    }
                }, 500);
            } catch (error) {
                showToast(error.message, true);
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
                    body: JSON.stringify({ email })
                });
                showToast(isEN ? 'Reset link sent to your email.' : 'تم إرسال الرابط، تفقد بريدك الإلكتروني.');
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
                showToast(error.message, true);
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
            <div class="verify-loading" style="text-align:center; padding:25px;">
                <i class="fas fa-spinner fa-spin" style="font-size:1.8rem; color:var(--primary);"></i>
                <p style="margin-top:10px; color:var(--text-muted);">${isEN ? 'Searching official records...' : 'جاري التحقق من سجلات الشهادات...'}</p>
            </div>
        `;
        try {
            const data = await apiFetch(`/api/certificates/${encodeURIComponent(code)}`);
            const cert = data.certificate;
            resultDiv.className = 'verify-result verify-success';
            
            // Format status badge
            const statusKey = (cert.status || 'Valid').toLowerCase();
            let statusLabel = isEN ? 'Valid' : 'معتمدة وصالحة';
            let statusBadgeClass = 'valid';
            if (statusKey === 'suspended') { statusLabel = isEN ? 'Suspended' : 'معلقة'; statusBadgeClass = 'suspended'; }
            if (statusKey === 'cancelled') { statusLabel = isEN ? 'Cancelled' : 'ملغاة'; statusBadgeClass = 'cancelled'; }
            if (statusKey === 'expired') { statusLabel = isEN ? 'Expired' : 'منتهية الصلاحية'; statusBadgeClass = 'expired'; }

            resultDiv.innerHTML = `
                <div class="verify-result-header" style="text-align:center; margin-bottom:20px;">
                    <div class="verify-check-icon" style="font-size:2.5rem; color:#12b76a; margin-bottom:10px;">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h3 style="font-size:1.4rem; color:var(--primary); margin-bottom:5px;">${isEN ? 'Verified Certificate' : 'شهادة موثّقة ومعتمدة'}</h3>
                    <p style="color:var(--text-muted); font-size:0.95rem;">${isEN ? 'This certificate is authentic and registered in the records of Nibras Academy.' : 'هذه الشهادة صحيحة ومسجلة رسمياً في سجلات أكاديمية نبراس.'}</p>
                </div>
                
                <div class="verify-data-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:15px; background:var(--bg-surface); padding:20px; border-radius:12px; border:1px solid var(--border); margin-bottom:20px;">
                    <div class="verify-data-item">
                        <span class="verify-data-label" style="display:block; font-size:0.85rem; color:var(--text-muted); margin-bottom:3px;"><i class="fas fa-user"></i> ${isEN ? 'Holder Name' : 'اسم حامل الشهادة'}</span>
                        <strong class="verify-data-value" style="font-size:1.05rem; color:var(--primary);">${cert.trainee_name}</strong>
                    </div>
                    <div class="verify-data-item">
                        <span class="verify-data-label" style="display:block; font-size:0.85rem; color:var(--text-muted); margin-bottom:3px;"><i class="fas fa-graduation-cap"></i> ${isEN ? 'Program' : 'اسم البرنامج'}</span>
                        <strong class="verify-data-value" style="font-size:1.05rem; color:var(--primary);">${cert.program_name}</strong>
                    </div>
                    <div class="verify-data-item">
                        <span class="verify-data-label" style="display:block; font-size:0.85rem; color:var(--text-muted); margin-bottom:3px;"><i class="fas fa-layer-group"></i> ${isEN ? 'Credential Type' : 'نوع الشهادة'}</span>
                        <span class="verify-data-value">${cert.program_type || (isEN ? 'Professional Certificate' : 'شهادة مهنية')}</span>
                    </div>
                    <div class="verify-data-item">
                        <span class="verify-data-label" style="display:block; font-size:0.85rem; color:var(--text-muted); margin-bottom:3px;"><i class="fas fa-briefcase"></i> ${isEN ? 'Specialty / Field' : 'التخصص'}</span>
                        <span class="verify-data-value">${cert.field || '—'}</span>
                    </div>
                    <div class="verify-data-item">
                        <span class="verify-data-label" style="display:block; font-size:0.85rem; color:var(--text-muted); margin-bottom:3px;"><i class="fas fa-hashtag"></i> ${isEN ? 'Certificate No.' : 'رقم الشهادة'}</span>
                        <strong class="verify-data-value" dir="ltr">${cert.cert_num}</strong>
                    </div>
                    <div class="verify-data-item">
                        <span class="verify-data-label" style="display:block; font-size:0.85rem; color:var(--text-muted); margin-bottom:3px;"><i class="fas fa-calendar-alt"></i> ${isEN ? 'Issue Date' : 'تاريخ الإصدار'}</span>
                        <span class="verify-data-value">${cert.issue_date}</span>
                    </div>
                    <div class="verify-data-item">
                        <span class="verify-data-label" style="display:block; font-size:0.85rem; color:var(--text-muted); margin-bottom:3px;"><i class="fas fa-shield-alt"></i> ${isEN ? 'Status' : 'حالة الشهادة'}</span>
                        <span class="badge-status ${statusBadgeClass}">${statusLabel}</span>
                    </div>
                </div>

                ${cert.pdf_url ? `
                <div class="verify-download" style="text-align:center;">
                    <a href="${cert.pdf_url}" target="_blank" class="btn-primary" style="display:inline-flex; align-items:center; gap:8px;">
                        <i class="fas fa-file-pdf"></i> ${isEN ? 'Download Official Electronic PDF' : 'تنزيل النسخة الإلكترونية الرسمية (PDF)'}
                    </a>
                </div>` : ''}
            `;
        } catch (error) {
            resultDiv.className = 'verify-result verify-error-result';
            resultDiv.innerHTML = `
                <div class="verify-result-header" style="text-align:center; padding:20px;">
                    <div class="verify-error-icon" style="font-size:2.5rem; color:#d92d20; margin-bottom:10px;">
                        <i class="fas fa-times-circle"></i>
                    </div>
                    <h3 style="color:#d92d20; font-size:1.3rem; margin-bottom:8px;">${isEN ? 'Certificate Not Found' : 'لم يتم العثور على سجل مطابق لرقم الشهادة'}</h3>
                    <p style="color:var(--text-muted); font-size:0.95rem; line-height:1.7; max-width:550px; margin:0 auto 15px;">
                        ${isEN ? 'Please verify the certificate number as printed on your document. If you require further assistance, contact us at 01112220796 or info@nibras-ac.com' : 'يرجى التأكد من كتابة رقم الشهادة كما هو موضح في الوثيقة بدون فراغات زائدة. إذا استمرت المشكلة، يرجى التواصل مع فريق الأكاديمية لمراجعة السجلات عبر هاتف: 01112220796 أو info@nibras-ac.com'}
                    </p>
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
                showToast(error.message, true);
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
                contentAr: document.getElementById('artContentAr').value.trim(),
                isPublished: document.getElementById('artPublished').checked
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
            const userId = document.getElementById('adminCertUserId')?.value;
            if (userId) formData.append('userId', userId);

            try {
                await apiFetch('/api/admin/certificates', {
                    method: 'POST',
                    body: formData
                });
                adminCertForm.reset();
                showToast(isEN ? 'Certificate added successfully.' : 'تمت إضافة بيانات الشهادة بنجاح.');
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
        const data = await apiFetch('/api/courses?limit=250');
        adminAllPrograms = data.courses || [];
        const countEl = document.getElementById('totalProgramsCount');
        if (countEl) countEl.textContent = adminAllPrograms.length;
        displayAdminPrograms(adminAllPrograms, isEN);
    } catch (err) {
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${err.message}</p>`;
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
        masters: 'ماجستير مهني',
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
                <td data-label="اسم البرنامج" style="font-weight:600; color:var(--primary);">${title}</td>
                <td data-label="المسار"><span class="badge" style="background:#eef4fb; color:var(--primary); font-size:0.8rem; padding:4px 8px; border-radius:8px;">${typeName}</span></td>
                <td data-label="التخصص">${p.specialty || '—'}</td>
                <td data-label="السعر" style="font-weight:700;">${p.price || 0} US$</td>
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
    document.getElementById('progType').value = prog.type || 'masters';
    document.getElementById('progSpecialty').value = prog.specialty || '';
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
        showToast(`تم تغيير حالة البرنامج إلى: ${newStatus}`);
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
        const data = await apiFetch('/api/articles');
        adminAllArticles = data.articles || [];
        const countEl = document.getElementById('totalArticlesCount');
        if (countEl) countEl.textContent = adminAllArticles.length;
        displayAdminArticles(adminAllArticles, isEN);
    } catch (err) {
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${err.message}</p>`;
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
            <td data-label="العنوان" style="font-weight:600; color:var(--primary);">${a.titleAr || a.title}</td>
            <td data-label="التصنيف"><span class="badge" style="background:#eef4fb; color:var(--primary); font-size:0.8rem; padding:4px 8px; border-radius:8px;">${a.category}</span></td>
            <td data-label="المصدر">${a.sourceUrl ? `<a href="${a.sourceUrl}" target="_blank" style="color:var(--primary); text-decoration:underline;">رابط المصدر <i class="fas fa-external-link-alt"></i></a>` : (a.author || 'نبراس')}</td>
            <td data-label="الحالة"><span class="badge-status ${a.isPublished ? 'available' : 'hidden-status'}">${a.isPublished ? 'منشور' : 'مسودة'}</span></td>
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
    document.getElementById('artCategory').value = art.category || 'media';
    document.getElementById('artSourceUrl').value = art.sourceUrl || '';
    document.getElementById('artAuthor').value = art.author || '';
    document.getElementById('artContentAr').value = art.contentAr || art.content || '';
    document.getElementById('artPublished').checked = art.isPublished !== false;

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
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${err.message}</p>`;
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
                    <strong>${m.name}</strong><br>
                    <small dir="ltr" style="color:var(--text-muted);">${m.phone}</small>
                    ${m.email ? `<br><small style="color:var(--text-muted);">${m.email}</small>` : ''}
                </td>
                <td data-label="نوع الاستفسار">
                    <span class="badge" style="background:#eef4fb; color:var(--primary); font-size:0.8rem; padding:4px 8px; border-radius:8px;">${m.inquiryType || 'عام'}</span>
                    ${m.programOrService ? `<br><small style="color:var(--text-muted);">${m.programOrService}</small>` : ''}
                </td>
                <td data-label="الرسالة" style="max-width:300px; font-size:0.9rem; line-height:1.5;">${m.message}</td>
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
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${error.message}</p>`;
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
                <td data-label="اسم المتدرب" style="font-weight:600; color:var(--primary);">${c.trainee_name}</td>
                <td data-label="البرنامج">${c.program_name}</td>
                <td data-label="رقم الشهادة" style="font-weight:700; color:#7a1c28;" dir="ltr">${c.cert_num}</td>
                <td data-label="الحالة"><span class="badge-status ${badgeClass}">${statusLabel}</span></td>
                <td data-label="التاريخ">${c.issue_date}</td>
                <td data-label="PDF">${c.pdf_url ? `<a href="${c.pdf_url}" target="_blank" download style="color:#0f766e; text-decoration:none; font-weight:600;"><i class="fas fa-file-pdf"></i> ${isEN ? 'Download' : 'تحميل'}</a>` : `<span style="color:#999;">${isEN ? 'N/A' : 'غير مرفق'}</span>`}</td>
                <td data-label="إدارة">
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
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${error.message}</p>`;
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
            allAdminUsers.map(u => `<option value="${u._id}">${u.name} (${u.email})</option>`).join('');
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
                <td data-label="${isEN ? 'Name' : 'الاسم'}">${u.name}</td>
                <td data-label="${isEN ? 'Email' : 'البريد'}">${u.email}</td>
                <td data-label="${isEN ? 'Phone' : 'الهاتف'}">${u.phone || '—'}</td>
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
        updateNavAuth(document.documentElement.lang === 'en');
        window.location.href = 'login.html';
    }
};

function updateNavAuth(isEN) {
    const userName = localStorage.getItem('nibras_user_name');
    if (!userName) return;

    const firstName = userName.split(' ')[0];
    const profileUrl = isEN ? '/pages/en/profile.html' : '/pages/ar/profile.html';
    
    // Try by ID first
    let navAuth = document.getElementById('navAuth');
    let mobileNavAuth = document.getElementById('mobileNavAuth');
    
    // Fallback: search for links containing "login.html"
    if (!navAuth) {
        const loginLinks = Array.from(document.querySelectorAll('.nav-links a[href*="login.html"]'));
        const desktopLogin = loginLinks.find(l => !l.classList.contains('mobile-btn'));
        if (desktopLogin) navAuth = desktopLogin.parentElement;
    }
    if (!mobileNavAuth) {
        const mobileLoginLinks = Array.from(document.querySelectorAll('.mobile-menu a[href*="login.html"], .mobile-menu .mobile-btn'));
        if (mobileLoginLinks.length > 0) {
            mobileNavAuth = mobileLoginLinks[0].parentElement;
        }
    }

    if (navAuth) {
        navAuth.innerHTML = `<a href="${profileUrl}" class="nav-btn"><i class="fas fa-user-circle"></i> ${firstName}</a>`;
    }
    if (mobileNavAuth) {
        mobileNavAuth.innerHTML = `<a href="${profileUrl}" class="mobile-btn"><i class="fas fa-user-circle"></i> ${firstName}</a>`;
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
    toast.style.background = isError ? '#e74c3c' : '#2ecc71';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- Cart & Modal Logic ---
function getCart() {
    return JSON.parse(localStorage.getItem('nibras_cart') || '[]');
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

    cartItemsEls.forEach((el) => {
        if (!cart.length) {
            el.innerHTML = '<p style="text-align:center; padding:12px;">Cart is empty</p>';
            return;
        }

        el.innerHTML = cart.map(item => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #eee;">
                <div>
                    <div style="font-weight:600;">${item.name}</div>
                    <small>${formatPrice(item.price)} x ${item.qty}</small>
                </div>
                <button onclick="removeFromCart('${item.id}')" style="border:none; background:none; color:#c00; cursor:pointer;">×</button>
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
        existing.qty += 1;
    } else {
        cart.push({ id, name, price: Number(price) || 0, qty: 1 });
    }
    saveCart(cart);
    updateCartBadge();
    renderCart();
    showToast('تمت الإضافة إلى السلة');
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

