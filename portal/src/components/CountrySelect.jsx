// A customer's country (or nationality) picked from a list (16 Nov 2026), the Arab countries first.
// A value saved before the list existed stays selectable as it was written.
import { useI18n } from '../i18n.jsx';

export const COUNTRIES = [
  ['مصر', 'Egypt'], ['السعودية', 'Saudi Arabia'], ['الإمارات', 'United Arab Emirates'], ['الكويت', 'Kuwait'], ['قطر', 'Qatar'],
  ['البحرين', 'Bahrain'], ['عُمان', 'Oman'], ['الأردن', 'Jordan'], ['العراق', 'Iraq'], ['ليبيا', 'Libya'], ['السودان', 'Sudan'],
  ['اليمن', 'Yemen'], ['فلسطين', 'Palestine'], ['لبنان', 'Lebanon'], ['سوريا', 'Syria'], ['المغرب', 'Morocco'], ['الجزائر', 'Algeria'],
  ['تونس', 'Tunisia'], ['موريتانيا', 'Mauritania'], ['الصومال', 'Somalia'], ['جيبوتي', 'Djibouti'], ['جزر القمر', 'Comoros'],
  ['تركيا', 'Turkey'], ['إيران', 'Iran'], ['باكستان', 'Pakistan'], ['الهند', 'India'], ['ماليزيا', 'Malaysia'], ['إندونيسيا', 'Indonesia'],
  ['نيجيريا', 'Nigeria'], ['إثيوبيا', 'Ethiopia'], ['كينيا', 'Kenya'], ['جنوب أفريقيا', 'South Africa'],
  ['المملكة المتحدة', 'United Kingdom'], ['ألمانيا', 'Germany'], ['فرنسا', 'France'], ['إيطاليا', 'Italy'], ['إسبانيا', 'Spain'],
  ['هولندا', 'Netherlands'], ['السويد', 'Sweden'], ['الولايات المتحدة', 'United States'], ['كندا', 'Canada'], ['أستراليا', 'Australia'],
  ['دولة أخرى', 'Another country']
];

export default function CountrySelect({ value, onChange, ...rest }) {
  const { lang, t } = useI18n();
  const known = COUNTRIES.some(([ar, en]) => ar === value || en === value);
  return (
    <select value={value || ''} onChange={onChange} {...rest}>
      <option value="">{t('chooseCountry')}</option>
      {value && !known && <option value={value}>{value}</option>}
      {COUNTRIES.map(([ar, en]) => <option key={ar} value={ar}>{lang === 'en' ? en : ar}</option>)}
    </select>
  );
}
