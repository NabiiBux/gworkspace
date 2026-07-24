#!/usr/bin/env bash
# Redeploy the backend from GitHub main. Run on the VPS:  bash backend/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/../.."          # repo root

echo "==> Pulling latest main…"
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "==> Installing backend dependencies…"
cd backend
npm install --omit=dev

echo "==> Syntax check…"
node --check backend-server.js

echo "==> Restarting API via PM2…"
pm2 restart gworkspace-api --update-env
pm2 save

echo "==> Done. Recent logs:"
pm2 logs gworkspace-api --lines 20 --nostream
