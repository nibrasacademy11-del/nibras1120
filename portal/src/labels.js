// Interface text for the CRM and HR screens, merged into the main dictionary in i18n.jsx
export const crmText = {
  ar: {
    customers: 'العملاء', customer: 'العميل', lookup: 'البحث عن عميل', tasks: 'المهام والمتابعات', accessRequests: 'طلبات التصريح',
    employees: 'الموظفون', teams: 'الأقسام والفرق', duplicates: 'الملفات المكررة', settings: 'الإعدادات', notifications: 'الإشعارات',
    newCustomer: 'عميل جديد', customerNo: 'رقم العميل', name: 'الاسم', nameAr: 'الاسم بالعربية', nameEn: 'الاسم بالإنجليزية',
    phone: 'الهاتف', phone2: 'هاتف آخر', whatsapp: 'واتساب', address: 'العنوان', city: 'المدينة', country: 'الدولة',
    source: 'مصدر العميل', sourceDetail: 'تفاصيل المصدر', status: 'الحالة', owner: 'الموظف المسؤول', team: 'الفريق', tags: 'التصنيفات', segment: 'الشريحة',
    registeredAt: 'تاريخ التسجيل', createdBy: 'أنشأه', lastContact: 'آخر تواصل', nextFollowUp: 'المتابعة القادمة', lostReason: 'سبب الخسارة',
    nationality: 'الجنسية', nationalId: 'رقم الهوية', passport: 'رقم الجواز', birthDate: 'تاريخ الميلاد', gender: 'النوع', male: 'ذكر', female: 'أنثى',
    reveal: 'إظهار كاملاً', programs: 'البرامج', unassigned: 'غير مسند', all: 'الكل', mine: 'عملائي', search: 'بحث', searchHint: 'الاسم أو الرقم أو الهاتف أو البريد',
    overview: 'البيانات', timeline: 'السجل الزمني', notes: 'الملاحظات', communications: 'التواصل', documents: 'المستندات', access: 'التصريح',
    contactData: 'بيانات التواصل', identityData: 'بيانات الهوية', generalData: 'البيانات العامة', edit: 'تعديل', transfer: 'نقل لموظف', archive: 'أرشفة', restore: 'استعادة', merge: 'دمج ملف آخر هنا',
    add: 'إضافة', close: 'إغلاق', confirm: 'تأكيد', required: 'مطلوب', optional: 'اختياري', saving: 'جاري الحفظ…',
    possibleDuplicates: 'يوجد عملاء ببيانات مشابهة', duplicateHint: 'راجع الملفات التالية. إن كان العميل موجوداً افتح ملفه بدلاً من إنشاء ملف جديد.',
    createAnyway: 'ليس نفس العميل، أنشئ الملف', strongDuplicate: 'رقم الهوية أو الجواز مسجل لعميل آخر. لا يمكن إنشاء ملف مكرر.', matchedBy: 'تطابق في',
    basicOnly: 'تظهر لك البيانات الأساسية فقط لأن العميل غير مسند إليك.', requestAccess: 'طلب الوصول لبيانات إضافية', requestSent: 'تم إرسال الطلب.',
    sections: 'البيانات المطلوبة', purpose: 'الغرض من الطلب', duration: 'المدة', hours: 'ساعة', days: 'يوم',
    incoming: 'واردة', outgoing: 'طلباتي', approve: 'موافقة', reject: 'رفض', revoke: 'إلغاء التصريح', cancelRequest: 'إلغاء الطلب', expires: 'ينتهي',
    requester: 'مقدم الطلب', decision: 'القرار', note: 'ملاحظة', pending: 'قيد الانتظار', approved: 'موافق عليه', rejected: 'مرفوض', revoked: 'ملغي', cancelled: 'ملغي', expired: 'منتهي',
    addNote: 'أضف ملاحظة', pinned: 'مثبتة', logContact: 'تسجيل تواصل', channel: 'الوسيلة', direction: 'الاتجاه', outbound: 'صادر', inbound: 'وارد', outcome: 'النتيجة', summary: 'الملخص',
    scheduleFollowUp: 'جدولة متابعة', followUpAt: 'موعد المتابعة', task: 'مهمة', followUp: 'متابعة', newTask: 'مهمة جديدة', title: 'العنوان', description: 'الوصف', assignee: 'المسؤول',
    dueAt: 'الموعد', priority: 'الأولوية', low: 'منخفضة', normal: 'عادية', high: 'عالية', open: 'مفتوحة', done: 'منجزة', overdue: 'متأخرة', today: 'اليوم', markDone: 'تم',
    upload: 'رفع مستند', newVersion: 'نسخة جديدة', version: 'نسخة', category: 'التصنيف', file: 'الملف', fileHint: 'PDF أو صورة أو DOCX، حتى 4MB', visibleToCustomer: 'يظهر للعميل', download: 'تحميل',
    transferTo: 'نقل إلى', mergeSource: 'رقم الملف المكرر', mergeHint: 'يُنقل كل محتوى الملف الآخر (الملاحظات والتواصل والمهام والمستندات والسجل) إلى هذا الملف، ويبقى الملف الآخر مؤرشفاً للرجوع إليه.',
    employeeNo: 'رقم الموظف', jobTitle: 'المسمى الوظيفي', department: 'القسم', hireDate: 'تاريخ التعيين', active: 'نشط', left: 'غادر', newEmployee: 'موظف جديد',
    tempPassword: 'كلمة المرور المؤقتة', tempPasswordHint: 'أعطها للموظف. سيُطلب منه تغييرها عند أول دخول، ولن تظهر مرة أخرى.', offboard: 'إنهاء الخدمة',
    offboardHint: 'يُعطل الحساب ويُسجل خروجه من كل الأجهزة. اختر موظفاً يستلم عملاءه ومهامه المفتوحة. لا يُحذف أي سجل.', history: 'السجل الوظيفي', members: 'الأعضاء',
    leader: 'قائد الفريق', newTeam: 'فريق جديد', newDepartment: 'قسم جديد', departments: 'الأقسام', none: 'بدون',
    myCustomers: 'عملائي حسب الحالة', teamCustomers: 'عملاء الفريق', academyCustomers: 'كل العملاء', newThisMonth: 'جدد هذا الشهر', conversion: 'نسبة التحويل',
    tasksOverdue: 'مهام متأخرة', tasksToday: 'مهام اليوم', accessPending: 'طلبات وصول بانتظارك', noContact7: 'بدون تواصل منذ 7 أيام', bySource: 'حسب المصدر', byCountry: 'حسب الدولة', byOwner: 'حسب الموظف', total: 'الإجمالي',
    markAllRead: 'تعليم الكل كمقروء', noNotifications: 'لا توجد إشعارات.', changePassword: 'تغيير كلمة المرور', currentPassword: 'كلمة المرور الحالية', newPassword: 'كلمة المرور الجديدة',
    mustChangePassword: 'هذه كلمة مرور مؤقتة. اختر كلمة مرور جديدة للمتابعة.', lookupNamePolicy: 'إظهار اسم العميل في البحث للموظفين غير المسؤولين', nameFull: 'الاسم كاملاً', namePartial: 'الاسم الأول وحرف من الثاني',
    assignSelected: 'إسناد المحدد', assignEven: 'توزيع بالتساوي', selected: 'محدد', noResults: 'لا توجد نتائج.', open_file: 'فتح الملف', role: 'الدور',
    kind: 'النوع',
    lookupHint: 'ابحث برقم العميل (NB-000123) أو رقم الهوية أو رقم الجواز.'
  },
  en: {
    customers: 'Customers', customer: 'Customer', lookup: 'Customer lookup', tasks: 'Tasks & follow-ups', accessRequests: 'Access requests',
    employees: 'Employees', teams: 'Departments & teams', duplicates: 'Duplicate files', settings: 'Settings', notifications: 'Notifications',
    newCustomer: 'New customer', customerNo: 'Customer no.', name: 'Name', nameAr: 'Name (Arabic)', nameEn: 'Name (English)',
    phone: 'Phone', phone2: 'Other phone', whatsapp: 'WhatsApp', address: 'Address', city: 'City', country: 'Country',
    source: 'Source', sourceDetail: 'Source details', status: 'Status', owner: 'Responsible employee', team: 'Team', tags: 'Tags', segment: 'Segment',
    registeredAt: 'Registered', createdBy: 'Created by', lastContact: 'Last contact', nextFollowUp: 'Next follow-up', lostReason: 'Lost reason',
    nationality: 'Nationality', nationalId: 'National ID', passport: 'Passport no.', birthDate: 'Birth date', gender: 'Gender', male: 'Male', female: 'Female',
    reveal: 'Show in full', programs: 'Programs', unassigned: 'Unassigned', all: 'All', mine: 'My customers', search: 'Search', searchHint: 'Name, number, phone or email',
    overview: 'Details', timeline: 'Timeline', notes: 'Notes', communications: 'Contact log', documents: 'Documents', access: 'Access',
    contactData: 'Contact', identityData: 'Identity', generalData: 'General', edit: 'Edit', transfer: 'Transfer', archive: 'Archive', restore: 'Restore', merge: 'Merge another file here',
    add: 'Add', close: 'Close', confirm: 'Confirm', required: 'Required', optional: 'Optional', saving: 'Saving…',
    possibleDuplicates: 'Similar customers exist', duplicateHint: 'Review these files. If the customer already exists, open their file instead of creating a new one.',
    createAnyway: 'Not the same person, create the file', strongDuplicate: 'This national ID or passport belongs to another customer. A duplicate file cannot be created.', matchedBy: 'Matched on',
    basicOnly: 'You see the basic card only because this customer is not assigned to you.', requestAccess: 'Request more access', requestSent: 'Request sent.',
    sections: 'Data needed', purpose: 'Purpose', duration: 'Duration', hours: 'hours', days: 'days',
    incoming: 'Incoming', outgoing: 'My requests', approve: 'Approve', reject: 'Reject', revoke: 'Revoke', cancelRequest: 'Cancel request', expires: 'Expires',
    requester: 'Requested by', decision: 'Decision', note: 'Note', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', revoked: 'Revoked', cancelled: 'Cancelled', expired: 'Expired',
    addNote: 'Add a note', pinned: 'Pinned', logContact: 'Log contact', channel: 'Channel', direction: 'Direction', outbound: 'Outbound', inbound: 'Inbound', outcome: 'Outcome', summary: 'Summary',
    scheduleFollowUp: 'Schedule a follow-up', followUpAt: 'Follow-up time', task: 'Task', followUp: 'Follow-up', newTask: 'New task', title: 'Title', description: 'Description', assignee: 'Assignee',
    dueAt: 'Due', priority: 'Priority', low: 'Low', normal: 'Normal', high: 'High', open: 'Open', done: 'Done', overdue: 'Overdue', today: 'Today', markDone: 'Done',
    upload: 'Upload document', newVersion: 'New version', version: 'Version', category: 'Category', file: 'File', fileHint: 'PDF, image or DOCX, up to 4MB', visibleToCustomer: 'Visible to customer', download: 'Download',
    transferTo: 'Transfer to', mergeSource: 'Duplicate file number', mergeHint: 'Everything in the other file (notes, contact log, tasks, documents, timeline) moves here; the other file stays archived for reference.',
    employeeNo: 'Employee no.', jobTitle: 'Job title', department: 'Department', hireDate: 'Hire date', active: 'Active', left: 'Left', newEmployee: 'New employee',
    tempPassword: 'Temporary password', tempPasswordHint: 'Give it to the employee. They must change it at first sign-in; it will not be shown again.', offboard: 'Offboard',
    offboardHint: 'Disables the account and signs it out everywhere. Choose who receives their customers and open tasks. No record is deleted.', history: 'Job history', members: 'Members',
    leader: 'Team leader', newTeam: 'New team', newDepartment: 'New department', departments: 'Departments', none: 'None',
    myCustomers: 'My customers by status', teamCustomers: 'Team customers', academyCustomers: 'All customers', newThisMonth: 'New this month', conversion: 'Conversion rate',
    tasksOverdue: 'Overdue tasks', tasksToday: 'Due today', accessPending: 'Access requests waiting for you', noContact7: 'No contact for 7 days', bySource: 'By source', byCountry: 'By country', byOwner: 'By employee', total: 'Total',
    markAllRead: 'Mark all as read', noNotifications: 'No notifications.', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password',
    mustChangePassword: 'This is a temporary password. Choose a new one to continue.', lookupNamePolicy: 'Customer name shown in lookup to employees who are not responsible', nameFull: 'Full name', namePartial: 'First name and initial',
    assignSelected: 'Assign selected', assignEven: 'Distribute evenly', selected: 'selected', noResults: 'No results.', open_file: 'Open file', role: 'Role',
    kind: 'Type',
    lookupHint: 'Search by customer number (NB-000123), national ID or passport number.'
  }
};

export const enumText = {
  status: {
    lead: { ar: 'عميل محتمل', en: 'Lead' }, interested: { ar: 'مهتم', en: 'Interested' }, customer: { ar: 'عميل', en: 'Customer' },
    lost: { ar: 'مفقود', en: 'Lost' }, inactive: { ar: 'غير نشط', en: 'Inactive' }, merged: { ar: 'مدمج', en: 'Merged' }
  },
  source: {
    website: { ar: 'الموقع', en: 'Website' }, facebook: { ar: 'فيسبوك', en: 'Facebook' }, instagram: { ar: 'إنستجرام', en: 'Instagram' }, tiktok: { ar: 'تيك توك', en: 'TikTok' },
    whatsapp: { ar: 'واتساب', en: 'WhatsApp' }, phone: { ar: 'اتصال', en: 'Phone' }, referral: { ar: 'ترشيح', en: 'Referral' }, walk_in: { ar: 'زيارة', en: 'Walk-in' },
    corporate: { ar: 'جهة/شركة', en: 'Corporate' }, event: { ar: 'فعالية', en: 'Event' }, other: { ar: 'أخرى', en: 'Other' }
  },
  channel: {
    call: { ar: 'مكالمة', en: 'Call' }, whatsapp: { ar: 'واتساب', en: 'WhatsApp' }, email: { ar: 'بريد', en: 'Email' }, sms: { ar: 'رسالة', en: 'SMS' },
    meeting: { ar: 'مقابلة', en: 'Meeting' }, social: { ar: 'سوشيال', en: 'Social' }, other: { ar: 'أخرى', en: 'Other' }
  },
  outcome: {
    '': { ar: '—', en: '—' }, reached: { ar: 'تم التواصل', en: 'Reached' }, no_answer: { ar: 'لم يرد', en: 'No answer' }, busy: { ar: 'مشغول', en: 'Busy' },
    wrong_number: { ar: 'رقم خطأ', en: 'Wrong number' }, interested: { ar: 'مهتم', en: 'Interested' }, not_interested: { ar: 'غير مهتم', en: 'Not interested' },
    callback: { ar: 'معاودة الاتصال', en: 'Call back' }, enrolled: { ar: 'سجّل', en: 'Enrolled' }
  },
  section: {
    contact: { ar: 'بيانات التواصل', en: 'Contact' }, identity: { ar: 'بيانات الهوية', en: 'Identity' }, financial: { ar: 'البيانات المالية', en: 'Financial' },
    documents: { ar: 'المستندات', en: 'Documents' }, notes: { ar: 'الملاحظات الداخلية', en: 'Internal notes' }
  },
  docCategory: {
    identity: { ar: 'هوية', en: 'Identity' }, contract: { ar: 'عقد', en: 'Contract' }, certificate: { ar: 'شهادة', en: 'Certificate' },
    receipt: { ar: 'إيصال', en: 'Receipt' }, academic: { ar: 'أكاديمي', en: 'Academic' }, other: { ar: 'أخرى', en: 'Other' }
  },
  role: {
    super_admin: { ar: 'مدير النظام', en: 'Super Admin' }, admin: { ar: 'مدير', en: 'Admin' }, hr_manager: { ar: 'مدير الموارد البشرية', en: 'HR Manager' },
    finance_manager: { ar: 'المدير المالي', en: 'Finance Manager' }, team_leader: { ar: 'قائد فريق', en: 'Team Leader' }, employee: { ar: 'موظف', en: 'Employee' },
    accountant: { ar: 'محاسب', en: 'Accountant' }, customer_support: { ar: 'خدمة العملاء', en: 'Customer Support' }, customer: { ar: 'عميل', en: 'Customer' },
    student: { ar: 'متدرب', en: 'Student' }, user: { ar: 'متدرب', en: 'Student' }
  }
};
