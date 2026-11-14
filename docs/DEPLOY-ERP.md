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
   | `STAFF_HOST` | `staff.nibras-ac.com` (بعد ما الدومين الفرعي يشتغل، انظر `docs/DOMAINS.md`) |
   | `CMS_HOST` | **اتركه فاضي** (PLAN-V2: المالك بيعدّل الموقع من قسم «الموقع» في لوحته، ومفيش عنوان cms منفصل) |
   | `STAFF_COOKIE_DOMAIN` | `.nibras-ac.com` |
   | `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | من تطبيق زوم (الخطوات تحت في "ربط زوم") |
   | `ZOOM_HOST_USER` | إيميل حساب زوم اللي هيستضيف المحاضرات |
   | `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_SECURE` / `EMAIL_USER` / `EMAIL_PASS` | إيميل الأكاديمية على Hostinger. **من غيرها مفيش ولا إيميل بيتبعت** (تأكيد الحساب، والترحيب، والإيصالات، والشهادات، والتذكيرات، وحسابات الموظفين) |

3. **الدمج والنشر**:
   ```
   git checkout main
   git merge --no-ff erp-staff-portal
   git push origin main
   ```
   ثم تأكد من `/api/health` = `ok` ومن فتح `/portal/`.
4. **المالك الأساسي** (info@nibras-ac.com). جرّب الأول بـ `--dry-run`:
   ```
   node tools/promote-super-admin.js info@nibras-ac.com --primary --dry-run --production
   node tools/promote-super-admin.js info@nibras-ac.com --primary --production
   ```
   لو مفيش حساب بالإيميل ده، ضيف `--create "اسم المالك"`: الحساب بيتعمل من غير كلمة سر، والمالك يحط كلمة السر من «نسيت كلمة السر». لو الحساب موجود، بياناته وكلمة سره بتفضل زي ما هي.
5. **نقل البيانات القديمة** (كل سكريبت: تجربة أولاً ثم `--apply`):
   ```
   node data/migrations/001-crm-from-legacy.js --production
   node data/migrations/001-crm-from-legacy.js --production --apply
   node data/migrations/002-enrollments-from-legacy.js --production
   node data/migrations/002-enrollments-from-legacy.js --production --apply
   node data/migrations/003-link-legacy-certificates.js --production
   node data/migrations/003-link-legacy-certificates.js --production --apply
   node data/migrations/004-group-members-from-enrollments.js --production
   node data/migrations/004-group-members-from-enrollments.js --production --apply
   node data/migrations/005-five-roles.js --production
   node data/migrations/005-five-roles.js --production --apply
   node data/migrations/006-lecture-entries.js --production
   node data/migrations/006-lecture-entries.js --production --apply
   ```
   - **005:** الأدوار الخمسة. أي حساب بدور اتشال (مدير، موارد بشرية، مالية، محاسب، مدير موقع) بيبقى «موظف»، إلا لو حددت غير كده بـ `--map admin=team_leader`. الحسابات اللي اتنقلت بيتعملها تسجيل خروج.
   - **006:** الحضور القديم بيتحسب «دخول» للمحاضرة (المسار التعليمي). المحاور ما بتتقفلش هنا. لو عاوزها تتقفل وتطلع شهاداتها دلوقتي، ضيف `--refresh` مع `--apply`.
6. **صفحة صحة النظام** (`/portal/system`): كل الإعدادات المطلوبة ✓.
7. **النسخ التلقائي**: إعداد أسرار GitHub (انظر `docs/BACKUP-RESTORE.md`) وتشغيله مرة يدوياً.
8. **مراقبة توقف الموقع**: حساب مجاني على UptimeRobot (أو مثيله) يراقب `https://www.nibras-ac.com/api/health` كل 5 دقائق ويبعت إيميل/رسالة عند التوقف.

## إيميلات الأكاديمية (PLAN-V2)

1. **الإعداد:** متغيرات `EMAIL_*` فوق. بعد النشر جرّب «نسيت كلمة السر» على إيميلك، لازم توصل رسالة بشكل نبراس.
2. **علشان ما تقعش في السبام:** في لوحة الدومين (Hostinger ← DNS) فعّل **SPF** و**DKIM** لإيميل الأكاديمية. لو العدد كبر بعدين (مئات الإيميلات في اليوم)، انقلوا الإرسال لـ Brevo أو Resend.
3. **الإيميلات اللي بتتبعت لوحدها:** تأكيد الحساب، والترحيب، ونسيت كلمة السر، وكلمة السر اتغيرت، وتأكيد التسجيل في برنامج، وانضمامه لمجموعة، وإيصال الدفع، وتذكير القسط، وتذكير المحاضرة، والشهادة جاهزة، ورد طلب تعديل البيانات، ودعوة الفريق، وحساب الموظف الجديد (فيه لينك يختار منه كلمة السر).
4. **تذكير المحاضرة قبلها بساعة** محتاج المهمة اليومية تشتغل كل ساعة. ده مش متاح غير على **Vercel Pro**. لو اشتركتم فيه، غيّر `schedule` في `vercel.json` لـ `"0 * * * *"`. على الخطة المجانية بيوصل التذكير قبلها بيوم بس.

## هـ. الإعداد الأولي داخل البوابة (الإدارة)

كل الإدارة بقت من البوابة (/portal): الموقع الإلكتروني (البرامج والصور والكروت والآراء والطلبات) من صفحة **الموقع الإلكتروني**. صفحة لوحة التحكم القديمة بتحوّل للبوابة.

1. الأقسام والفرق وقادة الفرق، ثم الموظفين (كل موظف يأخذ كلمة مرور مؤقتة).
2. العملات والخزائن والحسابات البنكية (خزنة لكل عملة). أسعار الصرف اختيارية: التقارير بتعرض كل عملة لوحدها.
   - من **الإعدادات** ← بيانات الأكاديمية: العنوان والتليفون والرقم الضريبي ونسبة الضريبة (بتظهر على الإيصالات والتقارير، والإيصال بيبقى فاتورة ضريبية لو فيه رقم ضريبي).
3. نسب العمولات (لكل موظف أو افتراضية من الإعدادات)، ثم "حساب العمولات الناقصة".
   - من **الإعدادات** ← التذكير التلقائي بالأقساط (قبل الميعاد بكام يوم وبعد التأخير بكام يوم). كل الحسابات في قسم **الحسابات** في القايمة.
4. محاور البرامج والمجموعات.
5. قالب الشهادة (الشعار والتوقيعات) والاعتمادات.
   - من **الإعدادات**: شرط السداد قبل الشهادة (الافتراضي: سداد كل مستحقات العميل) ونسبة الحضور من زوم.
   - من كل مجموعة ← **الشهادات**: إمتى تطلع الشهادات (يدوي / أول ما تتعتمد / في تاريخ / بعد النهاية) وأقل نسبة حضور والإرسال بالإيميل.
6. مواعيد الدوام والعطلات وشاشة الحضور.
7. كل مدير يفعّل التحقق بخطوتين.

## ربط زوم (مرة واحدة، بحساب مدير زوم)

1. ادخل [marketplace.zoom.us](https://marketplace.zoom.us) بحساب الأكاديمية ← **Develop** ← **Build App** ← اختار **Server-to-Server OAuth App**.
2. سمّيه "Nibras Portal". هتاخد **Account ID** و **Client ID** و **Client Secret**.
3. في **Scopes** ضيف:
   - `meeting:write:meeting:admin` و `meeting:update:meeting:admin` و `meeting:delete:meeting:admin` و `meeting:read:meeting:admin` (إنشاء وتعديل وإلغاء المحاضرات)
   - `meeting:write:registrant:admin` (لينك خاص لكل عميل)
   - `report:read:list_meeting_participants:admin` (الحضور)
   - `cloud_recording:read:list_recording_files:admin` (التسجيلات)
   - `user:read:user:admin` (اختبار الربط)
4. **Activate** التطبيق.
5. حط القيم الثلاثة في متغيرات Vercel، و`ZOOM_HOST_USER` = إيميل حساب زوم المضيف. **ما تبعتهمش في شات أو إيميل.**
6. في البوابة: **المجموعات والمحاضرات** ← "اختبار الربط" لازم يقول "الربط يعمل".
7. في إعدادات زوم: فعّل **Cloud recording** علشان التسجيلات تظهر للعملاء لوحدها.

من غير الربط ده المحاضرات شغالة برضو: بتلزق لينك زوم والباسكود بإيدك.

## تخزين الملفات على Cloudflare R2 (مجاني لحد 10 جيجا)

الملفات زي المستندات وصور الإيصالات وصور الموقع بتتخزن في R2 بدل قاعدة البيانات، فقاعدة Atlas المجانية (512 ميجا) تفضل كافية.

1. اعمل حساب مجاني على [dash.cloudflare.com](https://dash.cloudflare.com) ← **R2** ← فعّل الخدمة. ممكن تطلب كارت للتأكيد، بس الخطة المجانية مش بتخصم حاجة لحد 10 جيجا.
2. **Create bucket**، واسمه مثلاً `nibras-files`. سيبه **private**، والسيستم هو اللي بيعرض الملفات.
3. **Manage R2 API Tokens** ← **Create API token** ← الصلاحية **Object Read & Write** على الـ bucket ده بس. هتاخد **Access Key ID** و**Secret Access Key**. **Account ID** موجود في صفحة R2.
4. حطهم في متغيرات Vercel، وما تبعتهمش في شات أو إيميل:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
5. من ساعتها كل ملف جديد بيترفع على R2.
6. علشان تنقل الملفات القديمة، حط نفس المتغيرات في `.env` على جهازك، وشغّل:
   ```
   node tools/move-files-to-r2.js --production
   node tools/move-files-to-r2.js --production --apply
   ```
   الأمر الأول تجربة. اللينكات القديمة بتفضل شغالة، وكل نسخة بتتأكد إنها مطابقة قبل ما تتشال من القاعدة.

## و. الرجوع في حالة مشكلة

- الكود: `git revert` لدمج الإطلاق ثم `git push` — الموقع يرجع للنسخة القديمة خلال دقائق. (العلامة `backup-before-erp-2026-11-10` فيها الكود قبل كل التعديلات.)
- البيانات: الجداول الجديدة لا تمس القديمة؛ النسخة الاحتياطية من الخطوة د-1 للاسترجاع عند الحاجة (`docs/BACKUP-RESTORE.md`).
