// www / staff / cms: which address a request is on, which cookie it uses, who may sign in, which APIs answer
const test = require('node:test');
const assert = require('node:assert/strict');
const zones = require('../lib/zones');

const req = (host) => ({ hostname: host.replace(/:\d+$/, ''), headers: { host }, protocol: 'https' });
const withEnv = (env, fn) => {
    const old = {};
    for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    try { return fn(); } finally { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
};
const SET = { STAFF_HOST: 'staff.nibras-ac.com', CMS_HOST: 'cms.nibras-ac.com', SITE_URL: 'https://www.nibras-ac.com', STAFF_COOKIE_DOMAIN: '.nibras-ac.com' };

test('before the subdomains exist, everything is one place like before', () => {
    withEnv({ STAFF_HOST: undefined, CMS_HOST: undefined }, () => {
        assert.equal(zones.zoneOf(req('www.nibras-ac.com')), 'all');
        assert.equal(zones.cookieName('all'), 'nibras_token');
        assert.equal(zones.accountFits('all', true), true);
        assert.equal(zones.accountFits('all', false), true);
        assert.equal(zones.apiAllowed('all', 'PUT', '/api/admin/site/heroes'), true);
    });
});

test('the address decides the zone', () => {
    withEnv(SET, () => {
        assert.equal(zones.zoneOf(req('staff.nibras-ac.com')), 'staff');
        assert.equal(zones.zoneOf(req('STAFF.nibras-ac.com:443')), 'staff');
        assert.equal(zones.zoneOf(req('cms.nibras-ac.com')), 'cms');
        assert.equal(zones.zoneOf(req('www.nibras-ac.com')), 'site');
        assert.equal(zones.zoneOf(req('nibras1120.vercel.app')), 'site');
    });
});

test('staff and customers never share a session cookie; staff share one between staff and cms', () => {
    withEnv(SET, () => {
        assert.equal(zones.cookieName('site'), 'nibras_token');
        assert.equal(zones.cookieName('staff'), 'nibras_staff');
        assert.equal(zones.cookieName('cms'), 'nibras_staff');
        assert.equal(zones.cookieDomain('staff'), '.nibras-ac.com');
        assert.equal(zones.cookieDomain('cms'), '.nibras-ac.com');
        assert.equal(zones.cookieDomain('site'), undefined);
    });
});

test('staff sign in on staff and cms only, customers on the website only', () => {
    assert.equal(zones.accountFits('staff', true), true);
    assert.equal(zones.accountFits('cms', true), true);
    assert.equal(zones.accountFits('staff', false), false);
    assert.equal(zones.accountFits('cms', false), false);
    assert.equal(zones.accountFits('site', false), true);
    assert.equal(zones.accountFits('site', true), false);
});

test('website editing answers on cms only', () => {
    for (const [m, p] of [['PUT', '/api/admin/site/heroes'], ['POST', '/api/admin/media'], ['POST', '/api/courses'], ['DELETE', '/api/courses/1'], ['GET', '/api/inquiries'], ['PUT', '/api/inquiries/1'], ['GET', '/api/v2/website/specialties']]) {
        assert.equal(zones.apiAllowed('cms', m, p), true, `${m} ${p} on cms`);
        assert.equal(zones.apiAllowed('staff', m, p), false, `${m} ${p} on staff`);
        assert.equal(zones.apiAllowed('site', m, p), false, `${m} ${p} on site`);
    }
});

test('the public site keeps its public calls (contact form, course list)', () => {
    assert.equal(zones.apiAllowed('site', 'POST', '/api/inquiries'), true);
    assert.equal(zones.apiAllowed('site', 'POST', '/api/inquiries/enrollment'), true);
    assert.equal(zones.apiAllowed('site', 'GET', '/api/courses'), true);
    assert.equal(zones.apiAllowed('site', 'GET', '/api/site'), true);
});

test('cms answers nothing but the website, sign-in and the account itself', () => {
    assert.equal(zones.apiAllowed('cms', 'POST', '/api/auth/login'), true);
    assert.equal(zones.apiAllowed('cms', 'GET', '/api/v2/me'), true);
    assert.equal(zones.apiAllowed('cms', 'POST', '/api/v2/me/password'), true);
    assert.equal(zones.apiAllowed('cms', 'GET', '/api/v2/customers'), false);
    assert.equal(zones.apiAllowed('cms', 'GET', '/api/v2/payments'), false);
    assert.equal(zones.apiAllowed('cms', 'GET', '/api/auth/users'), true); // still needs the admin role on the route
    assert.equal(zones.apiAllowed('staff', 'GET', '/api/v2/customers'), true);
});

test('links between the three addresses keep the port in local testing', () => {
    withEnv({ STAFF_HOST: 'staff.localhost', CMS_HOST: 'cms.localhost', SITE_URL: 'http://localhost:3300' }, () => {
        const u = zones.urls({ headers: { host: 'staff.localhost:3300' }, protocol: 'http' });
        assert.equal(u.site, 'http://localhost:3300');
        assert.equal(u.staff, 'http://staff.localhost:3300');
        assert.equal(u.cms, 'http://cms.localhost:3300');
    });
});
