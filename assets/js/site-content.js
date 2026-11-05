/* Default content for everything the admin can edit. Loaded by the browser and by the server.
   The site shows these until the admin saves changes; the admin panel starts from them too. */
(function (root, factory) {
    const content = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = content;
    else root.NIBRAS_CONTENT = content;
})(typeof self !== 'undefined' ? self : this, function () {
    // Pages whose wine header can carry an image, in the order the admin lists them
    const heroPages = [
        { key: 'about', ar: 'عن نبراس', en: 'About' },
        { key: 'programs', ar: 'البرامج والخدمات', en: 'Programs & Services' },
        { key: 'pro_courses', ar: 'الدورات التدريبية', en: 'Training Courses' },
        { key: 'diploma', ar: 'الدبلومات المهنية', en: 'Professional Diplomas' },
        { key: 'masters', ar: 'الماجستير المهني', en: 'Professional Masters' },
        { key: 'phd', ar: 'الدكتوراه المهنية', en: 'Professional Doctorate' },
        { key: 'program', ar: 'صفحة تفاصيل البرنامج', en: 'Program details' },
        { key: 'corporate', ar: 'حلول الشركات', en: 'Corporate Solutions' },
        { key: 'contact', ar: 'تواصل معنا', en: 'Contact' },
        { key: 'verify', ar: 'التحقق من الشهادات', en: 'Verify Certificate' },
        { key: 'checkout', ar: 'طلب التسجيل', en: 'Enrollment Request' },
        { key: 'privacy', ar: 'سياسة الخصوصية', en: 'Privacy Policy' },
        { key: 'terms', ar: 'الشروط والأحكام', en: 'Terms & Conditions' },
        { key: 'refund', ar: 'سياسة الاسترداد', en: 'Refund Policy' },
        { key: 'accessibility', ar: 'إمكانية الوصول', en: 'Accessibility' }
    ];

    // Each track links to its catalog page
    const trackPages = { course: 'pro_courses.html', diploma: 'diploma.html', master: 'masters.html', phd: 'phd.html' };

    const pathways = [
        {
            key: 'course', icon: 'fa-chalkboard-user', image: '',
            titleAr: 'الدورات التدريبية', titleEn: 'Professional Courses',
            taglineAr: 'مهارة جديدة اليوم... فرصة أكبر غداً', taglineEn: 'New Skill Today... Bigger Opportunity Tomorrow',
            descAr: 'دورات تدريبية متخصصة تساعدك على اكتساب مهارات جديدة وتطوير معرفتك في مجالات مهنية متنوعة ترفع كفاءتك العملية.',
            descEn: 'Targeted training courses to acquire specialized skills and update your operational knowledge across key sectors.'
        },
        {
            key: 'diploma', icon: 'fa-award', image: '',
            titleAr: 'الدبلومات المهنية', titleEn: 'Professional Diplomas',
            taglineAr: 'تخصص أعمق... وخبرة أكثر', taglineEn: 'Deeper Specialization... Greater Competence',
            descAr: 'برامج مهنية متخصصة تساعدك على التعمق في مجال محدد، وبناء قاعدة معرفية ومهارية أكثر شمولاً تدعم تطورك أو انتقالك لمجال جديد.',
            descEn: 'Comprehensive programs to specialize in a specific domain and build a robust foundation for career advancement.'
        },
        {
            key: 'master', icon: 'fa-user-graduate', image: '',
            titleAr: 'الماجستير المهني', titleEn: 'Professional Masters',
            taglineAr: 'ارتِق بخبرتك... ووسّع آفاقك', taglineEn: 'Elevate Your Expertise... Expand Your Horizons',
            descAr: 'برامج مهنية متقدمة تجمع بين المعرفة المتخصصة والتطبيق، وتساعد المهنيين على تطوير قدراتهم الإدارية والقيادية والتنفيذية.',
            descEn: 'Advanced graduate programs merging specialized knowledge with practical application to develop executive and strategic leaders.'
        },
        {
            key: 'phd', icon: 'fa-graduation-cap', image: '',
            titleAr: 'الدكتوراه المهنية', titleEn: 'Professional Doctorate',
            taglineAr: 'للمهنيين والخبراء والقيادات الطموحة', taglineEn: 'For Senior Leaders & Subject Matter Experts',
            descAr: 'مسارات مهنية متقدمة تركز على المعرفة التخصصية العميقة، والتفكير الاستراتيجي، وتطوير القدرات القيادية وصناعة القرار المؤسسي.',
            descEn: 'High-level executive programs focusing on deep industry mastery, strategic vision, and high-impact decision making.'
        }
    ];

    const stats = [
        { value: 500, suffix: '+', icon: 'fa-user-graduate', labelAr: 'متدرب وخريج', labelEn: 'Graduates & Learners' },
        { value: 26, suffix: '+', icon: 'fa-chalkboard-teacher', labelAr: 'مدرب وخبير', labelEn: 'Instructors & Experts' },
        { value: 66, suffix: '+', icon: 'fa-certificate', labelAr: 'برنامج وتخصص مهني', labelEn: 'Programs & Specialties' },
        { value: 5, suffix: '+', icon: 'fa-history', labelAr: 'سنوات من الخبرة المهنية', labelEn: 'Years of Experience' }
    ];

    // "How to choose" cards on the programs page, one per track
    const guideCards = [
        {
            key: 'course', icon: 'fa-bullseye', image: '',
            titleAr: 'أريد تطوير مهارة محددة', titleEn: 'I want to build a specific skill',
            textAr: 'ابدأ من الدورات التدريبية واكتسب معرفة ومهارات مركزة في وقت قياسي.',
            textEn: 'Start with training courses and gain focused knowledge and skills in a short time.',
            linkAr: 'استكشف الدورات', linkEn: 'Explore courses'
        },
        {
            key: 'diploma', icon: 'fa-award', image: '',
            titleAr: 'أريد التخصص في مجال مهني', titleEn: 'I want to specialize in a field',
            textAr: 'استكشف الدبلومات المهنية وابنِ قاعدة معرفية وتطبيقية أكثر تخصصاً.',
            textEn: 'Explore professional diplomas and build deeper, more applied expertise.',
            linkAr: 'استكشف الدبلومات', linkEn: 'Explore diplomas'
        },
        {
            key: 'master', icon: 'fa-user-tie', image: '',
            titleAr: 'أريد تطوير مساري الوظيفي', titleEn: 'I want to advance my career',
            textAr: 'تعرف على برامج الماجستير المهني التي تساعدك على توسيع معارفك وقدراتك الإدارية.',
            textEn: 'Discover professional master programs that broaden your knowledge and management skills.',
            linkAr: 'استكشف الماجستير', linkEn: 'Explore masters'
        },
        {
            key: 'phd', icon: 'fa-chess-king', image: '',
            titleAr: 'أطمح لمستوى قيادي متقدم', titleEn: 'I aim for senior leadership',
            textAr: 'استكشف برامج الدكتوراه المهنية لتعميق التفكير الاستراتيجي والقيادة المؤسسية.',
            textEn: 'Explore professional doctorate programs to deepen strategic thinking and organizational leadership.',
            linkAr: 'استكشف الدكتوراه', linkEn: 'Explore doctorates'
        }
    ];

    // "Our services" cards on the programs page. A point written "Label: text" shows its label in bold.
    const serviceCards = [
        {
            key: 'individuals', icon: 'fa-user-check', image: '', href: '#pathways',
            titleAr: 'للأفراد والمهنيين', titleEn: 'For Individuals & Professionals',
            subtitleAr: 'طوّر مهاراتك... وابنِ مسارك المهني', subtitleEn: 'Build your skills... and your career path',
            textAr: 'نوفر للأفراد والمهنيين برامج وخدمات متكاملة تساعدهم على تطوير المعرفة، وبناء المهارات، واختيار المسار الأقرب لأهدافهم.',
            textEn: 'Integrated programs and services that help individuals and professionals grow their knowledge, build skills and choose the path closest to their goals.',
            pointsAr: ['دورات وبرامج في تخصصات متنوعة', 'محتوى يجمع بين المعرفة والتطبيق', 'خيارات تعلم تراعي التزاماتك اليومية', 'متابعة وتقييم خلال الرحلة التدريبية'],
            pointsEn: ['Courses and programs across many specialties', 'Content that combines knowledge and practice', 'Learning options that fit your daily commitments', 'Follow-up and assessment throughout your journey'],
            linkAr: 'استكشف برامج الأفراد', linkEn: 'Explore programs'
        },
        {
            key: 'companies', icon: 'fa-building', image: '', href: 'corporate.html',
            titleAr: 'للشركات والمؤسسات', titleEn: 'For Companies & Institutions',
            subtitleAr: 'التدريب الذي يبدأ من احتياج المؤسسة', subtitleEn: "Training that starts from the organization's needs",
            textAr: 'نعمل مع الشركات والمؤسسات على تطوير حلول تدريبية مخصصة ترتبط بأهدافها وتواكب التحول في بيئات العمل:',
            textEn: 'We work with companies and institutions on customized training solutions tied to their goals and the changing workplace:',
            pointsAr: ['تحليل الاحتياجات: تحديد الفجوات والمهارات المستهدفة', 'تصميم برامج مخصصة: إعداد برامج تلائم بيئة المؤسسة', 'تنفيذ مرن: تدريب عن بُعد أو وفق النموذج المتفق عليه', 'تقارير تدريبية: قياس الأثر ومستوى المشاركة والتقدم'],
            pointsEn: ['Needs analysis: identify gaps and target skills', 'Custom programs: designed around your organization', 'Flexible delivery: remote or the model we agree on', 'Training reports: impact, participation and progress'],
            linkAr: 'اطلب حلاً تدريبياً لمؤسستك', linkEn: 'Request a training solution'
        },
        {
            key: 'centers', icon: 'fa-book-open', image: '', href: 'corporate.html#request',
            titleAr: 'لمراكز التدريب والمعاهد', titleEn: 'For Training Centers & Institutes',
            subtitleAr: 'محتوى تدريبي احترافي يدعم برامجك', subtitleEn: 'Professional training content for your programs',
            textAr: 'نقدم حلولاً لتطوير وإعداد الحقائب التدريبية والمحتوى المتخصص لمراكز التدريب والجهات التعليمية:',
            textEn: 'We develop training packages and specialized content for training centers and educational institutions:',
            pointsAr: ['الحقائب التدريبية: دليل مدرب، دليل متدرب، عروض', 'أدوات التقييم: أنشطة وتطبيقات ومواد مساندة', 'تطوير وتخصيص: صياغة وفق هوية وأهداف المركز', 'تحديث المحتوى: مواكبة التغيرات في المجال التخصصي'],
            pointsEn: ['Training packages: instructor and trainee guides, slides', 'Assessment tools: activities, exercises and support material', 'Customization: written to the center\'s identity and goals', 'Content updates: keeping pace with the field'],
            linkAr: 'تحدث مع فريقنا', linkEn: 'Talk to our team'
        }
    ];

    return { heroPages, trackPages, pathways, stats, guideCards, serviceCards, limits: { stats: 8, testimonials: 30 } };
});
