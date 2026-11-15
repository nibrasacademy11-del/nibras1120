# Nibras deployment

Nibras runs on one Hostinger VPS (KVM 1, Ubuntu 24.04): Node.js 22 behind nginx, MongoDB 8 on the
same machine (127.0.0.1, one-node replica set), pm2 keeping the app up, and the hourly jobs
(reminders, Zoom attendance, due certificates) inside the app. Backups: Hostinger's weekly VPS backup.

- Step by step (Arabic), including the move from Atlas: [docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md)
- Server files: [deploy/](deploy/) — `setup-server.sh` (once, as root), `update.sh` (every update),
  `nginx-nibras.conf`, `ecosystem.config.js` (pm2)
- Domains: [docs/DOMAINS.md](docs/DOMAINS.md) · Backups: [docs/BACKUP-RESTORE.md](docs/BACKUP-RESTORE.md)

Update the server after pushing to `main`:

```bash
ssh root@<server-ip> "sudo -u nibras bash /var/www/nibras/deploy/update.sh main"
```

Health check: `/api/health` reports `"status":"ok"`; the owner's System health page shows the
settings, the database and the last run of the hourly jobs.
