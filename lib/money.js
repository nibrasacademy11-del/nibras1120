// Money rules shared by the finance module. Pure functions so they can be unit tested.
//
// Every amount is kept in its own currency, rounded to that currency's decimals (KWD has 3).
// A rate is "base units for one unit of the currency": with SAR as base and 1 USD = 3.75 SAR,
// the USD rate is 3.75. Base amounts are frozen when the transaction is recorded.

const DEFAULT_CURRENCIES = [
    { code: 'SAR', nameAr: 'ريال سعودي', nameEn: 'Saudi Riyal', symbol: 'ر.س', decimals: 2 },
    { code: 'EGP', nameAr: 'جنيه مصري', nameEn: 'Egyptian Pound', symbol: 'ج.م', decimals: 2 },
    { code: 'AED', nameAr: 'درهم إماراتي', nameEn: 'UAE Dirham', symbol: 'د.إ', decimals: 2 },
    { code: 'USD', nameAr: 'دولار أمريكي', nameEn: 'US Dollar', symbol: '$', decimals: 2 },
    { code: 'EUR', nameAr: 'يورو', nameEn: 'Euro', symbol: '€', decimals: 2 },
    { code: 'KWD', nameAr: 'دينار كويتي', nameEn: 'Kuwaiti Dinar', symbol: 'د.ك', decimals: 3 }
];

const decimalsOf = (code, currencies = DEFAULT_CURRENCIES) => {
    const c = currencies.find((x) => x.code === code);
    return c ? c.decimals : 2;
};

// Rounds half away from zero at the currency's precision, avoiding binary float drift (1.005 → 1.01)
function round(amount, decimals = 2) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    const f = 10 ** decimals;
    return Math.sign(n) * Math.round((Math.abs(n) * f) + 1e-9) / f;
}

function toBase(amount, rate, baseDecimals = 2) {
    return round(Number(amount) * Number(rate), baseDecimals);
}

function fromBase(baseAmount, rate, decimals = 2) {
    if (!Number(rate)) return 0;
    return round(Number(baseAmount) / Number(rate), decimals);
}

// Converts an amount between two currencies through the base, using the rates of the moment
function convert(amount, fromRate, toRate, toDecimals = 2) {
    return fromBase(Number(amount) * Number(fromRate), toRate, toDecimals);
}

// Normalises currency codes written in the old catalog ("US$") to ISO codes
function normalizeCode(code) {
    const c = String(code || '').trim().toUpperCase();
    if (['US$', '$', 'USD$', 'دولار'].includes(c)) return 'USD';
    if (['ر.س', 'SR', 'ريال'].includes(c)) return 'SAR';
    if (['LE', 'E£', 'ج.م', 'جنيه'].includes(c)) return 'EGP';
    return /^[A-Z]{3}$/.test(c) ? c : '';
}

function isValidAmount(n, decimals = 2) {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 && round(v, decimals) === v && v < 1e10;
}

// Splits a net amount into installments. Equal parts, with the rounding remainder on the last one.
function splitInstallments(total, count, firstDue, everyMonths = 1, decimals = 2) {
    const n = Math.max(1, Math.min(parseInt(count, 10) || 1, 60));
    const part = round(total / n, decimals);
    const list = [];
    for (let i = 0; i < n; i++) {
        const due = new Date(firstDue);
        due.setMonth(due.getMonth() + i * everyMonths);
        list.push({ no: i + 1, dueDate: due, amount: i === n - 1 ? round(total - part * (n - 1), decimals) : part });
    }
    return list;
}

// Applies what was paid to the installments in due-date order and says what is still owed
function installmentStatus(installments, paid, asOf = new Date(), decimals = 2) {
    let left = round(paid, decimals);
    return [...installments]
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
        .map((i) => {
            const covered = round(Math.min(Math.max(left, 0), i.amount), decimals);
            left = round(left - covered, decimals);
            const remaining = round(i.amount - covered, decimals);
            return {
                no: i.no,
                dueDate: i.dueDate,
                amount: i.amount,
                paid: covered,
                remaining,
                status: remaining <= 0 ? 'paid' : covered > 0 ? 'partial' : new Date(i.dueDate) < asOf ? 'overdue' : 'due'
            };
        });
}

// Balance of a charge in its own currency. applied: confirmed payments in charge currency,
// refunded: refunds of those payments in charge currency.
function chargeBalance({ net, applied = 0, refunded = 0 }, decimals = 2) {
    const paid = round(applied - refunded, decimals);
    return { net: round(net, decimals), paid, remaining: round(net - paid, decimals), overpaid: paid > net ? round(paid - net, decimals) : 0 };
}

// "2026-11" for a date, the unit of financial period closing
const periodKey = (date) => {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

module.exports = {
    DEFAULT_CURRENCIES, decimalsOf, round, toBase, fromBase, convert, normalizeCode, isValidAmount,
    splitInstallments, installmentStatus, chargeBalance, periodKey
};
