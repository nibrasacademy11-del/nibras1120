// The Zoom connection (a Server-to-Server OAuth app on the academy's paid Zoom account).
// Settings come from the environment, never from the database:
//   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET   from the app in the Zoom App Marketplace
//   ZOOM_HOST_USER                                        the host's Zoom email (default: the app owner)
// Without them lectures still work: staff paste the meeting link and passcode by hand.

const API = 'https://api.zoom.us/v2';
const TOKEN_URL = 'https://zoom.us/oauth/token';
const TIMEOUT_MS = 10000;

let token = null;   // { value, expiresAt }

function config() {
    return {
        accountId: (process.env.ZOOM_ACCOUNT_ID || '').trim(),
        clientId: (process.env.ZOOM_CLIENT_ID || '').trim(),
        clientSecret: (process.env.ZOOM_CLIENT_SECRET || '').trim(),
        hostUser: (process.env.ZOOM_HOST_USER || '').trim() || 'me'
    };
}

const isConfigured = () => {
    const c = config();
    return !!(c.accountId && c.clientId && c.clientSecret);
};

class ZoomError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.zoomCode = code;
    }
}

async function getToken(fetchImpl = fetch) {
    if (token && token.expiresAt > Date.now() + 60000) return token.value;
    const c = config();
    if (!isConfigured()) throw new ZoomError(0, 'Zoom is not connected.');
    const res = await fetchImpl(`${TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(c.accountId)}`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new ZoomError(res.status, `Zoom sign-in failed: ${body.reason || body.error || res.status}`);
    token = { value: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
    return token.value;
}

async function request(method, path, body, fetchImpl = fetch) {
    const send = async () => fetchImpl(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${await getToken(fetchImpl)}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    let res = await send();
    if (res.status === 401) {
        token = null;   // the token was revoked or expired early: get a new one once
        res = await send();
    }
    if (res.status === 204) return null;
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new ZoomError(res.status, `Zoom: ${out.message || res.status}`, out.code);
    return out;
}

const resetToken = () => { token = null; };

const createMeeting = (payload, f) => request('POST', `/users/${encodeURIComponent(config().hostUser)}/meetings`, payload, f);
const updateMeeting = (id, payload, f) => request('PATCH', `/meetings/${encodeURIComponent(id)}`, payload, f);

async function deleteMeeting(id, f) {
    try {
        await request('DELETE', `/meetings/${encodeURIComponent(id)}`, null, f);
    } catch (err) {
        if (err.status !== 404) throw err;   // already gone
    }
}

const addRegistrant = (id, { email, first_name, last_name }, f) =>
    request('POST', `/meetings/${encodeURIComponent(id)}/registrants`, { email, first_name, last_name }, f);

// Everyone who joined a finished meeting (one row per join), all pages
async function listParticipants(id, f) {
    const rows = [];
    let next = '';
    for (let i = 0; i < 20; i++) {
        const q = `page_size=300${next ? `&next_page_token=${encodeURIComponent(next)}` : ''}`;
        const page = await request('GET', `/report/meetings/${encodeURIComponent(id)}/participants?${q}`, null, f);
        rows.push(...(page.participants || []));
        next = page.next_page_token || '';
        if (!next) break;
    }
    return rows;
}

// The cloud recording's share link and passcode, or null while Zoom is still processing it
async function getRecording(id, f) {
    try {
        const r = await request('GET', `/meetings/${encodeURIComponent(id)}/recordings`, null, f);
        if (!r || !r.share_url) return null;
        return { url: r.share_url, passcode: r.password || r.recording_play_passcode || '', fileId: String(r.uuid || r.id || '') };
    } catch (err) {
        if (err.status === 404) return null;
        throw err;
    }
}

async function testConnection(f) {
    const me = await request('GET', `/users/${encodeURIComponent(config().hostUser)}`, null, f);
    return { email: me.email, type: me.type };   // type 2 = licensed (paid)
}

module.exports = {
    isConfigured, getToken, request, resetToken, createMeeting, updateMeeting, deleteMeeting,
    addRegistrant, listParticipants, getRecording, testConnection, ZoomError
};
