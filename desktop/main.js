// Nibras desktop app: the admin portal in its own window.
// It is not a separate system: it opens the same portal, with the same server, data and permissions.
// What it adds: a desktop window, real "Save as PDF" (A4) and printing, and offline/retry handling.

const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

const SITE = (process.env.NIBRAS_URL || readConfig().siteUrl || 'https://www.nibras-ac.com').replace(/\/$/, '');
const ORIGIN = new URL(SITE).origin;
const START = `${SITE}/portal/`;
const STAFF_ROLES = ['super_admin', 'admin', 'hr_manager', 'finance_manager', 'team_leader', 'employee', 'accountant', 'customer_support'];

function readConfig() {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    } catch {
        return {};
    }
}

// ---- window size remembered between runs ----
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
const loadBounds = () => {
    try {
        return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    } catch {
        return { width: 1360, height: 860 };
    }
};
const saveBounds = (win) => {
    try {
        fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getBounds(), maximized: win.isMaximized() }));
    } catch {
        // not important
    }
};

let win;

function createWindow() {
    const bounds = loadBounds();
    win = new BrowserWindow({
        ...bounds,
        minWidth: 900,
        minHeight: 600,
        title: 'Nibras Admin',
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#fbf7f0',
        autoHideMenuBar: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false
        }
    });
    if (bounds.maximized) win.maximize();
    win.on('close', () => saveBounds(win));

    // Only the academy's own site opens inside the app; everything else goes to the normal browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (new URL(url).origin === ORIGIN) return { action: 'allow' };
        if (/^https?:/.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
        if (new URL(url).origin !== ORIGIN && !url.startsWith('file:')) {
            e.preventDefault();
            if (/^https?:/.test(url)) shell.openExternal(url);
        }
    });

    // No internet or the site is down: show a page with a retry button instead of a blank window
    win.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
        if (isMainFrame && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: START } });
    });

    // The desktop app is for staff; customers use the website portal
    win.webContents.on('did-finish-load', async () => {
        const url = win.webContents.getURL();
        if (!url.startsWith(`${SITE}/portal`)) return;
        try {
            const me = await win.webContents.executeJavaScript("fetch('/api/v2/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).catch(()=>null)");
            if (me && me.user && !STAFF_ROLES.includes(me.user.role)) {
                await dialog.showMessageBox(win, { type: 'info', message: 'هذا التطبيق مخصص لإدارة وموظفي الأكاديمية. يمكنك متابعة حسابك من الموقع.', detail: 'This app is for academy staff. Please use the website portal.' });
                await win.webContents.executeJavaScript("fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'})");
                win.loadURL(START);
            }
        } catch {
            // the page will show its own sign-in
        }
    });

    win.loadURL(START);
}

// A real A4 PDF of the current page, using the page's print layout
async function saveAsPdf() {
    if (!win) return;
    const landscape = await win.webContents.executeJavaScript("document.body.classList.contains('print-landscape') || !!document.querySelector('.cert-sheet') || !!document.querySelector('.report-landscape')").catch(() => false);
    const title = (win.webContents.getTitle() || 'nibras').replace(/[\\/:*?"<>|]+/g, '_');
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
        defaultPath: path.join(app.getPath('documents'), `${title}-${new Date().toISOString().slice(0, 10)}.pdf`),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return;
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', landscape, printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(filePath, pdf);
    shell.showItemInFolder(filePath);
}

function buildMenu() {
    const template = [
        {
            label: 'ملف / File',
            submenu: [
                { label: 'حفظ PDF (A4) / Save as PDF', accelerator: 'CmdOrCtrl+Shift+S', click: saveAsPdf },
                { label: 'طباعة / Print', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print({ printBackground: true }) },
                { type: 'separator' },
                { label: 'الرئيسية / Home', accelerator: 'Alt+Home', click: () => win && win.loadURL(START) },
                { label: 'فتح الموقع / Open website', click: () => shell.openExternal(SITE) },
                { type: 'separator' },
                { role: 'quit', label: 'خروج / Quit' }
            ]
        },
        { label: 'تحرير / Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
        {
            label: 'عرض / View',
            submenu: [
                { role: 'reload', label: 'تحديث / Reload' },
                { label: 'رجوع / Back', accelerator: 'Alt+Left', click: () => win && win.webContents.navigationHistory.canGoBack() && win.webContents.navigationHistory.goBack() },
                { type: 'separator' },
                { role: 'zoomIn', label: 'تكبير / Zoom in' },
                { role: 'zoomOut', label: 'تصغير / Zoom out' },
                { role: 'resetZoom', label: 'الحجم الطبيعي / Actual size' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'ملء الشاشة / Full screen' },
                ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// One window only: opening the app again focuses it
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });
    app.whenReady().then(() => {
        // The portal needs no camera, microphone, location or notifications from the desktop
        session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'clipboard-sanitized-write'));
        buildMenu();
        createWindow();
    });
    app.on('window-all-closed', () => app.quit());
}
