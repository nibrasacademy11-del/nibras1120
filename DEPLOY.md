# Nibras Deployment Guide (Node.js)

## 1) Server requirements
- Node.js 18+ on Vercel (current setup) or any Node host
- MongoDB Atlas database
- HTTPS enabled

## 2) Environment variables
Set these in Vercel: Project Settings > Environment Variables. See `.env.example`.

| Name | Required | Notes |
|------|----------|-------|
| `MONGO_URI` | Yes | Atlas connection string. The site cannot start without it. |
| `MONGO_URI_FALLBACK` | No | Direct replica set URI, used if `MONGO_URI` fails. |
| `JWT_SECRET` | Yes | Long random value. Login is refused in production without it. |
| `SITE_URL` | Yes | `https://www.nibras-ac.com`. Used in password reset links. |
| `EMAIL_USER`, `EMAIL_PASS` | Yes | SMTP login for notifications and password reset. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE` | No | Defaults to Hostinger on port 587. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First run | Creates the first admin when it does not exist. |

Generate `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Check the deployment at `/api/health`: it should report `"status":"ok"`.

## 3) Running on a regular server
1. Copy the project and create `.env` from `.env.example`
2. Run `npm install`
3. Run `npm start`
4. Forward the domain to `http://127.0.0.1:3000`

## 4) Data
- All data lives in MongoDB Atlas, including certificate PDFs (4MB max each) and images uploaded from the admin panel.
- Admin-edited content (page header images, pathways, programs page cards, Nibras numbers) is stored in `SiteSettings`. Until a section is saved, the site shows the defaults in `assets/js/site-content.js`.
- Uploaded images that nothing uses are removed a day later, the next time an image is uploaded.
- Enable Atlas backups.
- `data/seedData.js` adds missing programs and settings without touching existing data.
- `data/migrateCatalog.js` normalizes specialties and fills English titles. It is safe to run again.

## 5) Admin panel
- Sign in from the normal login page with an admin account. The navigation then shows a "لوحة التحكم" button that opens `/pages/ar/admin.html`.
- Opening the admin page without an admin session sends you to the login page.

## 6) Security notes
- Secrets belong in environment variables only, never in the code.
- Use a long `JWT_SECRET` and change it to sign everyone out.
- Keep the Atlas network access list as narrow as the host allows.
