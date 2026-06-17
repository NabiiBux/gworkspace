/**
 * Google Workspace Reseller Portal - Backend Server
 * Complete API with Google Workspace Admin SDK & Voice Integration
 */

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
// Stripe webhook needs the raw body for signature verification — skip JSON parsing for it
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') return next();
  express.json()(req, res, next);
});
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') return next();
  express.urlencoded({ extended: true })(req, res, next);
});

// ==================== DATABASE CONNECTION ====================
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.once('open', () => {
  console.log('✅ MongoDB connected');
  seedPlans().then(() => backfillPlanSkus());
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

// Backfill Google SKU IDs onto existing workspace plans (safe to run every boot)
async function backfillPlanSkus() {
  try {
    const skuMap = {
      starter: '1010020027',
      standard: '1010020028',
      plus: '1010020025',
      frontline: '1010020030',
      'voice-starter': '1010330003',
      'voice-standard': '1010330004',
      'voice-premier': '1010330002',
    };
    for (const [planId, skuId] of Object.entries(skuMap)) {
      await Plan.updateOne({ planId, $or: [{ skuId: { $exists: false } }, { skuId: null }, { skuId: '' }] }, { $set: { skuId } });
    }
    console.log('✅ Plan SKUs backfilled');
  } catch (e) {
    console.error('SKU backfill error:', e.message);
  }
}

// ==================== SCHEMAS ====================

// Customer Schema
const CustomerSchema = new mongoose.Schema({
  companyName: String,
  username: String,
  businessEmail: String,
  password: String,
  phone: String,
  country: String,
  address: String,
  taxId: String,
  // Shared profile (used as domain registrant + reused for Workspace order)
  firstName: String,
  lastName: String,
  city: String,
  state: String,
  postalCode: String,
  phoneCountryCode: String,
  resellerCode: String,
  role: { type: String, enum: ['admin', 'customer'], default: 'customer' },
  domain: String,                 // the customer's own Google Workspace domain (links their subscriptions)
  account: { type: String, default: 'pk' }, // which reseller account their domain lives on: 'pk' or 'usa'
  registrationIp: String,         // IP captured at signup
  lastLoginIp: String,            // IP captured at last login
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  totalUsers: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
});

// Order Schema
const OrderSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  orderNumber: String,
  items: [{
    productType: String, // 'workspace', 'voice', 'addon'
    productName: String,
    quantity: Number,
    monthlyPrice: Number,
    totalPrice: Number,
  }],
  totalAmount: Number,
  status: { type: String, enum: ['pending', 'active', 'expired', 'cancelled'], default: 'pending' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
  paymentMethod: String,
  transactionId: String,
  startDate: Date,
  renewalDate: Date,
  createdAt: { type: Date, default: Date.now },
  notes: String,
});

// Subscription Schema
const SubscriptionSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  orderId: mongoose.Schema.Types.ObjectId,
  subscriptionId: String,
  type: String, // 'workspace', 'voice'
  plan: String, // 'business_starter', 'business_standard', 'business_plus'
  seats: Number,
  monthlyPrice: Number,
  status: { type: String, enum: ['active', 'suspended', 'cancelled'], default: 'active' },
  googleWorkspaceSkuId: String,
  autoRenew: { type: Boolean, default: true },
  nextBillingDate: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// User (End-user) Schema
const UserSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  firstName: String,
  lastName: String,
  email: String,
  role: String, // 'admin', 'user'
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  googleWorkspaceId: String,
  voiceNumber: String,
  forwardingNumber: String,
  createdAt: { type: Date, default: Date.now },
});

// Invoice Schema
const InvoiceSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  invoiceNumber: String,
  orderId: mongoose.Schema.Types.ObjectId,
  amount: Number,
  tax: Number,
  total: Number,
  status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue'], default: 'draft' },
  issueDate: Date,
  dueDate: Date,
  paidDate: Date,
  paymentMethod: String,
  createdAt: { type: Date, default: Date.now },
});

// Domain Schema
const DomainSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  domainName: String,
  verified: { type: Boolean, default: false },
  verificationMethod: String,
  txtRecord: String,
  createdAt: { type: Date, default: Date.now },
});

// Support Ticket Schema
const TicketSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  customerEmail: String,
  customerDomain: String,
  subject: String,
  status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
  priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
  messages: [{
    fromRole: String,        // 'customer' or 'admin'
    fromName: String,
    body: String,
    createdAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Models
const Customer = mongoose.model('Customer', CustomerSchema);
const Order = mongoose.model('Order', OrderSchema);
const Subscription = mongoose.model('Subscription', SubscriptionSchema);
const User = mongoose.model('User', UserSchema);
const Invoice = mongoose.model('Invoice', InvoiceSchema);
const Domain = mongoose.model('Domain', DomainSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);

// Payment record
const PaymentSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  customerEmail: String,
  domain: String,
  orderId: mongoose.Schema.Types.ObjectId,
  orderType: { type: String, enum: ['workspace', 'domain'], default: 'workspace' },
  amount: Number,
  currency: { type: String, default: 'USD' },
  method: { type: String, enum: ['stripe', 'nicky'], default: 'stripe' },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'cancelled'], default: 'pending' },
  providerRef: String,     // Stripe session id or Nicky bill/order id
  checkoutUrl: String,     // hosted checkout URL (Stripe or Nicky)
  isTest: { type: Boolean, default: false },  // true if made in Stripe test mode — does NOT provision real Google subs
  createdAt: { type: Date, default: Date.now },
  paidAt: Date,
});
const Payment = mongoose.model('Payment', PaymentSchema);

// Domain order (paid domain registration)
const DomainOrderSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  orderNumber: { type: String, unique: true },
  domainName: String,
  period: { type: Number, default: 1 },
  price: Number,
  status: { type: String, enum: ['pending', 'registered', 'failed', 'test_paid'], default: 'pending' },
  registeredAt: Date,
  registrationResult: String,
  createdAt: { type: Date, default: Date.now },
});
const DomainOrder = mongoose.model('DomainOrder', DomainOrderSchema);

// Payment settings (which methods are enabled) — keys themselves live in env vars
const PaymentSettingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'main', unique: true },
  stripeEnabled: { type: Boolean, default: true },
  nickyEnabled: { type: Boolean, default: true },
  currency: { type: String, default: 'USD' },
  // Stripe mode + publishable keys (secrets stay in Railway env vars)
  stripeMode: { type: String, enum: ['test', 'live'], default: 'test' },
  stripePublishableTest: { type: String, default: '' },
  stripePublishableLive: { type: String, default: '' },
  // Customer-paid processing fee
  feeEnabled: { type: Boolean, default: false },
  feeFixed: { type: Number, default: 0 },        // USD
  feePercent: { type: Number, default: 0 },      // % of subtotal
  updatedAt: { type: Date, default: Date.now },
});
const PaymentSettings = mongoose.model('PaymentSettings', PaymentSettingsSchema);

// ==================== STAGE 1: EDITABLE PLANS + WORKSPACE ORDERS ====================

// Plan Schema — prices stored in DB so they are editable without code changes
const PlanSchema = new mongoose.Schema(
  {
    planId: { type: String, required: true, unique: true }, // e.g. 'starter'
    category: { type: String, enum: ['workspace', 'voice', 'addon'], required: true },
    name: { type: String, required: true },
    monthlyPrice: { type: Number, required: true }, // your selling price /user/mo
    skuId: String, // Google Reseller API SKU id (for provisioning)
    features: [String],
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const Plan = mongoose.model('Plan', PlanSchema);

// Workspace Order Schema — customer-facing order intake (USA only)
const WorkspaceOrderSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    orderNumber: { type: String, unique: true },
    type: { type: String, default: 'workspace' },
    plan: { id: String, name: String, monthlyPrice: Number },
    seats: Number,
    monthlyTotal: Number,
    organization: {
      name: String,
      domain: String,
      desiredAdminUsername: String,
      tempPassword: String,
      country: { type: String, default: 'US' },
      streetAddress: String,
      streetAddress2: String,
      city: String,
      state: String,
      zip: String,
    },
    contact: {
      firstName: String,
      lastName: String,
      email: String,
      alternateEmail: String,
      phone: String,
    },
    status: {
      type: String,
      enum: ['pending', 'domain_verification', 'provisioned', 'cancelled', 'test_paid'],
      default: 'pending',
    },
    domainVerified: { type: Boolean, default: false },
    googleProvisioned: { type: Boolean, default: false },
    txtRecord: String,
    voiceEligible: { type: Boolean, default: true }, // one Voice sub per domain (Stage 2)
    // Billing cycle (29 days from last payment)
    lastPaymentDate: Date,
    nextBillingDate: Date,                 // lastPaymentDate + 29 days
    billingStatus: { type: String, enum: ['active', 'warned', 'suspended'], default: 'active' },
    renewalWarnedAt: Date,
    suspendedAt: Date,
  },
  { timestamps: true }
);
const WorkspaceOrder = mongoose.model('WorkspaceOrder', WorkspaceOrderSchema);

// Stores the reseller's Google OAuth connection (refresh token) — set once by admin
const GoogleConnectionSchema = new mongoose.Schema(
  {
    account: { type: String, default: 'pk', index: true }, // 'pk' (Pakistan) or 'usa'
    name: { type: String, default: 'Reseller Google Connection' },
    refreshToken: String,
    accessToken: String,
    tokenExpiry: Date,
    connectedEmail: String,
    scopes: [String],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
const GoogleConnection = mongoose.model('GoogleConnection', GoogleConnectionSchema);

// Build a configured OAuth2 client (Pakistan / default)
function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

// Build a configured OAuth2 client for the USA reseller account
function makeUsaOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID_USA,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET_USA,
    process.env.GOOGLE_OAUTH_REDIRECT_URI_USA
  );
}

const RESELLER_SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.domain',
  'https://www.googleapis.com/auth/apps.order',
];

// Seed placeholder plans once (won't overwrite later edits)
async function seedPlans() {
  try {
    const count = await Plan.countDocuments();
    if (count > 0) return;
    await Plan.insertMany([
      {
        planId: 'starter', category: 'workspace', name: 'Business Starter', monthlyPrice: 7.20, sortOrder: 1, skuId: '1010020027',
        features: ['30 GB pooled storage', 'Custom business email', 'Meet (100 participants)', 'Security & management controls']
      },
      {
        planId: 'standard', category: 'workspace', name: 'Business Standard', monthlyPrice: 14.40, sortOrder: 2, skuId: '1010020028',
        features: ['2 TB pooled storage', 'Custom business email', 'Meet (150 participants) + recording', 'eSignature in Docs']
      },
      {
        planId: 'plus', category: 'workspace', name: 'Business Plus', monthlyPrice: 21.60, sortOrder: 3, skuId: '1010020025',
        features: ['5 TB pooled storage', 'Enhanced security & Vault', 'Meet (500 participants) + attendance', 'Advanced endpoint management']
      },
      {
        planId: 'frontline', category: 'workspace', name: 'Frontline Starter', monthlyPrice: 6.00, sortOrder: 4, skuId: '1010020030',
        features: ['Business email', 'Shared device support', 'Meet (100 participants)', 'For frontline workers']
      },
      {
        planId: 'voice-starter', category: 'voice', name: 'Voice Starter', monthlyPrice: 12.00, sortOrder: 1, skuId: '1010330003',
        features: ['1 user / domain region', 'Voicemail & SMS', 'Call forwarding']
      },
      {
        planId: 'voice-standard', category: 'voice', name: 'Voice Standard', monthlyPrice: 24.00, sortOrder: 2, skuId: '1010330004',
        features: ['Unlimited US regions', 'Multi-level auto attendant', 'Ring groups']
      },
      {
        planId: 'voice-premier', category: 'voice', name: 'Voice Premier', monthlyPrice: 36.00, sortOrder: 3, skuId: '1010330002',
        features: ['Unlimited international', 'Advanced reporting', 'Desk phone support']
      },
    ]);
    console.log('✅ Seeded placeholder plans');
  } catch (e) {
    console.error('Plan seed error:', e.message);
  }
}

// ==================== EMAIL SERVICE ====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendEmail = async (to, subject, htmlContent) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html: htmlContent,
    });
  } catch (error) {
    console.error('Email send error:', error);
  }
};

// ==================== GOOGLE WORKSPACE INTEGRATION ====================
const getGoogleAuth = () => {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.customer',
      'https://www.googleapis.com/auth/admin.directory.user',
      'https://www.googleapis.com/auth/admin.directory.domain',
    ],
  });
};

const createGoogleWorkspaceUser = async (email, firstName, lastName, customerId) => {
  try {
    const auth = getGoogleAuth();
    const admin = google.admin({ version: 'directory_v1', auth });

    const result = await admin.users.insert({
      customer: 'my_customer',
      requestBody: {
        primaryEmail: email,
        firstName,
        lastName,
        password: generateRandomPassword(),
      },
    });

    // Create user record in database
    await User.create({
      customerId,
      firstName,
      lastName,
      email,
      googleWorkspaceId: result.data.id,
      role: 'user',
    });

    // Send welcome email
    const welcomeHTML = `
      <h2>Welcome to Google Workspace</h2>
      <p>Your Google Workspace account has been created!</p>
      <p><strong>Email:</strong> ${email}</p>
      <p>You can access your account at <a href="https://mail.google.com">mail.google.com</a></p>
    `;
    await sendEmail(email, 'Welcome to Google Workspace', welcomeHTML);

    return result.data;
  } catch (error) {
    console.error('Google Workspace user creation error:', error);
    throw error;
  }
};

// ==================== GOOGLE VOICE INTEGRATION ====================
const createGoogleVoiceNumber = async (userId, forwardingNumber) => {
  try {
    // Using Google Voice API via partner endpoint
    const response = await axios.post(
      `https://www.googleapis.com/voice/v1/accounts/${process.env.GOOGLE_ACCOUNT_ID}/phones`,
      {
        phoneNumber: userId,
        forwardingNumbers: [forwardingNumber],
      },
      {
        headers: {
          Authorization: `Bearer ${await getGoogleToken()}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Google Voice creation error:', error);
    throw error;
  }
};

// ==================== UTILITY FUNCTIONS ====================
const generateRandomPassword = () => {
  return Math.random().toString(36).slice(-12) + 'Aa@1';
};

const generateToken = (id, email, role = 'customer') => {
  return jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Middleware for authentication
// Capture the real client IP (works behind Railway/Vercel proxies)
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

const authenticateCustomer = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  req.customerId = decoded.id;
  req.userRole = decoded.role || 'customer';
  next();
};

// Require admin role for admin-only endpoints
const requireAdmin = async (req, res, next) => {
  try {
    const me = await Customer.findById(req.customerId);
    if (!me || me.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: 'Authorization check failed.' });
  }
};

// ==================== PAYMENT PROCESSING ====================
const processPayment = async (customerId, amount, paymentMethod) => {
  try {
    // Stripe or PayPal integration
    if (paymentMethod === 'stripe') {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        metadata: { customerId },
      });
      return { success: true, transactionId: paymentIntent.id };
    }
    // Add PayPal integration similarly
    return { success: true };
  } catch (error) {
    console.error('Payment error:', error);
    return { success: false, error: error.message };
  }
};

// ==================== API ENDPOINTS ====================

// AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
  try {
    const { companyName, username, businessEmail, password, phone, country, address, taxId, domain,
      firstName, lastName, city, state, postalCode, phoneCountryCode } = req.body;

    if (!businessEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const existing = await Customer.findOne({ businessEmail: businessEmail.toLowerCase() });
    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const resellerCode = `RSL-${Date.now()}`;
    const ip = getClientIp(req);

    const customer = await Customer.create({
      companyName,
      username: username || (businessEmail.split('@')[0]),
      businessEmail: businessEmail.toLowerCase(),
      password: hashedPassword,
      phone,
      country,
      address,
      taxId,
      firstName,
      lastName,
      city,
      state,
      postalCode,
      phoneCountryCode,
      domain: domain ? domain.toLowerCase().trim() : undefined,
      resellerCode,
      role: 'customer',
      registrationIp: ip,
      lastLoginIp: ip,
    });

    const token = generateToken(customer._id, customer.businessEmail, customer.role);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      customer: {
        id: customer._id,
        companyName: customer.companyName,
        username: customer.username,
        businessEmail: customer.businessEmail,
        domain: customer.domain,
        role: customer.role,
        resellerCode: customer.resellerCode,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { businessEmail, password } = req.body;

    const emailLc = (businessEmail || '').trim().toLowerCase();
    // case-insensitive lookup so accounts created with any casing still log in
    let customer = await Customer.findOne({ businessEmail: emailLc });
    if (!customer) {
      customer = await Customer.findOne({ businessEmail: new RegExp('^' + emailLc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') });
    }
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const isValid = await bcrypt.compare(password, customer.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid password' });

    // Safeguard: the configured admin email is always admin (prevents lockout)
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@gnbmentor.com').trim().toLowerCase();
    const myEmail = (customer.businessEmail || '').trim().toLowerCase();
    if (myEmail === adminEmail && customer.role !== 'admin') {
      customer.role = 'admin';
      // normalize stored email to lowercase so future lookups are consistent
      customer.businessEmail = myEmail;
    }

    customer.lastLogin = new Date();
    customer.lastLoginIp = getClientIp(req);
    await customer.save();

    const token = generateToken(customer._id, customer.businessEmail, customer.role || 'customer');

    res.json({
      success: true,
      token,
      customer: {
        id: customer._id,
        companyName: customer.companyName,
        username: customer.username,
        businessEmail: customer.businessEmail,
        domain: customer.domain,
        role: customer.role || 'customer',
        resellerCode: customer.resellerCode,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// One-time admin promotion by secret (diagnoses + fixes admin role).
// Visit: /api/admin/fix-admin?secret=YOUR_JWT_SECRET&email=admin@gnbmentor.com
app.get('/api/admin/fix-admin', async (req, res) => {
  try {
    const { secret, email } = req.query;
    if (!secret || secret !== process.env.JWT_SECRET) {
      return res.status(403).json({ error: 'Invalid secret.' });
    }
    const target = (email || process.env.ADMIN_EMAIL || 'admin@gnbmentor.com').trim().toLowerCase();
    const customer = await Customer.findOne({
      businessEmail: new RegExp('^' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
    });
    if (!customer) {
      const all = await Customer.find().select('businessEmail role').limit(50);
      return res.status(404).json({
        error: 'No account found with that email.',
        searchedFor: target,
        existingAccounts: all.map((c) => ({ email: c.businessEmail, role: c.role })),
      });
    }
    customer.role = 'admin';
    customer.businessEmail = target;
    await customer.save();
    res.json({ success: true, message: `${target} is now admin. Log out and log back in.`, role: customer.role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Who am I (role, domain) — used by frontend to route admin vs customer
app.get('/api/auth/me', authenticateCustomer, async (req, res) => {
  try {
    const me = await Customer.findById(req.customerId).select('-password');
    if (!me) return res.status(404).json({ error: 'Not found' });
    res.json({
      id: me._id,
      companyName: me.companyName,
      username: me.username,
      businessEmail: me.businessEmail,
      domain: me.domain,
      role: me.role || 'customer',
      resellerCode: me.resellerCode,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== CUSTOMER SELF-SERVICE ====================
// Update own profile (username / email)
app.patch('/api/customer/profile', authenticateCustomer, async (req, res) => {
  try {
    const { username, businessEmail } = req.body;
    const me = await Customer.findById(req.customerId);
    if (!me) return res.status(404).json({ error: 'Not found' });

    if (businessEmail && businessEmail.toLowerCase() !== me.businessEmail) {
      const taken = await Customer.findOne({ businessEmail: businessEmail.toLowerCase() });
      if (taken) return res.status(400).json({ error: 'That email is already in use.' });
      me.businessEmail = businessEmail.toLowerCase();
    }
    if (username) me.username = username;
    await me.save();
    res.json({ success: true, username: me.username, businessEmail: me.businessEmail });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Change own password (must provide current password)
app.post('/api/customer/change-password', authenticateCustomer, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    const me = await Customer.findById(req.customerId);
    if (!me) return res.status(404).json({ error: 'Not found' });
    const ok = await bcrypt.compare(currentPassword || '', me.password);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
    me.password = await bcrypt.hash(newPassword, 10);
    await me.save();
    res.json({ success: true, message: 'Password changed.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer's OWN subscriptions (isolated to their domain only)
app.get('/api/customer/my-subscriptions', authenticateCustomer, async (req, res) => {
  try {
    const me = await Customer.findById(req.customerId);
    if (!me) return res.status(404).json({ error: 'Not found' });
    if (!me.domain) return res.json({ subscriptions: [], domain: null, note: 'No domain linked to your account yet.' });

    // Look up this domain on the correct reseller account
    const account = (me.account || 'pk');
    let auth;
    try {
      auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
    } catch (e) {
      return res.status(400).json({ error: 'Reseller not connected for your account.' });
    }
    const reseller = google.reseller({ version: 'v1', auth });

    let subs = [];
    try {
      const resp = await reseller.subscriptions.list({ customerId: me.domain });
      subs = resp.data.subscriptions || [];
    } catch (e) {
      if (e?.code === 404) return res.json({ subscriptions: [], domain: me.domain });
      throw e;
    }

    const rows = subs.map((s) => ({
      domain: s.customerDomain || me.domain,
      skuId: s.skuId,
      skuName: s.skuName || s.skuId,
      planName: s.plan?.planName,
      seats: s.seats?.numberOfSeats ?? s.seats?.licensedNumberOfSeats ?? null,
      status: s.status,
      creationTime: s.creationTime ? Number(s.creationTime) : null,
    }));
    res.json({ subscriptions: rows, domain: me.domain });
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message || 'Could not load your subscriptions.';
    res.status(500).json({ error: msg });
  }
});

// ==================== ADMIN: CUSTOMERS VIEW ====================
// List all portal customers with their info (admin only)
app.get('/api/admin/customers', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const customers = await Customer.find({ role: { $ne: 'admin' } })
      .select('-password')
      .sort({ createdAt: -1 });
    const rows = customers.map((c) => ({
      id: c._id,
      companyName: c.companyName,
      username: c.username,
      email: c.businessEmail,
      domain: c.domain,
      account: c.account,
      registrationIp: c.registrationIp,
      lastLoginIp: c.lastLoginIp,
      status: c.status,
      createdAt: c.createdAt,
      lastLogin: c.lastLogin,
    }));
    res.json({ customers: rows, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: reset a customer's portal password
app.post('/api/admin/customers/:id/reset-password', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const pwd = newPassword && newPassword.length >= 6 ? newPassword : `Temp-${Math.random().toString(36).slice(2, 10)}`;
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    c.password = await bcrypt.hash(pwd, 10);
    await c.save();
    res.json({ success: true, message: 'Password reset.', temporaryPassword: pwd });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== SUPPORT TICKETS ====================
// Customer: open a ticket
app.post('/api/customer/tickets', authenticateCustomer, async (req, res) => {
  try {
    const { subject, message, priority } = req.body;
    if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required.' });
    const me = await Customer.findById(req.customerId);
    const ticket = await Ticket.create({
      customerId: me._id,
      customerEmail: me.businessEmail,
      customerDomain: me.domain,
      subject,
      priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
      status: 'open',
      messages: [{ fromRole: 'customer', fromName: me.username || me.businessEmail, body: message }],
    });
    res.status(201).json({ success: true, ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: list own tickets
app.get('/api/customer/tickets', authenticateCustomer, async (req, res) => {
  try {
    const tickets = await Ticket.find({ customerId: req.customerId }).sort({ updatedAt: -1 });
    res.json({ tickets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: reply to own ticket
app.post('/api/customer/tickets/:id/reply', authenticateCustomer, async (req, res) => {
  try {
    const { message } = req.body;
    const ticket = await Ticket.findOne({ _id: req.params.id, customerId: req.customerId });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (!message) return res.status(400).json({ error: 'Message required.' });
    const me = await Customer.findById(req.customerId);
    ticket.messages.push({ fromRole: 'customer', fromName: me.username || me.businessEmail, body: message });
    if (ticket.status === 'resolved' || ticket.status === 'closed') ticket.status = 'open';
    ticket.updatedAt = new Date();
    await ticket.save();
    res.json({ success: true, ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: list all tickets (optionally filter by status)
app.get('/api/admin/tickets', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const tickets = await Ticket.find(filter).sort({ updatedAt: -1 });
    const counts = {
      open: await Ticket.countDocuments({ status: 'open' }),
      in_progress: await Ticket.countDocuments({ status: 'in_progress' }),
      resolved: await Ticket.countDocuments({ status: 'resolved' }),
      closed: await Ticket.countDocuments({ status: 'closed' }),
    };
    res.json({ tickets, counts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: reply to a ticket
app.post('/api/admin/tickets/:id/reply', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (!message) return res.status(400).json({ error: 'Message required.' });
    const me = await Customer.findById(req.customerId);
    ticket.messages.push({ fromRole: 'admin', fromName: me.username || 'Support', body: message });
    if (ticket.status === 'open') ticket.status = 'in_progress';
    ticket.updatedAt = new Date();
    await ticket.save();
    res.json({ success: true, ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: change ticket status (resolve / close / reopen)
app.patch('/api/admin/tickets/:id/status', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    ticket.status = status;
    ticket.updatedAt = new Date();
    await ticket.save();
    res.json({ success: true, ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== PAYMENTS ====================
const FRONTEND_URL = process.env.CORS_ORIGIN || 'https://gworkspaceresellere.vercel.app';

// Customer: create a checkout for an order (method = 'stripe' | 'nicky')
app.post('/api/customer/checkout', authenticateCustomer, async (req, res) => {
  try {
    const { orderId, method } = req.body;
    const me = await Customer.findById(req.customerId);
    const order = await WorkspaceOrder.findOne({ _id: orderId, customerId: req.customerId });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const amount = Number(order.monthlyTotal || 0);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Order amount is invalid.' });

    const payment = await Payment.create({
      customerId: me._id,
      customerEmail: me.businessEmail,
      domain: order.organization?.domain,
      orderId: order._id,
      amount,
      currency: 'USD',
      method: method === 'nicky' ? 'nicky' : 'stripe',
      status: 'pending',
    });

    // Human-readable description carrying the order number + what was bought
    const orderDesc = `Order ${order.orderNumber} — ${order.plan?.name || order.type} (${order.seats || 1} seat${(order.seats || 1) === 1 ? '' : 's'}) for ${order.organization?.domain || ''}`;

    const successUrl = `${FRONTEND_URL}/?payment=success&pid=${payment._id}`;
    const cancelUrl = `${FRONTEND_URL}/?payment=cancelled&pid=${payment._id}`;

    if (payment.method === 'stripe') {
      let stripe;
      try { stripe = await getStripeForMode(); }
      catch (e) { return res.status(500).json({ error: e.message }); }

      // Record whether this is a test-mode payment (won't provision real Google subs)
      const settingsDoc = await PaymentSettings.findOne({ singleton: 'main' });
      payment.isTest = (settingsDoc?.stripeMode || 'test') !== 'live';
      await payment.save();

      const line_items = [{
        price_data: {
          currency: 'usd',
          product_data: { name: orderDesc },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }];
      // Customer-paid processing fee as a separate line item
      const fee = await computeProcessingFee(amount);
      if (fee > 0) {
        line_items.push({
          price_data: {
            currency: 'usd',
            product_data: { name: 'Processing fee' },
            unit_amount: Math.round(fee * 100),
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items,
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: String(payment._id),
        metadata: { paymentId: String(payment._id), orderId: String(order._id), orderNumber: order.orderNumber },
      });
      payment.providerRef = session.id;
      payment.checkoutUrl = session.url;
      await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id });
    }

    // ===== NICKY (crypto) =====
    try {
      const nickyUrl = await createNickyPayment({
        amount,
        currency: 'USD',
        description: orderDesc,
        orderNumber: order.orderNumber,
        reference: String(payment._id),
        billDescription: orderDesc,
        customerEmail: me.businessEmail,
        customerName: me.username || me.companyName || me.businessEmail,
        redirectUrl: successUrl,
        cancelUrl: cancelUrl,
      });
      payment.checkoutUrl = nickyUrl;
      await payment.save();
      return res.json({ checkoutUrl: nickyUrl, paymentId: payment._id });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available yet: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Nicky create-payment — fill exact endpoint/body from your Nicky Swagger / gnbmentor.com code.
async function createNickyPayment({ amount, currency, description, orderNumber, reference, billDescription, customerEmail, customerName, redirectUrl, cancelUrl }) {
  const token = process.env.NICKY_API_TOKEN;
  if (!token) throw new Error('NICKY_API_TOKEN not set');
  const base = process.env.NICKY_API_BASE || 'https://api-public.pay.nicky.me';
  // The pricing/settlement asset id from your Nicky account (e.g. a USD or stablecoin asset id).
  const assetId = process.env.NICKY_ASSET_ID || '';

  // Real Nicky CreateForUser schema
  const body = {
    blockchainAssetId: assetId,
    amountExpectedNative: Number(amount),
    billDetails: {
      invoiceReference: orderNumber || reference || '',
      description: billDescription || description || '',
    },
    requester: {
      email: customerEmail || '',
      name: customerName || '',
    },
    sendNotification: true,
    successUrl: redirectUrl,
    cancelUrl: cancelUrl || redirectUrl,
  };

  const resp = await fetch(`${base}/api/public/PaymentRequestPublicApi/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': token },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error('NICKY ERROR', resp.status, t);
    throw new Error(`Nicky error ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data = await resp.json();
  console.log('NICKY RESPONSE:', JSON.stringify(data));
  // Nicky checkout URL format (confirmed): https://pay.nicky.me/home?paymentId=<shortId>
  const shortId = data.bill?.shortId || data.shortId || data.requestShortId;
  const url =
    data.checkoutUrl || data.url || data.paymentUrl || data.hostedUrl ||
    (shortId ? `https://pay.nicky.me/home?paymentId=${shortId}` : null);
  if (!url) {
    throw new Error('Nicky created the request but no checkout URL was found. Response keys: ' + Object.keys(data).join(', ') + (shortId ? ` (shortId=${shortId})` : ''));
  }
  return url;
}

// Stripe webhook — confirms payment truly completed
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST);
    const sig = req.headers['stripe-signature'];
    let event;
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const pid = session.metadata?.paymentId || session.client_reference_id;
      if (pid) {
        const payment = await Payment.findById(pid);
        await markPaidAndProvision(payment);
      }
    }
    res.json({ received: true });
  } catch (e) {
    res.status(400).send(`Webhook Error: ${e.message}`);
  }
});

// Mark a payment paid and auto-provision its Workspace order (pay-first flow)
async function markPaidAndProvision(payment) {
  if (!payment || payment.status === 'paid') return;
  payment.status = 'paid';
  payment.paidAt = new Date();
  await payment.save();

  // DOMAIN orders: register the domain on payment
  if (payment.orderType === 'domain') {
    try {
      const dOrder = await DomainOrder.findById(payment.orderId);
      if (dOrder && dOrder.status === 'pending') {
        if (payment.isTest) {
          console.log('TEST PAYMENT — skipping real domain registration for', dOrder.domainName);
          dOrder.status = 'test_paid';
          await dOrder.save();
          return;
        }
        const me = await Customer.findById(payment.customerId);
        const result = await registerDomainViaApi(me, dOrder.domainName, dOrder.period);
        dOrder.status = 'registered';
        dOrder.registeredAt = new Date();
        dOrder.registrationResult = JSON.stringify(result).slice(0, 500);
        await dOrder.save();
        // Link this domain to the customer's account
        if (me && !me.domain) { me.domain = dOrder.domainName; await me.save(); }
        console.log('DOMAIN REGISTERED on payment:', dOrder.domainName);
      }
    } catch (e) {
      console.error('DOMAIN REGISTRATION FAILED for payment', String(payment._id), e.message);
    }
    return;
  }

  // Auto-provision the linked Workspace order + set/refresh the billing cycle
  try {
    if (payment.orderId) {
      const order = await WorkspaceOrder.findById(payment.orderId);
      if (order) {
        // TEST-MODE payments must NOT create real Google subscriptions.
        if (payment.isTest) {
          console.log('TEST PAYMENT — skipping real Google provisioning for order', order.orderNumber);
          order.status = 'test_paid';
          await order.save();
          return;
        }

        // Set billing cycle: next bill = now + 29 days
        const now = new Date();
        order.lastPaymentDate = now;
        order.nextBillingDate = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000);
        order.renewalWarnedAt = null;

        // First-time provisioning
        if (!order.googleProvisioned) {
          await provisionWorkspaceOrder(order);
          console.log('AUTO-PROVISIONED order', order.orderNumber);
        }

        // If it was suspended for non-payment, reactivate it in Google
        if (order.billingStatus === 'suspended') {
          try {
            await reactivateSubscription(order);
            console.log('REACTIVATED order', order.orderNumber);
          } catch (e) {
            console.error('REACTIVATE FAILED', order.orderNumber, e.message);
          }
        }
        order.billingStatus = 'active';
        order.suspendedAt = null;
        await order.save();
      }
    }
  } catch (e) {
    console.error('AUTO-PROVISION FAILED for payment', String(payment._id), e.message);
    // Payment stays 'paid'; admin can manually provision if auto fails. Don't throw (webhook must 200).
  }
}

// Suspend a Workspace subscription in Google (Reseller API)
async function suspendSubscription(order) {
  const auth = await getResellerAuth();
  const reseller = google.reseller({ version: 'v1', auth });
  const domain = (order.organization?.domain || '').toLowerCase();
  const planDoc = await Plan.findOne({ planId: order.plan?.id });
  if (!planDoc?.skuId) throw new Error('Plan SKU missing');
  await reseller.subscriptions.suspend({ customerId: domain, subscriptionId: planDoc.skuId });
}

// Reactivate a suspended Workspace subscription in Google
async function reactivateSubscription(order) {
  const auth = await getResellerAuth();
  const reseller = google.reseller({ version: 'v1', auth });
  const domain = (order.organization?.domain || '').toLowerCase();
  const planDoc = await Plan.findOne({ planId: order.plan?.id });
  if (!planDoc?.skuId) throw new Error('Plan SKU missing');
  await reseller.subscriptions.activate({ customerId: domain, subscriptionId: planDoc.skuId });
}

// The daily billing check: warn at day 25-ish, suspend past day 29 if unpaid.
async function runBillingCheck() {
  const now = new Date();
  const results = { warned: [], suspended: [], checked: 0 };
  // Only provisioned, active/warned subscriptions with a billing date
  const orders = await WorkspaceOrder.find({
    googleProvisioned: true,
    billingStatus: { $in: ['active', 'warned'] },
    nextBillingDate: { $ne: null },
  });
  for (const order of orders) {
    results.checked++;
    const due = new Date(order.nextBillingDate).getTime();
    const msLeft = due - now.getTime();
    const daysLeft = msLeft / (24 * 60 * 60 * 1000);

    // Warn when within 4 days of billing (≈ day 25 of a 29-day cycle) and not already warned
    if (daysLeft <= 4 && daysLeft > 0 && order.billingStatus === 'active') {
      order.billingStatus = 'warned';
      order.renewalWarnedAt = now;
      await order.save();
      results.warned.push(order.orderNumber);
      // (Optional) send a reminder email here if email is configured
    }

    // Suspend when past the billing date (day 29+) and still unpaid
    if (daysLeft <= 0 && order.billingStatus !== 'suspended') {
      try {
        await suspendSubscription(order);
        order.billingStatus = 'suspended';
        order.suspendedAt = now;
        await order.save();
        results.suspended.push(order.orderNumber);
        console.log('SUSPENDED (non-payment)', order.orderNumber);
      } catch (e) {
        console.error('SUSPEND FAILED', order.orderNumber, e.message);
      }
    }
  }
  return results;
}

// Secured cron endpoint — point an external daily cron (e.g. cron-job.org) here.
app.get('/api/cron/billing-check', async (req, res) => {
  if (!req.query.secret || req.query.secret !== process.env.JWT_SECRET) {
    return res.status(403).json({ error: 'Invalid secret.' });
  }
  try {
    const results = await runBillingCheck();
    console.log('BILLING CHECK:', JSON.stringify(results));
    res.json({ success: true, ...results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin manual trigger (to test the billing check on demand)
app.post('/api/admin/run-billing-check', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const results = await runBillingCheck();
    res.json({ success: true, ...results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Nicky webhook — Nicky notifies us when crypto payment completes
app.post('/api/webhooks/nicky', async (req, res) => {
  try {
    console.log('NICKY WEBHOOK:', JSON.stringify(req.body));  // log payload to confirm/adjust fields
    // Nicky sends the bill/payment info. invoiceReference = our order number; also try our payment id.
    const b = req.body || {};
    const invoiceRef = b.invoiceReference || b.bill?.invoiceReference || b.reference;
    const status = (b.status || b.bill?.status || '').toString().toLowerCase();
    const paid = /paid|completed|success|confirmed/.test(status);

    if (paid) {
      let payment = null;
      // Match by order number (invoiceReference) first
      if (invoiceRef) {
        const order = await WorkspaceOrder.findOne({ orderNumber: invoiceRef });
        if (order) payment = await Payment.findOne({ orderId: order._id }).sort({ createdAt: -1 });
      }
      // Fallback: maybe reference is our payment id
      if (!payment && invoiceRef) {
        try { payment = await Payment.findById(invoiceRef); } catch (_) { }
      }
      await markPaidAndProvision(payment);
    }
    res.json({ received: true });
  } catch (e) {
    console.error('NICKY WEBHOOK ERROR', e.message);
    res.json({ received: true }); // always 200 so Nicky doesn't retry-storm
  }
});

// Payment status (customer polls after returning from checkout)
app.get('/api/customer/payment/:id', authenticateCustomer, async (req, res) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, customerId: req.customerId });
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    res.json({ status: payment.status, amount: payment.amount, method: payment.method });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: list own payments
app.get('/api/customer/payments', authenticateCustomer, async (req, res) => {
  try {
    const payments = await Payment.find({ customerId: req.customerId }).sort({ createdAt: -1 });
    res.json({ payments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: payment settings (which methods enabled) + which keys are configured
app.get('/api/admin/payment-settings', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    let s = await PaymentSettings.findOne({ singleton: 'main' });
    if (!s) s = await PaymentSettings.create({ singleton: 'main' });
    res.json({
      stripeEnabled: s.stripeEnabled,
      nickyEnabled: s.nickyEnabled,
      currency: s.currency,
      stripeMode: s.stripeMode || 'test',
      stripePublishableTest: s.stripePublishableTest || '',
      stripePublishableLive: s.stripePublishableLive || '',
      feeEnabled: !!s.feeEnabled,
      feeFixed: s.feeFixed || 0,
      feePercent: s.feePercent || 0,
      // secrets live in Railway env vars (Option A) — report whether each is configured
      stripeTestSecretConfigured: !!process.env.STRIPE_SECRET_KEY_TEST,
      stripeLiveSecretConfigured: !!process.env.STRIPE_SECRET_KEY,
      stripeWebhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
      nickyConfigured: !!process.env.NICKY_API_TOKEN,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/payment-settings', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    let s = await PaymentSettings.findOne({ singleton: 'main' });
    if (!s) s = await PaymentSettings.create({ singleton: 'main' });
    const b = req.body || {};
    if (b.stripeEnabled !== undefined) s.stripeEnabled = !!b.stripeEnabled;
    if (b.nickyEnabled !== undefined) s.nickyEnabled = !!b.nickyEnabled;
    if (b.currency) s.currency = b.currency;
    if (b.stripeMode && ['test', 'live'].includes(b.stripeMode)) s.stripeMode = b.stripeMode;
    if (b.stripePublishableTest !== undefined) s.stripePublishableTest = b.stripePublishableTest;
    if (b.stripePublishableLive !== undefined) s.stripePublishableLive = b.stripePublishableLive;
    if (b.feeEnabled !== undefined) s.feeEnabled = !!b.feeEnabled;
    if (b.feeFixed !== undefined) s.feeFixed = Number(b.feeFixed) || 0;
    if (b.feePercent !== undefined) s.feePercent = Number(b.feePercent) || 0;
    s.updatedAt = new Date();
    await s.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: pick the active Stripe secret key based on saved mode
async function getStripeForMode() {
  const s = await PaymentSettings.findOne({ singleton: 'main' });
  const mode = s?.stripeMode || 'test';
  const key = mode === 'live'
    ? process.env.STRIPE_SECRET_KEY
    : (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY);
  if (!key) throw new Error(`Stripe ${mode} secret key not configured.`);
  return require('stripe')(key);
}

// Helper: compute customer-paid processing fee for a subtotal
async function computeProcessingFee(subtotal) {
  const s = await PaymentSettings.findOne({ singleton: 'main' });
  if (!s || !s.feeEnabled) return 0;
  const fee = (Number(s.feeFixed) || 0) + (Number(s.feePercent) || 0) / 100 * subtotal;
  return Math.round(fee * 100) / 100;
}

// Admin: all payments
app.get('/api/admin/payments', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 }).limit(500);
    const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
    res.json({ payments, totalPaid, count: payments.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PRODUCTS & PRICING (DB-backed, editable via /api/admin/plans)
// ==================== DOMAINS (DomainNameAPI) ====================
// OT&E test base: https://ote.domainresellerapi.com  | Production: https://api.domainresellerapi.com
const DNA_BASE = process.env.DNA_API_BASE || 'https://ote.domainresellerapi.com';

// Build auth headers for DomainNameAPI.
// Auth = two headers: "reseller" (your reseller UUID) + "x-api-key" (your API key).
function dnaAuthHeaders() {
  const headers = { 'Content-Type': 'application/json', 'accept': 'text/plain' };
  if (process.env.DNA_RESELLER_ID) {
    // DomainNameAPI expects the reseller id under the header "__reseller" (double underscore)
    headers['__reseller'] = process.env.DNA_RESELLER_ID;
  }
  if (process.env.DNA_API_KEY) headers['X-API-KEY'] = process.env.DNA_API_KEY;
  if (!process.env.DNA_API_KEY && process.env.DNA_USERNAME && process.env.DNA_PASSWORD) {
    const basic = Buffer.from(`${process.env.DNA_USERNAME}:${process.env.DNA_PASSWORD}`).toString('base64');
    headers['Authorization'] = `Basic ${basic}`;
  }
  return headers;
}

// Safe domain search — handles non-JSON (e.g. "Unauthorized") responses and logs diagnostics.
async function dnaDomainSearch(dom) {
  const headers = dnaAuthHeaders();
  console.log('DNA SEARCH ->', dom, '| __reseller set:', !!process.env.DNA_RESELLER_ID, '| api-key set:', !!process.env.DNA_API_KEY);
  const resp = await fetch(`${DNA_BASE}/api/v1/domains/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ domainName: dom }),
  });
  const raw = await resp.text();
  console.log('DNA SEARCH <-', resp.status, raw.slice(0, 300));
  let data;
  try { data = JSON.parse(raw); }
  catch (_) {
    // Non-JSON response (e.g. "Unauthorized") — surface a clean message
    if (resp.status === 401 || /unauthor/i.test(raw)) {
      throw new Error('DomainNameAPI rejected the credentials (401). Check DNA_RESELLER_ID and DNA_API_KEY in Railway, and that the key matches the environment (test key → ote server).');
    }
    throw new Error(`DomainNameAPI returned a non-JSON response (${resp.status}): ${raw.slice(0, 120)}`);
  }
  if (!resp.ok || data.success === false) {
    const msg = data?.error?.message || data?.reason || `Search failed (${resp.status})`;
    throw new Error(msg);
  }
  const info = data.info || {};
  const markup = Number(process.env.DNA_MARKUP_PERCENT || 0);
  const sellPrice = Math.round(Number(info.price || 0) * (1 + markup / 100) * 100) / 100;
  return {
    domainName: info.domainName || dom,
    tld: info.tld,
    available: (info.status || '').toUpperCase() === 'AVAILABLE',
    isPremium: !!info.isPremium,
    currency: info.currency || 'USD',
    period: info.period || 1,
    price: sellPrice,
    basePrice: Number(info.price || 0),
  };
}

// Customer: get/check domain verification (TXT or CNAME) for Workspace
app.post('/api/customer/domains/verify-check', authenticateCustomer, async (req, res) => {
  try {
    const { domain, method } = req.body;
    const dom = (domain || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'Domain required.' });

    // Look up the customer's order for this domain to read/store its verification token
    const order = await WorkspaceOrder.findOne({ customerId: req.customerId, 'organization.domain': dom });

    // Generate a verification token if not present (used for both TXT and CNAME display)
    let token = order?.txtRecord;
    if (!token) {
      token = 'google-site-verification=' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      if (order) { order.txtRecord = token; await order.save(); }
    }

    // Actually check DNS for the record using Node's DNS resolver
    const dns = require('dns').promises;
    let verified = false;
    try {
      if (method === 'cname') {
        const recs = await dns.resolveCname(`workspace-verify.${dom}`).catch(() => []);
        verified = recs.some(r => /google|verify/i.test(r));
      } else {
        const txt = await dns.resolveTxt(dom).catch(() => []);
        const flat = txt.map(arr => arr.join('')).join(' ');
        verified = flat.includes(token);
      }
    } catch (_) { verified = false; }

    if (verified && order) { order.domainVerified = true; await order.save(); }

    res.json({
      domain: dom,
      method: method || 'txt',
      verified,
      txtRecord: token,
      cnameHost: `workspace-verify.${dom}`,
      cnameValue: 'verify.google.com',
      instructions: method === 'cname'
        ? `Add a CNAME record: host "workspace-verify" pointing to "verify.google.com", then click Check.`
        : `Add a TXT record at your domain root with value "${token}", then click Check.`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: register a domain (real purchase via DomainNameAPI) using their saved profile
// Reusable: actually register a domain via DomainNameAPI using a customer's profile
async function registerDomainViaApi(customer, domainName, period) {
  const dom = (domainName || '').toLowerCase().trim();
  const contact = {
    firstName: customer.firstName || (customer.username || 'Customer'),
    lastName: customer.lastName || (customer.companyName || 'Owner'),
    companyName: customer.companyName || '',
    eMail: customer.businessEmail,
    address: customer.address || '',
    phoneCountryCode: customer.phoneCountryCode || '1',
    phone: customer.phone || '',
    faxCountryCode: '',
    fax: '',
    postalCode: customer.postalCode || '',
    country: customer.country || '',
    city: customer.city || '',
    state: customer.state || '',
    contactType: 'Registrant',
    isHidden: true,
  };
  const headers = dnaAuthHeaders();
  headers['accept'] = 'text/plain';
  const payload = { domainName: dom, period: Number(period) || 1, nameServers: [], contacts: [contact], useTrusteeContact: true };
  console.log('DNA REGISTER ->', dom, 'period', payload.period);
  const resp = await fetch(`${DNA_BASE}/api/v1/domains/register-with-contacts`, {
    method: 'POST', headers, body: JSON.stringify(payload),
  });
  const raw = await resp.text();
  console.log('DNA REGISTER <-', resp.status, raw.slice(0, 400));
  let data;
  try { data = JSON.parse(raw); } catch (_) { throw new Error(`Registration response error (${resp.status}): ${raw.slice(0, 150)}`); }
  if (!resp.ok || data.success === false) {
    throw new Error(data?.error?.message || data?.reason || `Registration failed (${resp.status})`);
  }
  return data;
}

// Customer: start a PAID domain registration — creates a domain order + checkout (pay first)
app.post('/api/customer/domains/register', authenticateCustomer, async (req, res) => {
  try {
    const { domainName, period, price, method } = req.body;
    const dom = (domainName || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'Domain required.' });
    const me = await Customer.findById(req.customerId);
    if (!me) return res.status(404).json({ error: 'Account not found.' });

    const amount = Number(price || 0);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid domain price.' });

    const orderNumber = `DM-${Date.now()}`;
    const order = await DomainOrder.create({
      customerId: me._id, orderNumber, domainName: dom, period: Number(period) || 1, price: amount, status: 'pending',
    });

    const payment = await Payment.create({
      customerId: me._id, customerEmail: me.businessEmail, domain: dom,
      orderId: order._id, orderType: 'domain', amount, currency: 'USD',
      method: method === 'nicky' ? 'nicky' : 'stripe', status: 'pending',
    });

    const orderDesc = `Domain ${dom} (${order.period} year${order.period === 1 ? '' : 's'})`;
    const successUrl = `${FRONTEND_URL}/?payment=success&pid=${payment._id}`;
    const cancelUrl = `${FRONTEND_URL}/?payment=cancelled&pid=${payment._id}`;

    if (payment.method === 'stripe') {
      let stripe;
      try { stripe = await getStripeForMode(); } catch (e) { return res.status(500).json({ error: e.message }); }
      const settingsDoc = await PaymentSettings.findOne({ singleton: 'main' });
      payment.isTest = (settingsDoc?.stripeMode || 'test') !== 'live';
      await payment.save();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price_data: { currency: 'usd', product_data: { name: orderDesc }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
        success_url: successUrl, cancel_url: cancelUrl,
        client_reference_id: String(payment._id),
        metadata: { paymentId: String(payment._id), orderId: String(order._id), orderType: 'domain' },
      });
      payment.providerRef = session.id; payment.checkoutUrl = session.url; await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id });
    }

    // Nicky crypto
    try {
      const nickyUrl = await createNickyPayment({
        amount, currency: 'USD', description: orderDesc, orderNumber,
        reference: String(payment._id), billDescription: orderDesc,
        customerEmail: me.businessEmail, customerName: me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me.businessEmail,
        redirectUrl: successUrl, cancelUrl,
      });
      payment.checkoutUrl = nickyUrl; await payment.save();
      return res.json({ checkoutUrl: nickyUrl, paymentId: payment._id });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: 'Domain order error: ' + e.message });
  }
});

// Admin: reseller account balance from DomainNameAPI
app.get('/api/admin/domain-balance', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const headers = dnaAuthHeaders();
    headers['accept'] = 'text/plain';
    const resp = await fetch(`${DNA_BASE}/api/v1/deposit/accounts/me`, { method: 'GET', headers });
    const raw = await resp.text();
    console.log('DNA BALANCE <-', resp.status, raw.slice(0, 300));
    let data;
    try { data = JSON.parse(raw); } catch (_) {
      return res.status(400).json({ error: `Balance response error (${resp.status}): ${raw.slice(0, 150)}` });
    }
    if (!resp.ok || data.success === false) {
      return res.status(400).json({ error: data?.error?.message || data?.reason || `Balance fetch failed (${resp.status})` });
    }
    // Return the raw data plus best-guess normalized fields (adjust if field names differ)
    const info = data.info || data;
    res.json({
      balance: info.balance ?? info.amount ?? info.deposit ?? null,
      currency: info.currency || 'USD',
      raw: info,
    });
  } catch (e) {
    res.status(500).json({ error: 'Balance error: ' + e.message });
  }
});

// Public domain search (for the landing page — no login required)
app.post('/api/public/domains/search', async (req, res) => {
  try {
    const { domainName } = req.body;
    const dom = (domainName || '').toLowerCase().trim();
    if (!dom || !/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) {
      return res.status(400).json({ error: 'Please enter a valid domain like example.com' });
    }
    const result = await dnaDomainSearch(dom);
    res.json({
      domainName: result.domainName,
      available: result.available,
      currency: result.currency,
      period: result.period,
      price: result.price,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Customer: search domain availability + price
app.post('/api/customer/domains/search', authenticateCustomer, async (req, res) => {
  try {
    const { domainName } = req.body;
    const dom = (domainName || '').toLowerCase().trim();
    if (!dom || !/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) {
      return res.status(400).json({ error: 'Please enter a valid domain like example.com' });
    }
    const result = await dnaDomainSearch(dom);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const plans = await Plan.find({ active: true }).sort({ category: 1, sortOrder: 1 });
    const shape = (cat) =>
      plans
        .filter((p) => p.category === cat)
        .map((p) => ({ id: p.planId, name: p.name, monthlyPrice: p.monthlyPrice, features: p.features }));
    res.json({ workspace: shape('workspace'), voice: shape('voice'), addons: shape('addon') });
  } catch (error) {
    res.status(500).json({ error: 'Could not load products' });
  }
});

// ADMIN: manage plans/prices
app.get('/api/admin/plans', async (req, res) => {
  try {
    const plans = await Plan.find().sort({ category: 1, sortOrder: 1 });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/plans', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const plan = await Plan.create(req.body);
    res.json(plan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/admin/plans/:id', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/admin/plans/:id', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WORKSPACE ORDERS (Stage 1 customer order intake)
app.post('/api/workspace-orders', authenticateCustomer, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.organization?.domain || !body.plan?.id || !body.seats) {
      return res.status(400).json({ error: 'Missing required order fields' });
    }
    const orderNumber = `WS-${Date.now()}`;
    const order = await WorkspaceOrder.create({
      customerId: req.customerId,
      orderNumber,
      type: 'workspace',
      plan: body.plan,
      seats: body.seats,
      monthlyTotal: body.monthlyTotal,
      organization: body.organization,
      contact: body.contact,
      status: 'pending',
    });

    // Link this domain to the customer's account so their "My Subscriptions" can find it
    try {
      const dom = (body.organization.domain || '').toLowerCase().trim();
      if (dom) {
        await Customer.findByIdAndUpdate(req.customerId, { domain: dom });
      }
    } catch (_) { }

    res.json({ orderNumber: order.orderNumber, id: order._id, status: order.status });
  } catch (error) {
    res.status(500).json({ error: 'Could not create order' });
  }
});

app.get('/api/workspace-orders', authenticateCustomer, async (req, res) => {
  try {
    const orders = await WorkspaceOrder.find({ customerId: req.customerId }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check whether a domain is already taken (DB-level now; Google API check added in Stage 2c)
app.get('/api/workspace-orders/check-domain/:domain', authenticateCustomer, async (req, res) => {
  try {
    const domain = (req.params.domain || '').toLowerCase().trim();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      return res.status(400).json({ available: false, reason: 'invalid', message: 'Enter a valid domain (e.g. example.com).' });
    }
    // Has this domain already been ordered through this portal?
    const existing = await WorkspaceOrder.findOne({ 'organization.domain': domain });
    if (existing) {
      return res.json({
        available: false,
        reason: 'taken',
        message: 'This domain already has a Workspace order. Use the existing customer to purchase add-ons.',
      });
    }

    // Ask Google: does this domain already have a Workspace customer on our reseller account?
    try {
      const auth = await getResellerAuth();
      const reseller = google.reseller({ version: 'v1', auth });
      // customers.get with a domain returns the customer if it exists, else 404
      await reseller.customers.get({ customerId: domain });
      // If we got here, the customer EXISTS on Google -> domain already has Workspace
      return res.json({
        available: false,
        reason: 'google_taken',
        message: 'This domain already has Google Workspace. Please use a different domain.',
      });
    } catch (gErr) {
      const code = gErr?.code || gErr?.response?.status;
      if (code === 404) {
        // 404 = no customer for this domain on Google -> it's free to use
        return res.json({ available: true, message: 'Domain is available.' });
      }
      if (String(gErr.message || '').includes('not connected')) {
        // Google not connected — fall back to DB-only result (don't hard-block)
        return res.json({ available: true, message: 'Domain is available (Google check unavailable).' });
      }
      // Other Google errors: be safe, let them proceed but note it
      return res.json({ available: true, message: 'Domain is available.' });
    }
  } catch (error) {
    res.status(500).json({ available: false, reason: 'error', message: 'Could not check domain right now.' });
  }
});

// Get one workspace order (for the verification screen)
app.get('/api/workspace-orders/:id', authenticateCustomer, async (req, res) => {
  try {
    const order = await WorkspaceOrder.findOne({ _id: req.params.id, customerId: req.customerId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get (or create) the domain verification TXT record for an order
app.get('/api/workspace-orders/:id/verification', authenticateCustomer, async (req, res) => {
  try {
    const order = await WorkspaceOrder.findOne({ _id: req.params.id, customerId: req.customerId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.txtRecord) {
      // Generate a verification token (placeholder format until Stage 2c wires real Google verification)
      order.txtRecord = `google-site-verification=${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      order.status = 'domain_verification';
      await order.save();
    }
    res.json({
      domain: order.organization?.domain,
      txtRecord: order.txtRecord,
      verified: order.domainVerified,
      status: order.status,
      steps: [
        'Open admin.google.com and start setup for your domain',
        'Add the TXT record below to your domain DNS (at your registrar)',
        'Wait for DNS to propagate (can take minutes to a few hours)',
        'Verify the domain in the Google Admin console',
        'Come back here and mark it verified',
      ],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark the domain verified (customer confirms after verifying at admin.google.com)
// NOTE: In Stage 2c this will actually CHECK with Google. For now it records the customer's confirmation.
app.post('/api/workspace-orders/:id/verify', authenticateCustomer, async (req, res) => {
  try {
    const order = await WorkspaceOrder.findOne({ _id: req.params.id, customerId: req.customerId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.domainVerified = true;
    if (order.status !== 'provisioned') order.status = 'domain_verification';
    await order.save();
    res.json({ success: true, domainVerified: true, status: order.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== GOOGLE OAUTH CONNECTION (Stage 2c) ====================

// Step A: Admin starts the connect flow -> redirects to Google sign-in
app.get('/api/google/connect', (req, res) => {
  try {
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
      return res.status(500).send('Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI.');
    }
    const oauth2 = makeOAuthClient();
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',     // get a refresh token
      prompt: 'consent',          // force refresh token on every connect
      scope: RESELLER_SCOPES,
    });
    res.redirect(url);
  } catch (e) {
    res.status(500).send('Could not start Google connection: ' + e.message);
  }
});

// Step B: Google redirects back here with a code -> exchange for tokens, store them
app.get('/api/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing authorization code.');
    const oauth2 = makeOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    // Find out which account connected
    let email = '';
    try {
      const oauth2api = google.oauth2({ version: 'v2', auth: oauth2 });
      const info = await oauth2api.userinfo.get();
      email = info.data.email || '';
    } catch (_) { }

    // Upsert the Pakistan connection record
    let conn = await GoogleConnection.findOne({ account: 'pk' });
    if (!conn) conn = new GoogleConnection({ account: 'pk' });
    if (tokens.refresh_token) conn.refreshToken = tokens.refresh_token;
    conn.accessToken = tokens.access_token;
    conn.tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    conn.connectedEmail = email;
    conn.scopes = RESELLER_SCOPES;
    conn.name = 'Pakistan Reseller';
    conn.active = true;
    await conn.save();

    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>✅ Pakistan reseller connected</h2>
      <p>Connected as <b>${email || 'your reseller account'}</b>.</p>
      <p>You can close this tab and return to your portal.</p>
      </body></html>`);
  } catch (e) {
    res.status(500).send('Google connection failed: ' + e.message);
  }
});

// ===== USA reseller OAuth (for Google Voice) =====
app.get('/api/google/usa/connect', (req, res) => {
  try {
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID_USA) {
      return res.status(500).send('USA OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID_USA / SECRET_USA / REDIRECT_URI_USA.');
    }
    const oauth2 = makeUsaOAuthClient();
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/apps.order'], // Voice subscription only needs apps.order
    });
    res.redirect(url);
  } catch (e) {
    res.status(500).send('Could not start USA connection: ' + e.message);
  }
});

app.get('/api/google/usa/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing authorization code.');
    const oauth2 = makeUsaOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    let email = '';
    try {
      const oauth2api = google.oauth2({ version: 'v2', auth: oauth2 });
      const info = await oauth2api.userinfo.get();
      email = info.data.email || '';
    } catch (_) { }

    let conn = await GoogleConnection.findOne({ account: 'usa' });
    if (!conn) conn = new GoogleConnection({ account: 'usa' });
    if (tokens.refresh_token) conn.refreshToken = tokens.refresh_token;
    conn.accessToken = tokens.access_token;
    conn.tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    conn.connectedEmail = email;
    conn.scopes = ['https://www.googleapis.com/auth/apps.order'];
    conn.name = 'USA Reseller (Voice)';
    conn.active = true;
    await conn.save();

    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>✅ USA reseller connected (Voice)</h2>
      <p>Connected as <b>${email || 'your USA reseller account'}</b>.</p>
      <p>You can close this tab and return to your portal.</p>
      </body></html>`);
  } catch (e) {
    res.status(500).send('USA connection failed: ' + e.message);
  }
});

// Status: is the reseller Google account connected?
app.get('/api/google/status', authenticateCustomer, async (req, res) => {
  try {
    const pk = await GoogleConnection.findOne({ account: 'pk' });
    const usa = await GoogleConnection.findOne({ account: 'usa' });
    res.json({
      connected: !!(pk && pk.refreshToken && pk.active) || !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      email: pk?.connectedEmail || null,
      usa: {
        connected: !!(usa && usa.refreshToken && usa.active),
        email: usa?.connectedEmail || null,
      },
    });
  } catch (e) {
    res.status(500).json({ connected: false });
  }
});

// Auth client for the USA reseller (OAuth refresh token) — used for Voice
async function getUsaAuth() {
  const conn = await GoogleConnection.findOne({ account: 'usa' });
  if (!conn || !conn.refreshToken) throw new Error('USA reseller not connected. Connect it to sell Voice.');
  const oauth2 = makeUsaOAuthClient();
  oauth2.setCredentials({ refresh_token: conn.refreshToken });
  return oauth2;
}

// Full scopes needed for end-to-end provisioning (customer + admin user + verification)
const PROVISION_SCOPES = [
  'https://www.googleapis.com/auth/apps.order',
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.domain',
  'https://www.googleapis.com/auth/siteverification',
];

// Service-account auth that impersonates the reseller admin (domain-wide delegation).
// This is the method that can create users in customer domains.
function getServiceAccountAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return null;
  let creds;
  try {
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (e) {
    console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:', e.message);
    return null;
  }
  const subject = process.env.RESELLER_ADMIN_EMAIL || 'admin@gnbmentor.com';
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: PROVISION_SCOPES,
    subject, // impersonate the reseller admin
  });
}

// Helper: get an authorized client for reseller calls.
// Prefers the service account (needed for user creation); falls back to OAuth refresh token.
async function getResellerAuth() {
  const sa = getServiceAccountAuth();
  if (sa) return sa;
  const conn = await GoogleConnection.findOne({ account: 'pk' });
  if (!conn || !conn.refreshToken) throw new Error('Google account not connected');
  const oauth2 = makeOAuthClient();
  oauth2.setCredentials({ refresh_token: conn.refreshToken });
  return oauth2;
}

// One-time: backfill Google SKU IDs onto existing workspace plans
app.post('/api/admin/backfill-skus', async (req, res) => {
  try {
    const skuMap = {
      starter: '1010020027',
      'voice-starter': '1010330003',
      'voice-standard': '1010330004',
      'voice-premier': '1010330002',
      standard: '1010020028',
      plus: '1010020025',
      frontline: '1010020030',
    };
    const results = [];
    for (const [planId, skuId] of Object.entries(skuMap)) {
      const r = await Plan.updateOne({ planId }, { $set: { skuId } });
      results.push({ planId, skuId, matched: r.matchedCount ?? r.n, modified: r.modifiedCount ?? r.nModified });
    }
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Provision a workspace order into Google: create customer + create subscription
// Reusable provisioning: creates Google customer + admin user + Workspace subscription.
// Returns { success, message } or throws. Used by the manual endpoint AND auto-provision-on-payment.
async function provisionWorkspaceOrder(order) {
  const planDoc = await Plan.findOne({ planId: order.plan?.id });
  if (!planDoc || !planDoc.skuId) throw new Error('Plan is missing a Google SKU.');

  const auth = await getResellerAuth();
  const reseller = google.reseller({ version: 'v1', auth });
  const org = order.organization || {};
  const contact = order.contact || {};
  const domain = (org.domain || '').toLowerCase();

  // Plan type: FLEXIBLE (monthly) or ANNUAL_MONTHLY_PAY (annual commitment, paid monthly)
  const planType = order.planType === 'annual' ? 'ANNUAL_MONTHLY_PAY' : 'FLEXIBLE';
  const seatsBody = planType === 'FLEXIBLE'
    ? { maximumNumberOfSeats: order.seats }
    : { numberOfSeats: order.seats };

  // 1) Create customer
  try {
    await reseller.customers.insert({
      requestBody: {
        customerDomain: domain,
        alternateEmail: contact.alternateEmail,
        customerDomainVerified: !!order.domainVerified,
        phoneNumber: contact.phone || undefined,
        postalAddress: {
          contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          organizationName: org.name,
          addressLine1: org.streetAddress,
          addressLine2: org.streetAddress2 || undefined,
          locality: org.city,
          region: org.state,
          postalCode: org.zip,
          countryCode: 'US',
        },
      },
    });
  } catch (custErr) {
    const msg = custErr?.errors?.[0]?.message || custErr?.message || '';
    if (!/already exists|entity already|duplicate/i.test(msg)) throw new Error('Customer creation failed: ' + msg);
  }

  // 2) Create admin user
  try {
    const rawUser = (org.desiredAdminUsername || 'admin').toString().trim();
    const localPart = rawUser.includes('@') ? rawUser.split('@')[0] : rawUser;
    const adminEmail = `${localPart}@${domain}`;
    const password = org.tempPassword && org.tempPassword.length >= 8
      ? org.tempPassword
      : Math.random().toString(36).slice(2) + 'A1!';
    const directory = google.admin({ version: 'directory_v1', auth });
    await directory.users.insert({
      requestBody: {
        primaryEmail: adminEmail,
        name: { givenName: contact.firstName || 'Admin', familyName: contact.lastName || org.name || 'User' },
        password,
        changePasswordAtNextLogin: true,
      },
    });
    await directory.users.makeAdmin({ userKey: adminEmail, requestBody: { status: true } });
  } catch (userErr) {
    const msg = userErr?.errors?.[0]?.message || userErr?.message || '';
    if (!/already exists|entity already|duplicate|409/i.test(msg)) throw new Error('Admin user creation failed: ' + msg);
  }

  // 3) Create subscription
  try {
    await reseller.subscriptions.insert({
      customerId: domain,
      requestBody: {
        customerId: domain,
        skuId: planDoc.skuId,
        plan: { planName: planType },
        seats: seatsBody,
        purchaseOrderId: order.orderNumber,
      },
    });
  } catch (subErr) {
    const msg = subErr?.errors?.[0]?.message || subErr?.message || '';
    throw new Error('Subscription creation failed: ' + msg);
  }

  order.status = 'provisioned';
  order.googleProvisioned = true;
  await order.save();
  return { success: true, message: 'Provisioned in Google.' };
}

app.post('/api/workspace-orders/:id/provision', authenticateCustomer, async (req, res) => {
  try {
    const order = await WorkspaceOrder.findOne({ _id: req.params.id, customerId: req.customerId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.googleProvisioned && !req.query.force) {
      // Verify it really exists in Google rather than trusting the flag
      try {
        const auth = await getResellerAuth();
        const reseller = google.reseller({ version: 'v1', auth });
        const domain = (order.organization?.domain || '').toLowerCase();
        const existing = await reseller.customers.get({ customerId: domain });
        return res.json({
          success: true,
          alreadyProvisioned: true,
          message: `Confirmed in Google: customer ${existing.data.customerDomain || domain} exists.`,
        });
      } catch (checkErr) {
        // Flag said provisioned but Google has no such customer -> reset and re-provision
        order.googleProvisioned = false;
        await order.save();
        // fall through to provisioning below
      }
    }

    // Look up the plan to get its Google SKU id
    const planDoc = await Plan.findOne({ planId: order.plan?.id });
    if (!planDoc || !planDoc.skuId) {
      return res.status(400).json({ error: 'Plan is missing a Google SKU. Set it in admin before provisioning.' });
    }

    const auth = await getResellerAuth();
    const reseller = google.reseller({ version: 'v1', auth });
    const org = order.organization || {};
    const contact = order.contact || {};
    const domain = (org.domain || '').toLowerCase();

    // 1) Create the customer (idempotent-ish: if exists, we catch and continue)
    let customerCreated = false;
    try {
      await reseller.customers.insert({
        requestBody: {
          customerDomain: domain,
          alternateEmail: contact.alternateEmail,
          customerDomainVerified: !!order.domainVerified,
          phoneNumber: contact.phone || undefined,
          postalAddress: {
            contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            organizationName: org.name,
            addressLine1: org.streetAddress,
            addressLine2: org.streetAddress2 || undefined,
            locality: org.city,
            region: org.state,
            postalCode: org.zip,
            countryCode: 'US',
          },
        },
      });
      customerCreated = true;
    } catch (custErr) {
      const msg = custErr?.errors?.[0]?.message || custErr?.message || '';
      // If the customer already exists, proceed to subscription
      if (!/already exists|entity already|duplicate/i.test(msg)) {
        return res.status(400).json({ error: 'Customer creation failed: ' + msg, step: 'customer' });
      }
    }

    // 2) Create the first admin user with the customer's chosen username + temp password
    let adminEmail = '';
    let adminCreated = false;
    try {
      const rawUser = (org.desiredAdminUsername || 'admin').toString().trim();
      // Accept either "admin" or "admin@domain" — normalize to local part
      const localPart = rawUser.includes('@') ? rawUser.split('@')[0] : rawUser;
      adminEmail = `${localPart}@${domain}`;
      const password = org.tempPassword && org.tempPassword.length >= 8
        ? org.tempPassword
        : Math.random().toString(36).slice(2) + 'A1!';

      const directory = google.admin({ version: 'directory_v1', auth });
      await directory.users.insert({
        requestBody: {
          primaryEmail: adminEmail,
          name: {
            givenName: contact.firstName || 'Admin',
            familyName: contact.lastName || org.name || 'User',
          },
          password,
          changePasswordAtNextLogin: true,
        },
      });
      // Promote to super administrator
      await directory.users.makeAdmin({
        userKey: adminEmail,
        requestBody: { status: true },
      });
      adminCreated = true;
    } catch (userErr) {
      const msg = userErr?.errors?.[0]?.message || userErr?.message || '';
      // 409 = user already exists -> treat as ok and continue
      if (!/already exists|entity already|duplicate|409/i.test(msg)) {
        return res.status(400).json({
          error: 'Admin user creation failed: ' + msg,
          step: 'admin_user',
          customerCreated,
        });
      }
      adminCreated = true; // already existed
    }

    // 3) Create the Workspace subscription
    try {
      await reseller.subscriptions.insert({
        customerId: domain,
        requestBody: {
          customerId: domain,
          skuId: planDoc.skuId,
          plan: { planName: 'FLEXIBLE' }, // pay-as-you-go monthly; matches reseller pricing
          seats: { numberOfSeats: order.seats, maximumNumberOfSeats: order.seats },
          purchaseOrderId: order.orderNumber,
        },
      });
    } catch (subErr) {
      const msg = subErr?.errors?.[0]?.message || subErr?.message || '';
      return res.status(400).json({
        error: 'Subscription creation failed: ' + msg,
        step: 'subscription',
        customerCreated,
        adminCreated,
      });
    }

    order.status = 'provisioned';
    order.googleProvisioned = true;
    await order.save();
    res.json({
      success: true,
      customerCreated,
      adminCreated,
      adminEmail,
      message: 'Customer, admin user, and Workspace subscription created in Google.',
    });
  } catch (error) {
    const msg = error?.message || 'Provisioning failed';
    res.status(500).json({ error: msg });
  }
});

// ==================== ADD GOOGLE VOICE TO AN EXISTING DOMAIN ====================
// Adds a Voice subscription to a domain that already has Workspace.
// Enforces: domain must exist in Google, must have an active Workspace sub, and only ONE Voice sub per domain.
app.post('/api/admin/add-voice', authenticateCustomer, async (req, res) => {
  try {
    const { domain, voicePlanId, seats } = req.body;
    const dom = (domain || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'Domain is required.' });

    const voicePlan = await Plan.findOne({ planId: voicePlanId, category: 'voice' });
    if (!voicePlan || !voicePlan.skuId) {
      return res.status(400).json({ error: 'Invalid Voice plan or missing SKU.' });
    }
    const numSeats = Math.max(1, parseInt(seats, 10) || 1);

    // Voice is sold through the USA reseller account (Pakistan can't sell Voice)
    let auth;
    try {
      auth = await getUsaAuth();
    } catch (e) {
      return res.status(400).json({ error: e.message, step: 'usa_not_connected' });
    }
    const reseller = google.reseller({ version: 'v1', auth });

    // 1) Confirm the customer exists in the USA reseller account
    try {
      await reseller.customers.get({ customerId: dom });
    } catch (e) {
      if (e?.code === 404) {
        return res.status(400).json({ error: 'This domain is not a customer in the USA reseller account. Voice requires the customer to exist there.' });
      }
      throw e;
    }

    // 2) Enforce one Voice subscription per domain (Workspace lives on the Pakistan account, so we don't require it here)
    const subResp = await reseller.subscriptions.list({ customerId: dom });
    const existing = subResp.data.subscriptions || [];
    const voiceSkus = ['1010330003', '1010330004', '1010330002', '1010330005', '1010330006'];
    const hasVoice = existing.some((s) => voiceSkus.includes(String(s.skuId)));

    if (hasVoice) {
      return res.status(400).json({ error: 'This domain already has a Google Voice subscription (one per domain).' });
    }

    // 3) Add the Voice subscription. Use the correct seats field per plan type:
    //    FLEXIBLE -> maximumNumberOfSeats only; ANNUAL_MONTHLY_PAY -> numberOfSeats only.
    const attempts = [
      { planName: 'FLEXIBLE', seats: { maximumNumberOfSeats: numSeats } },
      { planName: 'ANNUAL_MONTHLY_PAY', seats: { numberOfSeats: numSeats } },
    ];
    let lastErr = '';
    let added = false;
    for (const attempt of attempts) {
      try {
        await reseller.subscriptions.insert({
          customerId: dom,
          requestBody: {
            customerId: dom,
            skuId: voicePlan.skuId,
            plan: { planName: attempt.planName },
            seats: { kind: 'subscriptions#seats', ...attempt.seats },
            purchaseOrderId: `VOICE-${Date.now()}`,
          },
        });
        added = true;
        break;
      } catch (subErr) {
        lastErr = subErr?.errors?.[0]?.message || subErr?.message || '';
        // retry with the other plan type only on applicability errors
        if (!/not applicable|invalid|seat/i.test(lastErr)) break;
      }
    }

    if (!added) {
      let hint = '';
      if (/not applicable|invalid/i.test(lastErr)) {
        hint = ' The customer may already have Voice, or this Voice SKU needs enabling for them. Check the customer in the USA Partner Console.';
      } else if (/suspended/i.test(lastErr)) {
        hint = ' Resolve the suspended subscription on this customer first.';
      } else if (/terms of service|consent/i.test(lastErr)) {
        hint = ' Accept the Google Voice reseller terms of service in the USA Partner Console.';
      }
      return res.status(400).json({ error: 'Voice subscription failed: ' + lastErr + hint, step: 'voice_subscription' });
    }

    res.json({ success: true, message: `Google ${voicePlan.name} added to ${dom}.`, domain: dom, plan: voicePlan.name, seats: numSeats });
  } catch (error) {
    const msg = error?.errors?.[0]?.message || error?.message || 'Could not add Voice.';
    res.status(500).json({ error: msg });
  }
});

// ORDER MANAGEMENT
app.post('/api/orders', authenticateCustomer, async (req, res) => {
  try {
    const { items, paymentMethod } = req.body;

    let totalAmount = 0;
    items.forEach((item) => {
      totalAmount += item.monthlyPrice * item.quantity;
    });

    const orderNumber = `ORD-${Date.now()}`;

    const payment = await processPayment(req.customerId, totalAmount, paymentMethod);
    if (!payment.success) {
      return res.status(400).json({ error: 'Payment failed' });
    }

    const order = await Order.create({
      customerId: req.customerId,
      orderNumber,
      items,
      totalAmount,
      paymentMethod,
      transactionId: payment.transactionId,
      startDate: new Date(),
      renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Create subscriptions for each item
    for (const item of items) {
      await Subscription.create({
        customerId: req.customerId,
        orderId: order._id,
        type: item.productType,
        plan: item.productName,
        seats: item.quantity,
        monthlyPrice: item.monthlyPrice,
      });
    }

    // Generate invoice
    const invoice = await Invoice.create({
      customerId: req.customerId,
      invoiceNumber: `INV-${Date.now()}`,
      orderId: order._id,
      amount: totalAmount,
      tax: Math.round(totalAmount * 0.1 * 100) / 100,
      total: Math.round((totalAmount * 1.1) * 100) / 100,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Update customer
    await Customer.findByIdAndUpdate(req.customerId, {
      $inc: { totalUsers: items.reduce((sum, item) => sum + item.quantity, 0) },
    });

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order,
      invoice: {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', authenticateCustomer, async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.customerId }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SUBSCRIPTIONS
app.get('/api/subscriptions', authenticateCustomer, async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ customerId: req.customerId });
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/subscriptions/:id', authenticateCustomer, async (req, res) => {
  try {
    const { seats, autoRenew } = req.body;
    const subscription = await Subscription.findByIdAndUpdate(
      req.params.id,
      { seats, autoRenew, updatedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, subscription });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// USER MANAGEMENT
app.post('/api/users', authenticateCustomer, async (req, res) => {
  try {
    const { firstName, lastName, email, voiceNumber, forwardingNumber } = req.body;

    // Create Google Workspace user
    const googleUser = await createGoogleWorkspaceUser(email, firstName, lastName, req.customerId);

    // Create Google Voice number if provided
    if (voiceNumber && forwardingNumber) {
      await createGoogleVoiceNumber(googleUser.id, forwardingNumber);
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: googleUser,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', authenticateCustomer, async (req, res) => {
  try {
    const users = await User.find({ customerId: req.customerId });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticateCustomer, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true });
    // Also disable in Google Workspace
    res.json({ success: true, message: 'User disabled', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// INVOICES
app.get('/api/invoices', authenticateCustomer, async (req, res) => {
  try {
    const invoices = await Invoice.find({ customerId: req.customerId }).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invoices/:id', authenticateCustomer, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      customerId: req.customerId,
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DOMAINS
app.post('/api/domains', authenticateCustomer, async (req, res) => {
  try {
    const { domainName } = req.body;

    const domain = await Domain.create({
      customerId: req.customerId,
      domainName,
      txtRecord: `google-site-verification=${Math.random().toString(36).substring(7)}`,
    });

    res.status(201).json({
      success: true,
      domain,
      verificationSteps: [
        'Add the TXT record to your domain DNS',
        'Wait 24-48 hours for DNS propagation',
        'Verify the domain in your dashboard',
      ],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/domains', authenticateCustomer, async (req, res) => {
  try {
    const domains = await Domain.find({ customerId: req.customerId });
    res.json(domains);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/domains/:id/verify', authenticateCustomer, async (req, res) => {
  try {
    const domain = await Domain.findByIdAndUpdate(
      req.params.id,
      { verified: true, verificationMethod: 'dns' },
      { new: true }
    );
    res.json({ success: true, domain });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DASHBOARD STATS
app.get('/api/dashboard', authenticateCustomer, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customerId);
    const orders = await Order.find({ customerId: req.customerId });
    const subscriptions = await Subscription.find({ customerId: req.customerId });
    const users = await User.find({ customerId: req.customerId });
    const invoices = await Invoice.find({ customerId: req.customerId });

    const stats = {
      customerInfo: {
        companyName: customer.companyName,
        totalUsers: customer.totalUsers,
        totalCost: customer.totalCost,
        resellerCode: customer.resellerCode,
      },
      orders: orders.length,
      activeSubscriptions: subscriptions.filter((s) => s.status === 'active').length,
      totalUsers: users.length,
      totalRevenue: orders.reduce((sum, order) => sum + order.totalAmount, 0),
      pendingInvoices: invoices.filter((i) => i.status === 'unpaid').length,
      recentOrders: orders.slice(0, 5),
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Voice first-party supported countries (ISO codes) — from Google's official list
const VOICE_SUPPORTED_COUNTRIES = ['BE', 'CA', 'DK', 'FR', 'DE', 'IE', 'IT', 'NL', 'PT', 'ES', 'SE', 'CH', 'GB', 'US'];

// Live subscriptions for ONE account (PK or USA), paginated (100 per page).
// Query: ?account=PK|USA&page=1
app.get('/api/admin/google/subscriptions', authenticateCustomer, async (req, res) => {
  try {
    const account = (req.query.account || 'PK').toUpperCase() === 'USA' ? 'USA' : 'PK';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = 100;

    // Pick the right auth for the requested account ONLY (no merging)
    let auth;
    try {
      auth = account === 'USA' ? await getUsaAuth() : await getResellerAuth();
    } catch (e) {
      return res.status(400).json({ error: e.message, account, notConnected: true });
    }

    const reseller = google.reseller({ version: 'v1', auth });
    let subs = [];
    let pageToken;
    do {
      const resp = await reseller.subscriptions.list({ maxResults: 100, pageToken });
      subs = subs.concat(resp.data.subscriptions || []);
      pageToken = resp.data.nextPageToken;
    } while (pageToken);

    const allRows = subs.map((s) => {
      return {
        account,
        customerId: s.customerId,
        domain: s.customerDomain || s.customerId,
        skuId: s.skuId,
        skuName: s.skuName || s.skuId,
        planName: s.plan?.planName,
        seats: s.seats?.numberOfSeats ?? s.seats?.licensedNumberOfSeats ?? null,
        licensedSeats: s.seats?.licensedNumberOfSeats ?? null,
        status: s.status,
        creationTime: s.creationTime ? Number(s.creationTime) : null,
      };
    });

    const total = allRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const rows = allRows.slice(start, start + pageSize);

    const uniqueDomains = new Set(allRows.map((r) => r.domain));
    const summary = {
      account,
      totalSubscriptions: total,
      activeSubscriptions: allRows.filter((r) => r.status === 'ACTIVE').length,
      suspendedSubscriptions: allRows.filter((r) => r.status === 'SUSPENDED').length,
      totalCustomers: uniqueDomains.size,
    };

    res.json({ subscriptions: rows, summary, page, totalPages, total });
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message || 'Could not fetch subscriptions from Google';
    res.status(500).json({ error: msg });
  }
});

// Live dashboard stats from Google
app.get('/api/admin/google/dashboard', authenticateCustomer, async (req, res) => {
  try {
    const auth = await getResellerAuth();
    const reseller = google.reseller({ version: 'v1', auth });
    let subs = [];
    let pageToken;
    do {
      const resp = await reseller.subscriptions.list({ maxResults: 100, pageToken });
      subs = subs.concat(resp.data.subscriptions || []);
      pageToken = resp.data.nextPageToken;
    } while (pageToken);

    const uniqueDomains = new Set(subs.map((s) => s.customerDomain || s.customerId));
    const totalSeats = subs.reduce((sum, s) => sum + (s.seats?.numberOfSeats || 0), 0);

    res.json({
      totalCustomers: uniqueDomains.size,
      totalSubscriptions: subs.length,
      activeSubscriptions: subs.filter((s) => s.status === 'ACTIVE').length,
      suspendedSubscriptions: subs.filter((s) => s.status === 'SUSPENDED').length,
      totalSeats,
    });
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message || 'Could not fetch dashboard data from Google';
    res.status(500).json({ error: msg });
  }
});

// HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📧 Email service: ${process.env.EMAIL_USER}`);
  console.log(`🔐 JWT Secret configured: ${process.env.JWT_SECRET ? 'Yes' : 'No'}`);
  console.log(`☁️ Google Workspace configured: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'Yes' : 'No'}`);
});

module.exports = app;