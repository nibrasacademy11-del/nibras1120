// Runs the local attendance server for real (in a temporary folder) against a mock of the cloud
// sync endpoint that checks signatures exactly like modules/hr/attendanceController.js does.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const A = require('../lib/attendance');

const ROOT = path.join(__dirname, '..');
const qrcodeDir = path.join(ROOT, 'portal', 'node_modules');
const skip = fs.existsSync(path.join(qrcodeDir, 'qrcode')) ? false : 'portal/node_modules/qrcode is not installed';

test('local server: scan offline, then sync once', { skip, timeout: 30000 }, async (t) => {
    const secret = crypto.randomBytes(32).toString('hex');
    const received = [];
    let cloudUp = true;
    const cloud = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
            if (!cloudUp) { res.writeHead(503); return res.end('{}'); }
            const body = JSON.parse(raw);
            // Same check as the cloud: signature over JSON.stringify of the parsed body
            const ok = req.headers['x-nibras-signature'] === A.signBody(secret, JSON.stringify(body));
            if (!ok) { res.writeHead(401); return res.end('{"message":"Bad signature."}'); }
            const fresh = body.scans.filter((s) => !received.some((r) => r.id === s.id));
            received.push(...fresh);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ accepted: body.scans.map((s) => s.id), rejected: [], revoked: [] }));
        });
    });
    await new Promise((r) => cloud.listen(0, r));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nibras-local-'));
    fs.copyFileSync(path.join(ROOT, 'local-server', 'server.js'), path.join(dir, 'server.js'));
    const port = 40000 + Math.floor(Math.random() * 2000);
    const kioskKey = 'k-' + crypto.randomBytes(8).toString('hex');
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ cloudUrl: `http://127.0.0.1:${cloud.address().port}`, syncSecret: secret, kioskKey, stationName: 'Test', port, localUrl: `http://127.0.0.1:${port}` }));
    cloudUp = false; // start "offline"
    const child = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, NODE_PATH: qrcodeDir }, stdio: 'pipe' });
    t.after(() => { child.kill(); cloud.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) {
        try { await fetch(`${base}/status?key=${kioskKey}`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }

    // The kiosk code is only served with the key
    assert.equal((await fetch(`${base}/code?key=wrong`)).status, 404);
    const code = await (await fetch(`${base}/code?key=${kioskKey}`)).json();
    assert.match(code.svg, /^<svg/);
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'state.json'), 'utf8'));
    const step = A.stepAt();
    const tok = crypto.createHmac('sha256', state.stationSecret).update(`local:${step}`).digest('base64url').slice(0, 22);

    const device = A.sign(secret, { u: 'user-1', n: 'Sara', iat: Date.now() });
    const scan = (body) => fetch(`${base}/api/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await scan({ device: 'forged.token', t: tok, w: step })).status, 401);
    assert.equal((await scan({ device: A.sign('other-secret', { u: 'x' }), t: tok, w: step })).status, 401);
    assert.equal((await scan({ device, t: 'wrong', w: step })).status, 400);
    const ok = await scan({ device, t: tok, w: step });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).name, 'Sara');

    // Offline: the scan waits on disk
    await new Promise((r) => setTimeout(r, 1500));
    let status = await (await fetch(`${base}/status?key=${kioskKey}`)).json();
    assert.equal(status.pending, 1);
    assert.equal(received.length, 0);

    // Back online: the next scan triggers a sync that sends both, each once
    cloudUp = true;
    await scan({ device, t: tok, w: step });
    for (let i = 0; i < 30 && received.length < 2; i++) await new Promise((r) => setTimeout(r, 200));
    assert.equal(received.length, 2);
    assert.ok(received.every((s) => s.user === 'user-1'));
    status = await (await fetch(`${base}/status?key=${kioskKey}`)).json();
    assert.equal(status.pending, 0);
});
