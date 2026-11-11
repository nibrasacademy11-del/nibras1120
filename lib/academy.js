// The academy's identity on everything printed: name, contacts, tax registration and VAT.
// Pure helpers, so they can be unit tested.

const fieldCrypto = require('./fieldCrypto');

const PROFILE_DEFAULT = Object.freeze({
    nameAr: 'أكاديمية نبراس للتدريب والتأهيل المهني',
    nameEn: 'Nibras Academy for Training & Professional Development',
    address: '',
    phone: '',
    email: '',
    website: 'www.nibras-ac.com',
    taxNumber: '',            // the tax registration number; when set, receipts print as tax invoices
    commercialRegister: '',
    vatRate: 0,               // percent
    pricesIncludeVat: true    // amounts collected already include the VAT
});

const TEXT_FIELDS = { nameAr: 200, nameEn: 200, address: 300, phone: 80, email: 120, website: 120, taxNumber: 40, commercialRegister: 40 };

// A clean profile from what the settings page sent, or null when it is not a profile
function cleanProfile(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const out = { ...PROFILE_DEFAULT };
    for (const [k, max] of Object.entries(TEXT_FIELDS)) {
        if (input[k] === undefined) continue;
        if (typeof input[k] !== 'string') return null;
        out[k] = input[k].trim().slice(0, max);
    }
    if (input.vatRate !== undefined) {
        const r = Number(input.vatRate);
        if (!Number.isFinite(r) || r < 0 || r > 100) return null;
        out.vatRate = Math.round(r * 100) / 100;
    }
    if (input.pricesIncludeVat !== undefined) out.pricesIncludeVat = input.pricesIncludeVat !== false;
    if (!out.nameAr) out.nameAr = PROFILE_DEFAULT.nameAr;
    return out;
}

// VAT inside (or on top of) an amount. Rounded to the currency's decimals; net + vat = total.
function vatSplit(amount, rate, included = true, decimals = 2) {
    const f = 10 ** decimals;
    const r = Number(rate) || 0;
    const a = Number(amount) || 0;
    if (r <= 0) return { net: a, vat: 0, total: a, rate: 0 };
    if (included) {
        const net = Math.round((a / (1 + r / 100)) * f) / f;
        return { net, vat: Math.round((a - net) * f) / f, total: a, rate: r };
    }
    const vat = Math.round(a * (r / 100) * f) / f;
    return { net: a, vat, total: Math.round((a + vat) * f) / f, rate: r };
}

// A short signature for the receipt's verification link, so receipt numbers cannot be tried in bulk
function receiptKey(receiptNo) {
    return fieldCrypto.blindIndex(String(receiptNo || ''), 'receipt').slice(0, 16);
}

module.exports = { PROFILE_DEFAULT, cleanProfile, vatSplit, receiptKey };
