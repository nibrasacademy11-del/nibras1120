// One certificate on the customer's website page: the issued design (frozen when it was issued),
// a QR code to its public verification, and "Download PDF" (an A4 landscape file made in the
// browser, so Arabic text and the academy's fonts come out exactly as on screen).
// Uses apiFetch and esc from script.js. The PDF libraries load only when they are needed.

(function () {
    const isEN = document.documentElement.lang === 'en';
    const L = isEN ? 'en' : 'ar';
    const T = isEN
        ? { loading: 'Loading your certificate…', notFound: 'This certificate is not available.', back: 'My certificates', download: 'Download PDF', print: 'Print', verify: 'Verify', making: 'Preparing the PDF…', failed: 'The PDF could not be made. Try again, or use Print and choose "Save as PDF".', hours: (n) => `${n} training hours` }
        : { loading: 'جارٍ تحميل شهادتك…', notFound: 'هذه الشهادة غير متاحة.', back: 'شهاداتي', download: 'تحميل PDF', print: 'طباعة', verify: 'تحقق', making: 'جارٍ تجهيز ملف PDF…', failed: 'تعذر تجهيز الملف. حاول مرة أخرى، أو اضغط طباعة واختر «حفظ بصيغة PDF».', hours: (n) => `بعدد ${n} ساعة تدريبية` };
    const LIBS = {
        qr: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
        canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        pdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        // the academy's sheets are pictured exactly as the browser draws them (html2canvas moves text)
        image: 'https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js'
    };
    const $ = (id) => document.getElementById(id);
    const h = (v) => esc(v == null ? '' : String(v));
    const loaded = {};
    const load = (src) => (loaded[src] = loaded[src] || new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Could not load ${src}`));
        document.head.appendChild(s);
    }));

    async function qrImage(url, color) {
        try {
            await load(LIBS.qr);
            const qr = window.qrcode(0, 'M');
            qr.addData(url);
            qr.make();
            // drawn on a canvas as a PNG in the certificate's colour (the PDF step cannot draw SVG images)
            const n = qr.getModuleCount();
            const cell = 8;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = n * cell;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
            return canvas.toDataURL('image/png');
        } catch {
            return '';
        }
    }

    // The A4 sheet, the same layout the staff portal prints. The academy's designed sheet comes
    // from cert-nibras.js (shared with the portal); the earlier framed one is drawn here.
    function sheet(c, d, qr) {
        if (d.layout === 'nibras' && window.NibrasCertificate) return window.NibrasCertificate.sheet(c, d, { qr });
        const ar = d.language !== 'en';
        const en = d.language !== 'ar';
        const bg = d.background ? `background-image:url('${h(d.background)}');` : '';
        const accs = d.showAccreditations && (c.accreditations || []).length
            ? `<div class="cert-accreditations">${c.accreditations.map((a) => `<div class="cert-acc">${a.logo ? `<img src="${h(a.logo)}" alt="" crossorigin="anonymous">` : ''}<span>${h(ar ? a.nameAr : a.nameEn || a.nameAr)}${a.number ? ` · ${h(a.number)}` : ''}</span></div>`).join('')}</div>`
            : '';
        const signs = (d.signatures || []).map((s) => `<div class="cert-sign">${s.image ? `<img src="${h(s.image)}" alt="" crossorigin="anonymous">` : '<span class="cert-sign-line"></span>'}<strong>${h(ar ? s.nameAr : s.nameEn || s.nameAr)}</strong><small>${h(ar ? s.titleAr : s.titleEn || s.titleAr)}</small></div>`).join('');
        return `
        <div class="cert-sheet" style="--c-primary:${h(d.primaryColor)};--c-accent:${h(d.accentColor)};${bg}">
            <div class="cert-frame">
                <header class="cert-head">
                    <img src="${h(d.logo)}" alt="" class="cert-logo">
                    <div class="cert-titles">${ar ? `<h1 dir="rtl">${h(d.titleAr)}</h1>` : ''}${en ? `<h2 dir="ltr">${h(d.titleEn)}</h2>` : ''}</div>
                    ${qr ? `<img src="${qr}" alt="QR" class="cert-qr">` : '<span class="cert-qr"></span>'}
                </header>
                <div class="cert-body">
                    ${ar ? `<p dir="rtl" class="cert-intro">${h(d.introAr)}</p>` : ''}
                    ${en ? `<p dir="ltr" class="cert-intro">${h(d.introEn)}</p>` : ''}
                    ${ar ? `<div dir="rtl" class="cert-name">${h(c.trainee_name)}</div>` : ''}
                    ${en && (c.nameEn || !ar) ? `<div dir="ltr" class="cert-name cert-name--en">${h(c.nameEn || c.trainee_name)}</div>` : ''}
                    ${ar ? `<p dir="rtl" class="cert-text">${h(d.bodyAr)}</p>` : ''}
                    ${en ? `<p dir="ltr" class="cert-text">${h(d.bodyEn)}</p>` : ''}
                    ${d.showHours && c.hours > 0 ? `<p class="cert-meta">${ar ? `<span dir="rtl">${h(T.hours(c.hours))}</span>` : ''}${ar && en ? ' · ' : ''}${en ? `<span dir="ltr">${c.hours} training hours</span>` : ''}</p>` : ''}
                </div>
                ${accs}
                <footer class="cert-foot">
                    <div class="cert-facts" dir="ltr"><span>No. <strong>${h(c.cert_num)}</strong></span><span>${h(c.issue_date)}</span></div>
                    <div class="cert-signatures">${signs}</div>
                    ${d.footerAr || d.footerEn ? `<p class="cert-footer-text">${h(ar ? d.footerAr : d.footerEn)}</p>` : ''}
                </footer>
            </div>
        </div>`;
    }

    // Shows the real-size sheet scaled down to the screen
    function fit() {
        const box = $('certBox');
        const inner = $('certScaled');
        if (!box || !inner) return;
        // A4 landscape is 1123 x 794 px; the diploma is portrait (794 x 1123)
        const portrait = !!inner.querySelector('.ncert--portrait');
        const [w, h] = portrait ? [794, 1123] : [1123, 794];
        box.style.maxWidth = portrait ? '210mm' : '';
        inner.style.width = portrait ? '210mm' : '';
        const scale = Math.min(1, box.clientWidth / w);
        inner.style.transform = `scale(${scale})`;
        box.style.height = `${h * scale}px`;
    }

    async function download(btn, num, fileName) {
        const label = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="pf-spinner" aria-hidden="true"></span> ${h(T.making)}`;
        try {
            const nibras = !!$('certScaled').querySelector('.ncert');
            await Promise.all([load(nibras ? LIBS.image : LIBS.canvas), load(LIBS.pdf)]);
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            // the real-size sheet, off screen, so the picture is sharp whatever the screen size
            const holder = document.createElement('div');
            holder.className = 'cert-render';
            holder.innerHTML = $('certScaled').innerHTML;
            document.body.appendChild(holder);
            const canvas = nibras
                ? await window.htmlToImage.toCanvas(holder.firstElementChild, { pixelRatio: 3, backgroundColor: '#ffffff' })
                : await window.html2canvas(holder.firstElementChild, { scale: 3, useCORS: true, backgroundColor: '#fffdf8', logging: false });
            holder.remove();
            const { jsPDF } = window.jspdf;
            const portrait = !!holder.querySelector('.ncert--portrait') || canvas.height > canvas.width;
            const pdf = new jsPDF({ orientation: portrait ? 'portrait' : 'landscape', unit: 'mm', format: 'a4', compress: true });
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, portrait ? 210 : 297, portrait ? 297 : 210);
            pdf.setProperties({ title: `Nibras Academy certificate ${num}`, author: 'Nibras Academy' });
            pdf.save(`${fileName || `Nibras-certificate-${num}`}.pdf`);
        } catch (e) {
            console.error('The certificate PDF could not be made:', String((e && (e.message || e.type)) || e));
            showToast(T.failed, true);
        } finally {
            btn.disabled = false;
            btn.innerHTML = label;
        }
    }

    async function boot() {
        const main = $('certPage');
        // the language switch keeps the certificate open
        document.querySelectorAll('.lang-switch-btn').forEach((el) => { el.href = `${el.getAttribute('href').split('?')[0]}${window.location.search}`; });
        const id = new URLSearchParams(window.location.search).get('id') || '';
        main.innerHTML = `<div class="pf-loading"><span class="pf-spinner" aria-hidden="true"></span>${h(T.loading)}</div>`;
        let data;
        try {
            data = await apiFetch(`/api/v2/certificates/${encodeURIComponent(id)}`);
        } catch (e) {
            if (e.status === 401) {
                window.location.replace(`/pages/${L}/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                return;
            }
            main.innerHTML = `<div class="pf-empty"><i class="fas fa-award" aria-hidden="true"></i><p>${h(T.notFound)}</p><a class="pf-btn" href="/pages/${L}/profile.html#certificates">${h(T.back)}</a></div>`;
            return;
        }
        const c = data.item;
        const d = c.design || {};
        const verifyUrl = isEN ? data.verifyUrlEn || data.verifyUrl : data.verifyUrl;
        const nibras = d.layout === 'nibras' && window.NibrasCertificate;
        const qr = await qrImage(verifyUrl, nibras ? window.NibrasCertificate.qrColor(d, c) : d.primaryColor || '#5a020e');
        // saved (and printed) under the trainee's name, the kind and the program
        const fileName = nibras ? window.NibrasCertificate.fileName(c, d) : `Nibras-certificate-${c.cert_num}`;
        if (nibras) document.title = fileName;
        if (d.layout === 'nibras' && document.fonts && document.fonts.ready) await document.fonts.ready;
        main.innerHTML = `
            <div class="cert-toolbar">
                <a class="pf-btn pf-btn--ghost" href="/pages/${L}/profile.html#certificates"><i class="fas fa-arrow-${isEN ? 'left' : 'right'}" aria-hidden="true"></i> ${h(T.back)}</a>
                <span class="cert-toolbar__gap"></span>
                <a class="pf-btn pf-btn--ghost" href="${h(verifyUrl)}"><i class="fas fa-shield-halved" aria-hidden="true"></i> ${h(T.verify)}</a>
                <button type="button" class="pf-btn pf-btn--ghost" id="certPrint"><i class="fas fa-print" aria-hidden="true"></i> ${h(T.print)}</button>
                <button type="button" class="pf-btn" id="certDownload"><i class="fas fa-file-arrow-down" aria-hidden="true"></i> ${h(T.download)}</button>
            </div>
            <div class="cert-box" id="certBox"><div class="cert-scaled" id="certScaled">${sheet(c, d, qr)}</div></div>`;
        fit();
        window.addEventListener('resize', fit);
        $('certPrint').addEventListener('click', () => window.print());
        $('certDownload').addEventListener('click', (ev) => download(ev.currentTarget, c.cert_num, fileName));
    }

    document.addEventListener('DOMContentLoaded', () => {
        if ($('certPage')) boot();
    });
})();
