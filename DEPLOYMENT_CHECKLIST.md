# ✅ Pre-Deployment Checklist & Quick Reference

## 📋 Before You Deploy - Complete This Checklist

### Accounts & Services (Required)
- [ ] GitHub account created and verified
  - Username: ________________
  - Link: https://github.com/YOUR_USERNAME

- [ ] Vercel account created
  - Email: ________________
  - Link: https://vercel.com/dashboard

- [ ] Railway account created
  - Email: ________________
  - Link: https://railway.app/dashboard

- [ ] MongoDB Atlas account with cluster created
  - Username: reseller_admin
  - Cluster: ________________
  - Connection string saved

- [ ] Stripe account (test mode)
  - Publishable key: pk_test_________________
  - Secret key: sk_test_________________
  - Mode: TEST (not live yet)

- [ ] Gmail with 2FA enabled
  - Email: ________________
  - App password generated: ________________

- [ ] Google Cloud Project with Service Account
  - Email: ________________@project.iam.gserviceaccount.com
  - Private key: saved securely

### Code Preparation
- [ ] All files created locally in correct structure
- [ ] .env.example reviewed and values prepared
- [ ] backend/package.json present
- [ ] frontend/package.json present
- [ ] No sensitive data in code
- [ ] All dependencies listed in package.json

### GitHub Setup
- [ ] Repository created
- [ ] Code pushed to main branch
- [ ] Folder structure correct:
  ```
  backend/
  frontend/
  DATABASE_SCHEMA.js
  email-templates.js
  SETUP_GUIDE.md
  README.md
  .env.example
  ```

---

## 🚀 Quick Deployment Steps

### Phase 1: GitHub (5 minutes)
```bash
cd google-workspace-reseller
git init
git add .
git commit -m "Initial commit: Workspace Reseller Portal"
git remote add origin https://github.com/YOUR_USERNAME/google-workspace-reseller.git
git branch -M main
git push -u origin main
```

### Phase 2: MongoDB Atlas (5 minutes)
1. Create cluster → wait 3 mins
2. Create user: reseller_admin (save password!)
3. Get connection string
4. Allow access from anywhere

**MongoDB URI:**
```
mongodb+srv://reseller_admin:PASSWORD@cluster.mongodb.net/workspace-reseller?retryWrites=true&w=majority
```

### Phase 3: Frontend → Vercel (10 minutes)
1. vercel.com → "Import Project"
2. Select GitHub repo
3. Root directory: `./frontend`
4. Add env var: `REACT_APP_API_URL` (leave blank, update later)
5. Deploy
6. Copy your Vercel URL: `https://workspace-reseller-frontend.vercel.app`

### Phase 4: Backend → Railway (15 minutes)
1. railway.app → "New Project"
2. Select GitHub repo
3. Add MongoDB service
4. Add all environment variables (see full list below)
5. Deploy
6. Copy your Railway URL: `https://your-api.up.railway.app`

### Phase 5: Connect Frontend to Backend (5 minutes)
1. Vercel dashboard → Settings → Environment Variables
2. Update `REACT_APP_API_URL = https://your-api.up.railway.app/api`
3. Deploy again (Redeploy button)
4. Test at frontend URL

### Phase 6: Test (10 minutes)
1. Visit frontend URL
2. Register test account
3. Check backend logs for errors
4. Test payment (use Stripe test card 4242 4242 4242 4242)

---

## 🔑 Environment Variables - Complete List

Copy this and fill in your values. Add to Railway:

```
# ==================== DATABASE ====================
MONGODB_URI=mongodb+srv://reseller_admin:PASSWORD@cluster.mongodb.net/workspace-reseller?retryWrites=true&w=majority

# ==================== SERVER ====================
PORT=5000
NODE_ENV=production

# ==================== JWT ====================
JWT_SECRET=make-this-long-random-32-chars-minimum-use-https://www.uuidgenerator.net/

# ==================== EMAIL ====================
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-character-app-password

# ==================== GOOGLE WORKSPACE ====================
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GOOGLE_PROJECT_ID=your-project-id-12345

# ==================== STRIPE ====================
STRIPE_PUBLIC_KEY=pk_test_your_key
STRIPE_SECRET_KEY=sk_test_your_secret_key

# ==================== PAYPAL ====================
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
PAYPAL_MODE=sandbox

# ==================== CORS ====================
CORS_ORIGIN=https://workspace-reseller-frontend.vercel.app

# ==================== BUSINESS ====================
BUSINESS_NAME=Google Workspace Reseller
BUSINESS_EMAIL=support@yourreseller.com
BUSINESS_PHONE=+1-XXX-XXX-XXXX
BUSINESS_WEBSITE=https://yourreseller.com

# ==================== PRICING ====================
WORKSPACE_MARKUP=20
VOICE_MARKUP=15

# ==================== LOGGING ====================
LOG_LEVEL=info
```

---

## 🧪 Testing After Deployment

### Test 1: Check Frontend
```
https://workspace-reseller-frontend.vercel.app
```
✅ Should load login page

### Test 2: Check Backend Health
```
https://your-api.up.railway.app/api/health
```
✅ Should return: `{"status": "Server is running"}`

### Test 3: Register Account
1. Go to frontend
2. Click "Register"
3. Fill in test data
4. Submit
✅ Account should be created

### Test 4: Check Logs
**Frontend (Vercel):**
- Vercel dashboard → Deployments → Latest → Logs

**Backend (Railway):**
- Railway dashboard → backend service → Logs

---

## 🐛 Common Issues & Fixes

### Issue: "Cannot reach backend"
**Check:**
- [ ] Backend URL in REACT_APP_API_URL matches Railway URL
- [ ] CORS_ORIGIN in Railway matches frontend URL exactly
- [ ] Backend service is "Running" in Railway
- [ ] No typos in URLs

**Fix:**
```bash
# Update frontend env var
REACT_APP_API_URL=https://your-api.up.railway.app/api

# Update backend CORS
CORS_ORIGIN=https://workspace-reseller-frontend.vercel.app

# Redeploy both
```

### Issue: Database connection error
**Check:**
- [ ] MongoDB cluster is running (green status in Atlas)
- [ ] Connection string is correct
- [ ] Password doesn't have special characters that need escaping
- [ ] IP whitelist allows your backend

**Fix:**
```bash
# Test connection string locally first
# Then update in Railway and redeploy
```

### Issue: Email not sending
**Check:**
- [ ] 2FA enabled on Gmail
- [ ] Using 16-char app password (not Gmail password)
- [ ] EMAIL_USER and EMAIL_PASSWORD are set in Railway

**Fix:**
```bash
# Generate new app password
# Update EMAIL_PASSWORD in Railway
# Redeploy
```

### Issue: Payments failing
**Check:**
- [ ] Using test keys (pk_test_, sk_test_)
- [ ] Using test card: 4242 4242 4242 4242
- [ ] Stripe account is active

**Fix:**
```bash
# Verify keys in Stripe dashboard
# Update STRIPE_SECRET_KEY in Railway
# Redeploy
```

---

## 📊 Monitoring Your Live System

### Daily Checks (First Week)
- [ ] Check backend logs for errors
- [ ] Test registration and login
- [ ] Verify emails are sending
- [ ] Check payment processing

### Weekly Checks
- [ ] Review error logs
- [ ] Check database size
- [ ] Monitor API response times
- [ ] Verify backups are working

### Metrics to Track
- Successful registrations per day
- Orders placed per day
- Payment success rate
- Email delivery success rate
- API response time (aim for <200ms)

---

## 🔗 Live URLs After Deployment

| Service | URL |
|---------|-----|
| Frontend | https://workspace-reseller-frontend.vercel.app |
| Backend API | https://your-api.up.railway.app |
| Database | MongoDB Atlas (cloud) |
| Admin Dashboard | https://workspace-reseller-frontend.vercel.app/admin |

---

## 📞 Support Resources

**When you get stuck:**

1. **Check error logs first**
   - Vercel: Dashboard → Deployments → Logs
   - Railway: Dashboard → Service → Logs

2. **Read documentation**
   - Vercel: https://vercel.com/docs
   - Railway: https://docs.railway.app
   - MongoDB: https://docs.mongodb.com

3. **Try in search order**
   - Google the exact error message
   - Check GitHub Issues
   - Ask in community Discord
   - Email Vercel/Railway support

---

## ✨ After Deployment Success

### Next Steps:
1. [ ] Add custom domain (optional)
2. [ ] Set up email templates with branding
3. [ ] Configure Google Workspace reseller account
4. [ ] Test with real Google Workspace services
5. [ ] Add team members to manage
6. [ ] Create help/support documentation
7. [ ] Set up analytics tracking
8. [ ] Plan upgrade path for growth

### Marketing Your Portal:
- Add to your website
- Send to potential customers
- Create demo videos
- Write setup guides
- Share on social media

---

## 🎓 Learning Resources

If you want to understand more:

- **React**: https://react.dev/learn
- **Node.js**: https://nodejs.org/en/docs
- **Express**: https://expressjs.com
- **MongoDB**: https://docs.mongodb.com
- **Deployment**: https://www.theodinproject.com/

---

## 💾 Backup Your Configuration

**Save these files safely:**
```
📄 Environment variables (.env files)
📄 MongoDB connection string
📄 Stripe/PayPal API keys
📄 Google Cloud service account key
📄 Gmail app password
📄 GitHub personal access token
```

**Use a password manager:**
- 1Password
- LastPass
- Bitwarden
- Dashlane

---

## 🎉 Congratulations!

Your Google Workspace Reseller Portal is now live!

**Share these URLs:**
- Frontend: `https://workspace-reseller-frontend.vercel.app`
- Documentation: `https://workspace-reseller-frontend.vercel.app/docs`

**Start promoting:**
- Email customers the signup link
- Add to your website
- Create demo for prospects
- Get feedback and iterate

---

**Last Updated:** June 2024
**Status:** ✅ Ready for Production
