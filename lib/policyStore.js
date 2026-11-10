const RolePolicy = require('../models/RolePolicy');
const { effectiveGrants } = require('./permissions');

// Role overrides change rarely, so each server instance keeps them for a short time.
// A save clears the cache of the instance that handled it; others pick it up within TTL_MS.
const TTL_MS = 60 * 1000;
let cache = null;
let loadedAt = 0;

async function loadOverrides() {
    if (cache && Date.now() - loadedAt < TTL_MS) return cache;
    const docs = await RolePolicy.find().lean();
    const map = {};
    for (const d of docs) map[d.role] = d.grants instanceof Map ? Object.fromEntries(d.grants) : (d.grants || {});
    cache = map;
    loadedAt = Date.now();
    return map;
}

function invalidate() {
    cache = null;
}

async function grantsForRole(role) {
    return effectiveGrants(role, await loadOverrides());
}

module.exports = { loadOverrides, grantsForRole, invalidate };
