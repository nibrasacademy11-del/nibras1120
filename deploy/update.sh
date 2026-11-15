#!/usr/bin/env bash
# Puts the latest code on the server and restarts the app. Run as the user "nibras":
#
#   bash /var/www/nibras/deploy/update.sh            the branch already checked out (main)
#   bash /var/www/nibras/deploy/update.sh <branch>   another branch
#
# It stops before restarting if anything fails, so the running app is never left half-updated.

set -euo pipefail
APP_DIR=/var/www/nibras
cd "$APP_DIR"
BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

if [ ! -f .env ]; then echo "No .env in $APP_DIR: see docs/DEPLOY-VPS.md"; exit 1; fi

echo "== Code ($BRANCH)"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "== Packages"
npm ci --omit=dev --no-audit --no-fund

echo "== The staff portal"
npm --prefix portal ci --no-audit --no-fund
npm --prefix portal run build

echo "== Restart"
mkdir -p /home/nibras/logs
export APP_VERSION="$(git rev-parse --short HEAD)"
if pm2 describe nibras >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.js --update-env
else
  pm2 start deploy/ecosystem.config.js
fi
pm2 save

sleep 3
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  echo "OK: $(git log -1 --format='%h %s')"
else
  echo "The app did not answer: pm2 logs nibras --lines 50"
  exit 1
fi
