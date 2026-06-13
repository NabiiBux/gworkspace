# 🚀 Google Workspace Reseller Portal

A complete, production-ready platform for reselling Google Workspace and Google Voice services. Built with React.js, Node.js, Express, and MongoDB.

**Status:** ✅ Ready for deployment

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Support](#support)

---

## ✨ Features

### Customer Features
- ✅ User registration & authentication
- ✅ Dashboard with real-time analytics
- ✅ Browse and order Google Workspace products
- ✅ Order Google Voice services
- ✅ Subscription management
- ✅ Add/manage end users
- ✅ Invoice & billing history
- ✅ Domain verification
- ✅ Profile management

### Admin Features
- ✅ Customer management
- ✅ Order monitoring
- ✅ Payment tracking
- ✅ Revenue analytics
- ✅ Platform settings
- ✅ Support ticket management
- ✅ Audit logs

### Google Workspace Integration
- ✅ Automatic user provisioning
- ✅ License management
- ✅ Domain verification
- ✅ Multi-tenant architecture
- ✅ Admin API integration

### Payment Processing
- ✅ Stripe integration
- ✅ PayPal integration
- ✅ Bank transfer support
- ✅ Invoice generation
- ✅ Automatic billing

### Communication
- ✅ Email notifications
- ✅ Order confirmation emails
- ✅ Invoice delivery
- ✅ User invitation emails
- ✅ Renewal reminders

---

## 🛠 Tech Stack

### Frontend
- **React.js** 18+ - UI library
- **Axios** - HTTP client
- **CSS3** - Modern styling with custom design system
- **Responsive Design** - Mobile-first approach

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database (local or Atlas)
- **Mongoose** - ODM (Object Data Modeling)
- **JWT** - Authentication
- **Bcrypt** - Password hashing

### APIs & Integrations
- **Google Workspace Admin API** - User management
- **Google Voice API** - Phone number management
- **Stripe API** - Payment processing
- **PayPal API** - Payment processing
- **Nodemailer** - Email sending (Gmail SMTP)

### DevOps & Deployment
- **Heroku** - Backend hosting (recommended)
- **Vercel/Netlify** - Frontend hosting
- **MongoDB Atlas** - Cloud database
- **Environment Variables** - Configuration management

---

## 📁 Project Structure

```
google-workspace-reseller/
│
├── backend/
│   ├── backend-server.js          # Main Express server
│   ├── package.json               # Dependencies
│   ├── .env                       # Environment variables
│   └── node_modules/              # Dependencies (generated)
│
├── frontend/
│   ├── src/
│   │   ├── App.js                 # Main React component
│   │   ├── App.css                # Styles
│   │   ├── index.js               # Entry point
│   │   └── index.css              # Global styles
│   ├── public/
│   ├── package.json               # Dependencies
│   ├── .env                       # React environment variables
│   └── node_modules/              # Dependencies (generated)
│
├── DATABASE_SCHEMA.js             # MongoDB schema setup
├── email-templates.js             # Email notification templates
├── admin-panel-component.jsx      # Admin dashboard component
├── SETUP_GUIDE.md                 # Complete setup instructions
├── .env.example                   # Environment variables template
└── README.md                      # This file

```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 14+ (https://nodejs.org)
- MongoDB (local or MongoDB Atlas account)
- Google Cloud Project with Service Account
- Stripe and/or PayPal account
- Gmail account (for email notifications)

### Installation & Setup (5 minutes)

#### 1. Clone the Repository
```bash
git clone <repository-url>
cd google-workspace-reseller
```

#### 2. Backend Setup
```bash
cd backend

# Install dependencies
npm install

# Create .env file from template
cp ../.env.example .env

# Edit .env with your credentials
nano .env
```

**Required .env variables:**
```
MONGODB_URI=mongodb://localhost:27017/workspace-reseller
JWT_SECRET=your-secret-key-here
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
STRIPE_SECRET_KEY=sk_test_...
EMAIL_USER=your@gmail.com
EMAIL_PASSWORD=your-app-password
```

#### 3. Frontend Setup
```bash
cd ../frontend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_ENV=development
EOF
```

#### 4. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Server running on http://localhost:5000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
# Frontend running on http://localhost:3000
```

**Terminal 3 - MongoDB (if using local):**
```bash
mongod
# MongoDB running on mongodb://localhost:27017
```

### Access the Application
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000/api
- **Admin Panel:** http://localhost:3000/admin

### Create Test Account
1. Click "Register"
2. Fill in company details
3. Set password
4. Click "Create Account"

---

## 📚 Documentation

### Setup Guide
Complete step-by-step instructions for setting up the entire system:
- Database configuration
- Google Workspace API setup
- Payment gateway integration
- Email configuration
- Environment variables

👉 [Read SETUP_GUIDE.md](./SETUP_GUIDE.md)

### Database Schema
MongoDB collection definitions with validation rules and indexes:
- Customer model
- Order model
- Subscription model
- User model
- Invoice model
- Domain model
- Audit logs

👉 [Read DATABASE_SCHEMA.js](./DATABASE_SCHEMA.js)

### Email Templates
HTML email templates for all notifications:
- Registration confirmation
- Order confirmation
- Invoice notification
- User invitation
- Subscription renewal reminder
- Payment received

👉 [Read email-templates.js](./email-templates.js)

### Admin Panel
Complete admin dashboard with:
- Customer management
- Order monitoring
- Payment tracking
- Analytics & reports
- Platform settings

👉 [Read admin-panel-component.jsx](./admin-panel-component.jsx)

---

## 🔌 API Reference

### Authentication Endpoints

#### Register
```http
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
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "businessEmail": "email@company.com",
  "password": "SecurePassword123"
}

Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "customer": { ... }
}
```

### Products Endpoints

#### Get All Products
```http
GET /api/products

Response:
{
  "workspace": [
    {
      "id": "starter",
      "name": "Business Starter",
      "monthlyPrice": 6,
      "features": [...]
    }
  ],
  "voice": [...],
  "addons": [...]
}
```

### Orders Endpoints

#### Create Order
```http
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

#### Get Customer Orders
```http
GET /api/orders
Authorization: Bearer <token>

Response: [{ order objects }]
```

### Users Endpoints

#### Create User
```http
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
```http
GET /api/users
Authorization: Bearer <token>

Response: [{ user objects }]
```

#### Delete User
```http
DELETE /api/users/:id
Authorization: Bearer <token>
```

### Subscriptions Endpoints

#### Get Subscriptions
```http
GET /api/subscriptions
Authorization: Bearer <token>
```

#### Update Subscription
```http
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
```http
GET /api/invoices
Authorization: Bearer <token>
```

#### Get Invoice Details
```http
GET /api/invoices/:id
Authorization: Bearer <token>
```

### Domains Endpoints

#### Add Domain
```http
POST /api/domains
Authorization: Bearer <token>
Content-Type: application/json

{
  "domainName": "example.com"
}
```

#### Get Domains
```http
GET /api/domains
Authorization: Bearer <token>
```

#### Verify Domain
```http
POST /api/domains/:id/verify
Authorization: Bearer <token>
```

---

## 📊 Dashboard Statistics

The platform provides real-time analytics including:

- **Total Orders** - Number of orders placed
- **Active Subscriptions** - Currently active subscriptions
- **Total Users** - End users created
- **Total Revenue** - All-time revenue
- **Pending Invoices** - Awaiting payment
- **Reseller Code** - Unique identifier for marketing

---

## 🔒 Security Features

- ✅ JWT token authentication
- ✅ Password hashing with bcrypt
- ✅ CORS configuration
- ✅ Input validation
- ✅ Rate limiting ready
- ✅ Audit logging
- ✅ Secure environment variables
- ✅ HTTPS recommended for production
- ✅ SQL injection prevention (MongoDB)
- ✅ XSS protection

---

## 📈 Growth & Scalability

### Performance Optimizations
- Database indexing on frequently queried fields
- Pagination support for large datasets
- Caching ready (Redis integration optional)
- CDN ready for static assets
- Load balancer compatible

### Scalability Considerations
- Stateless API design
- Horizontal scaling ready
- Database sharding support
- Queue system integration ready
- Multi-region deployment ready

---

## 🚢 Deployment

### Deploy Backend (Heroku)
```bash
# Create Heroku app
heroku create your-app-name

# Set environment variables
heroku config:set -a your-app-name \
  MONGODB_URI="your-mongo-uri" \
  JWT_SECRET="your-secret" \
  STRIPE_SECRET_KEY="your-key"

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Deploy Frontend (Vercel)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# REACT_APP_API_URL=https://your-backend.herokuapp.com/api
```

### Deploy Frontend (Netlify)
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod

# Connect GitHub repo for automatic deployments
```

---

## 🆘 Troubleshooting

### MongoDB Connection Error
```bash
# Check MongoDB is running
mongod

# Or use MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/db
```

### Google Workspace API Error
- Verify service account has Domain-wide Delegation enabled
- Check scopes are correct
- Ensure private key is properly formatted

### Email Not Sending
- Enable 2-Factor Authentication on Gmail
- Generate App Password (not regular password)
- Use App Password in EMAIL_PASSWORD

### CORS Error
- Check CORS_ORIGIN in backend .env
- For localhost: `CORS_ORIGIN=http://localhost:3000`
- For production: `CORS_ORIGIN=https://yourdomain.com`

### Payment Processing Failed
- Verify Stripe/PayPal credentials
- Use test cards for testing
- Check payment gateway logs

---

## 📞 Support

### Documentation
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - Complete setup instructions
- [DATABASE_SCHEMA.js](./DATABASE_SCHEMA.js) - Data model documentation
- [email-templates.js](./email-templates.js) - Email templates

### External Resources
- [Google Workspace Admin API](https://developers.google.com/admin-sdk)
- [Stripe Documentation](https://stripe.com/docs)
- [PayPal Developer](https://developer.paypal.com)
- [MongoDB Documentation](https://docs.mongodb.com)
- [React Documentation](https://react.dev)

### Contact
- **Email:** support@yourreseller.com
- **Phone:** +1-XXX-XXX-XXXX
- **Website:** https://yourreseller.com

---

## 📄 License

This project is provided as-is for your Google Workspace reseller business.

---

## 🎯 Roadmap

### Phase 1 (Current) ✅
- [x] Basic order management
- [x] User provisioning
- [x] Payment integration
- [x] Invoice generation
- [x] Email notifications

### Phase 2 (Planned)
- [ ] Advanced analytics
- [ ] Custom branding options
- [ ] API for third-party integrations
- [ ] Bulk user import
- [ ] Automated support tickets

### Phase 3 (Future)
- [ ] Mobile app
- [ ] Advanced reporting
- [ ] Multi-currency support
- [ ] Commission tracking
- [ ] Affiliate program

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

---

## ⭐ Show Your Support

If this project helps you, please consider:
- Starring the repository
- Sharing with other resellers
- Providing feedback for improvements

---

## 📝 Changelog

### v1.0.0 (Initial Release)
- Complete platform launch
- Full feature set implemented
- Production-ready code
- Comprehensive documentation

---

**Last Updated:** January 2024

**Happy Reselling! 🚀**
