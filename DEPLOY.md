# Nibras Deployment Guide (Node.js)

## 1) Server requirements
- Node.js 18+ installed on hosting
- Domain pointed to your Node app
- HTTPS enabled (recommended)

## 2) Setup
1. Copy project files to server
2. Create `.env` from `.env.example`
3. Install dependencies:
   - `npm install`
4. Start app:
   - `npm start`

## 3) Environment variables
- `PORT=3000`
- `JWT_SECRET=your-strong-random-secret`
- `ADMIN_EMAIL=nibras8883@gmail.com`
- `ADMIN_PASSWORD=Aa01515416972`
- `NODE_ENV=production`

## 4) Reverse proxy (Nginx/Apache)
- Forward domain traffic to `http://127.0.0.1:3000`
- Keep `/uploads/*` accessible via app (already configured)

## 5) Data persistence
- Database file: `data/nibras.db`
- Uploaded files: `uploads/certificates/`
- Back up both folders regularly

## 6) Security notes
- Change default admin password immediately after first deploy.
- Use a long `JWT_SECRET`.
- Keep HTTPS enabled in production.
