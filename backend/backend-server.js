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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  businessEmail: String,
  password: String,
  phone: String,
  country: String,
  address: String,
  taxId: String,
  resellerCode: String,
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

// Models
const Customer = mongoose.model('Customer', CustomerSchema);
const Order = mongoose.model('Order', OrderSchema);
const Subscription = mongoose.model('Subscription', SubscriptionSchema);
const User = mongoose.model('User', UserSchema);
const Invoice = mongoose.model('Invoice', InvoiceSchema);
const Domain = mongoose.model('Domain', DomainSchema);

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
      enum: ['pending', 'domain_verification', 'provisioned', 'cancelled'],
      default: 'pending',
    },
    domainVerified: { type: Boolean, default: false },
    googleProvisioned: { type: Boolean, default: false },
    txtRecord: String,
    voiceEligible: { type: Boolean, default: true }, // one Voice sub per domain (Stage 2)
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

const generateToken = (id, email) => {
  return jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Middleware for authentication
const authenticateCustomer = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  req.customerId = decoded.id;
  next();
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
    const { companyName, businessEmail, password, phone, country, address, taxId } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const resellerCode = `RSL-${Date.now()}`;

    const customer = await Customer.create({
      companyName,
      businessEmail,
      password: hashedPassword,
      phone,
      country,
      address,
      taxId,
      resellerCode,
    });

    const token = generateToken(customer._id, customer.businessEmail);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      customer: {
        id: customer._id,
        companyName: customer.companyName,
        businessEmail: customer.businessEmail,
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

    const customer = await Customer.findOne({ businessEmail });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const isValid = await bcrypt.compare(password, customer.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid password' });

    customer.lastLogin = new Date();
    await customer.save();

    const token = generateToken(customer._id, customer.businessEmail);

    res.json({
      success: true,
      token,
      customer: {
        id: customer._id,
        companyName: customer.companyName,
        businessEmail: customer.businessEmail,
        resellerCode: customer.resellerCode,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PRODUCTS & PRICING (DB-backed, editable via /api/admin/plans)
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

app.post('/api/admin/plans', async (req, res) => {
  try {
    const plan = await Plan.create(req.body);
    res.json(plan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/admin/plans/:id', async (req, res) => {
  try {
    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/admin/plans/:id', async (req, res) => {
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