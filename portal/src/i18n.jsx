import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { crmText, enumText } from './labels.js';

const dict = {
  ar: {
    portal: 'بوابة نبراس',
    academy: 'أكاديمية نبراس',
    signIn: 'تسجيل الدخول',
    forgotPassword: 'نسيت كلمة المرور؟',
    createAccount: 'إنشاء حساب جديد',
    signInTitle: 'الدخول إلى بوابة نبراس',
    signInHint: 'للإدارة والموظفين وقادة الفرق والعملاء',
    signInStaff: 'دخول فريق نبراس',
    signInStaffHint: 'للمالك والإدارة وكل الموظفين',
    signInCms: 'إدارة موقع نبراس',
    signInCmsHint: 'تعديل محتوى الموقع الإلكتروني',
    signInCustomer: 'حسابي في نبراس',
    signInCustomerHint: 'ادخل على برامجك ومحاضراتك ومدفوعاتك وشهاداتك',
    goThere: 'افتح صفحة الدخول الصحيحة',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    code: 'رمز التحقق',
    codeHint: 'أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة، أو أحد رموز الاسترداد.',
    verify: 'تحقق',
    back: 'رجوع',
    signOut: 'تسجيل الخروج',
    dashboard: 'الرئيسية',
    security: 'الأمان والأجهزة',
    roles: 'الأدوار والصلاحيات',
    audit: 'سجل العمليات',
    oldPanel: 'لوحة محتوى الموقع',
    website: 'الموقع العام',
    welcome: 'أهلاً',
    loading: 'جاري التحميل…',
    save: 'حفظ',
    cancel: 'إلغاء',
    reset: 'استرجاع الافتراضي',
    reason: 'سبب التعديل',
    reasonRequired: 'اكتب سبب التعديل، سيُحفظ في سجل العمليات.',
    saved: 'تم الحفظ.',
    forbidden: 'ليس لديك صلاحية لفتح هذه الصفحة.',
    notFound: 'الصفحة غير موجودة.',
    language: 'English',
    role: 'الدور',
    comingSoon: 'قيد التطوير',
    phaseNote: 'هذه أول نسخة من البوابة. الأقسام التالية تُضاف مع كل مرحلة من خطة التطوير.',
    // security page
    twoFactor: 'التحقق بخطوتين',
    twoFactorOn: 'مفعل',
    twoFactorOff: 'غير مفعل',
    twoFactorIntro: 'عند تفعيله يطلب النظام رمزاً من تطبيق على هاتفك (مثل Google Authenticator) بعد كلمة المرور.',
    twoFactorMust: 'التحقق بخطوتين إجباري لدورك. فعّله للمتابعة.',
    enable: 'تفعيل',
    disable: 'إيقاف',
    confirmPassword: 'أكد كلمة المرور',
    scanQr: 'امسح الرمز بتطبيق المصادقة، ثم أدخل أول رمز يظهر لك.',
    manualKey: 'أو أدخل هذا المفتاح يدوياً:',
    recoveryTitle: 'رموز الاسترداد',
    recoveryHint: 'احفظ هذه الرموز في مكان آمن. كل رمز يُستخدم مرة واحدة إذا فقدت هاتفك، ولن تظهر مرة أخرى.',
    recoveryLeft: 'رموز استرداد متبقية',
    newRecovery: 'رموز استرداد جديدة',
    done: 'تم',
    devices: 'الأجهزة المسجّل دخولها',
    thisDevice: 'هذا الجهاز',
    signOutDevice: 'خروج',
    signOutOthers: 'تسجيل الخروج من كل الأجهزة الأخرى',
    lastSeen: 'آخر نشاط',
    signedInAt: 'تاريخ الدخول',
    loginHistory: 'سجل محاولات الدخول',
    success: 'ناجحة',
    failed: 'فاشلة',
    // roles page
    permission: 'الصلاحية',
    scopeNone: '—',
    scopeOwn: 'الخاص به',
    scopeDepartment: 'القسم',
    scopeTeam: 'فريقه',
    scopeAll: 'الكل',
    customized: 'معدّل',
    users: 'مستخدم',
    fixedRole: 'صلاحيات المالك كاملة وثابتة.',
    readOnlyRoles: 'يمكنك مشاهدة الصلاحيات فقط. التعديل للمالك.',
    // audit page
    when: 'الوقت',
    who: 'المستخدم',
    action: 'العملية',
    details: 'التفاصيل',
    filterResource: 'القسم',
    filterAction: 'العملية',
    from: 'من',
    to: 'إلى',
    apply: 'تطبيق',
    prev: 'السابق',
    next: 'التالي',
    noData: 'لا توجد بيانات.',
    print: 'طباعة'
  },
  en: {
    portal: 'Nibras Portal',
    academy: 'Nibras Academy',
    signIn: 'Sign in',
    forgotPassword: 'Forgot your password?',
    createAccount: 'Create an account',
    signInTitle: 'Sign in to the Nibras portal',
    signInHint: 'For management, employees, team leaders and customers',
    signInStaff: 'Nibras team sign-in',
    signInStaffHint: 'For the owner, management and every employee',
    signInCms: 'Nibras website editor',
    signInCmsHint: 'Edit the website content',
    signInCustomer: 'My Nibras account',
    signInCustomerHint: 'Your programs, lectures, payments and certificates',
    goThere: 'Open the right sign-in page',
    email: 'Email',
    password: 'Password',
    code: 'Verification code',
    codeHint: 'Enter the 6-digit code from your authenticator app, or one of your recovery codes.',
    verify: 'Verify',
    back: 'Back',
    signOut: 'Sign out',
    dashboard: 'Home',
    security: 'Security & devices',
    roles: 'Roles & permissions',
    audit: 'Audit log',
    oldPanel: 'Website content panel',
    website: 'Public website',
    welcome: 'Welcome',
    loading: 'Loading…',
    save: 'Save',
    cancel: 'Cancel',
    reset: 'Restore defaults',
    reason: 'Reason for the change',
    reasonRequired: 'Write the reason for the change; it is kept in the audit log.',
    saved: 'Saved.',
    forbidden: 'You do not have permission to open this page.',
    notFound: 'Page not found.',
    language: 'العربية',
    role: 'Role',
    comingSoon: 'In development',
    phaseNote: 'This is the first version of the portal. Each phase of the upgrade plan adds its sections here.',
    twoFactor: 'Two-factor sign-in',
    twoFactorOn: 'On',
    twoFactorOff: 'Off',
    twoFactorIntro: 'When on, the system asks for a code from an app on your phone (such as Google Authenticator) after your password.',
    twoFactorMust: 'Two-factor sign-in is required for your role. Turn it on to continue.',
    enable: 'Turn on',
    disable: 'Turn off',
    confirmPassword: 'Confirm your password',
    scanQr: 'Scan the code with your authenticator app, then enter the first code it shows.',
    manualKey: 'Or enter this key manually:',
    recoveryTitle: 'Recovery codes',
    recoveryHint: 'Keep these codes somewhere safe. Each one works once if you lose your phone, and they will not be shown again.',
    recoveryLeft: 'recovery codes left',
    newRecovery: 'New recovery codes',
    done: 'Done',
    devices: 'Signed-in devices',
    thisDevice: 'This device',
    signOutDevice: 'Sign out',
    signOutOthers: 'Sign out all other devices',
    lastSeen: 'Last active',
    signedInAt: 'Signed in',
    loginHistory: 'Sign-in history',
    success: 'Successful',
    failed: 'Failed',
    permission: 'Permission',
    scopeNone: '—',
    scopeOwn: 'Own',
    scopeDepartment: 'Department',
    scopeTeam: 'Team',
    scopeAll: 'All',
    customized: 'Customized',
    users: 'users',
    fixedRole: 'The owner always has every permission.',
    readOnlyRoles: 'You can view permissions only. Changes are made by the owner.',
    when: 'Time',
    who: 'User',
    action: 'Action',
    details: 'Details',
    filterResource: 'Section',
    filterAction: 'Action',
    from: 'From',
    to: 'To',
    apply: 'Apply',
    prev: 'Previous',
    next: 'Next',
    noData: 'No data.',
    print: 'Print'
  }
};

Object.assign(dict.ar, crmText.ar);
Object.assign(dict.en, crmText.en);

const I18nContext = createContext(null);

function initialLang() {
  try {
    const saved = localStorage.getItem('nibras_portal_lang');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    // storage may be blocked
  }
  return 'ar';
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = dict[lang].portal;
    try {
      localStorage.setItem('nibras_portal_lang', lang);
    } catch {
      // storage may be blocked
    }
  }, [lang]);

  const t = useCallback((key) => dict[lang][key] ?? dict.ar[key] ?? key, [lang]);
  // Server labels come as { ar, en }
  const label = useCallback((obj) => (obj ? obj[lang] || obj.ar || '' : ''), [lang]);
  const fmtDate = useCallback(
    (v) => (v ? new Date(v).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'),
    [lang]
  );
  // enum values from the API, e.g. en('status', 'lead')
  const en = useCallback((group, value) => label(enumText[group] && enumText[group][value]) || value || '—', [label]);
  const fmtDay = useCallback((v) => (v ? new Date(v).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' }) : '—'), [lang]);
  const toggle = useCallback(() => setLang((l) => (l === 'ar' ? 'en' : 'ar')), []);

  const value = useMemo(() => ({ lang, t, label, fmtDate, fmtDay, en, toggle }), [lang, t, label, fmtDate, fmtDay, en, toggle]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
