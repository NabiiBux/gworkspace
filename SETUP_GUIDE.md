# 🚀 Google Workspace Reseller Portal - Complete Setup Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [System Architecture](#system-architecture)
4. [Installation & Setup](#installation--setup)
5. [Google Workspace Configuration](#google-workspace-configuration)
6. [Payment Gateway Setup](#payment-gateway-setup)
7. [Running the Application](#running-the-application)
8. [API Documentation](#api-documentation)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)

---

## Project Overview

This is a complete **Google Workspace Reseller Portal** built with:
- **Frontend**: React.js with modern UI/UX
- **Backend**: Node.js + Express.js
- **Database**: MongoDB
- **APIs**: Google Workspace Admin SDK, Google Voice API
- **Payments**: Stripe, PayPal integration
- **Email**: Nodemailer (Gmail SMTP)

**Features:**
- Customer registration & authentication
- Product ordering (Google Workspace & Voice)
- Subscription management
- User management & provisioning
- Invoice generation
- Domain verification
- Dashboard with analytics
- Multi-tenant architecture

---

## Prerequisites

### Required
- **Node.js** v14+ (https://nodejs.org)
- **npm** or **yarn** (comes with Node.js)
- **MongoDB** (local or MongoDB Atlas account)
- **Google Cloud Project** (with Service Account)
- **Stripe Account** (for payments)
- **Gmail Account** (for email notifications)

### Optional
- **Git** (for version control)
- **Postman** (for API testing)
- **VS Code** (recommended editor)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                       │
│                    http://localhost:3000                    │
│  - Login & Registration                                     │
│  - Product Ordering                                         │
│  - Dashboard & Analytics                                    │
│  - User Management                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API (Axios)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js)                        │
│                  http://localhost:5000                      │
│  - Authentication & Authorization                          │
│  - Order Management                                         │
│  - Subscription Management                                  │
│  - Payment Processing                                       │
│  - Email Notifications                                      │
└──────────────┬──────────────────┬──────────────────────────┘
               │                  │
        ┌──────┴────────┐    ┌────┴─────────────┐
        ↓               ↓    ↓                   ↓
    ┌────────┐    ┌─────────────────┐   ┌──────────────┐
    │MongoDB │    │Google Workspace │   │Payment       │
    │        │    │Admin API        │   │Gateways      │
    └────────┘    └─────────────────┘   │(Stripe,      │
                                         │PayPal)       │
                                         └──────────────┘
```

---

## Installation & Setup

### Step 1: Clone/Download Project

```bash
# Navigate to your projects directory
cd ~/projects

# Create project folder
mkdir google-workspace-reseller
cd google-workspace-reseller

# Initialize git (optional)
git init
```

### Step 2: Backend Setup

```bash
# Create backend folder
mkdir backend
cd backend

# Copy backend-server.js here
# Copy backend-package.json here as package.json

# Install dependencies
npm install

# Create .env file
cp ../.env.example .env

# Edit .env with your credentials
nano .env  # or open with your editor
```

### Step 3: Frontend Setup

```bash
# Go back to root directory
cd ..

# Create React app
npx create-react-app frontend

# Navigate to frontend
cd frontend

# Copy frontend-app.jsx to src/App.js
cp ../frontend-app.jsx src/App.js

# Copy app-styles.css to src/App.css
cp ../app-styles.css src/App.css

# Create .env file for React
cat > .env << EOF
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_ENV=development
EOF

# Install additional dependencies
npm install axios

cd ..
```

### Step 4: Create Project Structure

```
google-workspace-reseller/
├── backend/
│   ├── backend-server.js
│   ├── package.json
│   ├── .env
│   └── node_modules/
├── frontend/
│   ├── src/
│   │   ├── App.js (frontend-app.jsx)
│   │   ├── App.css (app-styles.css)
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   ├── package.json
│   ├── .env
│   └── node_modules/
└── .env.example
```

---

## Google Workspace Configuration

### Step 1: Create Google Cloud Project

1. Visit https://console.cloud.google.com
2. Click on "Select a Project" → "New Project"
3. Enter name: "Google Workspace Reseller Portal"
4. Click "Create"
5. Wait for project creation (2-3 minutes)

### Step 2: Enable Google Workspace Admin API

1. Go to APIs & Services → Library
2. Search for "Google Workspace Admin API"
3. Click on result → "Enable"
4. Repeat for:
   - Directory API
   - Gmail API
   - Calendar API
   - Drive API

### Step 3: Create Service Account

1. Go to APIs & Services → Credentials
2. Click "Create Credentials" → "Service Account"
3. Fill in:
   - Service account name: "workspace-reseller"
   - Service account ID: (auto-filled)
   - Description: "Service account for Workspace reseller portal"
4. Click "Create and Continue"
5. Grant roles:
   - **Workspace Admin** (for user management)
6. Click "Continue" → "Done"

### Step 4: Create Private Key

1. Click on created service account
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose "JSON"
5. Click "Create"
6. File will download automatically

### Step 5: Configure .env

```bash
# Open backend/.env
# Copy values from downloaded JSON:

# Service account email (looks like: xxx@xxx.iam.gserviceaccount.com)
GOOGLE_SERVICE_ACCOUNT_EMAIL=

# Private key (entire key including BEGIN and END markers)
GOOGLE_PRIVATE_KEY=

# Project ID (looks like: my-project-12345)
GOOGLE_PROJECT_ID=
```

**Important:** Make sure `GOOGLE_PRIVATE_KEY` is properly formatted:
- Keep the entire key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
- Replace actual newlines with `\n`

### Step 6: Grant Service Account Admin Access

1. Go to Google Admin Console: https://admin.google.com
2. Go to Security → API Controls
3. Click "Domain-wide Delegation"
4. Add the service account with these scopes:
   - `https://www.googleapis.com/auth/admin.directory.customer`
   - `https://www.googleapis.com/auth/admin.directory.user`
   - `https://www.googleapis.com/auth/admin.directory.domain`

---

## Payment Gateway Setup

### Stripe Setup

1. Create account at https://stripe.com
2. Go to Dashboard → Developers → API Keys
3. Copy keys:
   - **Publishable Key** → `STRIPE_PUBLIC_KEY`
   - **Secret Key** → `STRIPE_SECRET_KEY`
4. Add to `.env` file

### PayPal Setup

1. Create account at https://developer.paypal.com
2. Go to Dashboard → Sandbox/Live → Accounts
3. Copy credentials:
   - **Client ID** → `PAYPAL_CLIENT_ID`
   - **Secret** → `PAYPAL_CLIENT_SECRET`
4. Add to `.env` file

---

## MongoDB Setup

### Option A: Local MongoDB

```bash
# Install MongoDB Community Edition
# macOS (with Homebrew):
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community

# Connection string:
MONGODB_URI=mongodb://localhost:27017/workspace-reseller
```

### Option B: MongoDB Atlas (Cloud)

1. Visit https://www.mongodb.com/cloud/atlas
2. Create free account
3. Create new cluster (Free tier)
4. Create database user (save username & password)
5. Get connection string (Cluster → Connect → Drivers)
6. Format: `mongodb+srv://username:password@cluster.mongodb.net/workspace-reseller`
7. Add to `.env`:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/workspace-reseller
```

---

## Email Configuration (Gmail)

### Step 1: Enable 2-Factor Authentication

1. Go to https://myaccount.google.com/security
2. Enable "2-Step Verification"
3. Complete verification

### Step 2: Generate App Password

1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" → "Windows Computer" (or your device)
3. Generate password
4. Copy the 16-character password

### Step 3: Update .env

```
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-character-app-password
```

**Note:** Use the 16-character password, NOT your Gmail password

---

## Running the Application

### Terminal 1: Start Backend

```bash
cd backend
npm install
npm run dev
```

You should see:
```
✅ Server running on port 5000
📧 Email service: your-email@gmail.com
🔐 JWT Secret configured: Yes
☁️ Google Workspace configured: Yes
```

### Terminal 2: Start Frontend

```bash
cd frontend
npm install
npm start
```

Application will open at http://localhost:3000

### Terminal 3: MongoDB (if using local)

```bash
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
# MongoDB should auto-start or start from Services
```

---

## Testing the Application

### 1. Create Test Account

1. Go to http://localhost:3000
2. Click "Register"
3. Fill in details:
   - Company Name: "Test Company"
   - Business Email: "test@example.com"
   - Password: "TestPassword123!"
   - Other fields as needed
4. Click "Create Account"

### 2. Login

1. Enter your test email and password
2. Click "Login"
3. You should see the Dashboard

### 3. Order a Product

1. Click "Products" in sidebar
2. Click "Add to Cart" for any product
3. Click "Proceed to Checkout"
4. Choose payment method
5. Click "Complete Order"

### 4. Test User Creation

1. Click "Users" in sidebar
2. Click "+ Add User"
3. Fill in details
4. Click "Create User"
5. Check email for invitation (if email service is working)

---

## API Documentation

### Authentication Endpoints

#### Register
```
POST /api/auth/register
Content-Type: application/json

{
  "companyName": "Your Company",
  "businessEmail": "email@company.com",
  "password": "SecurePassword123",
  "phone": "+1234567890",
  "country": "United States",
  "address": "123 Main St",
  "taxId": "XX-XXXXXXXX"
}

Response:
{
  "success": true,
  "token": "jwt_token_here",
  "customer": { ... }
}
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "businessEmail": "email@company.com",
  "password": "SecurePassword123"
}

Response:
{
  "success": true,
  "token": "jwt_token_here",
  "customer": { ... }
}
```

### Products Endpoints

#### Get Products
```
GET /api/products

Response:
{
  "workspace": [ ... ],
  "voice": [ ... ],
  "addons": [ ... ]
}
```

### Orders Endpoints

#### Create Order
```
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "productType": "workspace",
      "productName": "Business Starter",
      "quantity": 5,
      "monthlyPrice": 6
    }
  ],
  "paymentMethod": "stripe"
}
```

#### Get Orders
```
GET /api/orders
Authorization: Bearer <token>

Response: [ { order objects } ]
```

### Users Endpoints

#### Create User
```
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@company.com",
  "voiceNumber": "+1234567890",
  "forwardingNumber": "+0987654321"
}
```

#### Get Users
```
GET /api/users
Authorization: Bearer <token>

Response: [ { user objects } ]
```

### Subscriptions Endpoints

#### Get Subscriptions
```
GET /api/subscriptions
Authorization: Bearer <token>

Response: [ { subscription objects } ]
```

#### Update Subscription
```
PATCH /api/subscriptions/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "seats": 10,
  "autoRenew": true
}
```

### Invoices Endpoints

#### Get Invoices
```
GET /api/invoices
Authorization: Bearer <token>

Response: [ { invoice objects } ]
```

---

## Deployment

### Deploy Backend (Heroku)

```bash
# Install Heroku CLI
brew install heroku/brew/heroku

# Login
heroku login

# Create app
heroku create google-workspace-reseller-api

# Set environment variables
heroku config:set -a google-workspace-reseller-api \
  MONGODB_URI="your-mongo-uri" \
  JWT_SECRET="your-secret" \
  STRIPE_SECRET_KEY="your-key" \
  # ... other variables

# Deploy
git push heroku main

# View logs
heroku logs -a google-workspace-reseller-api
```

### Deploy Frontend (Vercel/Netlify)

#### Vercel
```bash
npm install -g vercel
vercel

# Follow prompts
# Update .env.production with backend URL
```

#### Netlify
```bash
npm install -g netlify-cli
netlify deploy --prod

# or connect GitHub repo in Netlify dashboard
```

### Environment Variables for Production

Update these in production:
```
CORS_ORIGIN=https://yourdomain.com
NODE_ENV=production
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
```

---

## Database Backup

### MongoDB Atlas Backup
1. Go to Backup section
2. Enable automated backups
3. Download snapshots as needed

### Manual Backup
```bash
mongodump --uri "mongodb+srv://user:pass@cluster.mongodb.net/workspace-reseller"
```

---

## Security Best Practices

1. ✅ Keep `.env` file secret (never commit to Git)
2. ✅ Use HTTPS in production
3. ✅ Enable CORS only for your domain
4. ✅ Use rate limiting on API endpoints
5. ✅ Validate all user inputs on backend
6. ✅ Hash passwords with bcrypt
7. ✅ Use JWT tokens with expiration
8. ✅ Keep Google service account key secure
9. ✅ Monitor payment gateway for fraud
10. ✅ Regular security audits

---

## Troubleshooting

### "Cannot find module 'express'"
```bash
cd backend
npm install
```

### "MongoDB connection error"
- Check MongoDB is running
- Verify connection string in .env
- Check database exists in MongoDB Atlas

### "Google Workspace API error"
- Verify service account has proper permissions
- Check that Domain-wide Delegation is enabled
- Ensure scopes are correctly configured

### "Payment processing fails"
- Verify Stripe/PayPal credentials
- Check test mode is enabled
- Use test card: 4242 4242 4242 4242

### "Email not sending"
- Verify Gmail app password (not regular password)
- Check 2-Factor Authentication is enabled
- Verify CORS allows your domain
- Check spam/trash folder

### "Frontend can't reach backend"
- Verify backend is running on port 5000
- Check REACT_APP_API_URL in .env
- Check CORS settings in backend

### "CORS error"
Add to .env:
```
CORS_ORIGIN=http://localhost:3000
```

For production:
```
CORS_ORIGIN=https://yourdomain.com
```

---

## Support & Resources

- **Google Workspace Admin API**: https://developers.google.com/admin-sdk
- **MongoDB Docs**: https://docs.mongodb.com
- **Stripe Docs**: https://stripe.com/docs
- **React Documentation**: https://react.dev
- **Express.js**: https://expressjs.com

---

## License

This project is provided as-is for your Google Workspace reseller business.

---

## Contact & Updates

For updates and support:
- Check GitHub for latest version
- Review API changes in CHANGELOG
- Test thoroughly in development before production

---

**Happy reselling! 🚀**
