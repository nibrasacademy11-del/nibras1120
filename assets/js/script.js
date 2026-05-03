/* ============================================
   Nibras Academy - Frontend Script (API Version)
   ============================================ */

let adminCertificates = [];

document.addEventListener('DOMContentLoaded', () => {
    const isEN = document.documentElement.lang === 'en';
    const path = window.location.pathname.toLowerCase();
    const isAdminPagePath = path.endsWith('/admin.html');
    const isProfilePath = path.endsWith('/profile.html');

    cleanupDuplicateIds(['cartSidebar', 'cartOverlay', 'cartItems', 'cartTotal', 'cartBadge']);
    initLayout();
    initCounters();
    updateCartBadge();
    initVerifyForm(isEN);
    initPublicAuth(isEN, isAdminPagePath);
    if (isAdminPagePath) initAdminPanel(isEN);
    if (isProfilePath) initProfile(isEN);

    // Update Navigation based on login state
    updateNavAuth(isEN);
});

function updateNavAuth(isEN) {
    const userName = localStorage.getItem('nibras_user_name');
    // All login/profile anchor links in navbar and mobile menu
    const loginLinks = document.querySelectorAll(
        'a[href="pages/ar/login.html"], a[href="login.html"], a[href$="profile.html"]'
    );
    loginLinks.forEach(el => {
        if (userName) {
            // User IS logged in → show "حسابي"
            const newHref = el.href.includes('pages/ar/') ? 'pages/ar/profile.html' : 'profile.html';
            el.href = newHref;
            el.innerHTML = `<i class="fas fa-user-circle"></i> ${isEN ? 'My Account' : 'حسابي'}`;
        } else {
            // User NOT logged in → show "تسجيل الدخول"
            const newHref = el.href.includes('pages/ar/') ? 'pages/ar/login.html' : 'login.html';
            el.href = newHref;
            el.innerHTML = isEN ? 'Login' : 'تسجيل الدخول';
        }
    });
}

window.logout = async () => {
    try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch(err) {}
    localStorage.removeItem('nibras_user_name');
    // Update navbar immediately before redirect
    updateNavAuth(document.documentElement.lang === 'en');
    window.location.href = 'login.html';
};

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
                if(data && data.user) localStorage.setItem('nibras_user_name', data.user.name);
                showToast(isEN ? 'Account created successfully.' : 'تم إنشاء الحساب بنجاح.');
                setTimeout(() => {
                    window.location.href = 'profile.html';
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
                if(data && data.user) localStorage.setItem('nibras_user_name', data.user.name);
                showToast(isEN ? 'Login successful.' : 'تم تسجيل الدخول بنجاح.');
                setTimeout(() => {
                    if (data.user && data.user.role === 'admin') {
                        window.location.href = 'admin.html';
                    } else {
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
        resultDiv.innerHTML = `<p>${isEN ? 'Checking...' : 'جاري التحقق...'}</p>`;
        try {
            const data = await apiFetch(`/api/certificates/${encodeURIComponent(code)}`);
            const cert = data.certificate;
            resultDiv.innerHTML = `
                <div style="padding:22px; background:linear-gradient(135deg,#fff,#f8f9fb); border-radius:14px; border:1px solid #e6e8ef; box-shadow:0 8px 20px rgba(0,0,0,0.06); text-align:${isEN ? 'left' : 'right'};">
                    <h3 style="color:var(--primary-color); margin-bottom:14px; font-size:1.2rem;">
                        ${isEN ? 'Certificate verified successfully' : 'تم التحقق من الشهادة بنجاح'} ✓
                    </h3>
                    <p style="margin:8px 0;"><strong>${isEN ? 'Name' : 'الاسم'}:</strong> ${cert.trainee_name}</p>
                    <p style="margin:8px 0;"><strong>${isEN ? 'Program' : 'البرنامج'}:</strong> ${cert.program_name}</p>
                    <p style="margin:8px 0;"><strong>${isEN ? 'Issue date' : 'تاريخ الإصدار'}:</strong> ${cert.issue_date}</p>
                    ${cert.pdf_url ? `<a href="${cert.pdf_url}" target="_blank" download style="display:inline-block; margin-top:15px; padding:10px 16px; border-radius:10px; background:var(--primary-color,#7a1c28); color:#fff; text-decoration:none;">${isEN ? 'Download PDF certificate' : 'تنزيل نسخة PDF'}</a>` : ''}
                </div>
            `;
        } catch (error) {
            resultDiv.innerHTML = `<p style="color:#b42318; font-weight:600;">${error.message}</p>`;
        }
    });
}

async function initAdminPanel(isEN) {
    const loginForm = document.getElementById('loginForm');
    const adminCertForm = document.getElementById('adminCertForm');
    const loginPage = document.getElementById('loginPage');
    const dashboard = document.getElementById('dashboard');

    try {
        const data = await apiFetch('/api/auth/me');
        if (data.user && data.user.role === 'admin') {
            if (loginPage) loginPage.style.display = 'none';
            if (dashboard) dashboard.classList.add('active');
            const adminUserEl = document.getElementById('adminUser');
            if (adminUserEl) adminUserEl.textContent = data.user.name || 'الأدمن';
            await renderAdminCerts(isEN);
            await renderAdminUsers(isEN);
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
                    showToast(isEN ? 'Unauthorized.' : 'ليس لديك صلاحية الأدمن.', true);
                    return;
                }
                window.location.reload();
            } catch (error) {
                showToast(error.message, true);
            }
        });
    }

    if (adminCertForm) {
        adminCertForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.append('certNum', document.getElementById('adminCertNum').value.trim());
            formData.append('traineeName', document.getElementById('adminTraineeName').value.trim());
            formData.append('programName', document.getElementById('adminProgramName').value.trim());
            formData.append('field', document.getElementById('adminField').value.trim());
            formData.append('issueDate', document.getElementById('adminIssueDate').value);
            const pdfInput = document.getElementById('adminPdfFile');
            if (pdfInput && pdfInput.files && pdfInput.files[0]) {
                formData.append('pdf', pdfInput.files[0]);
            }

            try {
                await apiFetch('/api/admin/certificates', {
                    method: 'POST',
                    body: formData
                });
                adminCertForm.reset();
                showToast(isEN ? 'Certificate added successfully.' : 'تمت إضافة الشهادة بنجاح.');
                await renderAdminCerts(isEN);
            } catch (error) {
                showToast(error.message, true);
            }
        });
    }
}

async function renderAdminCerts(isEN) {
    const container = document.getElementById('certsTableContainer') || document.getElementById('addedCertsContainer');
    if (!container) return;
    try {
        const data = await apiFetch('/api/admin/certificates');
        adminCertificates = data.certificates || [];
    } catch (error) {
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${error.message}</p>`;
        return;
    }

    if (!adminCertificates.length) {
        container.innerHTML = `<p style="text-align:center; padding:20px;">${isEN ? 'No certificates found.' : 'لا توجد شهادات مسجلة حالياً.'}</p>`;
        return;
    }

    const rows = adminCertificates.map((c) => `
        <tr style="background:#fff; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
            <td style="padding:12px;">${c.trainee_name}</td>
            <td style="padding:12px; font-weight:700; color:#7a1c28;">${c.cert_num}</td>
            <td style="padding:12px;">${c.issue_date}</td>
            <td style="padding:12px;">${c.pdf_url ? `<a href="${c.pdf_url}" target="_blank" download style="color:#0f766e; text-decoration:none; font-weight:600;">${isEN ? 'Download' : 'تحميل'}</a>` : `<span style="color:#999;">${isEN ? 'N/A' : 'غير مرفق'}</span>`}</td>
            <td style="padding:12px;">
                <button onclick="window.deleteCert('${c._id}')" style="color:#b42318; background:#fff0f0; border:1px solid #ffd6d6; border-radius:8px; padding:6px 10px; cursor:pointer;">${isEN ? 'Delete' : 'حذف'}</button>
            </td>
        </tr>
    `).join('');


    container.innerHTML = `
        <table class="dash-table" style="width:100%; border-collapse:separate; border-spacing:0 8px;">
            <thead>
                <tr style="background:#f8f9fa;">
                    <th style="padding:12px;">${isEN ? 'Name' : 'الاسم'}</th>
                    <th style="padding:12px;">${isEN ? 'Certificate No.' : 'رقم الشهادة'}</th>
                    <th style="padding:12px;">${isEN ? 'Issue Date' : 'التاريخ'}</th>
                    <th style="padding:12px;">PDF</th>
                    <th style="padding:12px;">${isEN ? 'Actions' : 'إدارة'}</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

async function renderAdminUsers(isEN) {
    const container = document.getElementById('usersTableContainer');
    if (!container) return;
    try {
        const data = await apiFetch('/api/auth/users');
        const users = data.users || [];

        if (!users.length) {
            container.innerHTML = `<p style="text-align:center; padding:20px;">${isEN ? 'No registered users.' : 'لا يوجد عملاء مسجلين حالياً.'}</p>`;
            return;
        }

        const rows = users.map(u => {
            const role = u.role === 'admin' ? (isEN ? 'Admin' : 'مدير') : (isEN ? 'Student' : 'طالب');
            const date = new Date(u.createdAt || Date.now()).toLocaleDateString('ar-EG');
            return `
                <tr style="background:#fff; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
                    <td style="padding:12px;">${u.name}</td>
                    <td style="padding:12px;">${u.email}</td>
                    <td style="padding:12px;">${u.phone || '—'}</td>
                    <td style="padding:12px;"><span style="background:${u.role === 'admin' ? '#fef3c7' : '#dbeafe'}; color:${u.role === 'admin' ? '#92400e' : '#1e40af'}; padding:4px 12px; border-radius:50px; font-size:0.85rem; font-weight:600;">${role}</span></td>
                    <td style="padding:12px;">${date}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <p style="margin-bottom:15px; color:#666; font-size:0.9rem;">${isEN ? 'Total registered:' : 'إجمالي المسجلين:'} <strong>${users.length}</strong></p>
            <table class="dash-table" style="width:100%; border-collapse:separate; border-spacing:0 8px;">
                <thead>
                    <tr style="background:#f8f9fa;">
                        <th style="padding:12px;">${isEN ? 'Name' : 'الاسم'}</th>
                        <th style="padding:12px;">${isEN ? 'Email' : 'البريد الإلكتروني'}</th>
                        <th style="padding:12px;">${isEN ? 'Phone' : 'الهاتف'}</th>
                        <th style="padding:12px;">${isEN ? 'Role' : 'الدور'}</th>
                        <th style="padding:12px;">${isEN ? 'Joined' : 'تاريخ التسجيل'}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#b42318;">${error.message}</p>`;
    }
}

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

async function initProfile(isEN) {
    const profileContent = document.getElementById('profileContent');
    if (!profileContent) return;
    try {
        const data = await apiFetch('/api/auth/me');
        if (!data || !data.user) throw new Error('Not logged in');
        const user = data.user;
        const roleText = user.role === 'admin' ? 'مدير (Admin)' : 'طالب (Student)';
        const dateText = new Date(user.createdAt || Date.now()).toLocaleDateString('ar-EG');
        
        profileContent.innerHTML = `
            <div class="profile-header">
              <div class="profile-avatar">${user.name.charAt(0).toUpperCase()}</div>
              <div class="profile-info">
                <h2>${user.name}</h2>
                <p>${user.email}</p>
                <p style="margin-top:5px; font-size:0.9rem; color:#888;">${user.phone || ''}</p>
              </div>
            </div>
            <div class="profile-details">
              <div class="detail-item">
                <span class="detail-label">الدور (Role)</span>
                <span class="detail-value">${roleText}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">تاريخ الانضمام</span>
                <span class="detail-value">${dateText}</span>
              </div>
            </div>
            <div style="text-align: center; margin-top: 40px;">
              <button onclick="window.logout()" class="logout-btn">تسجيل الخروج <i class="fas fa-sign-out-alt"></i></button>
            </div>
        `;
    } catch(error) {
        showToast(isEN ? 'Please login first.' : 'برجاء تسجيل الدخول أولاً.', true);
        setTimeout(() => window.location.href = 'login.html', 1000);
    }
}
