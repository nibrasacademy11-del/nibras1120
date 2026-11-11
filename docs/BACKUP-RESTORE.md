# النسخ الاحتياطي والاسترجاع

## النسخ التلقائي اليومي (GitHub Actions)

الملف: `.github/workflows/backup.yml` — بيشتغل كل يوم الساعة 2:30 بتوقيت القاهرة، ويقدر يتشغل يدوياً من تبويب **Actions**.

1. في GitHub: **Settings ← Secrets and variables ← Actions ← New repository secret**:
   - `BACKUP_MONGO_URI`: رابط القاعدة الحقيقية (يُفضل مستخدم Atlas بصلاحية قراءة فقط `readAnyDatabase`).
   - `BACKUP_PASSPHRASE`: عبارة سر طويلة. **احفظ نسخة منها ورقياً أو في مدير كلمات مرور** — من غيرها النسخ مش هتتفتح.
2. اختياري (لحفظ النسخ أكتر من 30 يوم): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
3. من **Actions ← Database backup ← Run workflow** شغّله مرة وتأكد إنه نجح.

النسخة بتتشفّر قبل ما تتحفظ، لأن الـ repository عام وملفات الـ Actions ممكن تتحمل من أي حد عنده حساب GitHub.

## نسخة يدوية قبل أي تغيير كبير

```
set BACKUP_PASSPHRASE=...
node tools/backup-now.js --production
```

بتتحفظ في `Desktop\My Work\Nibras-backups\` بامتداد `.nbk` (مشفرة).

## الاسترجاع

### من نسخة GitHub (mongodump)

```
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in nibras-<التاريخ>.archive.gz.enc -out nibras.archive -pass pass:<BACKUP_PASSPHRASE>
mongorestore --uri="<رابط القاعدة التجريبية>" --archive=nibras.archive --gzip --drop
```

### من نسخة يدوية (.nbk)

```
node tools/restore-backup.js <الملف>.nbk --check      # يعرض المحتوى بدون كتابة
node tools/restore-backup.js <الملف>.nbk --to-test    # يسترجع في القاعدة التجريبية
```

**القاعدة:** الاسترجاع يكون الأول في قاعدة تجريبية، تتراجع البيانات، وبعد موافقة الإدارة يتغير رابط `MONGO_URI` على Vercel للقاعدة المسترجعة. محدش يسترجع فوق القاعدة الحقيقية مباشرة.

## تجربة الاسترجاع (مرة كل 3 شهور)

1. شغّل النسخ اليدوي أو حمّل آخر نسخة من GitHub.
2. استرجعها في القاعدة التجريبية.
3. افتح البوابة على القاعدة التجريبية وتأكد من: عدد العملاء، آخر دفعة، آخر شهادة.
4. سجّل التاريخ والنتيجة.
