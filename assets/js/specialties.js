/* Single source of truth for specialties. Loaded by the browser and by the server. */
(function (root, factory) {
    const list = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = list;
    else root.NIBRAS_SPECIALTIES = list;
})(typeof self !== 'undefined' ? self : this, function () {
    const specialties = [
        { key: 'business', ar: 'إدارة الأعمال', en: 'Business Administration', icon: 'fa-briefcase', match: ['إدارة الأعمال', 'الإدارة التنفيذية', 'الابتكار', 'MBA'] },
        { key: 'leadership', ar: 'القيادة والإدارة', en: 'Leadership & Management', icon: 'fa-user-tie', match: ['القيادة'] },
        { key: 'strategy', ar: 'التخطيط الاستراتيجي', en: 'Strategic Planning', icon: 'fa-chess', match: ['الاستراتيجي', 'الأداء الوظيفي', 'KPIs'] },
        { key: 'projects', ar: 'إدارة المشاريع', en: 'Project Management', icon: 'fa-diagram-project', match: ['المشروعات', 'المشاريع', 'PMP', 'CAPM'] },
        { key: 'hr', ar: 'الموارد البشرية', en: 'Human Resources', icon: 'fa-users', match: ['الموارد البشرية', 'SHRM', 'نظام العمل'] },
        { key: 'finance', ar: 'المالية والمحاسبة', en: 'Finance & Accounting', icon: 'fa-coins', match: ['المالية', 'المحاسبة', 'CMA', 'FMAA'] },
        { key: 'marketing', ar: 'التسويق والمبيعات', en: 'Marketing & Sales', icon: 'fa-bullhorn', match: ['التسويق', 'المبيعات', 'مهارات البيع'] },
        { key: 'customer', ar: 'خدمة وتجربة العملاء', en: 'Customer Experience', icon: 'fa-headset', match: ['خدمة العملاء', 'تجربة وخدمة', 'CCXP'] },
        { key: 'risk', ar: 'إدارة المخاطر', en: 'Risk Management', icon: 'fa-shield-halved', match: ['المخاطر'] },
        { key: 'governance', ar: 'الحوكمة المؤسسية', en: 'Corporate Governance', icon: 'fa-scale-balanced', match: ['الحوكمة', 'حوكمة'] },
        { key: 'quality', ar: 'الجودة والتحسين المستمر', en: 'Quality & Continuous Improvement', icon: 'fa-medal', match: ['الجودة', 'Six Sigma'] },
        { key: 'health', ar: 'الإدارة الصحية والمستشفيات', en: 'Healthcare & Hospital Management', icon: 'fa-hospital', match: ['الصحية', 'المستشفيات'] },
        { key: 'safety', ar: 'السلامة والصحة المهنية', en: 'Occupational Health & Safety', icon: 'fa-helmet-safety', match: ['السلامة'] },
        { key: 'supply', ar: 'سلاسل الإمداد واللوجستيات', en: 'Supply Chain & Logistics', icon: 'fa-truck-moving', match: ['سلاسل الإمداد', 'اللوجستيات'] },
        { key: 'hospitality', ar: 'الفنادق والضيافة', en: 'Hospitality Management', icon: 'fa-hotel', match: ['الفنادق', 'الضيافة'] },
        { key: 'pr', ar: 'العلاقات العامة والإعلام', en: 'Public Relations & Media', icon: 'fa-newspaper', match: ['العلاقات العامة', 'الإعلام'] },
        { key: 'data', ar: 'تحليل البيانات', en: 'Data Analytics', icon: 'fa-chart-pie', match: ['تحليل البيانات', 'Power BI', 'التقارير الإدارية'] },
        { key: 'ai', ar: 'الذكاء الاصطناعي', en: 'Artificial Intelligence', icon: 'fa-robot', match: ['الذكاء الاصطناعي'] },
        { key: 'cyber', ar: 'الأمن السيبراني', en: 'Cybersecurity', icon: 'fa-lock', match: ['السيبراني'] },
        { key: 'digital', ar: 'التحول الرقمي والتكنولوجيا', en: 'Digital Transformation', icon: 'fa-network-wired', match: ['التحول الرقمي'] },
        { key: 'professional', ar: 'التطوير المهني', en: 'Professional Development', icon: 'fa-seedling', match: [] }
    ];

    specialties.fallback = 'professional';

    specialties.keyFor = function (title, specialty) {
        const matches = (text) => specialties.find((s) => s.match.some((term) => (text || '').includes(term)));
        // The program title is more specific than a free-text specialty, so it is checked first
        const found = specialties.find((s) => s.ar === specialty || s.key === specialty)
            || matches(title)
            || matches(specialty);
        return found ? found.key : specialties.fallback;
    };

    specialties.byKey = function (key) {
        return specialties.find((s) => s.key === key) || specialties.find((s) => s.key === specialties.fallback);
    };

    return specialties;
});
