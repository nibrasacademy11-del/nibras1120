import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { CertificateSheet, previewDesign } from './Certificates.jsx';
import { ReceiptSheet, StatementView } from './Finance.jsx';

// Every document a customer receives on paper, filled with made-up data, to check the design.
// ?doc=receipt|receipt_simple|cert_module|cert_program|statement shows one document only (for PDFs).

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
const SITE = 'https://www.nibras-ac.com';

const PAYMENT = {
  _id: 'sample', receiptNo: 'RC-000231', status: 'confirmed', amount: 11400, currency: 'EGP', method: 'bank_transfer', reference: 'TRX-55310', paidAt: daysAgo(0), refundedAmount: 0,
  customer: { customerNo: 'NB-000101', nameAr: 'محمد علي حسن' },
  account: { nameAr: 'بنك مصر - الحساب الجاري', nameEn: 'Banque Misr' },
  charge: { chargeNo: 'CH-000044', description: 'القسط الأول - ماجستير إدارة الأعمال التنفيذي' },
  enrollment: { enrollmentNo: 'EN-000044', programTitleAr: 'ماجستير إدارة الأعمال التنفيذي' },
  collectedBy: { name: 'أحمد سمير' }, recordedBy: { name: 'أحمد سمير' }, confirmedBy: { name: 'مدير النظام' }
};

const CERT = (kind) => ({
  cert_num: kind === 'program' ? 'NC-0000146' : 'NC-0000145', trainee_name: 'محمد علي حسن', nameEn: 'Mohamed Ali Hassan', issue_date: today, hours: kind === 'program' ? 0 : 36, status: 'Valid',
  accreditations: [{ nameAr: 'المجلس الدولي للتدريب', nameEn: 'International Training Council', number: 'ITC-2291' }]
});

const DESIGN = (kind) => ({
  ...previewDesign({
    titleAr: kind === 'program' ? 'شهادة إتمام برنامج' : 'شهادة إتمام محور', titleEn: kind === 'program' ? 'Program Completion Certificate' : 'Module Completion Certificate',
    introAr: 'تشهد أكاديمية نبراس للتدريب والتأهيل المهني بأن', introEn: 'Nibras Academy for Training & Professional Qualification certifies that',
    bodyAr: kind === 'program' ? 'قد أتم بنجاح جميع متطلبات برنامج «ماجستير إدارة الأعمال التنفيذي»' : 'قد أتم بنجاح متطلبات محور «القيادة الاستراتيجية» ضمن برنامج «ماجستير إدارة الأعمال التنفيذي»',
    bodyEn: kind === 'program' ? 'has successfully completed all requirements of the “Executive MBA” program' : 'has successfully completed the module “Strategic Leadership” of the “Executive MBA” program',
    signatures: [{ nameAr: 'د. أحمد سالم', nameEn: 'Dr. Ahmed Salem', titleAr: 'المدير الأكاديمي', titleEn: 'Academic Director' }, { nameAr: 'أ. منى فاروق', nameEn: 'Mona Farouk', titleAr: 'مدير الأكاديمية', titleEn: 'Academy Director' }]
  }, kind)
});

const STATEMENT = {
  byCurrency: [{ currency: 'EGP', charged: 45000, paid: 22800, remaining: 22200 }, { currency: 'SAR', charged: 600, paid: 0, remaining: 600 }],
  charges: [
    { _id: 'c1', description: 'ماجستير إدارة الأعمال التنفيذي', currency: 'EGP', installmentStatus: [
      { no: 1, dueDate: daysAgo(60), amount: 11400, remaining: 0, status: 'paid' },
      { no: 2, dueDate: daysAgo(30), amount: 11400, remaining: 0, status: 'paid' },
      { no: 3, dueDate: daysAgo(-1), amount: 11100, remaining: 11100, status: 'due' },
      { no: 4, dueDate: daysAgo(-31), amount: 11100, remaining: 11100, status: 'due' }
    ] },
    { _id: 'c2', description: 'رسوم اختبار الاعتماد', currency: 'SAR', installmentStatus: [{ no: 1, dueDate: daysAgo(3), amount: 600, remaining: 600, status: 'overdue' }] }
  ],
  payments: [
    { _id: 'p1', receiptNo: 'RC-000188', amount: 11400, currency: 'EGP', method: 'cash', paidAt: daysAgo(60) },
    { _id: 'p2', receiptNo: 'RC-000231', amount: 11400, currency: 'EGP', method: 'bank_transfer', paidAt: daysAgo(30) }
  ]
};

const DOCS = ['receipt', 'receipt_simple', 'cert_module', 'cert_program', 'statement'];

export default function PrintSamples() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const only = DOCS.includes(params.get('doc')) ? params.get('doc') : null;
  const show = (k) => !only || only === k;
  const verify = `${SITE}/pages/ar/receipt.html?no=RC-000231&k=0123456789abcdef`;
  return (
    <div className={`samples${only ? ' samples--one' : ''}`}>
      {!only && (
        <div className="no-print">
          <h1 className="page-title">{t('printSamplesNav')}</h1>
          <p className="muted">{t('psHint')}</p>
          <div className="row">{DOCS.map((k) => <button key={k} type="button" className="btn btn--small btn--ghost" onClick={() => setParams({ doc: k })}>{t(`ps_${k}`)}</button>)}</div>
        </div>
      )}
      {only && <div className="no-print row"><button type="button" className="btn btn--small btn--ghost" onClick={() => setParams({})}>← {t('printSamplesNav')}</button><button type="button" className="btn btn--small btn--primary" onClick={() => window.print()}>{t('printPdf')}</button></div>}

      {show('receipt') && <div className="sample-doc"><h2 className="sample-title no-print">{t('ps_receipt')}</h2><ReceiptSheet p={PAYMENT} vat={{ net: 10000, vat: 1400, total: 11400, rate: 14 }} verifyUrl={verify} /></div>}
      {show('receipt_simple') && <div className="sample-doc"><h2 className="sample-title no-print">{t('ps_receipt_simple')}</h2><ReceiptSheet p={{ ...PAYMENT, receiptNo: 'RC-000232', amount: 600, currency: 'SAR', method: 'cash', reference: '', account: { nameAr: 'خزنة الريال' }, charge: { chargeNo: 'CH-000060', description: 'رسوم اختبار الاعتماد' } }} vat={null} verifyUrl={verify} /></div>}
      {show('cert_module') && <div className="sample-doc sample-doc--cert"><h2 className="sample-title no-print">{t('ps_cert_module')}</h2><CertificateSheet cert={CERT('module')} design={DESIGN('module')} verifyUrl={`${SITE}/pages/ar/verify.html?code=NC-0000145`} /></div>}
      {show('cert_program') && <div className="sample-doc sample-doc--cert"><h2 className="sample-title no-print">{t('ps_cert_program')}</h2><CertificateSheet cert={CERT('program')} design={DESIGN('program')} verifyUrl={`${SITE}/pages/ar/verify.html?code=NC-0000146`} /></div>}
      {show('statement') && <div className="sample-doc sample-doc--statement"><h2 className="sample-title no-print">{t('ps_statement')}</h2><StatementView d={STATEMENT} customerName="محمد علي حسن · NB-000101" /></div>}
    </div>
  );
}
