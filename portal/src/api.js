// Thin wrapper around fetch for the Nibras API. The session lives in an httpOnly cookie,
// so nothing secret is ever kept in JavaScript.

export class ApiError extends Error {
  constructor(status, message, code, body) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

// Called on every 401, so the app can return to the sign-in screen
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login')) onUnauthorized();
    throw new ApiError(res.status, (data && data.message) || `Request failed (${res.status})`, data && data.code, data);
  }
  return data;
}

// Server messages come as "Arabic / English"; show the half that matches the interface language
export function pickMessage(message, lang) {
  const text = String(message || '');
  const parts = text.split(' / ');
  if (parts.length === 2) return lang === 'en' ? parts[1] : parts[0];
  return text;
}
