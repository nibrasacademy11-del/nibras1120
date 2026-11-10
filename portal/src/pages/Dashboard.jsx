import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

// Each role gets its own dashboard as the phases land; for now it shows the account and what is coming
const UPCOMING = {
  ar: ['ملفات العملاء والبحث وطلبات التصريح', 'الموظفون والفرق', 'البرامج والمحاور والتسجيلات', 'المدفوعات والعملات', 'العمولات', 'الشهادات', 'التقارير والطباعة', 'الحضور والانصراف'],
  en: ['Customer files, search and access requests', 'Employees and teams', 'Programs, modules and enrollments', 'Payments and currencies', 'Commissions', 'Certificates', 'Reports and printing', 'Attendance']
};

export default function Dashboard() {
  const { me } = useAuth();
  const { t, label, lang, fmtDate } = useI18n();
  const { user, security } = me;

  return (
    <>
      <h1 className="page-title">{t('welcome')}{lang === 'ar' ? '، ' : ', '}{user.name.split(' ')[0]}</h1>
      <div className="grid grid--3">
        <div className="card stat">
          <small>{t('role')}</small>
          <strong>{label(user.roleLabel)}</strong>
        </div>
        <div className="card stat">
          <small>{t('twoFactor')}</small>
          <strong className={security.twoFactorEnabled ? 'ok' : 'warn'}>
            {security.twoFactorEnabled ? t('twoFactorOn') : t('twoFactorOff')}
          </strong>
          {!security.twoFactorEnabled && <Link to="/security">{t('enable')} ←</Link>}
        </div>
        <div className="card stat">
          <small>{t('signedInAt')}</small>
          <strong>{fmtDate(user.lastLoginAt)}</strong>
        </div>
      </div>

      {user.isStaff && (
        <section className="card">
          <h2>{t('comingSoon')}</h2>
          <p className="muted">{t('phaseNote')}</p>
          <ul className="upcoming">
            {UPCOMING[lang].map((x) => <li key={x}>{x}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}
