// WhatsApp message templates for the customer file. Pure, so they can be unit tested.

const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const DEFAULT_TEMPLATES = Object.freeze([
    { key: 'welcome', titleAr: 'ترحيب', text: 'مرحباً {name}، أهلاً بك في {academy}. رقم ملفك {customerNo}، ويسعدنا مساعدتك في أي وقت.' },
    { key: 'payment', titleAr: 'تذكير بالسداد', text: 'مرحباً {name}، نذكّرك بالمبلغ المستحق: {owed}. للاستفسار أو السداد تواصل معنا. شكراً لك.' },
    { key: 'lecture', titleAr: 'تذكير بمحاضرة', text: 'مرحباً {name}، نذكّرك بمحاضرتك القادمة. ادخل من صفحة «محاضراتي» على بوابة نبراس: {portal}' },
    { key: 'certificate', titleAr: 'الشهادة جاهزة', text: 'مرحباً {name}، شهادتك جاهزة. مبروك! تقدر تشوفها من بوابة نبراس: {portal}' },
    { key: 'follow', titleAr: 'متابعة', text: 'مرحباً {name}، معك {owner} من {academy}. حبيت أطمّن عليك وأعرف لو محتاج أي مساعدة.' }
]);

function cleanTemplates(v) {
    if (!Array.isArray(v) || v.length > 20) return null;
    const out = [];
    for (const t of v) {
        if (!t || typeof t !== 'object') return null;
        const titleAr = str(t.titleAr, 60);
        const text = str(t.text, 1000);
        if (!titleAr || !text) return null;
        out.push({ key: str(t.key, 30) || `t${out.length + 1}`, titleAr, text });
    }
    return out;
}

// Fills {name}, {customerNo}, {owner}, {academy}, {owed}, {portal}; unknown names stay as they are
function fillTemplate(text, values) {
    return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (values[k] !== undefined && values[k] !== null ? String(values[k]) : m));
}

module.exports = { DEFAULT_TEMPLATES, cleanTemplates, fillTemplate };
