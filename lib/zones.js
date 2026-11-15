// Which part of the academy a request belongs to, decided by the address it came in on:
//   www.nibras-ac.com    -> 'site'  : the public website and the customers' profile (/portal)
//   staff.nibras-ac.com  -> 'staff' : one sign-in for the owner and every employee
//   cms.nibras-ac.com    -> 'cms'   : editing the website, for accounts granted website.manage
//
// The staff and cms addresses come from STAFF_HOST and CMS_HOST. Until they are set (before the
// subdomains exist), everything runs as one place like before: zone 'all'.
//
// Staff and customers get different sign-in cookies, so a staff session never works on the public
// site and a customer session never works on staff or cms. STAFF_COOKIE_DOMAIN (".nibras-ac.com")
// shares the staff cookie between staff and cms, so the owner signs in once for both.

const hostOnly = (h) => String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');

// STAFF_HOST may list more than one address, comma-separated (the first is the main one used
// in links). Local testing uses this to sign in as several roles at once, one address each,
// since a browser keeps one sign-in per address.
function config() {
    const staffHosts = String(process.env.STAFF_HOST || '').split(',').map(hostOnly).filter(Boolean);
    const cms = hostOnly(process.env.CMS_HOST);
    return { staff: staffHosts[0] || '', staffHosts, cms, enabled: staffHosts.length > 0 };
}

function zoneOf(req) {
    const c = config();
    if (!c.enabled) return 'all';
    const host = hostOnly(req.hostname || (req.headers && req.headers.host));
    if (c.staffHosts.includes(host)) return 'staff';
    if (c.cms && host === c.cms) return 'cms';
    return 'site';
}

const isStaffZone = (zone) => zone === 'staff' || zone === 'cms';

// Customers' cookie stays as it always was; staff get their own
const cookieName = (zone) => (isStaffZone(zone) ? 'nibras_staff' : 'nibras_token');

function cookieDomain(zone) {
    if (!isStaffZone(zone)) return undefined;
    const d = String(process.env.STAFF_COOKIE_DOMAIN || '').trim().toLowerCase();
    return d || undefined;
}

// The full addresses, for links between the three places (and reset-password emails)
function urls(req) {
    const c = config();
    const proto = (req && (req.headers['x-forwarded-proto'] || req.protocol)) || 'https';
    const port = req && req.headers && req.headers.host && /:\d+$/.test(req.headers.host) ? req.headers.host.match(/:\d+$/)[0] : '';
    const site = String(process.env.SITE_URL || '').replace(/\/$/, '') || (req ? `${proto}://${req.headers.host}` : '');
    return {
        site,
        staff: c.staff ? `${String(proto).split(',')[0]}://${c.staff}${port}` : site,
        // empty when there is no separate cms address: the website is edited from staff
        cms: c.cms ? `${String(proto).split(',')[0]}://${c.cms}${port}` : ''
    };
}

// Does an account of this kind sign in on this zone? Staff on staff/cms, customers on the site.
function accountFits(zone, isStaff) {
    if (zone === 'all') return true;
    return isStaffZone(zone) ? !!isStaff : !isStaff;
}

// ---- which API calls belong where ----
// Editing the website: only on cms.* (or everywhere while the subdomains are not set up)
const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function isCmsApi(method, path) {
    if (/^\/api\/admin\//.test(path)) return true;
    if (/^\/api\/v2\/website(\/|$)/.test(path)) return true;
    if (/^\/api\/courses(\/|$)/.test(path) && WRITE.has(method)) return true;
    // The public contact form posts to /api/inquiries; reading and handling them is CMS work
    if (/^\/api\/inquiries(\/|$)/.test(path) && !(method === 'POST' && /^\/api\/inquiries(\/enrollment)?\/?$/.test(path))) return true;
    return false;
}

// What the cms address may call besides editing: signing in, the account itself, public reads
function cmsMayCall(method, path) {
    if (isCmsApi(method, path)) return true;
    if (/^\/api\/(auth|health|site|media)(\/|$)/.test(path)) return true;
    if (/^\/api\/v2\/me(\/|$)/.test(path)) return true;
    if (/^\/api\/courses(\/|$)/.test(path) && method === 'GET') return true;
    return false;
}

function apiAllowed(zone, method, path) {
    if (zone === 'all') return true;
    // Website editing: on cms.* when it exists, otherwise from the staff panel (the owner's section)
    if (isCmsApi(method, path)) return zone === 'cms' || (zone === 'staff' && !config().cms);
    if (zone === 'cms') return cmsMayCall(method, path);
    return true;
}

module.exports = { zoneOf, isStaffZone, cookieName, cookieDomain, urls, accountFits, config, hostOnly, isCmsApi, apiAllowed };
