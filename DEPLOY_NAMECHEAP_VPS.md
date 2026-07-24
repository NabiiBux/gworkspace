# Deploy the backend on a Namecheap VPS (Railway replacement)

This runs `backend/backend-server.js` on your VPS with **PM2** (keeps it alive, restarts on reboot)
behind **Nginx** with free **Let's Encrypt SSL**. MongoDB stays on Atlas; the frontend stays where it is —
only the API moves.

**You need:** VPS root SSH access, Ubuntu 20.04/22.04 (a clean OS image is best — if your VPS has cPanel,
see the note at the bottom), and an API subdomain, e.g. `api.gnbmentor.com`.

---

## 1. Point a subdomain at the VPS

In Namecheap DNS for your domain, add an **A record**:

- Host: `api` → Value: `<YOUR_VPS_IP>` (TTL automatic)

## 2. Install Node.js 20, git, nginx, PM2 (SSH into the VPS as root)

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx
npm install -g pm2
node -v   # should print v20.x
```

## 3. Clone the repo and install dependencies

```bash
cd /opt
git clone https://github.com/NabiiBux/gworkspace.git
cd gworkspace/backend
npm install --omit=dev
```

(For a private repo, create a GitHub fine-grained personal access token with read access and clone with
`git clone https://<TOKEN>@github.com/NabiiBux/gworkspace.git`.)

## 4. Create the .env

```bash
cp .env.vps.example .env
nano .env
```

Fill in every value — copy them from **Railway → your service → Variables**. Three values CHANGE for the VPS:

| Variable | New value |
|---|---|
| `NAMECHEAP_CLIENT_IP` | your VPS public IP (and whitelist that IP in Namecheap → Profile → Tools → API Access) |
| `GOOGLE_OAUTH_REDIRECT_URI` / `_USA` | swap the Railway domain for `https://api.gnbmentor.com/...` (same path), and add the new URI in Google Cloud Console → Credentials |
| `STRIPE_WEBHOOK_SECRET` | new signing secret from step 7 |

Paste the two `GOOGLE_SERVICE_ACCOUNT_JSON` values as **one single line** each, exactly as they are in Railway.

## 5. Start with PM2

```bash
cd /opt/gworkspace/backend
mkdir -p logs
pm2 start ecosystem.config.js
pm2 startup            # prints a command — run it (registers PM2 on boot)
pm2 save
curl http://127.0.0.1:5000/api/health   # should return OK JSON
```

Logs (your `[lookup]`, `[auto-renew]`, `[bulk-lookup]` lines) are at:

```bash
pm2 logs gworkspace-api
```

## 6. Nginx + SSL

```bash
cp /opt/gworkspace/backend/deploy/nginx-api.conf /etc/nginx/sites-available/gworkspace-api
nano /etc/nginx/sites-available/gworkspace-api    # replace api.gnbmentor.com if different
ln -s /etc/nginx/sites-available/gworkspace-api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.gnbmentor.com      # choose redirect HTTP→HTTPS
```

Firewall (if enabled / to enable):

```bash
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
```

Test from your own computer: `https://api.gnbmentor.com/api/health` should return OK.

## 7. Re-point the outside world at the VPS

1. **Stripe webhook** — Stripe Dashboard → Developers → Webhooks: edit (or add) the endpoint to
   `https://api.gnbmentor.com/api/webhooks/stripe`, event `checkout.session.completed`.
   Copy the **new signing secret** into `STRIPE_WEBHOOK_SECRET` in `.env`, then `pm2 restart gworkspace-api`.
2. **MongoDB Atlas** — Network Access → add the VPS IP (replace the old allow-all/Railway entry if you want).
3. **Google Cloud Console** — both OAuth clients (PK + USA): add the new redirect URI.
4. **Frontend** — in Vercel (or wherever the frontend builds), set
   `REACT_APP_API_URL=https://api.gnbmentor.com/api` and redeploy the frontend.
5. **Nicky** — if a webhook/callback URL is configured in your Nicky account, update it to the new domain.

Once everything works, you can stop the Railway service.

## 8. Deploying updates later

```bash
bash /opt/gworkspace/backend/deploy/update.sh
```

That pulls `main`, installs deps, syntax-checks, and restarts PM2. (This replaces Railway's auto-deploy;
run it after each merge to main.)

## Notes / gotchas

- **Keep ONE instance** (`ecosystem.config.js` already does): the daily billing/auto-renew scheduler runs
  inside the process — two instances would double-charge/double-suspend.
- `backend/google_connections.json` (OAuth fallback tokens) now persists on disk — an upgrade over Railway's
  ephemeral filesystem. It lives in `backend/` and survives restarts; don't delete it.
- The daily billing check schedules itself in-process at midnight — no external cron needed. Optionally point
  a free cron (cron-job.org) at `https://api.gnbmentor.com/api/cron/subscription-billing` as a backup.
- **If your VPS has cPanel**: cPanel's Apache occupies ports 80/443. Easiest fix is reinstalling the VPS with
  a clean Ubuntu image (Namecheap panel → Reinstall). Alternatively run Nginx on other ports or use Apache's
  reverse proxy — but clean Ubuntu is strongly recommended.
- RAM: the API runs comfortably in ~200–400 MB; any 1 GB+ VPS plan is fine.
