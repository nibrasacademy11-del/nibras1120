# إطلاق نظام الإدارة — خطوة بخطوة

الشغل كله على فروع متتالية: `erp-phase-0` ← … ← `erp-phase-8`. كل فرع مبني على اللي قبله، فآخر فرع (`erp-phase-8`) فيه كل حاجة.

## أ. قبل أي شيء (مرة واحدة)

1. **تغيير باسورد Atlas القديم** وتحديث `MONGO_URI` على Vercel، وجعل الـ repository خاصاً (Private).
2. **حساب Vercel Pro** باسم الأكاديمية.
3. **قاعدة تجريبية** (Atlas M0) وملف `.env.development` على جهاز التطوير (انظر `.env.development.example`).

## ب. الاختبار الكامل على القاعدة التجريبية

```
node tools/test-all.js
```

لازم كل الاختبارات تنجح (بما فيها اختبارات `test/integration`) قبل الإطلاق.

## ج. تجربة عملية

1. `npm start` (يشتغل على القاعدة التجريبية لأن `.env.development` موجود) و`npm run build:portal`.
2. افتح `http://localhost:3000/portal/`، وجرّب كل دور مع 2–3 موظفين.
3. أو اعمل **Preview Deployment** على Vercel من الفرع `erp-phase-8` بمتغيرات تشير للقاعدة التجريبية.

## د. يوم الإطلاق

1. **نسخة احتياطية** من القاعدة الحقيقية: `node tools/backup-now.js --production`.
2. **متغيرات Vercel** (Production):

   | المتغير | القيمة |
   |---|---|
   | `JWT_SECRET` | موجود (اتركه) |
   | `DATA_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — **احفظ نسخة آمنة** |
   | `CRON_SECRET` | قيمة عشوائية طويلة |
   | `ATTENDANCE_SYNC_SECRET` | فقط لو هتستخدموا جهاز الحضور المحلي |
   | `REQUIRE_2FA` | `admins` (موصى به) |
   | `SITE_URL` | `https://www.nibras-ac.com` |

3. **الدمج والنشر**:
   ```
   git checkout main
   git merge --no-ff erp-phase-8
   git push origin main
   ```
   ثم تأكد من `/api/health` = `ok` ومن فتح `/portal/`.
4. **مدير النظام**:
   ```
   node tools/promote-super-admin.js <إيميل صاحب الأكاديمية> --production
   ```
5. **نقل البيانات القديمة** (كل سكريبت: تجربة أولاً ثم `--apply`):
   ```
   node data/migrations/001-crm-from-legacy.js --production
   node data/migrations/001-crm-from-legacy.js --production --apply
   node data/migrations/002-enrollments-from-legacy.js --production
   node data/migrations/002-enrollments-from-legacy.js --production --apply
   node data/migrations/003-link-legacy-certificates.js --production
   node data/migrations/003-link-legacy-certificates.js --production --apply
   ```
6. **صفحة صحة النظام** (`/portal/system`): كل الإعدادات المطلوبة ✓.
7. **النسخ التلقائي**: إعداد أسرار GitHub (انظر `docs/BACKUP-RESTORE.md`) وتشغيله مرة يدوياً.
8. **مراقبة توقف الموقع**: حساب مجاني على UptimeRobot (أو مثيله) يراقب `https://www.nibras-ac.com/api/health` كل 5 دقائق ويبعت إيميل/رسالة عند التوقف.

## هـ. الإعداد الأولي داخل البوابة (الإدارة)

1. الأقسام والفرق وقادة الفرق، ثم الموظفين (كل موظف يأخذ كلمة مرور مؤقتة).
2. العملات وأسعار الصرف، والخزائن والحسابات البنكية.
3. نسب العمولات (لكل موظف أو افتراضية من الإعدادات)، ثم "حساب العمولات الناقصة".
4. محاور البرامج والمجموعات.
5. قالب الشهادة (الشعار والتوقيعات) والاعتمادات.
6. مواعيد الدوام والعطلات وشاشة الحضور.
7. كل مدير يفعّل التحقق بخطوتين.

## و. الرجوع في حالة مشكلة

- الكود: `git revert` لدمج الإطلاق ثم `git push` — الموقع يرجع للنسخة القديمة خلال دقائق. (العلامة `backup-before-erp-2026-11-10` فيها الكود قبل كل التعديلات.)
- البيانات: الجداول الجديدة لا تمس القديمة؛ النسخة الاحتياطية من الخطوة د-1 للاسترجاع عند الحاجة (`docs/BACKUP-RESTORE.md`).
