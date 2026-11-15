# تشغيل نبراس على سيرفر Hostinger (KVM 1) — خطوة بخطوة

السيستم كله على سيرفر واحد: الموقع، وبوابة الموظفين، وقاعدة البيانات، والتذكيرات اللي بتشتغل كل ساعة.
مفيش Vercel، ولا Atlas، ولا R2. الباك اب هو الباك اب الأسبوعي المجاني من Hostinger.

| الحاجة | فين |
|---|---|
| الموقع والعملاء | `https://www.nibras-ac.com` |
| المالك والموظفين وخدمة العملاء | `https://staff.nibras-ac.com` |
| قاعدة البيانات | MongoDB على نفس السيرفر (`127.0.0.1` بس، مقفولة من بره) |
| الملفات (مستندات، صور الموقع) | جوه قاعدة البيانات، على نفس السيرفر |
| التذكيرات (المحاضرات، الأقساط، المتابعات، الشهادات) | جوه السيستم نفسه، كل ساعة الساعة وخمس دقايق |
| الباك اب | Hostinger أسبوعي (من hPanel) |

---

## ١) قبل اليوم (مرة واحدة)

1. **اشتري KVM 1** من Hostinger لمدة 24 شهر:
   - المكان: أوروبا (هولندا أو ألمانيا أو فرنسا).
   - نظام التشغيل: **Ubuntu 24.04** من غير لوحة تحكم.
   - اكتب باسورد قوي لـ root واحفظه عندك. ما تبعتهوش في شات.
   - في صفحة الدفع، الباك اب الأسبوعي متضمّن ببلاش. لو لقيته إضافة بفلوس، شيل العلامة.
2. **في hPanel ← VPS ← Backups:** اتأكد إن الباك اب الأسبوعي شغال.
3. **خلّي الـ repo على GitHub خاص (Private).**
   - بعدها السيرفر محتاج إذن يقرأ الكود: GitHub ← الـ repo ← **Settings ← Deploy keys ← Add deploy key** (قراءة بس). المفتاح بيتعمل على السيرفر في الخطوة ٢.
4. **غيّر باسورد Atlas.** الباسورد القديم موجود في تاريخ الكود، وAtlas هيفضل شغال لحد يوم النقل.
5. **هات `DATA_ENCRYPTION_KEY` من Vercel:**
   - Vercel ← المشروع ← **Settings ← Environment Variables** ← اضغط على العين جنب `DATA_ENCRYPTION_KEY`.
   - **لازم نفس القيمة بالظبط** على السيرفر الجديد، وإلا أرقام الهوية والتحقق بخطوتين المشفرة ما تتقريش.
   - لو مش موجود في Vercel، يبقى البيانات لسه ما اتشفرتش. اعمل واحد جديد في الخطوة ٣.
6. **قلّل TTL في DNS** (hPanel ← Domains ← nibras-ac.com ← DNS) لسجلات `@` و`www` لـ 300 ثانية، قبل يوم النقل بيوم. كده تحويل الدومين ياخد دقايق مش ساعات.

## ٢) تجهيز السيرفر (حوالي ١٥ دقيقة)

من جهازك (PowerShell):

```
ssh root@<IP السيرفر>
```

على السيرفر:

```
ssh-keygen -t ed25519 -N "" -f /root/.ssh/github_deploy
cat /root/.ssh/github_deploy.pub
```

انسخ السطر اللي ظهر وحطه في GitHub ← **Deploy keys** (من الخطوة ١-٣). بعدها:

```
git clone -b main -c core.sshCommand="ssh -i /root/.ssh/github_deploy -o StrictHostKeyChecking=accept-new" git@github.com:nibrasacademy11-del/nibras1120.git /root/nibras-setup
bash /root/nibras-setup/deploy/setup-server.sh git@github.com:nibrasacademy11-del/nibras1120.git
```

السكريبت بيعمل كل ده:
- جدار حماية (SSH وHTTP وHTTPS بس).
- 2 جيجا ذاكرة احتياطية (swap).
- Node.js 22.
- MongoDB 8 بذاكرة 1 جيجا، على `127.0.0.1` بس.
- nginx وcertbot وpm2.
- مستخدم `nibras`، والكود في `/var/www/nibras` (بنفس مفتاح GitHub).

> الكود لازم يكون على `main` قبل الخطوة دي، يعني الفرع `erp-staff-portal` يتدمج الأول.

## ٣) ملف الإعدادات `.env` على السيرفر

```
sudo -u nibras nano /var/www/nibras/.env
```

| المتغير | القيمة |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/nibras?replicaSet=rs0` |
| `JWT_SECRET` | قيمة عشوائية جديدة (الأمر تحت) |
| `DATA_ENCRYPTION_KEY` | **نفس قيمة Vercel** (الخطوة ١-٥) |
| `SITE_URL` | `https://www.nibras-ac.com` |
| `STAFF_HOST` | `staff.nibras-ac.com` |
| `STAFF_COOKIE_DOMAIN` | `.nibras-ac.com` |
| `CMS_HOST` | فاضي (تعديل الموقع من لوحة المالك) |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_SECURE` / `EMAIL_USER` / `EMAIL_PASS` | إيميل الأكاديمية على Hostinger (نفس الموجود دلوقتي) |
| `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` / `ZOOM_HOST_USER` | من تطبيق زوم (`DEPLOY-ERP.md` ← ربط زوم) |
| `REQUIRE_2FA` | `admins` |
| `CRON_SECRET` | اختياري: لتشغيل التذكيرات بإيدك |
| `BACKUP_PASSPHRASE` | نفس عبارة السر اللي هتعمل بيها نسخة النقل (الخطوة ٤) |

**ما تحطش** `ADMIN_EMAIL` ولا `ADMIN_PASSWORD`. حساب المالك بيتعمل بأمر في الخطوة ٦.

قيمة عشوائية لأي سر:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

بعدها: `chmod 600 /var/www/nibras/.env`

## ٤) يوم النقل: نقل البيانات من Atlas (حوالي ساعة، يفضل بالليل)

> أي حاجة تتكتب على الموقع القديم بعد النسخة دي مش هتتنقل. عشان كده اعمل الخطوات ٤ و٥ و٧ ورا بعض من غير وقفة.

**على جهازك (ويندوز)**، في فولدر المشروع:

```
set BACKUP_PASSPHRASE=<عبارة سر طويلة>
node tools/backup-now.js --production
```

النسخة بتتحفظ مشفرة في `Desktop\My Work\Nibras-backups\` باسم زي `db-nibras-<التاريخ>.nbk`. الأمر ده **بيقرأ بس** من Atlas.

ارفعها للسيرفر:
```
scp "..\Nibras-backups\<الملف>.nbk" root@<IP>:/home/nibras/
```

**على السيرفر:**
```
chown nibras: /home/nibras/*.nbk
cd /var/www/nibras
sudo -u nibras npm ci --omit=dev
sudo -u nibras node tools/restore-backup.js /home/nibras/<الملف>.nbk --check
sudo -u nibras node tools/restore-backup.js /home/nibras/<الملف>.nbk --to-server
```

- `--check` بيعرض اللي جوه النسخة من غير ما يكتب حاجة.
- `--to-server` بيكتب في قاعدة السيرفر بس، وبيرفض لو القاعدة فيها بيانات أو لو العنوان مش على السيرفر نفسه.
- قارن الأعداد اللي بتطلع بالأعداد اللي طلعت على جهازك. لازم تبقى زي بعض.

## ٥) تشغيل السيستم

```
sudo -u nibras bash /var/www/nibras/deploy/update.sh main
```

ده بيجيب الكود، ويبني بوابة الموظفين، ويشغّل السيستم بـ pm2، وبيتأكد إنه بيرد. لو كتب `OK`، السيستم شغال.

## ٦) سكريبتات البيانات وحساب المالك (على السيرفر)

كل أمر بيتجرب الأول من غير `--apply` ومن غير ما يكتب حاجة، وبعدها يتشغل فعلاً:

```
cd /var/www/nibras
sudo -u nibras node tools/promote-super-admin.js info@nibras-ac.com --primary --dry-run --production
sudo -u nibras node tools/promote-super-admin.js info@nibras-ac.com --primary --production
for m in 001-crm-from-legacy 002-enrollments-from-legacy 003-link-legacy-certificates 004-group-members-from-enrollments 005-five-roles 006-lecture-entries; do
  sudo -u nibras node data/migrations/$m.js --production
done
```

لو كل التجارب تمام، شغّلها بـ `--apply` بنفس الترتيب.

## ٧) تحويل الدومين

في hPanel ← **Domains ← nibras-ac.com ← DNS**:

| النوع | الاسم | القيمة |
|---|---|---|
| A | `@` | IP السيرفر |
| A | `www` | IP السيرفر (امسح الـ CNAME القديم بتاع Vercel) |
| A | `staff` | IP السيرفر |

- **ما تلمسش** سجلات `MX` و`TXT` بتوع الإيميل، وإلا إيميل الأكاديمية هيقف.
- في Vercel: امسح الدومينات من المشروع (**Settings ← Domains**). كده الموقع القديم يبطل يشتغل ومحدش يكتب في Atlas تاني.

بعد ما الدومين يوصل للسيرفر (اتأكد بـ `ping www.nibras-ac.com`)، طلّع شهادة HTTPS:
```
certbot --nginx -d nibras-ac.com -d www.nibras-ac.com -d staff.nibras-ac.com --redirect -m info@nibras-ac.com --agree-tos -n
```
certbot بيجدد الشهادة لوحده.

## ٨) اتأكد

- `https://www.nibras-ac.com` الموقع فاتح، وتسجيل دخول عميل شغال.
- `https://staff.nibras-ac.com` دخول المالك، وصفحة **صحة النظام** كلها ✓، وفيها آخر تشغيل للتذكيرات.
- «نسيت كلمة المرور» بتوصل إيميل.
- **حسابات العملاء** (المالك وخدمة العملاء): القايمة ظاهرة بتواريخ التسجيل.

بعد أسبوعين من غير مشاكل: امسح Atlas وVercel.

---

## تحديث السيستم بعد كده

كل تعديل جديد بيتعمل push على `main`، وبعدين:
```
ssh root@<IP> "sudo -u nibras bash /var/www/nibras/deploy/update.sh main"
```
أو من جهازك: `deploy.bat` ← اختيار 4.

## أوامر مفيدة على السيرفر

| الأمر | بيعمل إيه |
|---|---|
| `sudo -u nibras pm2 status` | السيستم شغال ولا لأ |
| `sudo -u nibras pm2 logs nibras --lines 100` | آخر رسائل السيستم |
| `sudo -u nibras pm2 restart nibras` | إعادة تشغيل |
| `free -h` | الرام والـ swap |
| `df -h /` | المساحة |
| `systemctl status mongod` | قاعدة البيانات |

## لو حصلت مشكلة

- **السيستم واقع:** `pm2 logs`. pm2 بيشغّله تاني لوحده لو وقع، وبعد أي ريستارت للسيرفر.
- **تعديل بوّظ حاجة:** `sudo -u nibras bash deploy/update.sh` على commit قبله (`git revert` على `main` وبعدين `update.sh`).
- **البيانات اتمسحت أو اتبوظت:** hPanel ← VPS ← **Backups** ← استرجع آخر نسخة أسبوعية. ده بيرجّع السيرفر كله، فأي حاجة اتعملت بعد النسخة دي بتضيع.
- **نسخة يدوية قبل أي تغيير كبير** (على السيرفر):
  `cd /var/www/nibras && sudo -u nibras node tools/backup-now.js --production` (بتتحفظ في `/var/www/Nibras-backups`).
