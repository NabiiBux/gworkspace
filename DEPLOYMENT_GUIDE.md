# 🚀 Complete Deployment Guide
## Vercel (Frontend) + Railway (Backend)

---

## 📋 Pre-Deployment Checklist

Before you start, make sure you have:
- [ ] GitHub account (free at github.com)
- [ ] Vercel account (free at vercel.com)
- [ ] Railway account (free at railway.app)
- [ ] MongoDB Atlas account (free at mongodb.com/cloud/atlas)
- [ ] Stripe account (free at stripe.com)
- [ ] Gmail account with 2FA enabled
- [ ] All code files ready locally

---

## STEP 1: Set Up GitHub Repository

### 1.1 Create GitHub Account
1. Go to https://github.com/signup
2. Sign up with your email
3. Verify your email
4. Complete profile setup

### 1.2 Create Repository
1. Log in to GitHub
2. Click **"+"** in top right → **"New repository"**
3. Enter details:
   ```
   Repository name: google-workspace-reseller
   Description: Google Workspace reseller portal
   Public: Yes (Vercel needs to see it)
   Initialize with README: No
   ```
4. Click **"Create repository"**

### 1.3 Upload Project to GitHub

**Option A: Using Git Command Line (Recommended)**

Open terminal/command prompt in your project root:

```bash
# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Google Workspace Reseller Portal"

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/google-workspace-reseller.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Option B: Upload Manually on GitHub**
1. On your repository page, click **"Add file"** → **"Upload files"**
2. Drag and drop your project folders
3. Commit the changes

### 1.4 Verify Upload
Visit `https://github.com/YOUR_USERNAME/google-workspace-reseller`
You should see your code with this structure:
```
backend/
frontend/
DATABASE_SCHEMA.js
email-templates.js
admin-panel-component.jsx
SETUP_GUIDE.md
.env.example
README.md
```

---

## STEP 2: Set Up MongoDB Atlas (Cloud Database)

### 2.1 Create MongoDB Account
1. Go to https://www.mongodb.com/cloud/atlas
2. Click **"Try Free"**
3. Sign up with your email
4. Verify email and log in

### 2.2 Create Cluster
1. Click **"Create"** on the default "Build your first cluster" card
2. Select **"Shared"** (Free tier)
3. Choose region closest to you
4. Click **"Create Cluster"** (takes 2-3 minutes)

### 2.3 Create Database User
1. Go to **"Database Access"** in sidebar
2. Click **"+ Add New Database User"**
3. Enter:
   ```
   Username: reseller_admin
   Password: (click "Generate Secure Password" and copy it)
   ```
4. Select **"Built-in Role"** → **"Atlas admin"**
5. Click **"Add User"**
6. **Save the password somewhere safe!**

### 2.4 Get Connection String
1. Go to **"Database"** → Click **"Connect"** on your cluster
2. Click **"Drivers"**
3. Select **"Node.js"** and version **"4.0 or later"**
4. Copy the connection string (looks like):
   ```
   mongodb+srv://reseller_admin:PASSWORD@cluster.mongodb.net/workspace-reseller?retryWrites=true&w=majority
   ```
5. Replace `PASSWORD` with your actual password
6. Save this string - you'll need it for backend setup

### 2.5 Whitelist IP Addresses
1. Go to **"Network Access"** in sidebar
2. Click **"+ Add IP Address"**
3. Click **"Allow Access from Anywhere"**
   (For production, restrict to your server IP later)
4. Click **"Confirm"**

---

## STEP 3: Deploy Frontend to Vercel

### 3.1 Connect Vercel to GitHub
1. Go to https://vercel.com/signup
2. Click **"Continue with GitHub"**
3. Authorize Vercel to access GitHub
4. Click **"Import Project"**

### 3.2 Import Your Repository
1. Under "From Git Repository", paste:
   ```
   https://github.com/YOUR_USERNAME/google-workspace-reseller
   ```
2. Click **"Continue"**
3. Vercel will analyze your project

### 3.3 Configure Frontend
When Vercel asks for project settings:
1. **Project name:** `workspace-reseller-frontend`
2. **Framework preset:** React
3. **Root directory:** `./frontend` (Important!)
4. Click **"Continue"**

### 3.4 Add Environment Variables
In the next screen, you'll see "Environment Variables":

Click **"Add"** and enter:
```
REACT_APP_API_URL = (leave blank for now - we'll update this after backend is deployed)
REACT_APP_ENV = production
```

Click **"Deploy"**

### 3.5 Wait for Deployment
Vercel will build and deploy. This takes 2-3 minutes.

When complete, you'll see:
```
✅ Production
https://workspace-reseller-frontend.vercel.app
```

**Save this URL - you'll need it for backend CORS settings!**

---

## STEP 4: Deploy Backend to Railway

Railway is easier than Heroku for beginners. Plus it's free tier is generous.

### 4.1 Create Railway Account
1. Go to https://railway.app
2. Click **"Start Project"**
3. Sign up with GitHub (easier)
4. Authorize Railway

### 4.2 Create New Project
1. Click **"+ Create New"**
2. Select **"GitHub Repo"**
3. Search and select `google-workspace-reseller`
4. Click **"Deploy Now"**

### 4.3 Add MongoDB Service
Railway automatically detects services. Let's add MongoDB:

1. In Railway dashboard, click **"+ New"**
2. Select **"Database"** → **"MongoDB"**
3. Railway creates a MongoDB instance
4. Copy the connection string shown

### 4.4 Create backend/.env on Railway

In your Railway project:
1. Click the **"backend"** service (if auto-detected) or create one:
   - Click **"+ New"**
   - Select **"GitHub Repo"**
   - Select backend folder path: `./backend`

2. Go to **Variables** tab
3. Click **"Raw Editor"** and paste:

```
MONGODB_URI=mongodb+srv://reseller_admin:YOUR_PASSWORD@cluster.mongodb.net/workspace-reseller?retryWrites=true&w=majority
PORT=3000
NODE_ENV=production

JWT_SECRET=your-super-secret-key-change-this-make-it-long-and-random-32-chars-minimum

EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-character-app-password

GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n
GOOGLE_PROJECT_ID=your-project-id

STRIPE_PUBLIC_KEY=pk_test_your_key
STRIPE_SECRET_KEY=sk_test_your_secret_key

PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
PAYPAL_MODE=sandbox

CORS_ORIGIN=https://workspace-reseller-frontend.vercel.app

BUSINESS_NAME=Google Workspace Reseller
BUSINESS_EMAIL=support@yourreseller.com
BUSINESS_PHONE=+1-XXX-XXX-XXXX
BUSINESS_WEBSITE=https://yourreseller.com

WORKSPACE_MARKUP=20
VOICE_MARKUP=15

LOG_LEVEL=info
```

**Important:** Replace all `YOUR_...` values with actual credentials!

### 4.5 Deploy Backend
1. Click **"Deploy"** button
2. Railway builds and deploys (takes 3-5 minutes)
3. When done, you'll see a green "Running" status
4. Copy the URL under "Domains":
   ```
   https://your-backend.up.railway.app
   ```

**Save this URL!**

---

## STEP 5: Connect Frontend to Backend

### 5.1 Update Frontend Environment Variable
1. Go to Vercel dashboard
2. Click your frontend project
3. Go to **Settings** → **Environment Variables**
4. Find/Edit `REACT_APP_API_URL`
5. Update value to:
   ```
   https://your-backend.up.railway.app/api
   ```
6. Click **"Save"**

### 5.2 Trigger Redeployment
1. Go to **Deployments** tab
2. Click the three dots on the latest deployment
3. Click **"Redeploy"**
4. Wait for it to complete (2-3 minutes)

---

## STEP 6: Configure External Services

### 6.1 Google Workspace Setup (Already Done?)
If you haven't set up Google Workspace API yet:

1. Create Google Cloud Project:
   - Go to https://console.cloud.google.com
   - Create new project
   
2. Enable APIs:
   - Search "Google Workspace Admin API"
   - Enable it
   - Repeat for: Directory API, Gmail API, Calendar API, Drive API

3. Create Service Account:
   - APIs & Services → Credentials
   - Create Service Account
   - Download JSON key
   - Copy values to Railway environment variables:
     - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
     - `GOOGLE_PRIVATE_KEY`
     - `GOOGLE_PROJECT_ID`

4. Grant Domain-wide Delegation:
   - In Admin Console (admin.google.com)
   - Security → API Controls → Domain-wide Delegation
   - Add service account with these scopes:
     ```
     https://www.googleapis.com/auth/admin.directory.customer
     https://www.googleapis.com/auth/admin.directory.user
     https://www.googleapis.com/auth/admin.directory.domain
     ```

### 6.2 Stripe Setup
1. Create Stripe account: https://stripe.com
2. Go to Dashboard → Developers → API Keys
3. Copy:
   - **Publishable Key** → `STRIPE_PUBLIC_KEY`
   - **Secret Key** → `STRIPE_SECRET_KEY`
4. Update in Railway environment variables

### 6.3 Gmail Configuration
1. Enable 2-Factor Authentication on your Gmail
2. Generate App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" → "Windows Computer"
   - Generate password (16 characters)
3. Update in Railway:
   - `EMAIL_USER` = your-email@gmail.com
   - `EMAIL_PASSWORD` = the 16-char password

---

## STEP 7: Test the Live Deployment

### 7.1 Test Frontend
1. Visit: `https://workspace-reseller-frontend.vercel.app`
2. You should see the login page
3. Try registering with test data
4. Check browser console (F12) for any errors

### 7.2 Test Backend API
Open a new tab and visit:
```
https://your-backend.up.railway.app/api/health
```

You should see:
```json
{
  "status": "Server is running"
}
```

### 7.3 Test Full Workflow
1. Go to frontend
2. Register new account
3. Check email for confirmation (should arrive in 2-3 minutes)
4. Login
5. Try ordering a product
6. Check Stripe test dashboard for payment attempt

### 7.4 Monitor Logs
**Backend logs:**
- Railway dashboard → backend service → Logs tab
- Watch for errors as you test

**Frontend errors:**
- Vercel dashboard → Deployments → click deployment → Logs
- Or open browser DevTools (F12) → Console

---

## STEP 8: Set Up Custom Domain (Optional)

### 8.1 Domain for Frontend (Vercel)
1. Go to Vercel project settings
2. Domains section
3. Add your domain (e.g., portal.yourcompany.com)
4. Follow DNS instructions
5. Update CORS on backend

### 8.2 Domain for Backend (Railway)
1. Railway project settings
2. Custom Domain section
3. Add domain (e.g., api.yourcompany.com)
4. Follow DNS instructions
5. Update frontend REACT_APP_API_URL

---

## STEP 9: Troubleshooting Deployment

### Issue: Frontend shows "Cannot reach backend"
**Solution:**
```bash
# Check CORS_ORIGIN in Railway
# Should match frontend domain exactly
CORS_ORIGIN=https://workspace-reseller-frontend.vercel.app

# Check REACT_APP_API_URL in Vercel
# Should be: https://your-backend.up.railway.app/api
```

### Issue: "CORS error" in browser
1. Backend error, not frontend problem
2. Check `CORS_ORIGIN` in Railway environment variables
3. Redeploy backend after changes:
   - Railway dashboard → Settings → Redeploy

### Issue: Database connection error
1. Check MongoDB Atlas is running
2. Verify connection string in `MONGODB_URI`
3. Check IP whitelist in MongoDB Atlas allows your backend's IP
   - Go to Network Access → Allow Access from Anywhere (temporary)

### Issue: Email not sending
1. Verify 2-Factor Authentication enabled on Gmail
2. Generate new App Password
3. Make sure using 16-char app password, not Gmail password
4. Update `EMAIL_PASSWORD` in Railway

### Issue: Google Workspace API errors
1. Check service account has correct permissions
2. Verify Domain-wide Delegation is enabled
3. Check scopes are correct in Admin Console

### Issue: Stripe payments failing
1. Use test cards in test mode:
   ```
   Card: 4242 4242 4242 4242
   Expiry: 12/25
   CVC: 123
   ```
2. Check Stripe API keys are for test mode (pk_test_, sk_test_)
3. Check Stripe account has email configured

---

## STEP 10: Monitor Your Live System

### 10.1 Set Up Alerts
**Railway:**
1. Project settings → Integrations
2. Connect Slack for notifications
3. Configure alerts for crashes/errors

**Vercel:**
1. Project settings → Integrations
2. Connect Slack
3. Get deployment notifications

### 10.2 Regular Checks
- [ ] Check backend logs weekly for errors
- [ ] Monitor MongoDB storage usage
- [ ] Review Stripe dashboard for transactions
- [ ] Check email delivery success rate

### 10.3 Database Backups
**MongoDB Atlas:**
1. Go to Backup section
2. Enable automated daily backups
3. Download backups weekly for safety

---

## STEP 11: Scale for Production (When Ready)

### 11.1 Upgrade from Free Tier
When you get real customers:
- **Vercel:** Upgrade to Pro ($20/month)
- **Railway:** Upgrade to paid plan (~$5/month per service)
- **MongoDB:** Increase storage beyond 512MB

### 11.2 Optimize Performance
1. Add Redis caching (Railway → New Service → Redis)
2. Set up CDN for static assets
3. Implement rate limiting on API

### 11.3 Security Hardening
1. [ ] Use HTTPS everywhere (automatic with Vercel/Railway)
2. [ ] Enable WAF (Web Application Firewall)
3. [ ] Set up IP whitelisting for admin panel
4. [ ] Implement 2FA for customer accounts
5. [ ] Regular security audits

---

## FINAL DEPLOYMENT SUMMARY

### Your Live URLs
```
🎨 Frontend: https://workspace-reseller-frontend.vercel.app
⚙️  Backend: https://your-backend.up.railway.app
📊 Database: MongoDB Atlas (cloud)
💳 Payments: Stripe (test/live keys)
📧 Email: Gmail (App Password)
```

### What's Running
```
✅ Frontend: React app served globally via Vercel CDN
✅ Backend: Node.js/Express running on Railway
✅ Database: MongoDB hosted on Atlas
✅ Emails: Sent via Gmail SMTP
✅ Payments: Processed via Stripe
```

### Next Steps
1. Test thoroughly with real data
2. Set up domain names
3. Configure email templates with your branding
4. Add your Google Workspace credentials
5. Monitor for issues daily first week
6. Scale up when you get customers

---

## Support & Quick Links

- **Vercel Docs:** https://vercel.com/docs
- **Railway Docs:** https://docs.railway.app
- **MongoDB Atlas:** https://docs.atlas.mongodb.com
- **Stripe API:** https://stripe.com/docs/api

---

## Video Tutorials (Recommended)

If you prefer video walkthroughs:
- Vercel deployment: YouTube "deploy React to Vercel 2024"
- Railway backend: YouTube "Railway.app deploy Node.js app"
- MongoDB Atlas: YouTube "MongoDB Atlas setup 2024"

---

**🎉 Congratulations! Your portal is now live!**

Share your live URL: `https://workspace-reseller-frontend.vercel.app`

Monitor your dashboard: 
- Vercel: https://vercel.com/dashboard
- Railway: https://railway.app/dashboard
- MongoDB: https://cloud.mongodb.com

---

**Need help?** Join the Railway/Vercel Discord communities for quick support!
