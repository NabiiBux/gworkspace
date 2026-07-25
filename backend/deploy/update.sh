#!/usr/bin/env bash
# Deploy/redeploy from GitHub main on the VPS:  bash backend/deploy/update.sh [--first-run]
# Pulls main, installs deps, rebuilds the React frontend (served by the backend),
# syntax-checks, and (re)starts the API under PM2.
set -euo pipefail
cd "$(dirname "$0")/../.."          # repo root
FIRST_RUN="${1:-}"

if [ "$FIRST_RUN" != "--first-run" ]; then
  echo "==> Pulling latest main…"
  git fetch origin main
  git checkout main
  git pull --ff-only origin main
fi

echo "==> Installing dependencies…"
npm install --prefix backend --omit=dev
npm install --prefix frontend

echo "==> Building frontend (env from backend/.env)…"
# Read single values from backend/.env WITHOUT sourcing it — values like the Google
# service-account JSON contain spaces and would break (and even execute) under `source`.
envval() { [ -f backend/.env ] && grep -E "^$1=" backend/.env | head -1 | cut -d= -f2- | tr -d '"' || true; }
# Prefer an explicit REACT_APP_* value in .env (paste the exact Vercel var names), else fall
# back to the backend variable names. REACT_APP_API_URL is intentionally left unset so the app
# defaults to window.location.origin + '/api' (i.e. https://portal.gnbmentor.com/api).
SIGNIN="$(envval REACT_APP_GOOGLE_SIGNIN_CLIENT_ID)"; [ -z "$SIGNIN" ] && SIGNIN="$(envval GOOGLE_OAUTH_CLIENT_ID)"
MAPS="$(envval REACT_APP_GOOGLE_MAPS_API_KEY)"; [ -z "$MAPS" ] && MAPS="$(envval GOOGLE_MAPS_API_KEY)"
REACT_APP_GOOGLE_SIGNIN_CLIENT_ID="$SIGNIN" \
REACT_APP_GOOGLE_MAPS_API_KEY="$MAPS" \
  npm run build --prefix frontend
echo "    (signin client id ${SIGNIN:+set}${SIGNIN:-MISSING}; maps key ${MAPS:+set}${MAPS:-MISSING})"

echo "==> Backend syntax check…"
node --check backend/backend-server.js

echo "==> (Re)starting API via PM2…"
mkdir -p backend/logs
if pm2 describe gworkspace-api >/dev/null 2>&1; then
  pm2 restart gworkspace-api --update-env
else
  pm2 start backend/ecosystem.config.js
fi
pm2 save

echo "==> Done. Recent logs:"
pm2 logs gworkspace-api --lines 20 --nostream
