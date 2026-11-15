// Monthly performance reviews: the criteria and the arithmetic, pure so they can be tested.

// The academy's criteria; the owner can change them (setting hr.reviewCriteria)
const DEFAULT_CRITERIA = [
    { key: 'commitment', ar: 'الالتزام والانضباط', en: 'Commitment and discipline' },
    { key: 'quality', ar: 'جودة الشغل', en: 'Quality of work' },
    { key: 'teamwork', ar: 'التعاون مع الفريق', en: 'Teamwork' },
    { key: 'initiative', ar: 'المبادرة وحل المشاكل', en: 'Initiative and problem solving' },
    { key: 'customers', ar: 'التعامل مع العملاء', en: 'Dealing with customers' }
];

// Keeps a clean list: 1 to 12 criteria, each with a key and an Arabic name
function cleanCriteria(input) {
    if (!Array.isArray(input)) return null;
    const out = [];
    const seen = new Set();
    for (const c of input) {
        const ar = String((c && c.ar) || '').trim().slice(0, 80);
        if (!ar) continue;
        let key = String((c && c.key) || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30) || `c${out.length + 1}`;
        while (seen.has(key)) key = `${key}_`;
        seen.add(key);
        out.push({ key, ar, en: String((c && c.en) || '').trim().slice(0, 80) });
    }
    return out.length >= 1 && out.length <= 12 ? out : null;
}

// Scores come as { key: 1..5 }; only the criteria's keys count, each a whole number from 1 to 5
function applyScores(criteria, input = {}) {
    return criteria.map((c) => {
        const n = Math.round(Number(input[c.key]));
        return { key: c.key, ar: c.ar, en: c.en, score: n >= 1 && n <= 5 ? n : undefined };
    });
}

function averageOf(scores) {
    const given = (scores || []).map((s) => s.score).filter((n) => n >= 1 && n <= 5);
    if (!given.length) return null;
    return Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 10) / 10;
}

// Attendance rate of the month: days present out of working days (leave days are not counted against)
function attendanceRate({ workingDays = 0, present = 0, leave = 0 } = {}) {
    const days = workingDays - leave;
    return days > 0 ? Math.round((present / days) * 100) : null;
}

const RATINGS = [
    [4.5, 'excellent', 'ممتاز', 'Excellent'],
    [3.5, 'very_good', 'جيد جداً', 'Very good'],
    [2.5, 'good', 'جيد', 'Good'],
    [1.5, 'needs_work', 'محتاج تحسين', 'Needs improvement'],
    [0, 'weak', 'ضعيف', 'Weak']
];
function ratingOf(avg) {
    if (avg === null || avg === undefined) return null;
    const r = RATINGS.find(([min]) => avg >= min);
    return { key: r[1], ar: r[2], en: r[3] };
}

module.exports = { DEFAULT_CRITERIA, cleanCriteria, applyScores, averageOf, attendanceRate, ratingOf };
