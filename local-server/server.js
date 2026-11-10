// Nibras local attendance server.
//
// Runs on a computer inside the academy. Employees' phones reach it over the academy Wi-Fi, so
// attendance keeps working when the internet is down. Scans are saved on this computer and sent
// to the cloud system as soon as the internet is back; sending the same scans twice adds nothing.
//
// Settings: local-server/config.json (copy config.example.json). Start: node server.js

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const DIR = __dirname;
const DATA = path.join(DIR, 'data');
const CONFIG_FILE = path.join(DIR, 'config.json');
const SCANS = path.join(DATA, 'scans.jsonl');
const STATE = path.join(DATA, 'state.json');
const STEP_MS = 30 * 1000;

if (!fs.existsSync(CONFIG_FILE)) {
    console.error('config.json is missing. Copy config.example.json to config.json and fill it in.');
    process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
for (const k of ['cloudUrl', 'syncSecret', 'kioskKey']) {
    if (!config[k]) {
        console.error(`config.json: "${k}" is required.`);
        process.exit(1);
    }
}
fs.mkdirSync(DATA, { recursive: true });

// ---- state kept on disk ----

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(STATE, 'utf8'));
    } catch {
        return { stationSecret: crypto.randomBytes(32).toString('hex'), synced: {}, revoked: [], lastSync: null, lastSyncError: null };
    }
}
let state = loadState();
const saveState = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
saveState();

function readScans() {
    if (!fs.existsSync(SCANS)) return [];
    return fs.readFileSync(SCANS, 'utf8').split('\n').filter(Boolean).map((l) => {
        try {
            return JSON.parse(l);
        } catch {
            return null;
        }
    }).filter(Boolean);
}

// ---- signatures (same rules as lib/attendance.js on the cloud) ----

const hmac = (key, data, enc = 'base64url') => crypto.createHmac('sha256', key).update(data).digest(enc);
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const stepAt = (t = Date.now()) => Math.floor(t / STEP_MS);
const stationToken = (step) => hmac(state.stationSecret, `local:${step}`).slice(0, 22);

function verifyCode(token, step) {
    const s = Number(step);
    const now = stepAt();
    return Number.isInteger(s) && s <= now && now - s <= 2 && safeEqual(stationToken(s), String(token || ''));
}

// The phone's pairing token, issued by the cloud and signed with the shared secret
function verifyDevice(token) {
    const [body, mac] = String(token || '').split('.');
    if (!body || !mac || !safeEqual(hmac(config.syncSecret, body), mac)) return null;
    try {
        return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
}

// ---- addresses ----

function lanAddress() {
    if (config.localUrl) return config.localUrl.replace(/\/$/, '');
    for (const list of Object.values(os.networkInterfaces())) {
        for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return `http://${a.address}:${config.port || 4000}`;
    }
    return `http://localhost:${config.port || 4000}`;
}

// ---- pages ----

const page = (title, body, script = '') => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,Tahoma,sans-serif;margin:0;background:#fbf7f0;color:#1d1416;display:grid;place-items:center;min-height:100vh;text-align:center}main{padding:24px;max-width:520px}h1{color:#5a020e}.big{font-size:1.4rem}.ok{color:#1f7a4d}.err{color:#b42318}button,a.btn{font:inherit;background:#5a020e;color:#fff;border:0;border-radius:10px;padding:12px 22px;text-decoration:none;display:inline-block;cursor:pointer}#qr svg{width:min(70vmin,520px);height:auto;background:#fff;padding:12px;border-radius:12px}.muted{color:#62555a}</style></head>
<body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;

const kioskPage = () => page('Nibras attendance', `<h1>${config.stationName || 'الحضور والانصراف'}</h1><p class="muted">امسح الرمز بكاميرا هاتفك · Scan with your phone camera</p><div id="qr"></div><p id="clock" class="big"></p><p id="sync" class="muted"></p>`,
    `const key=new URLSearchParams(location.search).get('key');
async function tick(){try{const r=await fetch('/code?key='+encodeURIComponent(key));const d=await r.json();document.getElementById('qr').innerHTML=d.svg;document.getElementById('sync').textContent=d.pending?('بانتظار المزامنة: '+d.pending):'';setTimeout(tick,d.refreshInMs+200);}catch(e){setTimeout(tick,3000);}}
setInterval(()=>{document.getElementById('clock').textContent=new Date().toLocaleTimeString('ar-EG');},1000);tick();`);

const scanPage = () => page('Nibras attendance', `<h1>الحضور والانصراف</h1><p id="msg" class="big">جاري التسجيل…</p><p id="pair"></p>`,
    `const q=new URLSearchParams(location.search);const token=localStorage.getItem('nibras_device');
const msg=document.getElementById('msg');
if(!token){msg.textContent='هذا الهاتف غير مربوط بعد. اربطه مرة واحدة وأنت متصل بالإنترنت.';document.getElementById('pair').innerHTML='<a class="btn" href="/pair">ربط الهاتف</a>';}
else fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:token,t:q.get('t'),w:q.get('w')})}).then(r=>r.json().then(d=>({ok:r.ok,d}))).then(({ok,d})=>{msg.className='big '+(ok?'ok':'err');msg.textContent=ok?('تم تسجيل '+d.name+' الساعة '+new Date(d.at).toLocaleTimeString('ar-EG')):d.message;}).catch(()=>{msg.className='big err';msg.textContent='تعذر الاتصال بجهاز الحضور.';});`);

const pairedPage = () => page('Nibras attendance', `<h1>ربط الهاتف</h1><p id="msg" class="big"></p>`,
    `const t=new URLSearchParams(location.hash.slice(1)).get('token');const m=document.getElementById('msg');
if(t){localStorage.setItem('nibras_device',t);m.className='big ok';m.textContent='تم ربط الهاتف. يمكنك الآن مسح رمز الحضور حتى بدون إنترنت.';history.replaceState(null,'',location.pathname);}else{m.className='big err';m.textContent='لم يكتمل الربط.';}`);

// ---- requests ----

function send(res, status, body, type = 'application/json; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readBody(req) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', (c) => {
            data += c;
            if (data.length > 10000) req.destroy();
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(data || '{}'));
            } catch {
                resolve({});
            }
        });
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const kioskOk = safeEqual(String(url.searchParams.get('key') || ''), String(config.kioskKey)) || false;

    if (req.method === 'GET' && url.pathname === '/kiosk') {
        return kioskOk ? send(res, 200, kioskPage(), 'text/html; charset=utf-8') : send(res, 404, 'Not found', 'text/plain');
    }
    if (req.method === 'GET' && url.pathname === '/code') {
        if (!kioskOk) return send(res, 404, { message: 'Not found' });
        const step = stepAt();
        const link = `${lanAddress()}/scan?t=${stationToken(step)}&w=${step}`;
        const svg = await QRCode.toString(link, { type: 'svg', margin: 1, color: { dark: '#5a020e' } });
        const pending = readScans().filter((s) => !state.synced[s.id]).length;
        return send(res, 200, { svg, step, pending, refreshInMs: STEP_MS - (Date.now() % STEP_MS) });
    }
    if (req.method === 'GET' && url.pathname === '/scan') return send(res, 200, scanPage(), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/paired') return send(res, 200, pairedPage(), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/pair') {
        // Pairing happens once, online: the cloud portal signs a token for the signed-in employee
        res.writeHead(302, { Location: `${config.cloudUrl.replace(/\/$/, '')}/portal/attend/pair?return=${encodeURIComponent(`${lanAddress()}/paired`)}` });
        return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/api/scan') {
        const body = await readBody(req);
        const device = verifyDevice(body.device);
        if (!device || !device.u) return send(res, 401, { message: 'الهاتف غير مربوط. اضغط "ربط الهاتف".' });
        if (state.revoked.includes(device.u)) return send(res, 403, { message: 'هذا الحساب غير نشط.' });
        if (!verifyCode(body.t, body.w)) return send(res, 400, { message: 'انتهت صلاحية الرمز. امسح الرمز الظاهر على الشاشة الآن.' });
        const scan = { id: crypto.randomUUID(), user: device.u, name: device.n, at: new Date().toISOString(), device: String(req.headers['user-agent'] || '').slice(0, 100) };
        fs.appendFileSync(SCANS, `${JSON.stringify(scan)}\n`);
        setTimeout(syncNow, 1000);
        return send(res, 200, { ok: true, name: device.n, at: scan.at });
    }
    if (req.method === 'GET' && url.pathname === '/status') {
        if (!kioskOk) return send(res, 404, { message: 'Not found' });
        const scans = readScans();
        return send(res, 200, { scans: scans.length, pending: scans.filter((s) => !state.synced[s.id]).length, lastSync: state.lastSync, lastSyncError: state.lastSyncError, address: lanAddress() });
    }
    send(res, 404, 'Not found', 'text/plain');
});

// ---- sync to the cloud ----

let syncing = false;
async function syncNow() {
    if (syncing) return;
    syncing = true;
    try {
        const pending = readScans().filter((s) => !state.synced[s.id]).slice(0, 500);
        if (!pending.length) return;
        const payload = { server: config.stationName || os.hostname(), scans: pending.map(({ id, user, at, device }) => ({ id, user, at, device })) };
        const body = JSON.stringify(payload);
        const res = await fetch(`${config.cloudUrl.replace(/\/$/, '')}/api/v2/attendance/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-nibras-signature': hmac(config.syncSecret, body, 'hex') },
            body,
            signal: AbortSignal.timeout(15000)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
        for (const id of data.accepted || []) state.synced[id] = 'ok';
        for (const r of data.rejected || []) state.synced[r.id] = 'rejected';
        state.revoked = [...new Set([...(state.revoked || []), ...(data.revoked || [])])];
        state.lastSync = new Date().toISOString();
        state.lastSyncError = null;
        saveState();
        console.log(`Synced ${data.accepted.length} scans (${(data.rejected || []).length} rejected).`);
    } catch (err) {
        state.lastSyncError = `${new Date().toISOString()} ${err.message}`;
        saveState();
    } finally {
        syncing = false;
    }
}
setInterval(syncNow, 60 * 1000);

const port = Number(config.port) || 4000;
server.listen(port, '0.0.0.0', () => {
    console.log(`Nibras local attendance server on ${lanAddress()}`);
    console.log(`Kiosk screen: ${lanAddress()}/kiosk?key=${config.kioskKey}`);
    syncNow();
});
