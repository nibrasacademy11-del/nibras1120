// Normalising customer input, duplicate matching and merge planning. Pure, so it can be unit tested.

const fieldCrypto = require('./fieldCrypto');

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const toAscii = (s) => String(s || '').replace(ARABIC_DIGITS, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660);
});

// The last 9 digits identify a mobile number regardless of how the country code was written
// (01112220796, +20 111 222 0796 and 00201112220796 all give 112220796)
function normalizePhone(phone) {
    const digits = toAscii(phone).replace(/\D/g, '');
    if (!digits) return '';
    return digits.length > 9 ? digits.slice(-9) : digits;
}

function normalizeEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
}

const last4 = (v) => fieldCrypto.normalizeIdentifier(v).slice(-4);

// Turns raw identity numbers into the stored form: encrypted value, search hash, last 4 digits
function identityFields(kind, value) {
    const clean = fieldCrypto.normalizeIdentifier(value);
    const prefix = kind === 'passport' ? 'passport' : 'nationalId';
    if (!clean) return { [`${prefix}Enc`]: '', [`${prefix}Idx`]: '', [`${prefix}Last4`]: '' };
    return {
        [`${prefix}Enc`]: fieldCrypto.encrypt(clean),
        [`${prefix}Idx`]: fieldCrypto.blindIndex(clean, kind === 'passport' ? 'passport' : 'national_id'),
        [`${prefix}Last4`]: last4(clean)
    };
}

// The keys a new or changed customer is compared on
function duplicateKeys({ phone, phone2, email, nationalId, passport }) {
    const keys = [];
    for (const p of [phone, phone2]) {
        const n = normalizePhone(p);
        if (n.length >= 7) keys.push({ field: 'contact.phoneNorm', value: n, kind: 'phone', strong: false });
    }
    const e = normalizeEmail(email);
    if (e) keys.push({ field: 'contact.email', value: e, kind: 'email', strong: false });
    if (fieldCrypto.normalizeIdentifier(nationalId)) {
        keys.push({ field: 'identity.nationalIdIdx', value: fieldCrypto.blindIndex(nationalId, 'national_id'), kind: 'national_id', strong: true });
    }
    if (fieldCrypto.normalizeIdentifier(passport)) {
        keys.push({ field: 'identity.passportIdx', value: fieldCrypto.blindIndex(passport, 'passport'), kind: 'passport', strong: true });
    }
    return keys;
}

function duplicateQuery(keys, excludeId) {
    if (!keys.length) return null;
    const q = { $or: keys.map((k) => ({ [k.field]: k.value })), status: { $ne: 'merged' } };
    if (excludeId) q._id = { $ne: excludeId };
    return q;
}

// Which keys each candidate matched on, strongest first
function explainMatches(keys, candidates) {
    const get = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
    return candidates
        .map((c) => {
            const matched = keys.filter((k) => get(c, k.field) === k.value);
            return { candidate: c, matched: [...new Set(matched.map((k) => k.kind))], strong: matched.some((k) => k.strong) };
        })
        .filter((m) => m.matched.length)
        .sort((a, b) => Number(b.strong) - Number(a.strong) || b.matched.length - a.matched.length);
}

// Fields copied from the merged-away file only where the surviving file is empty
const MERGE_FIELDS = [
    'nameEn', 'country', 'sourceDetail', 'segment',
    'contact.phone', 'contact.phoneNorm', 'contact.phone2', 'contact.whatsapp', 'contact.email', 'contact.address', 'contact.city',
    'identity.nationality', 'identity.nationalIdEnc', 'identity.nationalIdIdx', 'identity.nationalIdLast4',
    'identity.passportEnc', 'identity.passportIdx', 'identity.passportLast4', 'identity.birthDate', 'identity.gender',
    'user'
];

const empty = (v) => v === undefined || v === null || v === '';

// Returns the $set for the surviving file and the fields where both files hold different values
// (kept as they are on the survivor, and listed in the merge record so nothing is lost silently)
function planMerge(target, source) {
    const get = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
    const set = {};
    const conflicts = [];
    for (const f of MERGE_FIELDS) {
        const t = get(target, f);
        const s = get(source, f);
        if (empty(s)) continue;
        if (empty(t)) set[f] = s;
        else if (String(t) !== String(s) && !f.endsWith('Enc') && !f.endsWith('Idx')) conflicts.push({ field: f, kept: t, other: s });
    }
    const tags = [...new Set([...(target.tags || []), ...(source.tags || [])])];
    if (tags.length !== (target.tags || []).length) set.tags = tags;
    if (source.registeredAt && target.registeredAt && new Date(source.registeredAt) < new Date(target.registeredAt)) {
        set.registeredAt = source.registeredAt;
    }
    // A paying customer stays a customer after the merge
    const rank = { customer: 5, interested: 4, lead: 3, inactive: 2, lost: 1 };
    if ((rank[source.status] || 0) > (rank[target.status] || 0)) set.status = source.status;
    return { set, conflicts };
}

module.exports = { normalizePhone, normalizeEmail, identityFields, duplicateKeys, duplicateQuery, explainMatches, planMerge, MERGE_FIELDS };
