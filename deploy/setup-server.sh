#!/usr/bin/env bash
# One-time setup of a fresh Hostinger VPS (KVM 1, Ubuntu 24.04) for Nibras: run as root.
#
#   bash setup-server.sh <git-repo-url>
#
# Installs: firewall (SSH, HTTP, HTTPS only), 2 GB swap, Node.js 22, MongoDB 8.0 as a one-node
# replica set (the system uses transactions) listening on 127.0.0.1 only with a 1 GB cache,
# nginx, certbot and pm2; creates the user "nibras" and clones the code to /var/www/nibras.
# Safe to run again: every step checks first.

set -euo pipefail
REPO="${1:-}"
APP_DIR=/var/www/nibras
APP_USER=nibras

if [ "$(id -u)" != "0" ]; then echo "Run as root."; exit 1; fi
if [ -z "$REPO" ]; then echo "Usage: bash setup-server.sh <git-repo-url>"; exit 1; fi

echo "== System updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl gnupg git ufw nginx certbot python3-certbot-nginx unattended-upgrades
timedatectl set-timezone Africa/Cairo

echo "== Firewall: SSH, HTTP, HTTPS"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "== Swap (2 GB)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

echo "== Node.js 22"
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "== MongoDB 8.0"
if ! command -v mongod >/dev/null; then
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-8.0.list
  apt-get update -y
  apt-get install -y mongodb-org
fi
cat > /etc/mongod.conf <<'CONF'
# Nibras: local only, one-node replica set (transactions), 1 GB cache on a 4 GB server
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: 1
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
processManagement:
  timeZoneInfo: /usr/share/zoneinfo
replication:
  replSetName: rs0
CONF
systemctl enable mongod
systemctl restart mongod
for i in $(seq 1 30); do mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 && break; sleep 1; done
mongosh --quiet --eval 'try { rs.status().ok } catch (e) { rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] }).ok }'

echo "== The app user and the code"
id "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$APP_USER"
mkdir -p "$APP_DIR" /var/www/Nibras-backups "/home/$APP_USER/logs"
chown "$APP_USER:$APP_USER" "$APP_DIR" /var/www/Nibras-backups "/home/$APP_USER/logs"
# the read-only GitHub key made for root (docs/DEPLOY-VPS.md step 2) is the app user's too
GIT_SSH=""
if [ -f /root/.ssh/github_deploy ]; then
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  install -m 600 -o "$APP_USER" -g "$APP_USER" /root/.ssh/github_deploy "/home/$APP_USER/.ssh/github_deploy"
  GIT_SSH="ssh -i /home/$APP_USER/.ssh/github_deploy -o StrictHostKeyChecking=accept-new"
fi
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" GIT_SSH_COMMAND="${GIT_SSH:-ssh}" git clone "$REPO" "$APP_DIR"
  if [ -n "$GIT_SSH" ]; then sudo -u "$APP_USER" git -C "$APP_DIR" config core.sshCommand "$GIT_SSH"; fi
fi
# pm2 starts the app again after a reboot
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null

echo "== nginx"
cp "$APP_DIR/deploy/nginx-nibras.conf" /etc/nginx/sites-available/nibras
ln -sf /etc/nginx/sites-available/nibras /etc/nginx/sites-enabled/nibras
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo
echo "Done. Next (see docs/DEPLOY-VPS.md):"
echo "  1) put the .env in $APP_DIR (as $APP_USER)"
echo "  2) sudo -u $APP_USER bash $APP_DIR/deploy/update.sh"
echo "  3) point the domain here, then: certbot --nginx -d nibras-ac.com -d www.nibras-ac.com -d staff.nibras-ac.com"
