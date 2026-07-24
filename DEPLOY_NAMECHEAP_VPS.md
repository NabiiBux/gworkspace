# Deploy portal.gnbmentor.com on a Namecheap VPS (Railway replacement)

Your backend serves BOTH the API and the React frontend from one process — `portal.gnbmentor.com`
today points at Railway which does both. The VPS simply takes over that same domain:
one server, one domain, frontend + API together, with **PM2** (keeps it alive, restarts on reboot)
behind **Nginx** with free **Let's Encrypt SSL**. MongoDB stays on Atlas.

Because the domain stays `portal.gnbmentor.com`, your **Stripe webhook URL and Google OAuth redirect
URIs do NOT change.** Only two external things change (step 7).

**You need:** VPS root SSH access and Ubuntu 20.04/22.04 (a clean OS image is best — if your VPS has
cPanel, see the note at the bottom).

---

## 1. Install Node.js 20, git, nginx, PM2 (SSH into the VPS as root)

First check which OS the VPS runs: `cat /etc/os-release`.

**Ubuntu / Debian:**

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx
npm install -g pm2
node -v   # should print v20.x
```

**CentOS / AlmaLinux / Rocky (`apt: command not found` → you're here):**

```bash
dnf update -y
dnf install -y curl git nginx
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
npm install -g pm2
node -v   # should print v20.x
systemctl enable --now nginx
# SELinux blocks nginx from proxying to the Node app — allow it (one-time, required):
setsebool -P httpd_can_network_connect 1
```

On RHEL-family, later steps differ in two places: use **firewalld** instead of ufw (step 5) and install
certbot via EPEL (step 6) — both shown inline below.

If your VPS has **1 GB RAM or less**, add swap first (the React build needs it):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 2. Clone the repo and install dependencies

```bash
cd /opt
git clone https://github.com/NabiiBux/gworkspace.git
cd gworkspace
npm install --prefix backend --omit=dev
npm install --prefix frontend
```

(For a private repo, create a GitHub fine-grained personal access token with read access and clone with
`git clone https://<TOKEN>@github.com/NabiiBux/gworkspace.git`.)

## 3. Create the backend .env

```bash
cd /opt/gworkspace/backend
cp .env.vps.example .env
nano .env
```

Fill in every value — copy them from **Railway → your service → Variables**. Because the domain is
unchanged, almost everything is copied as-is (including `GOOGLE_OAUTH_REDIRECT_URI`, `PORTAL_URL`,
`STRIPE_WEBHOOK_SECRET`). The ONE value that must change:

| Variable | New value |
|---|---|
| `NAMECHEAP_CLIENT_IP` | your VPS public IP — and whitelist that IP in Namecheap → Profile → Tools → API Access |

Paste the two `GOOGLE_SERVICE_ACCOUNT_JSON` values as **one single line** each, exactly as in Railway.

## 4. Build the frontend, start with PM2

```bash
cd /opt/gworkspace
bash backend/deploy/update.sh --first-run
```

That builds the React frontend (served by the backend automatically) and starts the API under PM2.
Then make PM2 survive reboots:

```bash
pm2 startup     # prints a command — run it
pm2 save
curl http://127.0.0.1:5000/api/health   # should return OK JSON
```

Logs (your `[lookup]`, `[auto-renew]`, `[bulk-lookup]` lines — this replaces Railway logs):

```bash
pm2 logs gworkspace-api
```

## 5. Nginx + SSL

```bash
cp /opt/gworkspace/backend/deploy/nginx-api.conf /etc/nginx/sites-available/gworkspace
ln -s /etc/nginx/sites-available/gworkspace /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
```

Don't run certbot yet — it needs DNS pointing here first (next step).

Firewall — **Ubuntu/Debian:**

```bash
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
```

Firewall — **CentOS/AlmaLinux/Rocky (firewalld):**

```bash
firewall-cmd --permanent --add-service=http --add-service=https --add-service=ssh
firewall-cmd --reload
```

## 6. Switch DNS: portal.gnbmentor.com → the VPS

In Namecheap DNS for `gnbmentor.com`:

- **Delete/edit** the existing `portal` record (currently a CNAME/A pointing at Railway).
- Add an **A record**: Host `portal` → Value `<YOUR_VPS_IP>`.

Wait a few minutes for DNS, then issue the SSL certificate.

**Ubuntu/Debian** (certbot was installed in step 5). **CentOS/AlmaLinux/Rocky** — install it first:

```bash
dnf install -y epel-release && dnf install -y certbot python3-certbot-nginx
```

Then on either OS:

```bash
certbot --nginx -d portal.gnbmentor.com     # choose redirect HTTP→HTTPS
```

Open `https://portal.gnbmentor.com` — you should see your portal, served by the VPS.
(Railway keeps running unchanged during all this, so there's no downtime while DNS switches —
both serve the same app against the same database.)

## 7. The only two external updates

1. **MongoDB Atlas** — Network Access → add the VPS IP.
2. **Namecheap API** — whitelist the VPS IP (matches `NAMECHEAP_CLIENT_IP` from step 3).

Stripe webhook, Google OAuth redirects, Nicky URLs: **unchanged** — same domain as before.

Once you've tested login, a domain lookup, and (with a real payment) the Stripe webhook, stop the
Railway service.

## 8. Deploying updates later

After each merge to main:

```bash
bash /opt/gworkspace/backend/deploy/update.sh
```

Pulls `main`, installs deps, **rebuilds the frontend**, syntax-checks, restarts PM2.
(This replaces Railway's auto-deploy.)

## Notes / gotchas

- **Keep ONE instance** (`ecosystem.config.js` already does): the daily billing/auto-renew scheduler
  runs inside the process — two instances would double-charge/double-suspend.
- `backend/google_connections.json` (OAuth fallback tokens) now persists on disk — an upgrade over
  Railway's ephemeral filesystem. Don't delete it.
- The daily billing check schedules itself in-process at midnight — no external cron needed. Optionally
  point a free cron (cron-job.org) at `https://portal.gnbmentor.com/api/cron/subscription-billing` as backup.
- **If your VPS has cPanel**: cPanel's Apache occupies ports 80/443. Easiest fix is reinstalling with a
  clean Ubuntu image (Namecheap panel → Reinstall). Clean Ubuntu is strongly recommended.
- RAM: the API runs in ~200–400 MB. The React build is the heavy part — the swapfile from step 1 covers it.
