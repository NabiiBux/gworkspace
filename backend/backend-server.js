/**
 * Google Workspace Reseller Portal - Backend Server
 * Complete API with Google Workspace Admin SDK & Voice Integration
 */

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
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
mongoose.set('bufferCommands', false);
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/workspace-reseller', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 2000,
}).catch(err => console.warn('MongoDB not connected — some features may not work: ' + err.message));

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
  // Voice Acceptable Use Policy acceptance (recorded at signup for legal cover)
  aupAccepted: { type: Boolean, default: false },
  aupAcceptedAt: Date,
  aupVersion: String,
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

// Lead Schema (Prospective Client Lead Gen)
const LeadSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  businessName: String,
  domain: String,
  services: [String],
  message: String,
  status: { type: String, enum: ['New', 'In Discussion', 'Contacted', 'Qualified', 'Closed'], default: 'New' },
  notes: String,
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
const Lead = mongoose.model('Lead', LeadSchema);

// Payment record
const PaymentSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  customerEmail: String,
  domain: String,
  orderId: mongoose.Schema.Types.ObjectId,
  orderType: { type: String, enum: ['workspace', 'domain', 'domain_transfer', 'workspace_transfer', 'ssl', 'hosting', 'addon', 'seat_change'], default: 'workspace' },
  amount: Number,            // total charged (subtotal + tax)
  subtotal: Number,          // pre-tax amount
  tax: Number,               // tax portion
  fee: Number,               // processing fee portion
  addonSku: String,          // for addon orders: the SKU to provision
  addonAccount: String,      // which reseller account the addon bills to ('pk'/'usa')
  addonName: String,
  isRenewal: { type: Boolean, default: false },  // true = Workspace renewal payment
  renewalSkuId: String,      // which subscription SKU is being renewed
  seatChangeSku: String,     // for seat_change orders: the SKU to resize
  seatChangeNewSeats: Number,
  seatChangeFromSeats: Number,
  seatChangeSubId: String,
  currency: { type: String, default: 'USD' },
  method: { type: String, enum: ['stripe', 'nicky'], default: 'stripe' },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'cancelled'], default: 'pending' },
  providerRef: String,     // Stripe session id or Nicky bill/order id (GUID)
  providerShortId: String, // Nicky shortId (e.g. 6DBY95) — used for status lookups
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

// Tracks a domain transfer-in (import to Namecheap). Pay-first like registration.
const DomainTransferSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  orderNumber: { type: String, unique: true },
  domainName: String,
  eppCode: String,
  price: Number,
  status: { type: String, enum: ['pending', 'submitted', 'completed', 'failed', 'test_paid'], default: 'pending' },
  transferId: String,         // Namecheap TransferID once submitted
  transferStatus: String,     // WAITINGFOREPP | COMPLETED | CANCELED ...
  submittedAt: Date,
  completedAt: Date,
  resultNote: String,
  createdAt: { type: Date, default: Date.now },
});
const DomainTransfer = mongoose.model('DomainTransfer', DomainTransferSchema);

// Tracks a Google Workspace subscription transfer (import from another reseller via transfer token).
const WorkspaceTransferSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  orderNumber: { type: String, unique: true },
  domain: String,
  account: { type: String, default: 'pk' },   // which reseller account receives it
  planId: String,
  planName: String,
  seats: { type: Number, default: 1 },
  planType: { type: String, enum: ['flexible', 'annual'], default: 'flexible' },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'test_paid'], default: 'pending' },
  subscriptionsClaimed: { type: Number, default: 0 },
  resultNote: String,
  completedAt: Date,
  createdAt: { type: Date, default: Date.now },
});
const WorkspaceTransfer = mongoose.model('WorkspaceTransfer', WorkspaceTransferSchema);

// Tracks an SSL certificate purchase (pay-first, like domains).
const SslOrderSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  orderNumber: { type: String, unique: true },
  productType: String,           // e.g. 'PositiveSSL'
  years: { type: Number, default: 1 },
  price: Number,
  forDomain: String,             // the domain this cert is for (optional at purchase)
  status: { type: String, enum: ['pending', 'purchased', 'active', 'failed', 'test_paid'], default: 'pending' },
  certificateId: String,         // Namecheap CertificateID once purchased
  activationNote: String,
  purchasedAt: Date,
  createdAt: { type: Date, default: Date.now },
});
const SslOrder = mongoose.model('SslOrder', SslOrderSchema);

// Namecheap product pricing overrides (admin-set): per TLD/SSL/hosting.
// kind: 'tld' | 'ssl' | 'hosting'; key: e.g. 'com', 'PositiveSSL', 'stellar'
const NcPricingSchema = new mongoose.Schema({
  kind: { type: String, enum: ['tld', 'ssl', 'hosting'], required: true },
  key: { type: String, required: true },          // tld/ssl-type/hosting-plan id
  label: String,                                   // display name
  markupPercent: Number,                           // optional per-item markup override
  fixedPrice: Number,                              // optional fixed price (wins over markup)
  cost: Number,                                     // last-known Namecheap cost (for reference)
  active: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
});
NcPricingSchema.index({ kind: 1, key: 1 }, { unique: true });
const NcPricing = mongoose.model('NcPricing', NcPricingSchema);

// Hosting plans (admin-defined, since Namecheap hosting isn't a simple API product).
const HostingPlanSchema = new mongoose.Schema({
  planId: { type: String, unique: true },
  name: String,
  description: String,
  cost: Number,            // your cost
  price: Number,           // selling price
  billingCycle: { type: String, default: 'yearly' },
  features: [String],
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
});
const HostingPlan = mongoose.model('HostingPlan', HostingPlanSchema);

// Customer hosting purchases (pay-first).
const HostingOrderSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  orderNumber: { type: String, unique: true },
  planId: String,
  planName: String,
  forDomain: String,
  price: Number,
  billingCycle: String,
  status: { type: String, enum: ['pending', 'active', 'failed', 'test_paid'], default: 'pending' },
  activatedAt: Date,
  createdAt: { type: Date, default: Date.now },
});
const HostingOrder = mongoose.model('HostingOrder', HostingOrderSchema);

// Fixed 29-day recurring billing cycle for EACH Google subscription.
// CORE RULE: payments mark the current cycle paid but NEVER shift the schedule.
// Only two events define a new cycle: (1) initial creation, (2) manual admin unsuspension.
const BILLING_CYCLE_DAYS = 29;
const SubBillingSchema = new mongoose.Schema({
  account: { type: String, default: 'pk' },        // 'pk' or 'usa'
  domain: { type: String, index: true },
  skuId: String,
  subscriptionId: String,

  // The fixed schedule (only changed by creation or manual unsuspension):
  billingCycleStart: Date,                          // when the current cycle started
  nextBillingDate: Date,                            // billingCycleStart + 29 days
  currentCycleStatus: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },

  // Audit / tracking:
  lastPaymentDate: Date,
  lastManualUnsuspendAt: Date,
  suspendedAt: Date,

  billingStatus: { type: String, enum: ['active', 'warned', 'suspended'], default: 'active' },
  warnedAt: Date,
  whitelisted: { type: Boolean, default: false },   // whitelisted = never auto-suspended
  whitelistedAt: Date,

  // New expiration reminder tracking
  notified7DaysBefore: { type: Boolean, default: false },
  notifiedOnExpiration: { type: Boolean, default: false },

  // Legacy field kept for backward compatibility with older records (mirrors billingCycleStart).
  purchaseDate: Date,

  updatedAt: { type: Date, default: Date.now },
});
SubBillingSchema.index({ domain: 1, skuId: 1 }, { unique: true });
const SubBilling = mongoose.model('SubBilling', SubBillingSchema);

// ---- Billing cycle helpers (implement the fixed-schedule rules) ----

// Add days to a date.
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Start a BRAND NEW cycle from a given moment (creation or manual unsuspension only).
// Sets billingCycleStart = start, nextBillingDate = start + 29 days, cycle unpaid.
function startNewBillingCycle(rec, start = new Date()) {
  rec.billingCycleStart = new Date(start);
  rec.purchaseDate = rec.purchaseDate || new Date(start); // keep legacy mirror on first set
  rec.nextBillingDate = addDays(start, BILLING_CYCLE_DAYS);
  rec.currentCycleStatus = 'unpaid';
  rec.billingStatus = 'active';
  rec.warnedAt = null;
  rec.suspendedAt = null;
  rec.notified7DaysBefore = false;
  rec.notifiedOnExpiration = false;
  rec.updatedAt = new Date();
  return rec;
}

// Advance the schedule to the NEXT fixed cycle WITHOUT using the payment date.
// New start = the previous next_billing_date; new next = start + 29 days.
// Used when a paid cycle completes (rolled by the cron on/after the due date).
function advanceToNextCycle(rec) {
  const prevNext = rec.nextBillingDate ? new Date(rec.nextBillingDate) : new Date();
  rec.billingCycleStart = prevNext;
  rec.nextBillingDate = addDays(prevNext, BILLING_CYCLE_DAYS);
  rec.currentCycleStatus = 'unpaid';
  rec.warnedAt = null;
  rec.notified7DaysBefore = false;
  rec.notifiedOnExpiration = false;
  rec.updatedAt = new Date();
  return rec;
}

// Apply a customer PAYMENT to the CURRENT cycle. Never shifts the schedule.
// Just marks the current cycle paid + records the payment date, and reactivates if suspended.
function applyPaymentToCurrentCycle(rec, when = new Date()) {
  rec.currentCycleStatus = 'paid';
  rec.lastPaymentDate = new Date(when);
  rec.billingStatus = 'active';   // unsuspend if it was suspended (late payment)
  rec.warnedAt = null;
  rec.suspendedAt = null;
  rec.updatedAt = new Date();
  // NOTE: billingCycleStart and nextBillingDate are intentionally UNCHANGED.
  return rec;
}


// Editable email templates (admin can customize subject + body; {{vars}} are filled at send time)
const EmailTemplateSchema = new mongoose.Schema({
  key: { type: String, unique: true },     // 'warning' | 'suspension' | 'payment'
  subject: String,
  heading: String,
  body: String,                            // supports {{domain}}, {{dueDate}}, {{amount}}, {{brand}}
  updatedAt: { type: Date, default: Date.now },
});
const EmailTemplate = mongoose.model('EmailTemplate', EmailTemplateSchema);

// Abuse / spam complaint log — track reports against Voice customers
const AbuseReportSchema = new mongoose.Schema({
  domain: { type: String, index: true },     // customer domain the report is about
  customerId: mongoose.Schema.Types.ObjectId,
  reportType: { type: String, enum: ['spam_calls', 'spam_sms', 'robocall', 'harassment', 'fraud_scam', 'child_safety', 'illegal', 'impersonation', 'privacy', 'carrier_block', 'google_notice', 'other'], default: 'other' },
  source: String,                              // who reported (recipient, carrier, Google, internal)
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  description: String,
  phoneNumber: String,                         // the number involved, if known
  status: { type: String, enum: ['open', 'investigating', 'actioned', 'dismissed'], default: 'open' },
  actionTaken: String,                         // e.g. 'warned', 'suspended', 'none'
  loggedBy: String,                            // admin who logged it
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const AbuseReport = mongoose.model('AbuseReport', AbuseReportSchema);

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
  // Namecheap mode: 'sandbox' = test (no real charges), 'live' = production
  namecheapMode: { type: String, enum: ['sandbox', 'live'], default: 'sandbox' },
  // Customer-paid processing fee
  feeEnabled: { type: Boolean, default: false },
  feeFixed: { type: Number, default: 0 },        // USD
  feePercent: { type: Number, default: 0 },      // % of subtotal
  // Tax (applied to all checkouts — Stripe AND crypto). Added on top of the subtotal.
  taxEnabled: { type: Boolean, default: false },
  taxPercent: { type: Number, default: 0 },      // % tax added to every order
  taxLabel: { type: String, default: 'Tax' },
  updatedAt: { type: Date, default: Date.now },
});
const PaymentSettings = mongoose.model('PaymentSettings', PaymentSettingsSchema);

// Branding: logo + favicon (stored as base64 data URLs) + brand name/color.
const BrandSettingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'main', unique: true },
  brandName: { type: String, default: 'GNB MENTOR LLC' },
  brandColor: { type: String, default: '#0F766E' },
  logoDataUrl: { type: String, default: '' },     // data:image/png;base64,...
  faviconDataUrl: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});
const BrandSettings = mongoose.model('BrandSettings', BrandSettingsSchema);

// Order routing + plan availability (admin-controlled).
const OrderSettingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'main', unique: true },
  // Which reseller account fulfills new Workspace orders.
  pkOrdersEnabled: { type: Boolean, default: true },    // 🇵🇰 Pakistan reseller takes orders
  usaOrdersEnabled: { type: Boolean, default: false },  // 🇺🇸 USA reseller takes orders
  // Payment plans the customer may choose.
  flexibleEnabled: { type: Boolean, default: true },    // monthly / pay-as-you-go
  annualEnabled: { type: Boolean, default: false },     // annual commitment (monthly pay)
  // Our reseller transfer tokens (we give these to customers to paste in THEIR Google Admin).
  pkTransferToken: { type: String, default: '' },       // Pakistan reseller's transfer token
  usaTransferToken: { type: String, default: '' },      // USA reseller's transfer token
  pkPartnerId: { type: String, default: '' },           // Pakistan Partner/Reseller ID (shown to customer)
  usaPartnerId: { type: String, default: '' },          // USA Partner/Reseller ID
  updatedAt: { type: Date, default: Date.now },
});
const OrderSettings = mongoose.model('OrderSettings', OrderSettingsSchema);

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
    planType: { type: String, enum: ['flexible', 'annual'], default: 'flexible' }, // payment plan
    account: { type: String, default: '' },  // which reseller account fulfilled it ('pk'/'usa')
    provisionNote: String,  // any non-fatal provisioning note (e.g. admin user not auto-created)
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
      enum: ['draft', 'pending', 'domain_verification', 'provisioned', 'cancelled', 'test_paid'],
      default: 'pending',
    },
    draftData: { type: mongoose.Schema.Types.Mixed }, // saved in-progress form for resume
    draftStep: { type: Number, default: 0 },          // which step the customer was on
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
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

// Send email via Resend HTTP API (works on Railway where SMTP ports are blocked).
// Set RESEND_API_KEY and EMAIL_FROM (e.g. "GNB MENTOR LLC <noreply@yourdomain>").
async function sendViaResend(to, subject, html) {
  const fromName = process.env.EMAIL_FROM_NAME || process.env.BRAND_NAME || 'GNB MENTOR LLC';
  // Resend requires a verified domain sender; falls back to onboarding sender if EMAIL_FROM unset
  const from = process.env.EMAIL_FROM || `${fromName} <onboarding@resend.dev>`;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

const sendEmail = async (to, subject, htmlContent) => {
  try {
    const fromName = process.env.EMAIL_FROM_NAME || process.env.BRAND_NAME || 'GNB MENTOR LLC';
    // Prefer Resend (HTTP API — works on Railway where SMTP is blocked)
    if (process.env.RESEND_API_KEY) {
      await sendViaResend(to, subject, htmlContent);
      return true;
    }
    // Fallback: SMTP (works only where outbound SMTP isn't blocked)
    await transporter.sendMail({
      from: `"${fromName}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlContent,
    });
    return true;
  } catch (error) {
    console.error('Email send error:', error.message || error);
    return false;
  }
};

// ===== Billing email templates (brand: GNB MENTOR LLC, teal theme) =====
const BRAND_NAME = process.env.BRAND_NAME || 'GNB MENTOR LLC';
const PORTAL_URL = process.env.PORTAL_URL || process.env.CORS_ORIGIN || 'https://portal.gnbmentor.com';

function emailShell(title, bodyHtml) {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="background:#0F766E;color:#fff;padding:20px 24px;font-size:20px;font-weight:700">${BRAND_NAME}</div>
    <div style="padding:24px;color:#1f2937;line-height:1.6">
      <h2 style="margin:0 0 12px;font-size:20px">${title}</h2>
      ${bodyHtml}
      <div style="margin-top:24px"><a href="${PORTAL_URL}" style="background:#0F766E;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Go to your portal</a></div>
    </div>
    <div style="background:#f8fafc;padding:16px 24px;color:#6b7280;font-size:12px">You're receiving this because you have a subscription with ${BRAND_NAME}.</div>
  </div>`;
}

// Default templates (used if admin hasn't customized them)
const DEFAULT_EMAIL_TEMPLATES = {
  warning: {
    subject: 'Action needed: your {{domain}} subscription renews soon',
    heading: 'Your subscription renews soon',
    body: 'Hi,\n\nYour subscription for {{domain}} is due for renewal on {{dueDate}}.\n\nTo avoid any interruption to your email and services, please complete your payment before the due date.',
  },
  suspension: {
    subject: 'Your {{domain}} subscription is suspended — action required',
    heading: 'Your subscription has been suspended',
    body: 'Hi,\n\nYour subscription for {{domain}} has been suspended because payment wasn\'t received by the due date.\n\nTo restore your service, please make your payment in the portal. Your service reactivates automatically once payment is received.',
  },
  payment: {
    subject: 'Payment received for {{domain}}',
    heading: 'Payment received — thank you',
    body: 'Hi,\n\nWe\'ve received your payment of {{amount}} for {{domain}}.\n\nYour subscription is active and your billing cycle has been renewed. No further action is needed.',
  },
  expiry_7day: {
    subject: 'Action required: your {{domain}} subscription expires in 7 days',
    heading: 'Your subscription expires in 7 days',
    body: 'Hi,\n\nYour subscription for {{domain}} is set to expire on {{dueDate}} (in 7 days).\n\nTo prevent any disruption or suspension of your emails and services, please complete your payment in the portal before the expiration day.',
  },
  expiry_today: {
    subject: 'Action required: your {{domain}} subscription expires today',
    heading: 'Your subscription expires today',
    body: 'Hi,\n\nYour subscription for {{domain}} expires today.\n\nTo avoid immediate interruption to your service, please make your payment in the portal now.',
  },
};

function fillTemplate(str, vars) {
  return (str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

// Get a template (custom from DB, or default), filled with vars
async function getFilledTemplate(key, vars) {
  let t = await EmailTemplate.findOne({ key });
  const def = DEFAULT_EMAIL_TEMPLATES[key] || {};
  const subject = fillTemplate(t?.subject || def.subject || '', vars);
  const heading = fillTemplate(t?.heading || def.heading || '', vars);
  const bodyText = fillTemplate(t?.body || def.body || '', vars);
  const bodyHtml = bodyText.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '').join('');
  return { subject, html: emailShell(heading, bodyHtml) };
}

async function sendRenewalWarningEmail(to, domain, dueDate) {
  if (!to) return;
  const due = dueDate ? new Date(dueDate).toLocaleDateString() : 'soon';
  const { subject, html } = await getFilledTemplate('warning', { domain: domain || 'your account', dueDate: due, brand: BRAND_NAME });
  await sendEmail(to, subject, html);
}

async function sendSuspensionEmail(to, domain) {
  if (!to) return;
  const { subject, html } = await getFilledTemplate('suspension', { domain: domain || 'your account', brand: BRAND_NAME });
  await sendEmail(to, subject, html);
}

async function sendPaymentConfirmationEmail(to, domain, amount) {
  if (!to) return;
  const amt = amount != null ? `$${Number(amount).toFixed(2)}` : '';
  const { subject, html } = await getFilledTemplate('payment', { domain: domain || 'your account', amount: amt, brand: BRAND_NAME });
  await sendEmail(to, subject, html);
}

// Find a customer's email by domain (for billing notifications)
async function emailForDomain(domain) {
  if (!domain) return null;
  const c = await Customer.findOne({ domain: domain.toLowerCase() });
  return c?.businessEmail || null;
}

// Welcome / registration email
async function sendWelcomeEmail(to, name) {
  if (!to) return;
  const html = emailShell('Welcome to ' + BRAND_NAME, `
    <p>Hi ${name || 'there'},</p>
    <p>Your account has been created successfully. You can now sign in to your portal to order Google Workspace, Google Voice, domains, and add-ons.</p>
    <p>If you have any questions, just reply to this email or contact our support team.</p>`);
  await sendEmail(to, `Welcome to ${BRAND_NAME}`, html);
}

// Order-placed notification
async function sendOrderPlacedEmail(to, name, orderDesc, amount) {
  if (!to) return;
  const amt = amount != null ? ` Total: $${Number(amount).toFixed(2)}.` : '';
  const html = emailShell('Order received', `
    <p>Hi ${name || 'there'},</p>
    <p>We've received your order:</p>
    <p style="background:#f8fafc;padding:12px 16px;border-radius:8px"><strong>${orderDesc || 'Your order'}</strong>${amt}</p>
    <p>To activate your service, please complete payment in your portal. Once paid, your subscription is set up automatically.</p>`);
  await sendEmail(to, `Order received — ${BRAND_NAME}`, html);
}

// Simple email format validation (server-side)
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

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
      firstName, lastName, city, state, postalCode, phoneCountryCode, aupAccepted } = req.body;

    if (!businessEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (!isValidEmail(businessEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!aupAccepted) {
      return res.status(400).json({ error: 'You must accept the Voice Acceptable Use Policy to create an account.' });
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
      aupAccepted: true,
      aupAcceptedAt: new Date(),
      aupVersion: 'voice-aup-2025',
      domain: domain ? domain.toLowerCase().trim() : undefined,
      resellerCode,
      role: 'customer',
      registrationIp: ip,
      lastLoginIp: ip,
    });

    const token = generateToken(customer._id, customer.businessEmail, customer.role);

    // Send welcome email (non-blocking)
    try { await sendWelcomeEmail(customer.businessEmail, customer.firstName || customer.username); } catch (_) { }

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

// Endpoint to expose Google Client ID to frontend dynamically
app.get('/api/auth/google-client-id', (req, res) => {
  const clientId = process.env.GOOGLE_SIGNIN_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  res.json({ clientId });
});

// Sign in or sign up with Google (Google Identity Services).
// Frontend sends the Google ID token (credential); we verify it and log the customer in.
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });
    const clientId = process.env.GOOGLE_SIGNIN_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'Google sign-in is not configured. Set GOOGLE_SIGNIN_CLIENT_ID.' });

    const oauthClient = new google.auth.OAuth2(clientId);
    let payload;
    try {
      const ticket = await oauthClient.verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    } catch (e) {
      return res.status(401).json({ error: 'Could not verify Google sign-in. Please try again.' });
    }
    if (!payload || !payload.email || !payload.email_verified) {
      return res.status(401).json({ error: 'Your Google email could not be verified.' });
    }

    const email = payload.email.toLowerCase();
    let customer = await Customer.findOne({ businessEmail: email });
    let isNewUser = false;
    if (!customer) {
      isNewUser = true;
      customer = await Customer.create({
        businessEmail: email,
        username: (payload.given_name || email.split('@')[0]),
        firstName: payload.given_name || '',
        lastName: payload.family_name || '',
        companyName: payload.name || '',
        role: 'customer',
        password: await bcrypt.hash('google-' + Math.random().toString(36).slice(2) + Date.now(), 10),
      });
      const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
      if (adminEmail && email === adminEmail) { customer.role = 'admin'; await customer.save(); }
    }

    // Send the welcome email to brand-new Google sign-up users (same as email registration).
    if (isNewUser) {
      try { await sendWelcomeEmail(customer.businessEmail, customer.firstName || customer.username); }
      catch (e) { console.error('Welcome email (google signup) failed:', e.message); }
    }

    const token = generateToken(customer._id, customer.businessEmail, customer.role || 'customer');
    res.json({
      success: true, token,
      customer: {
        id: customer._id, companyName: customer.companyName, username: customer.username,
        businessEmail: customer.businessEmail, domain: customer.domain, role: customer.role || 'customer',
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

    // Figure out which domain(s) belong to this customer. Prefer me.domain; otherwise
    // derive from their workspace orders / transfers (covers existing/previous customers).
    let domain = me.domain;
    if (!domain) {
      const wo = await WorkspaceOrder.findOne({ customerId: me._id, 'organization.domain': { $exists: true } }).sort({ createdAt: -1 });
      if (wo?.organization?.domain) domain = wo.organization.domain.toLowerCase();
    }
    if (!domain) {
      const wt = await WorkspaceTransfer.findOne({ customerId: me._id }).sort({ createdAt: -1 });
      if (wt?.domain) domain = wt.domain.toLowerCase();
    }
    if (!domain) {
      // Last resort: derive from their email domain.
      const emailDom = (me.businessEmail || '').split('@')[1];
      if (emailDom) domain = emailDom.toLowerCase();
    }
    if (!domain) return res.json({ subscriptions: [], domain: null, note: 'No domain linked to your account yet.' });

    // Try BOTH reseller accounts (the domain could be on PK or USA).
    const accountsToTry = me.account ? [me.account] : ['pk', 'usa'];
    let subs = [];
    let foundAccount = null;
    let lastErr = null;

    for (const account of accountsToTry) {
      let auth;
      try { auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth(); }
      catch (e) { lastErr = e; continue; } // account not configured — try the next
      const reseller = google.reseller({ version: 'v1', auth });
      try {
        const resp = await reseller.subscriptions.list({ customerId: domain });
        subs = resp.data.subscriptions || [];
        foundAccount = account;
        break; // success
      } catch (e) {
        // 404 / "not found" / transfer-token style errors just mean this domain isn't on this account.
        const msg = (e?.errors?.[0]?.message || e?.message || '').toLowerCase();
        if (e?.code === 404 || /not found|does not exist|transfer token|no customer/i.test(msg)) {
          lastErr = e; continue; // try the other account
        }
        lastErr = e; // unexpected error — keep trying the other account too
        continue;
      }
    }

    // If the domain isn't on any reseller account, return an empty (not an error) so the
    // dashboard shows "no subscriptions" cleanly instead of a scary message.
    if (foundAccount === null && subs.length === 0) {
      const dbSubs = await Subscription.find({ customerId: me._id });
      if (dbSubs.length > 0) {
        const manualRows = dbSubs.map(ds => {
          return {
            domain: domain,
            skuId: ds.googleWorkspaceSkuId || 'manual',
            skuName: ds.plan || 'Workspace Subscription',
            planName: ds.plan || 'Workspace Subscription',
            seats: ds.seats || 1,
            seatPrice: ds.monthlyPrice || 6.00,
            status: ds.status === 'active' ? 'ACTIVE' : 'SUSPENDED',
            creationTime: ds.createdAt ? ds.createdAt.getTime() : Date.now(),
            renewalDate: ds.nextBillingDate ? ds.nextBillingDate.getTime() : addDays(new Date(), BILLING_CYCLE_DAYS).getTime(),
            daysUntilRenewal: ds.nextBillingDate ? Math.ceil((new Date(ds.nextBillingDate).getTime() - Date.now()) / 86400000) : 30,
            cycleStatus: 'paid', // manual subs
            category: 'workspace',
            isPrimary: true,
            subscriptionId: ds.subscriptionId || null,
            autoRenew: ds.autoRenew !== false,
          };
        });
        return res.json({ subscriptions: manualRows, domain, account: me.account || 'pk' });
      }
      return res.json({ subscriptions: [], domain, note: 'No active Workspace subscription found for your domain yet.' });
    }

    // Remember the account we found it on (so future loads are faster + billing is correct).
    if (foundAccount && me.account !== foundAccount) { try { me.account = foundAccount; if (!me.domain) me.domain = domain; await me.save(); } catch (_) { } }

    const nowD = new Date();
    // Pull our billing records for this domain to show the FIXED next_billing_date + cycle status.
    const billingRecs = await SubBilling.find({ domain: domain });
    const billingBySku = {};
    billingRecs.forEach((b) => { billingBySku[String(b.skuId)] = b; });

    // Pre-load plan prices by SKU for seat-increase pricing.
    const planDocs = await Plan.find({ skuId: { $in: subs.map((s) => String(s.skuId)) } });
    const priceBySku = {};
    planDocs.forEach((p) => { if (p.skuId) priceBySku[String(p.skuId)] = Number(p.monthlyPrice) || 0; });

    // Fetch DB subscriptions for the customer to get auto-renew status
    const dbSubs = await Subscription.find({ customerId: me._id });
    const dbSubBySkuOrId = {};
    dbSubs.forEach(ds => {
      if (ds.subscriptionId) dbSubBySkuOrId[String(ds.subscriptionId)] = ds;
      if (ds.googleWorkspaceSkuId) dbSubBySkuOrId[String(ds.googleWorkspaceSkuId)] = ds;
    });

    const rows = subs.map((s) => {
      const created = s.creationTime ? Number(s.creationTime) : null;
      const rec = billingBySku[String(s.skuId)];

      // Renewal date comes from our FIXED billing schedule (next_billing_date), not the payment date.
      let renewalMs = rec?.nextBillingDate ? new Date(rec.nextBillingDate).getTime() : null;
      // Fallback for subs without a billing record yet: creation + 29 days.
      if (!renewalMs && created) renewalMs = addDays(new Date(created), BILLING_CYCLE_DAYS).getTime();

      const daysUntil = renewalMs ? Math.ceil((renewalMs - nowD.getTime()) / 86400000) : null;
      const curSeats = s.seats?.numberOfSeats ?? s.seats?.licensedNumberOfSeats ?? null;

      const dbSub = (s.subscriptionId ? dbSubBySkuOrId[String(s.subscriptionId)] : null) || dbSubBySkuOrId[String(s.skuId)];
      const autoRenew = dbSub ? dbSub.autoRenew !== false : true;

      return {
        domain: s.customerDomain || domain,
        skuId: s.skuId,
        skuName: s.skuName || skuName(s.skuId) || s.skuId,
        planName: s.plan?.planName,
        seats: curSeats,
        seatPrice: priceBySku[String(s.skuId)] ?? null,   // monthly price per seat (if we have a Plan)
        status: s.status,
        creationTime: created,
        renewalDate: renewalMs,
        daysUntilRenewal: daysUntil,
        cycleStatus: rec?.currentCycleStatus || 'unpaid',
        category: skuCategory(s.skuId),
        isPrimary: isPrimarySku(s.skuId),
        billingCycleStart: rec?.billingCycleStart ? new Date(rec.billingCycleStart).getTime() : null,
        subscriptionId: s.subscriptionId || null,
        autoRenew,
      };
    });
    res.json({ subscriptions: rows, domain, account: foundAccount });
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message || 'Could not load your subscriptions.';
    res.status(500).json({ error: msg });
  }
});

// Customer: list MY domains (registered + pending-with-payment + failed).
app.get('/api/customer/my-domains', authenticateCustomer, async (req, res) => {
  try {
    const orders = await DomainOrder.find({ customerId: req.customerId }).sort({ createdAt: -1 });
    const domains = [];
    for (const o of orders) {
      // Only show registered/failed, or pending orders that actually have a payment.
      let show = (o.status === 'registered' || o.status === 'failed' || o.status === 'test_paid');
      if (!show && o.status === 'pending') {
        const p = await Payment.findOne({ orderId: o._id, orderType: 'domain' });
        show = !!p;
      }
      if (!show) continue;
      domains.push({
        id: o._id,
        orderNumber: o.orderNumber,
        domainName: o.domainName,
        status: o.status,
        period: o.period,
        price: o.price,
        registeredAt: o.registeredAt,
        createdAt: o.createdAt,
        expiresAt: o.registeredAt ? new Date(new Date(o.registeredAt).setFullYear(new Date(o.registeredAt).getFullYear() + (o.period || 1))) : null,
        error: o.status === 'failed' ? o.registrationResult : null,
      });
    }
    res.json({ domains });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: confirm the logged-in customer owns this domain (registered it through us).
async function customerOwnsDomain(customerId, domain) {
  const o = await DomainOrder.findOne({ customerId, domainName: String(domain).toLowerCase(), status: { $in: ['registered', 'test_paid'] } });
  return !!o;
}

// Customer: get registrant contact verification status (ICANN email verification).
app.get('/api/customer/domains/:domain/verification', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const status = await ncGetVerificationStatus(domain);
    if (!status.ok) return res.status(502).json({ error: status.error });
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: resend the registrant verification email.
app.post('/api/customer/domains/:domain/resend-verification', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const r = await ncResendVerification(domain);
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ success: true, sent: r.sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: get registrant contact details.
app.get('/api/customer/domains/:domain/contacts', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const r = await ncGetContacts(domain);
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: update registrant contact details (then Namecheap re-sends verification).
app.post('/api/customer/domains/:domain/contacts', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const { contact } = req.body;
    if (!contact || !contact.email || !contact.firstName) return res.status(400).json({ error: 'Contact name and email are required.' });
    const r = await ncSetContacts(domain, contact);
    if (!r.ok) return res.status(502).json({ error: r.error });
    // Updating the registrant name/email queues Namecheap's verification email automatically.
    // Send our own notification so the customer knows to check their inbox and click the link.
    try {
      const html = emailShell('Verify your domain contact info', `
        <p>Hi ${contact.firstName || 'there'},</p>
        <p>You updated the contact details for <strong>${domain}</strong>.</p>
        <p>ICANN requires you to verify this change. Namecheap has sent a verification email to <strong>${contact.email}</strong> — please open it and click the verification link within 7 days, or the change will be reverted.</p>
        <p>If you don't see it, check your spam folder, or search for "Verify your contact information".</p>`);
      await sendEmail(contact.email, `Action required: verify ${domain} contact info`, html);
    } catch (_) { }
    res.json({ success: true, message: 'Contact updated. A verification email has been sent — please check the registrant inbox and click the link.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: get DNS host records for one of THEIR domains.
app.get('/api/customer/domains/:domain/dns', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const hosts = await ncGetDnsHosts(domain);
    if (!hosts.ok) return res.status(502).json({ error: hosts.error });
    res.json(hosts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: replace DNS host records (full set) for their domain.
app.post('/api/customer/domains/:domain/dns', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const { hosts } = req.body;
    if (!Array.isArray(hosts)) return res.status(400).json({ error: 'hosts array required.' });
    // Basic validation
    for (const h of hosts) {
      if (!h.type || !h.address || !h.name) return res.status(400).json({ error: 'Each record needs name, type, and address/value.' });
    }
    const result = await ncSetDnsHosts(domain, hosts);
    if (!result.ok) return res.status(502).json({ error: result.error });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: get nameservers for their domain.
app.get('/api/customer/domains/:domain/nameservers', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const ns = await ncGetNameservers(domain);
    if (!ns.ok) return res.status(502).json({ error: ns.error });
    res.json(ns);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: set custom nameservers, or reset to Namecheap default.
app.post('/api/customer/domains/:domain/nameservers', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const { nameservers, useDefault } = req.body;
    let result;
    if (useDefault) {
      result = await ncSetDefaultNameservers(domain);
    } else {
      if (!Array.isArray(nameservers) || nameservers.length < 2) return res.status(400).json({ error: 'Provide at least 2 nameservers, or use the default option.' });
      result = await ncSetNameservers(domain, nameservers);
    }
    if (!result.ok) return res.status(502).json({ error: result.error });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: get verification status for their domain.
app.get('/api/customer/domains/:domain/verification', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const v = await ncGetVerificationStatus(domain);
    res.json(v);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: resend the ICANN verification email for their domain.
app.post('/api/customer/domains/:domain/resend-verification', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const me = await Customer.findById(req.customerId);
    // Try Namecheap's API resend. Some accounts/sandbox don't support it.
    const r = await ncResendVerification(domain);
    // Look up the registrant email to notify the customer where to look.
    let regEmail = me?.businessEmail;
    try { const c = await ncGetContacts(domain); if (c.ok && c.contact?.email) regEmail = c.contact.email; } catch (_) { }
    // Send our own Resend reminder so the customer knows to check their inbox.
    try {
      const html = emailShell('Verify your domain', `
        <p>Hi ${me?.firstName || me?.username || 'there'},</p>
        <p>Please verify the registrant email for <strong>${domain}</strong>.</p>
        <p>Namecheap sends the official verification email to <strong>${regEmail}</strong>. Open it and click the verification link to confirm your contact details. If you can't find it, check your spam folder or search for "Verify your contact information".</p>
        <p>If the email never arrives, update your contact details from the portal (Domains → Manage → Verification) — saving new details re-triggers the verification email.</p>`);
      await sendEmail(regEmail, `Verify your domain: ${domain}`, html);
    } catch (_) { }
    if (r.ok) return res.json({ success: true, message: 'Verification email re-sent. Please check the registrant inbox and click the link.' });
    // API resend unsupported — guide the customer to the reliable path.
    return res.json({ success: true, message: 'We\'ve emailed you verification instructions. Tip: updating your contact details (Verification tab) re-triggers Namecheap\'s verification email automatically.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: increase seats (users) on an existing Workspace subscription. Pay-first.
// Customers may only INCREASE (never decrease below current paid seats).
app.post('/api/customer/subscriptions/change-seats', authenticateCustomer, async (req, res) => {
  try {
    const { skuId, domain, newSeats, method } = req.body;
    const me = await Customer.findById(req.customerId);
    const dom = (domain || me.domain || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'No domain on your account.' });
    if (!skuId) return res.status(400).json({ error: 'Missing subscription.' });
    const wantSeats = parseInt(newSeats, 10);
    if (!wantSeats || wantSeats < 1) return res.status(400).json({ error: 'Enter a valid number of users.' });

    const account = me.account || 'pk';
    // Read current seats from Google.
    let currentSeats = 1, subscriptionId = null, planName = 'FLEXIBLE';
    try {
      const auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
      const reseller = google.reseller({ version: 'v1', auth });
      const resp = await reseller.subscriptions.list({ customerId: dom });
      const sub = (resp.data.subscriptions || []).find((s) => String(s.skuId) === String(skuId));
      if (!sub) return res.status(404).json({ error: 'Subscription not found for this domain.' });
      currentSeats = sub.seats?.numberOfSeats ?? sub.seats?.licensedNumberOfSeats ?? 1;
      subscriptionId = sub.subscriptionId;
      planName = sub.plan?.planName || 'FLEXIBLE';
    } catch (e) {
      return res.status(502).json({ error: 'Could not read your current subscription: ' + (e?.errors?.[0]?.message || e.message) });
    }

    // Customers can only INCREASE seats (Rule: no decrease after checkout).
    if (wantSeats <= currentSeats) {
      return res.status(400).json({ error: `You currently have ${currentSeats} user${currentSeats === 1 ? '' : 's'}. You can only increase the number of users here (choose more than ${currentSeats}). To reduce users, please contact support.` });
    }

    // Price the ADDED seats for the remainder of the current cycle (charge for the extra seats now).
    const plan = await Plan.findOne({ skuId: String(skuId) });
    if (!plan || !plan.monthlyPrice) return res.status(400).json({ error: 'This plan has no price set up. Please contact support.' });
    const addedSeats = wantSeats - currentSeats;
    const subtotal = Number(plan.monthlyPrice) * addedSeats; // one month for the added seats
    const taxed = await applyTaxAndFee(subtotal);
    const amount = taxed.total;

    const orderNumber = `SC-${Date.now()}`;
    const payment = await Payment.create({
      customerId: me._id, customerEmail: me.businessEmail, domain: dom,
      orderType: 'seat_change', amount, subtotal: taxed.subtotal, tax: taxed.tax, fee: taxed.fee, currency: 'USD',
      method: method === 'nicky' ? 'nicky' : 'stripe', status: 'pending',
      seatChangeSku: String(skuId), seatChangeNewSeats: wantSeats, seatChangeFromSeats: currentSeats, seatChangeSubId: subscriptionId,
    });

    const orderDesc = `Add ${addedSeats} user${addedSeats === 1 ? '' : 's'} to ${skuName(skuId)} (${dom}) — ${currentSeats}→${wantSeats}`;
    const successUrl = `${FRONTEND_URL}/?payment=success&pid=${payment._id}`;
    const cancelUrl = `${FRONTEND_URL}/?payment=cancelled&pid=${payment._id}`;

    if (payment.method === 'stripe') {
      let stripe; try { stripe = await getStripeForMode(); } catch (e) { return res.status(500).json({ error: e.message }); }
      const sd = await PaymentSettings.findOne({ singleton: 'main' });
      payment.isTest = (sd?.stripeMode || 'test') !== 'live'; await payment.save();
      const line_items = [{ price_data: { currency: 'usd', product_data: { name: orderDesc }, unit_amount: Math.round(taxed.subtotal * 100) }, quantity: 1 }];
      if (taxed.fee > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: 'Processing fee' }, unit_amount: Math.round(taxed.fee * 100) }, quantity: 1 });
      if (taxed.tax > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: `${taxed.taxLabel} (${taxed.taxPercent}%)` }, unit_amount: Math.round(taxed.tax * 100) }, quantity: 1 });
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', line_items, success_url: successUrl, cancel_url: cancelUrl,
        client_reference_id: String(payment._id), metadata: { paymentId: String(payment._id), orderType: 'seat_change' },
      });
      payment.providerRef = session.id; payment.checkoutUrl = session.url; await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id, addedSeats, newSeats: wantSeats });
    }

    try {
      const nicky = await createNickyPayment({
        amount, currency: 'USD', description: orderDesc, orderNumber,
        reference: String(payment._id), billDescription: orderDesc,
        customerEmail: me.businessEmail, customerName: me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me.businessEmail,
        redirectUrl: successUrl, cancelUrl,
      });
      payment.checkoutUrl = nicky.url; payment.providerRef = nicky.nickyId || nicky.shortId || String(payment._id); payment.providerShortId = nicky.shortId || null;
      await payment.save();
      return res.json({ checkoutUrl: nicky.url, paymentId: payment._id, addedSeats, newSeats: wantSeats });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: renew a Google Workspace subscription (pay the monthly amount; marks current cycle paid).
app.post('/api/customer/subscriptions/renew', authenticateCustomer, async (req, res) => {
  try {
    const { skuId, domain, method } = req.body;
    const me = await Customer.findById(req.customerId);
    const dom = (domain || me.domain || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'No domain on your account.' });
    if (!skuId) return res.status(400).json({ error: 'Missing subscription.' });

    // Find the plan/price for this SKU. Try exact SKU match, then by category, then any matching name.
    let plan = await Plan.findOne({ skuId: String(skuId) });
    if (!plan || !plan.monthlyPrice) {
      // Fallback: some attached/managed subs may not have an exact Plan row.
      // Try to find ANY active workspace plan as a price reference, or use the catalog.
      const meta = SKU_CATALOG[String(skuId)];
      if (meta) {
        plan = await Plan.findOne({ name: new RegExp(meta.name, 'i'), monthlyPrice: { $gt: 0 } });
      }
    }
    if (!plan || !plan.monthlyPrice) {
      return res.status(400).json({ error: 'This subscription doesn\'t have a price set up for renewal yet. Please ask support to add a price for it, or contact us to renew.' });
    }

    const account = me.account || 'pk';
    let seats = 1;
    try {
      const auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
      const reseller = google.reseller({ version: 'v1', auth });
      const resp = await reseller.subscriptions.list({ customerId: dom });
      const sub = (resp.data.subscriptions || []).find((s) => String(s.skuId) === String(skuId));
      if (sub) seats = sub.seats?.numberOfSeats ?? sub.seats?.licensedNumberOfSeats ?? 1;
    } catch (_) { }

    const subtotal = Number(plan.monthlyPrice) * seats;
    const taxed = await applyTaxAndFee(subtotal);
    const amount = taxed.total;
    const orderNumber = `RN-${Date.now()}`;
    const payment = await Payment.create({
      customerId: me._id, customerEmail: me.businessEmail, domain: dom,
      orderType: 'workspace', amount, subtotal: taxed.subtotal, tax: taxed.tax, fee: taxed.fee, currency: 'USD',
      method: method === 'nicky' ? 'nicky' : 'stripe', status: 'pending',
      isRenewal: true, renewalSkuId: String(skuId),
    });

    const orderDesc = `Renewal: ${skuName(skuId)} for ${dom} (${seats} seat${seats === 1 ? '' : 's'})`;
    const successUrl = `${FRONTEND_URL}/?payment=success&pid=${payment._id}`;
    const cancelUrl = `${FRONTEND_URL}/?payment=cancelled&pid=${payment._id}`;

    if (payment.method === 'stripe') {
      let stripe; try { stripe = await getStripeForMode(); } catch (e) { return res.status(500).json({ error: e.message }); }
      const sd = await PaymentSettings.findOne({ singleton: 'main' });
      payment.isTest = (sd?.stripeMode || 'test') !== 'live'; await payment.save();
      const line_items = [{ price_data: { currency: 'usd', product_data: { name: orderDesc }, unit_amount: Math.round(taxed.subtotal * 100) }, quantity: 1 }];
      if (taxed.fee > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: 'Processing fee' }, unit_amount: Math.round(taxed.fee * 100) }, quantity: 1 });
      if (taxed.tax > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: `${taxed.taxLabel} (${taxed.taxPercent}%)` }, unit_amount: Math.round(taxed.tax * 100) }, quantity: 1 });
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', line_items, success_url: successUrl, cancel_url: cancelUrl,
        client_reference_id: String(payment._id), metadata: { paymentId: String(payment._id), orderType: 'workspace', renewal: 'true' },
      });
      payment.providerRef = session.id; payment.checkoutUrl = session.url; await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id });
    }

    try {
      const nicky = await createNickyPayment({
        amount, currency: 'USD', description: orderDesc, orderNumber,
        reference: String(payment._id), billDescription: orderDesc,
        customerEmail: me.businessEmail, customerName: me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me.businessEmail,
        redirectUrl: successUrl, cancelUrl,
      });
      payment.checkoutUrl = nicky.url; payment.providerRef = nicky.nickyId || nicky.shortId || String(payment._id); payment.providerShortId = nicky.shortId || null;
      await payment.save();
      return res.json({ checkoutUrl: nicky.url, paymentId: payment._id });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: Toggle auto-renew status of a subscription (Google Workspace or Voice)
app.post('/api/customer/subscriptions/toggle-autorenew', authenticateCustomer, async (req, res) => {
  try {
    const { skuId, subscriptionId, autoRenew } = req.body;
    if (!skuId && !subscriptionId) {
      return res.status(400).json({ error: 'Please specify skuId or subscriptionId.' });
    }

    // Find the local subscription record
    let query = { customerId: req.customerId };
    if (subscriptionId) {
      query.subscriptionId = subscriptionId;
    } else {
      query.googleWorkspaceSkuId = skuId;
    }

    let sub = await Subscription.findOne(query);
    if (!sub) {
      // Create a local Subscription record to track the setting if it doesn't exist
      const me = await Customer.findById(req.customerId);
      sub = new Subscription({
        customerId: req.customerId,
        subscriptionId: subscriptionId || undefined,
        googleWorkspaceSkuId: skuId,
        type: 'workspace',
        plan: skuId ? skuName(skuId) || skuId : 'Workspace',
        seats: 1,
        monthlyPrice: 0,
        status: 'active',
        autoRenew: autoRenew,
      });
    } else {
      sub.autoRenew = autoRenew;
      if (subscriptionId && !sub.subscriptionId) {
        sub.subscriptionId = subscriptionId;
      }
    }
    sub.updatedAt = new Date();
    await sub.save();

    res.json({ success: true, autoRenew: sub.autoRenew });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: start a domain RENEWAL (creates an order + checkout, like registration).
app.post('/api/customer/domains/renew', authenticateCustomer, async (req, res) => {
  try {
    const { domainName, period, method } = req.body;
    const dom = (domainName || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'Domain required.' });
    const me = await Customer.findById(req.customerId);
    const tld = tldOf(dom);
    const pricing = await ncGetTldPricing(tld, 'RENEW');
    if (!pricing.ok) return res.status(502).json({ error: 'Could not price renewal: ' + pricing.error });
    const subtotal = (await ncCustomerPriceForTld(tld, pricing.cost)) * (Number(period) || 1);
    const taxed = await applyTaxAndFee(subtotal);
    const amount = taxed.total;

    const orderNumber = `DR-${Date.now()}`;
    const order = await DomainOrder.create({
      customerId: me._id, orderNumber, domainName: dom, period: Number(period) || 1, price: amount, status: 'pending',
    });
    order.registrationResult = JSON.stringify({ renew: true });
    await order.save();

    const payment = await Payment.create({
      customerId: me._id, customerEmail: me.businessEmail, domain: dom,
      orderId: order._id, orderType: 'domain', amount, subtotal: taxed.subtotal, tax: taxed.tax, currency: 'USD',
      method: method === 'nicky' ? 'nicky' : 'stripe', status: 'pending',
    });

    const orderDesc = `Renew ${dom} (${order.period} year${order.period === 1 ? '' : 's'})`;
    const successUrl = `${FRONTEND_URL}/?payment=success&pid=${payment._id}`;
    const cancelUrl = `${FRONTEND_URL}/?payment=cancelled&pid=${payment._id}`;

    if (payment.method === 'stripe') {
      let stripe;
      try { stripe = await getStripeForMode(); } catch (e) { return res.status(500).json({ error: e.message }); }
      const settingsDoc = await PaymentSettings.findOne({ singleton: 'main' });
      payment.isTest = (settingsDoc?.stripeMode || 'test') !== 'live';
      await payment.save();
      const rline = [{ price_data: { currency: 'usd', product_data: { name: orderDesc }, unit_amount: Math.round(taxed.subtotal * 100) }, quantity: 1 }];
      if (taxed.fee > 0) rline.push({ price_data: { currency: 'usd', product_data: { name: 'Processing fee' }, unit_amount: Math.round(taxed.fee * 100) }, quantity: 1 });
      if (taxed.tax > 0) rline.push({ price_data: { currency: 'usd', product_data: { name: `${taxed.taxLabel} (${taxed.taxPercent}%)` }, unit_amount: Math.round(taxed.tax * 100) }, quantity: 1 });
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: rline,
        success_url: successUrl, cancel_url: cancelUrl,
        client_reference_id: String(payment._id),
        metadata: { paymentId: String(payment._id), orderId: String(order._id), orderType: 'domain' },
      });
      payment.providerRef = session.id; payment.checkoutUrl = session.url; await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id });
    }

    // Nicky crypto
    try {
      const nicky = await createNickyPayment({
        amount, currency: 'USD', description: orderDesc, orderNumber,
        reference: String(payment._id), billDescription: orderDesc,
        customerEmail: me.businessEmail, customerName: me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me.businessEmail,
        redirectUrl: successUrl, cancelUrl,
      });
      payment.checkoutUrl = nicky.url;
      payment.providerRef = nicky.nickyId || nicky.shortId || String(payment._id);
      payment.providerShortId = nicky.shortId || null;
      await payment.save();
      return res.json({ checkoutUrl: nicky.url, paymentId: payment._id });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: 'Renewal error: ' + e.message });
  }
});

// ---- DOMAIN TRANSFER IN (import to Namecheap) — pay-first like registration ----
app.post('/api/customer/domains/transfer', authenticateCustomer, async (req, res) => {
  try {
    const { domainName, eppCode, method } = req.body;
    const dom = (domainName || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'Domain required.' });
    if (!eppCode || !String(eppCode).trim()) return res.status(400).json({ error: 'EPP / Auth code is required to transfer a domain.' });
    const me = await Customer.findById(req.customerId);

    // Price the transfer (Namecheap charges ~1 year). Use TRANSFER pricing.
    const tld = tldOf(dom);
    const pricing = await ncGetTldPricing(tld, 'TRANSFER');
    if (!pricing.ok) return res.status(502).json({ error: 'Could not price this transfer: ' + pricing.error });
    const subtotal = await ncCustomerPriceForTld(tld, pricing.cost);
    const taxed = await applyTaxAndFee(subtotal);
    const amount = taxed.total;

    const orderNumber = `DT-${Date.now()}`;
    const transfer = await DomainTransfer.create({
      customerId: me._id, orderNumber, domainName: dom, eppCode: String(eppCode).trim(), price: amount, status: 'pending',
    });

    const payment = await Payment.create({
      customerId: me._id, customerEmail: me.businessEmail, domain: dom,
      orderId: transfer._id, orderType: 'domain_transfer', amount, subtotal: taxed.subtotal, tax: taxed.tax, currency: 'USD',
      method: method === 'nicky' ? 'nicky' : 'stripe', status: 'pending',
    });

    const orderDesc = `Transfer ${dom} to Namecheap (incl. 1 year)`;
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
        metadata: { paymentId: String(payment._id), orderId: String(transfer._id), orderType: 'domain_transfer' },
      });
      payment.providerRef = session.id; payment.checkoutUrl = session.url; await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id });
    }

    try {
      const nicky = await createNickyPayment({
        amount, currency: 'USD', description: orderDesc, orderNumber,
        reference: String(payment._id), billDescription: orderDesc,
        customerEmail: me.businessEmail, customerName: me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me.businessEmail,
        redirectUrl: successUrl, cancelUrl,
      });
      payment.checkoutUrl = nicky.url;
      payment.providerRef = nicky.nickyId || nicky.shortId || String(payment._id);
      payment.providerShortId = nicky.shortId || null;
      await payment.save();
      return res.json({ checkoutUrl: nicky.url, paymentId: payment._id });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: 'Transfer error: ' + e.message });
  }
});

// Customer: list my transfers (status).
app.get('/api/customer/domains/transfers', authenticateCustomer, async (req, res) => {
  try {
    const transfers = await DomainTransfer.find({ customerId: req.customerId }).sort({ createdAt: -1 });
    // Refresh status from Namecheap for in-progress ones
    for (const t of transfers) {
      if (t.transferId && t.status === 'submitted') {
        const s = await ncTransferStatus(t.transferId);
        if (s.ok && s.status) {
          t.transferStatus = s.status;
          if (/complete/i.test(s.status)) { t.status = 'completed'; t.completedAt = new Date(); }
          else if (/cancel/i.test(s.status)) { t.status = 'failed'; t.resultNote = s.status; }
          await t.save();
        }
      }
    }
    res.json({
      transfers: transfers.map((t) => ({
        id: t._id, domainName: t.domainName, status: t.status, transferStatus: t.transferStatus,
        price: t.price, createdAt: t.createdAt, submittedAt: t.submittedAt, completedAt: t.completedAt, note: t.resultNote,
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: transfer OUT guidance — unlock + how to get EPP for moving to another registrar.
app.post('/api/customer/domains/:domain/transfer-out', authenticateCustomer, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    if (!await customerOwnsDomain(req.customerId, domain)) return res.status(403).json({ error: 'You do not manage this domain.' });
    const me = await Customer.findById(req.customerId);
    // Email the customer instructions (EPP must be obtained from the Namecheap dashboard/support).
    try {
      const html = emailShell('Transfer your domain out', `
        <p>Hi ${me?.firstName || me?.username || 'there'},</p>
        <p>You requested to transfer <strong>${domain}</strong> to another registrar. Here's how:</p>
        <ol>
          <li>The domain must be unlocked and at least 60 days since registration/last transfer.</li>
          <li>You need the <strong>EPP / Auth code</strong> for ${domain}. We'll provide this on request — reply to this email or contact support and we'll send it securely.</li>
          <li>Give the EPP code to your new registrar and start the transfer there.</li>
        </ol>
        <p>We're sorry to see the domain go. If there's anything we can help with, just reply.</p>`);
      await sendEmail(me?.businessEmail, `Transfer ${domain} to another registrar`, html);
    } catch (_) { }
    // Also notify admin so they can issue the EPP code.
    try {
      const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || process.env.EMAIL_FROM_ADDRESS;
      if (adminEmail) await sendEmail(adminEmail, `EPP code request: ${domain}`, emailShell('EPP code request', `<p>Customer ${me?.businessEmail} requested the EPP/auth code to transfer <strong>${domain}</strong> out. Please issue it from the Namecheap dashboard.</p>`));
    } catch (_) { }
    res.json({ success: true, message: 'We\'ve emailed you transfer-out instructions. We\'ll send your EPP/auth code on request.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
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

// Admin: look up a domain's Google Workspace subscriptions across BOTH accounts.
// Used by the "attach subscription" UI so the account auto-selects.
app.get('/api/admin/lookup-domain', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const dom = (req.query.domain || '').toLowerCase().trim();
    if (!dom || !/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) return res.status(400).json({ error: 'Enter a valid domain like example.com' });

    const errors = [];
    for (const account of ['pk', 'usa']) {
      let auth;
      try { auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth(); }
      catch (e) { errors.push(`${account.toUpperCase()}: not connected (${e.message})`); continue; }
      const reseller = google.reseller({ version: 'v1', auth });

      // Try listing subscriptions directly — this is the most reliable check and returns the data we need.
      try {
        const resp = await reseller.subscriptions.list({ customerId: dom });
        const subs = resp.data.subscriptions || [];
        if (subs.length > 0) {
          return res.json({
            found: true, account, domain: dom,
            subscriptions: subs.map((s) => ({
              skuId: String(s.skuId),
              skuName: skuName(s.skuId),
              planName: s.plan?.planName,
              seats: s.seats?.numberOfSeats ?? s.seats?.licensedNumberOfSeats ?? null,
              status: s.status,
            })),
          });
        }
        // No subscriptions on this account — but maybe the customer exists with none. Check.
        try { await reseller.customers.get({ customerId: dom }); return res.json({ found: true, account, domain: dom, subscriptions: [], note: 'Customer exists on ' + account.toUpperCase() + ' but has no subscriptions.' }); }
        catch (_) { /* not on this account */ }
      } catch (e) {
        const msg = e?.errors?.[0]?.message || e?.message || '';
        if (!/not found|does not exist|404/i.test(msg)) errors.push(`${account.toUpperCase()}: ${msg}`);
        // try next account
      }
    }
    res.json({ found: false, domain: dom, note: 'No Google Workspace customer found for this domain on either account.', diagnostics: errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: attach (link) a domain to an existing customer. Account auto-detected from Google.
app.post('/api/admin/customers/:id/attach-domain', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { domain, account: forceAccount } = req.body;
    const dom = (domain || '').toLowerCase().trim();
    if (!dom || !/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) return res.status(400).json({ error: 'Enter a valid domain like example.com' });
    const cust = await Customer.findById(req.params.id);
    if (!cust) return res.status(404).json({ error: 'Customer not found.' });

    // Auto-detect which account the domain's Workspace customer lives on (or use forced account).
    const tryAccounts = forceAccount ? [forceAccount] : ['pk', 'usa'];
    let account = null, subCount = 0;
    const errors = [];
    let googleSubs = [];
    for (const acct of tryAccounts) {
      let auth;
      try { auth = acct === 'usa' ? await getUsaAuth() : await getResellerAuth(); }
      catch (e) { errors.push(`${acct.toUpperCase()}: not connected (${e.message})`); continue; }
      const reseller = google.reseller({ version: 'v1', auth });
      try {
        // subscriptions.list is the most reliable existence check.
        const resp = await reseller.subscriptions.list({ customerId: dom });
        const subs = resp.data.subscriptions || [];
        if (subs.length > 0) { account = acct; subCount = subs.length; googleSubs = subs; break; }
        // No subs but customer may exist:
        try { await reseller.customers.get({ customerId: dom }); account = acct; subCount = 0; break; } catch (_) { }
      } catch (e) {
        const msg = e?.errors?.[0]?.message || e?.message || '';
        if (!/not found|does not exist|404/i.test(msg)) errors.push(`${acct.toUpperCase()}: ${msg}`);
      }
    }
    if (!account) {
      return res.status(400).json({
        error: 'Could not find ' + dom + ' as a Workspace customer on ' + (forceAccount ? forceAccount.toUpperCase() + ' account' : 'either account') + '.',
        diagnostics: errors.length ? errors : ['Domain is not a customer under your reseller. Add it in your Google reseller console first, or use "Force link" if you manage it manually.'],
      });
    }

    cust.domain = dom;
    cust.account = account;
    await cust.save();
    try { await syncSubscriptionsForBilling(account); } catch (_) { }

    // Sync subscriptions to MongoDB so they appear in customer's portal
    for (const s of googleSubs) {
      let planDoc = await Plan.findOne({ skuId: String(s.skuId) });
      const planName = planDoc ? planDoc.name : (skuName(s.skuId) || s.skuId);
      const monthlyPrice = planDoc ? planDoc.monthlyPrice : 6.00;
      const numSeats = s.seats?.numberOfSeats ?? s.seats?.licensedNumberOfSeats ?? 1;

      const orderNumber = `WS-ATTACH-${Date.now()}`;
      const order = await WorkspaceOrder.create({
        customerId: cust._id,
        orderNumber,
        type: 'workspace',
        planType: 'flexible',
        account: account,
        plan: { id: planDoc ? planDoc.planId : 'business_starter', name: planName, monthlyPrice: monthlyPrice },
        seats: numSeats,
        monthlyTotal: monthlyPrice * numSeats,
        organization: { domain: dom, name: dom.split('.')[0] },
        contact: { firstName: cust.firstName || 'Admin', lastName: cust.lastName || 'User', email: cust.businessEmail || cust.email },
        status: 'provisioned',
        googleProvisioned: true,
      });

      await Subscription.findOneAndUpdate(
        { customerId: cust._id, googleWorkspaceSkuId: String(s.skuId) },
        {
          customerId: cust._id,
          orderId: order._id,
          subscriptionId: s.subscriptionId,
          type: 'workspace',
          plan: planName,
          seats: numSeats,
          monthlyPrice: monthlyPrice,
          status: s.status === 'ACTIVE' ? 'active' : 'suspended',
          googleWorkspaceSkuId: String(s.skuId),
          autoRenew: true,
          nextBillingDate: addDays(new Date(), BILLING_CYCLE_DAYS),
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, domain: dom, account, subscriptions: subCount, message: `Attached ${dom} on the ${account.toUpperCase()} account${subCount ? ` (${subCount} subscription${subCount === 1 ? '' : 's'})` : ''}.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: force-link a domain to a customer WITHOUT Google verification (for manually-managed domains).
app.post('/api/admin/customers/:id/force-link-domain', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { domain, account, planId, seats } = req.body;
    const dom = (domain || '').toLowerCase().trim();
    if (!dom || !/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) return res.status(400).json({ error: 'Enter a valid domain like example.com' });
    const acct = account === 'usa' ? 'usa' : 'pk';
    const cust = await Customer.findById(req.params.id);
    if (!cust) return res.status(404).json({ error: 'Customer not found.' });
    cust.domain = dom;
    cust.account = acct;
    await cust.save();

    let extraMsg = '';
    if (planId) {
      const planDoc = await Plan.findOne({ planId });
      if (planDoc) {
        const numSeats = Number(seats) || 1;
        const orderNumber = `WS-FORCE-${Date.now()}`;
        const order = await WorkspaceOrder.create({
          customerId: cust._id,
          orderNumber,
          type: 'workspace',
          planType: 'flexible',
          account: acct,
          plan: { id: planDoc.planId, name: planDoc.name, monthlyPrice: planDoc.monthlyPrice },
          seats: numSeats,
          monthlyTotal: planDoc.monthlyPrice * numSeats,
          organization: { domain: dom, name: dom.split('.')[0] },
          contact: { firstName: cust.firstName || 'Admin', lastName: cust.lastName || 'User', email: cust.businessEmail || cust.email },
          status: 'provisioned',
          googleProvisioned: false,
        });

        await Subscription.findOneAndUpdate(
          { customerId: cust._id, googleWorkspaceSkuId: planDoc.skuId || 'unknown' },
          {
            customerId: cust._id,
            orderId: order._id,
            subscriptionId: `FORCE-${Date.now()}`,
            type: 'workspace',
            plan: planDoc.name,
            seats: numSeats,
            monthlyPrice: planDoc.monthlyPrice,
            status: 'active',
            googleWorkspaceSkuId: planDoc.skuId || 'unknown',
            autoRenew: true,
            nextBillingDate: addDays(new Date(), BILLING_CYCLE_DAYS),
            updatedAt: new Date()
          },
          { upsert: true, new: true }
        );
        extraMsg = ` and created manual subscription for ${planDoc.name} (${numSeats} seats)`;
      }
    }

    res.json({ success: true, domain: dom, account: acct, message: `Force-linked ${dom} to ${cust.businessEmail} on the ${acct.toUpperCase()} account${extraMsg}. (Not verified against Google.)` });
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
const FRONTEND_URL = process.env.PORTAL_URL || process.env.CORS_ORIGIN || 'https://portal.gnbmentor.com';

// Customer: create a checkout for an order (method = 'stripe' | 'nicky')
app.post('/api/customer/checkout', authenticateCustomer, async (req, res) => {
  try {
    const { orderId, method } = req.body;
    const me = await Customer.findById(req.customerId);
    const order = await WorkspaceOrder.findOne({ _id: orderId, customerId: req.customerId });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const subtotal = Number(order.monthlyTotal || 0);
    if (!subtotal || subtotal <= 0) return res.status(400).json({ error: 'Order amount is invalid.' });
    // Apply tax (+ optional fee) from payment settings so it works for Stripe AND crypto.
    const taxed = await applyTaxAndFee(subtotal);
    const amount = taxed.total;

    const payment = await Payment.create({
      customerId: me._id,
      customerEmail: me.businessEmail,
      domain: order.organization?.domain,
      orderId: order._id,
      amount,
      subtotal: taxed.subtotal,
      tax: taxed.tax,
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
          unit_amount: Math.round(taxed.subtotal * 100),
        },
        quantity: 1,
      }];
      // Processing fee as a separate line item (if enabled)
      if (taxed.fee > 0) {
        line_items.push({
          price_data: { currency: 'usd', product_data: { name: 'Processing fee' }, unit_amount: Math.round(taxed.fee * 100) },
          quantity: 1,
        });
      }
      // Tax as a separate line item (if enabled)
      if (taxed.tax > 0) {
        line_items.push({
          price_data: { currency: 'usd', product_data: { name: `${taxed.taxLabel} (${taxed.taxPercent}%)` }, unit_amount: Math.round(taxed.tax * 100) },
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
      const nicky = await createNickyPayment({
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
      payment.checkoutUrl = nicky.url;
      payment.providerRef = nicky.nickyId || nicky.shortId || String(payment._id);
      payment.providerShortId = nicky.shortId || null;
      await payment.save();
      return res.json({ checkoutUrl: nicky.url, paymentId: payment._id });
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
  return { url, nickyId: data.id || data.bill?.id || null, shortId: shortId || null };
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

  // DOMAIN orders: register or renew via Namecheap on payment
  // SSL orders: purchase the certificate via Namecheap on payment.
  if (payment.orderType === 'ssl') {
    try {
      const sOrder = await SslOrder.findById(payment.orderId);
      if (sOrder && sOrder.status === 'pending') {
        const ncSandbox = await ncResolveSandbox();
        if (payment.isTest && !ncSandbox) {
          console.log('TEST PAYMENT + Namecheap LIVE — skipping real SSL purchase for', sOrder.orderNumber);
          sOrder.status = 'test_paid';
          await sOrder.save();
          return;
        }
        const result = await ncPurchaseSsl(sOrder.productType, sOrder.years);
        if (!result.ok) throw new Error(result.error);
        sOrder.status = 'purchased';
        sOrder.certificateId = result.certificateId;
        sOrder.purchasedAt = new Date();
        sOrder.activationNote = 'Certificate purchased. Activate it with a CSR for ' + (sOrder.forDomain || 'your domain') + '.';
        await sOrder.save();
        console.log('SSL PURCHASED via Namecheap:', sOrder.productType, 'certId:', result.certificateId);
        const me = await Customer.findById(payment.customerId);
        try {
          const html = emailShell('SSL certificate purchased', `
            <p>Hi ${me?.firstName || me?.username || 'there'},</p>
            <p>Your <strong>${sOrder.productType}</strong> SSL certificate has been purchased${sOrder.forDomain ? ` for <strong>${sOrder.forDomain}</strong>` : ''}.</p>
            <p>To activate it, a CSR (Certificate Signing Request) and domain control validation are required. Our team will reach out, or you can request activation from your portal under <strong>Domains → SSL</strong>.</p>`);
          await sendEmail(me?.businessEmail, `SSL certificate purchased: ${sOrder.productType}`, html);
        } catch (_) { }
      }
    } catch (e) {
      console.error('SSL PURCHASE FAILED for payment', String(payment._id), e.message);
      try { const sOrder = await SslOrder.findById(payment.orderId); if (sOrder) { sOrder.status = 'failed'; sOrder.activationNote = e.message; await sOrder.save(); } } catch (_) { }
    }
    return;
  }

  // WORKSPACE TRANSFER orders: claim the customer + create their subscription on payment.
  if (payment.orderType === 'workspace_transfer') {
    try {
      const xfer = await WorkspaceTransfer.findById(payment.orderId);
      if (xfer && xfer.status === 'pending') {
        if (payment.isTest) {
          console.log('TEST PAYMENT — marking workspace transfer test_paid for', xfer.domain);
          xfer.status = 'test_paid'; xfer.resultNote = 'Test payment — no real transfer performed.'; await xfer.save();
          return;
        }
        const planDoc = await Plan.findOne({ planId: xfer.planId });
        if (!planDoc || !planDoc.skuId) throw new Error('Plan missing SKU for transfer.');
        const result = await transferWorkspaceCustomer(xfer.domain, xfer.account, planDoc, xfer.seats, xfer.planType);
        xfer.status = 'completed';
        xfer.subscriptionsClaimed = result.claimed;
        xfer.completedAt = new Date();
        xfer.resultNote = result.note || `Transferred. ${result.claimed} subscription(s) now managed by us.`;
        await xfer.save();
        console.log('WORKSPACE TRANSFER completed:', xfer.domain, 'account:', xfer.account, 'claimed:', result.claimed);
        const me = await Customer.findById(payment.customerId);
        if (me && !me.domain) { me.domain = xfer.domain; me.account = xfer.account; await me.save(); }
        try { await syncSubscriptionsForBilling(xfer.account); } catch (_) { }
        try {
          const html = emailShell('Workspace transfer complete', `
            <p>Hi ${me?.firstName || me?.username || 'there'},</p>
            <p>Your Google Workspace for <strong>${xfer.domain}</strong> is now managed by us.</p>
            <p>Your users, email, and data are unchanged — only billing and management moved to us. You can see your subscription under <strong>Subscriptions</strong> in your portal.</p>`);
          await sendEmail(me?.businessEmail, `Workspace transfer complete: ${xfer.domain}`, html);
        } catch (_) { }
      }
    } catch (e) {
      console.error('WORKSPACE TRANSFER FAILED for payment', String(payment._id), e.message);
      try { const xfer = await WorkspaceTransfer.findById(payment.orderId); if (xfer) { xfer.status = 'failed'; xfer.resultNote = e.message; await xfer.save(); } } catch (_) { }
    }
    return;
  }

  // SEAT CHANGE orders: apply the new (higher) seat count to the Google subscription.
  if (payment.orderType === 'seat_change') {
    try {
      if (payment.isTest) { console.log('TEST PAYMENT — seat change not applied for', payment.domain); return; }
      const me = await Customer.findById(payment.customerId);
      const account = me?.account || 'pk';
      const dom = (payment.domain || '').toLowerCase();
      const auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
      const reseller = google.reseller({ version: 'v1', auth });

      // Find the subscription to get its current plan type (FLEXIBLE vs ANNUAL).
      const resp = await reseller.subscriptions.list({ customerId: dom });
      const sub = (resp.data.subscriptions || []).find((s) => String(s.skuId) === String(payment.seatChangeSku));
      if (!sub) throw new Error('Subscription not found to change seats.');
      const planName = sub.plan?.planName || 'FLEXIBLE';
      const newSeats = payment.seatChangeNewSeats;
      // FLEXIBLE uses maximumNumberOfSeats; ANNUAL uses numberOfSeats.
      const seatsBody = /ANNUAL/i.test(planName)
        ? { numberOfSeats: newSeats }
        : { maximumNumberOfSeats: newSeats };

      await reseller.subscriptions.changeSeats({
        customerId: dom,
        subscriptionId: sub.subscriptionId,
        requestBody: { seats: seatsBody },
      });
      console.log(`SEAT CHANGE applied: ${dom} ${payment.seatChangeSku} → ${newSeats} seats (${planName})`);

      try {
        const html = emailShell('Users added', `
          <p>Hi ${me?.firstName || me?.username || 'there'},</p>
          <p>Your Google Workspace subscription for <strong>${dom}</strong> now has <strong>${newSeats} user licenses</strong>. You can create the new users in your Google Admin console.</p>`);
        await sendEmail(me?.businessEmail, `Users added: ${dom}`, html);
      } catch (_) { }
    } catch (e) {
      const msg = e?.errors?.[0]?.message || e.message;
      console.error('SEAT CHANGE FAILED for payment', String(payment._id), msg);
    }
    return;
  }

  // ADD-ON orders: provision the add-on subscription on the domain's reseller account.
  if (payment.orderType === 'addon') {
    try {
      if (payment.isTest) {
        console.log('TEST PAYMENT — addon not really provisioned for', payment.domain, payment.addonSku);
        return;
      }
      const account = payment.addonAccount || 'pk';
      const auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
      const reseller = google.reseller({ version: 'v1', auth });
      const dom = (payment.domain || '').toLowerCase();
      await reseller.subscriptions.insert({
        customerId: dom,
        requestBody: {
          customerId: dom,
          skuId: payment.addonSku,
          plan: { planName: 'FLEXIBLE' },
          seats: { maximumNumberOfSeats: 1 },
          purchaseOrderId: 'addon-' + Date.now(),
        },
      });
      console.log(`ADDON provisioned: ${payment.addonName} (${payment.addonSku}) for ${dom} on ${account}`);
      // Seed billing for the addon: new 29-day cycle from now, marked paid.
      try {
        const now = new Date();
        let rec = await SubBilling.findOne({ domain: dom, skuId: payment.addonSku });
        if (!rec) { rec = new SubBilling({ account, domain: dom, skuId: payment.addonSku }); startNewBillingCycle(rec, now); }
        applyPaymentToCurrentCycle(rec, now);
        await rec.save();
      } catch (_) { }
      const me = await Customer.findById(payment.customerId);
      try {
        const html = emailShell('Add-on activated', `
          <p>Hi ${me?.firstName || me?.username || 'there'},</p>
          <p>Your add-on <strong>${payment.addonName}</strong> for <strong>${dom}</strong> is now active.</p>`);
        await sendEmail(me?.businessEmail, `Add-on activated: ${payment.addonName}`, html);
      } catch (_) { }
    } catch (e) {
      const msg = e?.errors?.[0]?.message || e.message;
      if (/already exists|duplicate|resource already/i.test(msg)) {
        console.log('ADDON already exists for', payment.domain, payment.addonSku, '(treating as done)');
      } else {
        console.error('ADDON provision FAILED for payment', String(payment._id), msg);
      }
    }
    return;
  }

  // HOSTING orders: mark active on payment (hosting is provisioned by your team / cPanel).
  if (payment.orderType === 'hosting') {
    try {
      const hOrder = await HostingOrder.findById(payment.orderId);
      if (hOrder && hOrder.status === 'pending') {
        hOrder.status = payment.isTest ? 'test_paid' : 'active';
        hOrder.activatedAt = new Date();
        await hOrder.save();
        console.log('HOSTING order active:', hOrder.planName, hOrder.forDomain);
        const me = await Customer.findById(payment.customerId);
        try {
          const html = emailShell('Hosting order confirmed', `
            <p>Hi ${me?.firstName || me?.username || 'there'},</p>
            <p>Your hosting plan <strong>${hOrder.planName}</strong>${hOrder.forDomain ? ` for <strong>${hOrder.forDomain}</strong>` : ''} is confirmed.</p>
            <p>Our team will set up your hosting account and email you the login details shortly.</p>`);
          await sendEmail(me?.businessEmail, `Hosting confirmed: ${hOrder.planName}`, html);
        } catch (_) { }
      }
    } catch (e) {
      console.error('HOSTING order failed for payment', String(payment._id), e.message);
      try { const hOrder = await HostingOrder.findById(payment.orderId); if (hOrder) { hOrder.status = 'failed'; await hOrder.save(); } } catch (_) { }
    }
    return;
  }

  // DOMAIN TRANSFER orders: submit the transfer to Namecheap on payment.
  if (payment.orderType === 'domain_transfer') {
    try {
      const tOrder = await DomainTransfer.findById(payment.orderId);
      if (tOrder && tOrder.status === 'pending') {
        const ncSandbox = await ncResolveSandbox();
        if (payment.isTest && !ncSandbox) {
          console.log('TEST PAYMENT + Namecheap LIVE — skipping real transfer for', tOrder.domainName);
          tOrder.status = 'test_paid';
          await tOrder.save();
          return;
        }
        const result = await ncCreateTransfer(tOrder.domainName, tOrder.eppCode, 1);
        if (!result.ok) throw new Error(result.error);
        tOrder.transferId = result.transferId;
        tOrder.status = 'submitted';
        tOrder.submittedAt = new Date();
        tOrder.transferStatus = 'Submitted';
        await tOrder.save();
        console.log('DOMAIN TRANSFER submitted via Namecheap:', tOrder.domainName, 'transferId:', result.transferId);
        const me = await Customer.findById(payment.customerId);
        try {
          const html = emailShell('Domain transfer started', `
            <p>Hi ${me?.firstName || me?.username || 'there'},</p>
            <p>Your transfer of <strong>${tOrder.domainName}</strong> into our system has been submitted.</p>
            <p>Domain transfers usually take <strong>5–7 days</strong>. You may receive an approval email from the current registrar — approving it speeds things up. We'll email you when it completes.</p>
            <p>Track status anytime under <strong>Domains → Transfers</strong> in your portal.</p>
            <p><a href="${PORTAL_URL}/#domains" style="color:#0F766E">Open your domains</a></p>`);
          await sendEmail(me?.businessEmail, `Transfer started: ${tOrder.domainName}`, html);
        } catch (_) { }
      }
    } catch (e) {
      console.error('DOMAIN TRANSFER FAILED for payment', String(payment._id), e.message);
      try {
        const tOrder = await DomainTransfer.findById(payment.orderId);
        if (tOrder) { tOrder.status = 'failed'; tOrder.resultNote = e.message; await tOrder.save(); }
      } catch (_) { }
    }
    return;
  }

  if (payment.orderType === 'domain') {
    try {
      const dOrder = await DomainOrder.findById(payment.orderId);
      if (dOrder && dOrder.status === 'pending') {
        const ncSandbox = await ncResolveSandbox();
        // In a TEST payment, only register if Namecheap is in SANDBOX (safe, fake funds).
        // Never run a real (live) Namecheap registration on a test payment.
        if (payment.isTest && !ncSandbox) {
          console.log('TEST PAYMENT + Namecheap LIVE — skipping real domain action for', dOrder.domainName);
          dOrder.status = 'test_paid';
          await dOrder.save();
          return;
        }
        if (payment.isTest && ncSandbox) {
          console.log('TEST PAYMENT + Namecheap SANDBOX — registering in sandbox for', dOrder.domainName);
        }
        const me = await Customer.findById(payment.customerId);
        // Read stored meta (contact for register, or renew flag)
        let meta = {};
        try { meta = JSON.parse(dOrder.registrationResult || '{}'); } catch (_) { }

        let result;
        if (meta.renew) {
          result = await ncRenewDomain(dOrder.domainName, dOrder.period);
          if (!result.ok) throw new Error(result.error);
          console.log('DOMAIN RENEWED via Namecheap:', dOrder.domainName);
        } else {
          // Build contact from stored meta or the customer's account info
          const contact = meta.contact || {
            firstName: me?.firstName || me?.username || 'Domain',
            lastName: me?.lastName || 'Owner',
            address: me?.address || 'N/A', city: me?.city || 'N/A',
            state: me?.state || 'N/A', zip: me?.zip || '00000',
            country: me?.country || 'US', phone: me?.phone || '+1.0000000000',
            email: me?.businessEmail,
          };
          result = await ncRegisterDomain(dOrder.domainName, dOrder.period, contact);
          if (!result.ok) throw new Error(result.error);
          if (!result.registered) throw new Error('Namecheap did not confirm registration.');
          console.log('DOMAIN REGISTERED via Namecheap:', dOrder.domainName);
          // Only link this domain to the customer if they have NO domain yet.
          // Never overwrite an existing Workspace domain (that would break their Workspace billing).
          if (me && !me.domain) { me.domain = dOrder.domainName; await me.save(); }
        }
        // NOTE: domain registration/renewal does NOT touch Workspace (SubBilling) billing.
        // A domain renewal must never trigger a Workspace suspension.
        dOrder.status = 'registered';
        dOrder.registeredAt = new Date();
        dOrder.registrationResult = JSON.stringify(result).slice(0, 500);
        await dOrder.save();
        // Domain purchase confirmation + ICANN verification reminder
        try {
          const isRenew = !!meta.renew;
          const regEmail = (meta.contact && meta.contact.email) || me?.businessEmail;
          const html = emailShell(isRenew ? 'Domain renewed' : 'Domain registered', `
            <p>Hi ${me?.firstName || me?.username || 'there'},</p>
            <p>Your domain <strong>${dOrder.domainName}</strong> has been ${isRenew ? 'renewed' : 'registered'} successfully${dOrder.period ? ` for ${dOrder.period} year${dOrder.period === 1 ? '' : 's'}` : ''}.</p>
            ${isRenew ? '' : `<p><strong>Important — verify your email:</strong> ICANN requires you to verify the registrant email (<strong>${regEmail}</strong>) within 15 days. Namecheap has sent a verification email — please open it and click the link, or your domain may be suspended.</p>`}
            <p>You can manage DNS, nameservers, and contacts anytime from your portal under <strong>Domains → My domains → Manage</strong>.</p>
            <p><a href="${PORTAL_URL}/#domains" style="color:#0F766E">Open your domains</a></p>`);
          await sendEmail(regEmail, `${dOrder.domainName} ${isRenew ? 'renewed' : 'registered'} ✓`, html);
        } catch (_) { }
      }
    } catch (e) {
      console.error('DOMAIN ACTION FAILED for payment', String(payment._id), e.message);
      try {
        const dOrder = await DomainOrder.findById(payment.orderId);
        if (dOrder) { dOrder.status = 'failed'; dOrder.registrationResult = e.message; await dOrder.save(); }
      } catch (_) { }
    }
    return;
  }

  // RENEWAL payment (Workspace subscription renewal — no WorkspaceOrder attached).
  // Roll the billing record forward and make sure it's active in Google. Never suspends.
  if (payment.isRenewal && payment.renewalSkuId) {
    try {
      if (payment.isTest) { console.log('TEST PAYMENT — workspace renewal not applied for', payment.domain); return; }
      const dom = (payment.domain || '').toLowerCase();
      const me = await Customer.findById(payment.customerId);
      const account = me?.account || 'pk';
      const now = new Date();

      // Update/seed the billing record. RULE: mark the CURRENT cycle paid — never shift the schedule.
      let rec = await SubBilling.findOne({ domain: dom, skuId: payment.renewalSkuId });
      if (!rec) {
        // No record yet — create one anchored to now as a fresh cycle, then mark it paid.
        rec = new SubBilling({ domain: dom, skuId: payment.renewalSkuId, account });
        startNewBillingCycle(rec, now);
      }
      applyPaymentToCurrentCycle(rec, now);
      await rec.save();

      // If Google had it suspended, reactivate it.
      try {
        const auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
        const reseller = google.reseller({ version: 'v1', auth });
        const resp = await reseller.subscriptions.list({ customerId: dom });
        const sub = (resp.data.subscriptions || []).find((s) => String(s.skuId) === String(payment.renewalSkuId));
        if (sub && sub.status === 'SUSPENDED' && rec.subscriptionId) {
          await setSubscriptionState(account, dom, payment.renewalSkuId, 'activate', rec.subscriptionId);
          console.log('RENEWAL reactivated suspended sub:', dom, payment.renewalSkuId);
        }
      } catch (_) { }

      console.log('SUBSCRIPTION RENEWAL applied:', dom, payment.renewalSkuId, '→ next', rec.nextBillingDate);
      try {
        const prodName = skuName(payment.renewalSkuId);
        const html = emailShell('Subscription renewed', `
          <p>Hi ${me?.firstName || me?.username || 'there'},</p>
          <p>Thanks — your <strong>${prodName}</strong> subscription for <strong>${dom}</strong> has been renewed and is active. Your next renewal date is <strong>${rec.nextBillingDate ? new Date(rec.nextBillingDate).toLocaleDateString() : 'updated'}</strong>.</p>
          <p>Note: each subscription is billed separately. If you have other subscriptions (like Google Voice or add-ons), please make sure each one is paid to keep it active.</p>`);
        await sendEmail(me?.businessEmail, `Subscription renewed: ${prodName} · ${dom}`, html);
      } catch (_) { }
    } catch (e) {
      console.error('WORKSPACE RENEWAL FAILED for payment', String(payment._id), e.message);
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

        // Set billing cycle: next renewal anchored to the purchase day-of-month
        const now = new Date();
        order.lastPaymentDate = now;
        order.nextBillingDate = nextMonthlyRenewal(order.createdAt || now, now);
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

        // Payment confirmation email
        try {
          const me = await Customer.findById(payment.customerId);
          await sendPaymentConfirmationEmail(me?.businessEmail, order.organization?.domain, payment.amount);
        } catch (_) { }

        // Also set/refresh the 29-day billing cycle for this subscription's billing record.
        try {
          const domain = (order.organization?.domain || '').toLowerCase();
          const planDoc = await Plan.findOne({ planId: order.plan?.id });
          if (domain && planDoc?.skuId) {
            const nowD = new Date();
            let rec = await SubBilling.findOne({ domain, skuId: planDoc.skuId });
            if (!rec) {
              // First provisioning → brand new cycle (RULE: creation defines a cycle).
              rec = new SubBilling({ account: order.account || 'pk', domain, skuId: planDoc.skuId, subscriptionId: order.subscriptionId });
              startNewBillingCycle(rec, nowD);
              applyPaymentToCurrentCycle(rec, nowD); // this first cycle is paid
            } else {
              // Existing record → this payment marks the CURRENT cycle paid (no schedule shift).
              if (rec.billingStatus === 'suspended') {
                try { await setSubscriptionState(rec.account, domain, planDoc.skuId, 'activate', rec.subscriptionId); } catch (_) { }
              }
              applyPaymentToCurrentCycle(rec, nowD);
            }
            await rec.save();
          }
        } catch (_) { }
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

// ===== EXISTING SUBSCRIPTION 29-DAY BILLING (seeded from Google creation date) =====

// Compute the next monthly renewal date anchored to a subscription's purchase day-of-month.
// e.g. purchased Jan 27 → next renewal is the 27th of the current or upcoming month (whichever
// is the first 27th strictly after `from`). Handles short months (e.g. day 31 → last day).
function nextMonthlyRenewal(purchaseDate, from = new Date()) {
  const anchorDay = new Date(purchaseDate).getDate(); // 1..31
  // Start from the anchor day in `from`'s month
  let year = from.getFullYear();
  let month = from.getMonth();
  const clampDay = (y, m, d) => {
    const lastDay = new Date(y, m + 1, 0).getDate(); // last day of month m
    return Math.min(d, lastDay);
  };
  let candidate = new Date(year, month, clampDay(year, month, anchorDay), 0, 0, 0, 0);
  // If that date is today or in the past, roll to next month
  while (candidate.getTime() <= from.getTime()) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    candidate = new Date(year, month, clampDay(year, month, anchorDay), 0, 0, 0, 0);
  }
  return candidate;
}

// The suspend date is 1 day before the renewal date.
function suspendDateFor(renewalDate) {
  return new Date(new Date(renewalDate).getTime() - 24 * 60 * 60 * 1000);
}

// Recalculate a SubBilling record's next renewal date when reactivating/unsuspending.
// Anchored to the original purchase day-of-month, advanced to the next future occurrence.
// If purchaseDate is missing, anchor to today.
function recalcNextBilling(rec, from = new Date()) {
  const anchor = rec.purchaseDate ? new Date(rec.purchaseDate) : from;
  return nextMonthlyRenewal(anchor, from);
}


// Pull all subscriptions from a Google reseller account and seed/update billing records.
async function syncSubscriptionsForBilling(account) {
  let auth;
  try {
    auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
  } catch (e) {
    return { account, error: e.message, seeded: 0 };
  }
  const reseller = google.reseller({ version: 'v1', auth });
  let subs = [];
  let pageToken;
  do {
    const resp = await reseller.subscriptions.list({ maxResults: 100, pageToken });
    subs = subs.concat(resp.data.subscriptions || []);
    pageToken = resp.data.nextPageToken;
  } while (pageToken);

  let seeded = 0;
  const seen = new Set();
  for (const s of subs) {
    const domain = s.customerDomain || s.customerId;
    const skuId = String(s.skuId || '');
    if (!domain || !skuId) continue;
    // Skip duplicate domain+sku pairs within the same Google response
    const key = `${domain}::${skuId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Seed the FIXED cycle from the Google creation date on FIRST insert only.
    // billing_cycle_start = creation date; next_billing_date = start + 29 days.
    const creation = s.creationTime && !isNaN(Number(s.creationTime))
      ? new Date(Number(s.creationTime))
      : new Date();
    const seededNext = addDays(creation, BILLING_CYCLE_DAYS);

    try {
      // Insert if new. DO NOT overwrite an existing record's schedule (payments/cron own it).
      const r = await SubBilling.updateOne(
        { domain, skuId },
        {
          $setOnInsert: {
            account,
            billingCycleStart: creation,
            purchaseDate: creation,
            nextBillingDate: seededNext,
            currentCycleStatus: 'unpaid',
            billingStatus: s.status === 'SUSPENDED' ? 'suspended' : 'active',
          },
          $set: { subscriptionId: s.subscriptionId || '', updatedAt: new Date() },
        },
        { upsert: true }
      );
      if (r.upsertedCount) seeded++;
    } catch (e) {
      if (!String(e.message || '').includes('E11000')) {
        console.error('SUB BILLING SYNC error for', domain, skuId, e.message);
      }
    }
  }
  return { account, total: subs.length, seeded };
}

// Suspend / reactivate a subscription by domain + sku on the right account
async function setSubscriptionState(account, domain, skuId, action, subscriptionId) {
  const auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
  const reseller = google.reseller({ version: 'v1', auth });
  // Google Reseller API needs the customer's subscriptionId. For resold subs this is often
  // the skuId, but use the stored subscriptionId when we have it.
  const subId = subscriptionId || skuId;
  console.log(`SET SUB STATE: ${action} ${domain} subId=${subId} (sku=${skuId}, acct=${account})`);
  if (action === 'suspend') {
    await reseller.subscriptions.suspend({ customerId: domain, subscriptionId: subId });
  } else {
    await reseller.subscriptions.activate({ customerId: domain, subscriptionId: subId });
  }
}

// The 29-day check for ALL tracked subscriptions (existing + new).
async function runSubscriptionBillingCheck() {
  const now = new Date();
  const results = { checked: 0, warned: [], suspended: [], advanced: [], skippedWhitelisted: 0 };

  const allRecords = await SubBilling.find();
  const diag = { totalRecords: allRecords.length, statusCounts: {}, whitelistedCount: 0, nullNextDate: 0, pastDueUnpaid: 0 };
  for (const x of allRecords) {
    diag.statusCounts[x.billingStatus || 'undefined'] = (diag.statusCounts[x.billingStatus || 'undefined'] || 0) + 1;
    if (x.whitelisted) diag.whitelistedCount++;
    if (!x.nextBillingDate) diag.nullNextDate++;
    const due = x.nextBillingDate ? now.getTime() >= new Date(x.nextBillingDate).getTime() : false;
    if (due && x.currentCycleStatus !== 'paid' && x.billingStatus !== 'suspended' && !x.whitelisted) diag.pastDueUnpaid++;
  }
  console.log('BILLING CHECK DIAGNOSTIC:', JSON.stringify(diag));
  results.diagnostic = diag;

  // Process every non-whitelisted record with a schedule.
  const records = await SubBilling.find({ nextBillingDate: { $ne: null }, whitelisted: { $ne: true } });
  results.skippedWhitelisted = await SubBilling.countDocuments({ whitelisted: true });

  for (const r of records) {
    results.checked++;
    const nextBilling = new Date(r.nextBillingDate);
    const dueReached = now.getTime() >= nextBilling.getTime();

    // RULE 4/5: never touch an account manually unsuspended before its new next_billing_date.
    if (r.lastManualUnsuspendAt && now.getTime() < nextBilling.getTime()) {
      continue;
    }

    if (!dueReached) {
      // Not due yet. Optionally warn a few days before, but only if the current cycle is unpaid.
      const daysToDue = (nextBilling.getTime() - now.getTime()) / 86400000;

      // 1. Automated 7-day expiration reminder email
      if (r.currentCycleStatus !== 'paid' && daysToDue <= 7 && daysToDue > 0 && !r.notified7DaysBefore) {
        r.notified7DaysBefore = true;
        await r.save();
        const email = await emailForDomain(r.domain);
        if (email) {
          try {
            const { subject, html } = await getFilledTemplate('expiry_7day', {
              domain: r.domain || 'your account',
              dueDate: nextBilling.toLocaleDateString(),
              brand: BRAND_NAME
            });
            await sendEmail(email, subject, html);
            console.log(`[7-Day Expiry Notice] Sent to ${email} for domain ${r.domain}`);
          } catch (err) {
            console.error(`[7-Day Expiry Notice] Failed to send to ${email} for domain ${r.domain}:`, err.message);
          }
        }
      }

      // 2. Automated expiration day reminder email (secondary reminder on expiration day)
      if (r.currentCycleStatus !== 'paid' && daysToDue <= 1 && daysToDue > 0 && !r.notifiedOnExpiration) {
        r.notifiedOnExpiration = true;
        await r.save();
        const email = await emailForDomain(r.domain);
        if (email) {
          try {
            const { subject, html } = await getFilledTemplate('expiry_today', {
              domain: r.domain || 'your account',
              dueDate: nextBilling.toLocaleDateString(),
              brand: BRAND_NAME
            });
            await sendEmail(email, subject, html);
            console.log(`[Expiration Day Notice] Sent to ${email} for domain ${r.domain}`);
          } catch (err) {
            console.error(`[Expiration Day Notice] Failed to send to ${email} for domain ${r.domain}:`, err.message);
          }
        }
      }

      if (r.currentCycleStatus !== 'paid' && daysToDue <= 4 && daysToDue > 0 && r.billingStatus === 'active') {
        r.billingStatus = 'warned';
        r.warnedAt = now;
        await r.save();
        results.warned.push(`${r.domain} (${r.skuId})`);
        try { await sendRenewalWarningEmail(await emailForDomain(r.domain), r.domain, nextBilling); } catch (_) { }
      }
      continue;
    }

    // DUE DATE REACHED (now >= next_billing_date).
    if (r.currentCycleStatus === 'paid') {
      // RULE 2/3: the paid cycle has completed — advance to the NEXT fixed cycle.
      // New start = previous next_billing_date; new next = start + 29 days. (Never uses payment date.)
      advanceToNextCycle(r);
      // If Google had it suspended (e.g. late payment before this roll), make sure it's active.
      if (r.billingStatus === 'suspended') {
        try { await setSubscriptionState(r.account, r.domain, r.skuId, 'activate', r.subscriptionId); } catch (_) { }
      }
      r.billingStatus = 'active';
      r.suspendedAt = null;
      await r.save();
      results.advanced.push(`${r.domain} (${r.skuId}) → ${r.nextBillingDate.toISOString().slice(0, 10)}`);
      console.log('BILLING CYCLE ADVANCED (paid):', r.domain, r.skuId, '→ next', r.nextBillingDate.toISOString().slice(0, 10));
      continue;
    }

    // RULE 5: due reached AND current cycle unpaid → suspend (if not already).
    if (r.billingStatus !== 'suspended') {
      try {
        await setSubscriptionState(r.account, r.domain, r.skuId, 'suspend', r.subscriptionId);
        r.billingStatus = 'suspended';
        r.suspendedAt = now;
        await r.save();
        results.suspended.push(`${r.domain} (${r.skuId})`);
        console.log('SUB SUSPENDED (unpaid cycle):', r.domain, r.skuId, '| due was', nextBilling.toISOString().slice(0, 10));
        try { await sendSuspensionEmail(await emailForDomain(r.domain), r.domain); } catch (_) { }
      } catch (e) {
        const detail = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e.message;
        console.error('SUB SUSPEND FAILED', r.domain, 'sku=' + r.skuId, '→', detail);
        results.suspendErrors = results.suspendErrors || [];
        results.suspendErrors.push({ domain: r.domain, skuId: r.skuId, error: detail });
      }
    }
  }
  return results;
}

// Admin: migrate existing billing records to the fixed 29-day cycle schema.
// Sets billingCycleStart from purchaseDate (or existing nextBillingDate - 29d), recomputes nextBillingDate.
app.post('/api/admin/billing/migrate-cycles', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const startFromToday = req.body?.startFromToday === true; // optional: reset all to a fresh cycle now
    const now = new Date();
    const recs = await SubBilling.find();
    let migrated = 0;
    for (const r of recs) {
      if (startFromToday) {
        startNewBillingCycle(r, now);
        // Preserve paid status if they had a recent payment.
        r.currentCycleStatus = r.lastPaymentDate && (now - new Date(r.lastPaymentDate)) < BILLING_CYCLE_DAYS * 86400000 ? 'paid' : 'unpaid';
      } else {
        // Derive billingCycleStart if missing.
        if (!r.billingCycleStart) {
          if (r.purchaseDate) r.billingCycleStart = new Date(r.purchaseDate);
          else if (r.nextBillingDate) r.billingCycleStart = addDays(new Date(r.nextBillingDate), -BILLING_CYCLE_DAYS);
          else r.billingCycleStart = now;
        }
        // Recompute nextBillingDate on the fixed 29-day cycle if missing or inconsistent.
        if (!r.nextBillingDate) r.nextBillingDate = addDays(r.billingCycleStart, BILLING_CYCLE_DAYS);
        // Set cycle status from suspension/payment state.
        if (!r.currentCycleStatus) {
          r.currentCycleStatus = (r.billingStatus === 'suspended') ? 'unpaid' : 'paid';
        }
      }
      r.updatedAt = now;
      await r.save();
      migrated++;
    }
    res.json({ success: true, migrated, startFromToday });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: start the 29-day cycle from TODAY for existing subs (so old purchase dates don't instantly suspend)
app.post('/api/admin/billing/start-from-today', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const onlyPastDue = req.body?.onlyPastDue !== false; // default: only reset those already past due / suspended
    const now = new Date();
    const filter = onlyPastDue
      ? { $or: [{ nextBillingDate: { $lte: now } }, { billingStatus: 'suspended' }, { billingStatus: 'warned' }] }
      : {};
    const records = await SubBilling.find(filter);
    let reset = 0;
    for (const r of records) {
      if (r.billingStatus === 'suspended') {
        try { await setSubscriptionState(r.account, r.domain, r.skuId, 'activate', r.subscriptionId); } catch (_) { }
      }
      // Fresh 29-day cycle from today, marked paid (admin action = treat as current).
      startNewBillingCycle(r, now);
      r.lastManualUnsuspendAt = now;
      r.currentCycleStatus = 'paid';
      await r.save();
      reset++;
    }
    res.json({ success: true, reset, onlyPastDue });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: TEST suspend a single domain immediately (confirms the Google suspend call works).
// Suspends the subscription(s) for ONE domain you specify. Use a domain you own.
app.post('/api/admin/billing/test-suspend', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const domain = (req.body.domain || '').toLowerCase().trim();
    if (!domain) return res.status(400).json({ error: 'Enter a domain to test.' });

    const records = await SubBilling.find({ domain });
    if (!records.length) return res.status(404).json({ error: `No billing record found for ${domain}. Sync from Google first.` });

    const outcomes = [];
    for (const r of records) {
      try {
        await setSubscriptionState(r.account, r.domain, r.skuId, 'suspend', r.subscriptionId);
        r.billingStatus = 'suspended';
        r.suspendedAt = new Date();
        await r.save();
        outcomes.push({ skuId: r.skuId, account: r.account, result: 'SUSPENDED ✓' });
        console.log('TEST SUSPEND OK:', domain, r.skuId);
      } catch (e) {
        const detail = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e.message;
        outcomes.push({ skuId: r.skuId, account: r.account, result: 'FAILED: ' + detail });
        console.error('TEST SUSPEND FAILED:', domain, r.skuId, '→', detail);
      }
    }
    res.json({ success: true, domain, outcomes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: TEST reactivate a single domain (undo the test suspend)
app.post('/api/admin/billing/test-activate', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const domain = (req.body.domain || '').toLowerCase().trim();
    if (!domain) return res.status(400).json({ error: 'Enter a domain.' });
    const records = await SubBilling.find({ domain });
    if (!records.length) return res.status(404).json({ error: `No billing record found for ${domain}.` });
    const outcomes = [];
    for (const r of records) {
      try {
        await setSubscriptionState(r.account, r.domain, r.skuId, 'activate', r.subscriptionId);
        r.billingStatus = 'active';
        r.suspendedAt = null;
        await r.save();
        outcomes.push({ skuId: r.skuId, result: 'REACTIVATED ✓' });
      } catch (e) {
        const detail = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e.message;
        outcomes.push({ skuId: r.skuId, result: 'FAILED: ' + detail });
      }
    }
    res.json({ success: true, domain, outcomes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== CENTRAL SKU CATALOG (names for all core plans + add-ons) =====
const SKU_CATALOG = {
  // Core Workspace
  '1010020027': { name: 'Google Workspace Business Starter', category: 'core' },
  '1010020028': { name: 'Google Workspace Business Standard', category: 'core' },
  '1010020025': { name: 'Google Workspace Business Plus', category: 'core' },
  '1010060003': { name: 'Google Workspace Enterprise Essentials', category: 'core' },
  '1010020029': { name: 'Google Workspace Enterprise Starter', category: 'core' },
  '1010020026': { name: 'Google Workspace Enterprise Standard', category: 'core' },
  '1010020020': { name: 'Google Workspace Enterprise Plus', category: 'core' },
  '1010060005': { name: 'Google Workspace Enterprise Essentials Plus', category: 'core' },
  '1010020030': { name: 'Google Workspace Frontline Starter', category: 'core' },
  '1010020031': { name: 'Google Workspace Frontline Standard', category: 'core' },
  '1010020034': { name: 'Google Workspace Frontline Plus', category: 'core' },
  // Voice
  '1010330003': { name: 'Google Voice Starter', category: 'voice' },
  '1010330004': { name: 'Google Voice Standard', category: 'voice' },
  '1010330002': { name: 'Google Voice Premier', category: 'voice' },
  // Gemini
  '1010470001': { name: 'Gemini Enterprise', category: 'addon' },
  '1010470002': { name: 'Gemini Labs', category: 'addon' },
  '1010470003': { name: 'Gemini Business', category: 'addon' },
  '1010470006': { name: 'Gemini Security', category: 'addon' },
  '1010470007': { name: 'Gemini Meet', category: 'addon' },
  '1010470009': { name: 'AI Expanded Access', category: 'addon' },
  // AppSheet
  '1010380001': { name: 'AppSheet Core', category: 'addon' },
  '1010380002': { name: 'AppSheet Enterprise Standard', category: 'addon' },
  '1010380003': { name: 'AppSheet Enterprise Plus', category: 'addon' },
  '1010540001': { name: 'AppSheet User Pass', category: 'addon' },
  // Cloud Identity
  '1010010001': { name: 'Cloud Identity', category: 'addon' },
  '1010050001': { name: 'Cloud Identity Premium', category: 'addon' },
  // Assured Controls
  '1010390001': { name: 'Assured Controls', category: 'addon' },
  '1010390002': { name: 'Assured Controls Plus', category: 'addon' },
  // Chrome Enterprise Premium
  '1010400001': { name: 'Chrome Enterprise Premium', category: 'addon' },
  // Google Colab
  '1010500001': { name: 'Colab Pro', category: 'addon' },
  '1010500002': { name: 'Colab Pro+', category: 'addon' },
};
function skuName(skuId) {
  return SKU_CATALOG[String(skuId)]?.name || String(skuId);
}

// ===== SUBSCRIPTION DEPENDENCY MODEL (Rule 7: dynamic, no per-product hardcoding) =====
// A subscription is either the PRIMARY (Google Workspace) or an ADD-ON (Voice, Gemini,
// AI Expanded Access, and any FUTURE product). Classification is dynamic via the catalog
// category, so new add-ons automatically follow the same rules with no code changes.
function skuCategory(skuId) {
  const meta = SKU_CATALOG[String(skuId)];
  const name = (meta?.name || '').toLowerCase();
  // RULE: any product whose name contains "workspace" is the PRIMARY subscription.
  if (name.includes('workspace')) return 'workspace';
  // Voice is always an add-on.
  if (name.includes('voice')) return 'voice';
  if (meta?.category) {
    if (meta.category === 'core' || meta.category === 'workspace') return 'workspace';
    if (meta.category === 'voice') return 'voice';
    return 'addon';
  }
  if (WORKSPACE_SKUS.includes(String(skuId))) return 'workspace';
  return 'addon';
}
function isPrimarySku(skuId) { return skuCategory(skuId) === 'workspace'; }
function isAddonSku(skuId) { return !isPrimarySku(skuId); } // voice + addon + any future product


// ===== WORKSPACE-ANCHORED BILLING (customer-grouped) =====
// Billing is driven by the customer's Google WORKSPACE creation date. When that 29-day cycle is
// overdue, ALL of the customer's subscriptions (Workspace + Voice + others) are suspended together.
// Customers are grouped by email (falling back to domain when email isn't available).
const WORKSPACE_SKUS = ['1010020027', '1010020028', '1010020025', '1010020030',
  '1010020020', '1010020029', '1010020026', '1010020031'];
const VOICE_SKUS = ['1010330003', '1010330004', '1010330002', '1010330005', '1010330006'];

// Pull every subscription from both accounts, with the customer email resolved where possible.
async function gatherAllSubscriptions() {
  const out = [];
  for (const account of ['pk', 'usa']) {
    let auth;
    try { auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth(); }
    catch (e) { console.error(`gatherAllSubscriptions: ${account} auth failed:`, e.message); continue; }
    const reseller = google.reseller({ version: 'v1', auth });
    let pageToken;
    do {
      const resp = await reseller.subscriptions.list({ maxResults: 100, pageToken });
      for (const s of (resp.data.subscriptions || [])) {
        out.push({
          account,
          domain: (s.customerDomain || s.customerId || '').toLowerCase(),
          skuId: String(s.skuId || ''),
          subscriptionId: s.subscriptionId,
          status: s.status,
          creationTime: s.creationTime ? Number(s.creationTime) : null,
        });
      }
      pageToken = resp.data.nextPageToken;
    } while (pageToken);
  }
  return out;
}

// Resolve a customer's email by domain (from our Customer DB); fall back to the domain itself as the key.
async function customerKeyFor(domain) {
  if (!domain) return null;
  const c = await Customer.findOne({ domain: domain.toLowerCase() });
  return (c?.businessEmail || '').toLowerCase() || `domain:${domain.toLowerCase()}`;
}

// Workspace-anchored check: cycles are anchored to a fixed BILLING_EPOCH (Jan 1, 2026), counted in
// 30-day periods. Suspend fires on DAY 29 of the current period; warning on day 25.
// If a customer has paid, their cycle counts from the last payment instead.
const BILLING_EPOCH = new Date('2026-01-01T00:00:00Z').getTime();

async function runWorkspaceAnchoredBillingCheck(dryRun) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CYCLE_DAYS = 30;
  const SUSPEND_DAY = 29;   // suspend 1 day before the 30-day mark
  const WARN_DAY = 25;      // warn 4 days before suspension
  const now = Date.now();
  const subs = await gatherAllSubscriptions();

  // Group subscriptions by customer key (email, fallback domain)
  const groups = {};
  for (const s of subs) {
    const key = await customerKeyFor(s.domain);
    if (!key) continue;
    if (!groups[key]) groups[key] = { key, subs: [], domains: new Set() };
    groups[key].subs.push(s);
    groups[key].domains.add(s.domain);
  }

  const results = { dryRun: !!dryRun, customersChecked: 0, overdue: [], warned: [], suspended: [], skippedWhitelisted: 0, suspendErrors: [] };

  for (const key of Object.keys(groups)) {
    const g = groups[key];
    results.customersChecked++;

    // Whitelist protects the whole customer
    const wl = await SubBilling.findOne({ domain: { $in: [...g.domains] }, whitelisted: true });
    if (wl) { results.skippedWhitelisted++; continue; }

    // Cycle start = last payment if paid, otherwise the fixed billing epoch (Jan 1, 2026).
    const billRecs = await SubBilling.find({ domain: { $in: [...g.domains] } });
    const lastPaid = billRecs.map((r) => r.lastPaymentDate ? new Date(r.lastPaymentDate).getTime() : 0).reduce((a, b) => Math.max(a, b), 0);
    const cycleStart = lastPaid || BILLING_EPOCH;

    // Days elapsed within the CURRENT 30-day period since cycle start.
    const totalDays = Math.floor((now - cycleStart) / DAY_MS);
    if (totalDays < 0) continue; // cycle hasn't started yet
    const dayInCycle = totalDays % CYCLE_DAYS;
    // An account is overdue if it's at/after the suspend day in its current cycle,
    // OR it has rolled past at least one full cycle unpaid (totalDays >= CYCLE_DAYS while unpaid).
    const overduePastCycle = !lastPaid && totalDays >= SUSPEND_DAY;
    const atSuspendDay = dayInCycle >= SUSPEND_DAY;
    const atWarnDay = dayInCycle >= WARN_DAY && dayInCycle < SUSPEND_DAY;

    // WARN on day 25
    if (atWarnDay) {
      results.warned.push({ customer: key, domains: [...g.domains], dayInCycle });
      if (!dryRun) {
        for (const d of g.domains) {
          try { await sendRenewalWarningEmail(await emailForDomain(d), d, new Date(cycleStart + (totalDays - dayInCycle + SUSPEND_DAY) * DAY_MS)); } catch (_) { }
        }
      }
    }

    // SUSPEND on day 29 (or past a full unpaid cycle)
    if (atSuspendDay || overduePastCycle) {
      results.overdue.push({ customer: key, domains: [...g.domains], cycleStart: new Date(cycleStart).toISOString().slice(0, 10), totalDays, dayInCycle, subs: g.subs.length });
      if (!dryRun) {
        for (const s of g.subs) {
          if (s.status === 'SUSPENDED') continue;
          try {
            await setSubscriptionState(s.account, s.domain, s.skuId, 'suspend', s.subscriptionId);
            await SubBilling.updateOne({ domain: s.domain, skuId: s.skuId }, { $set: { billingStatus: 'suspended', suspendedAt: new Date(), updatedAt: new Date() } });
            results.suspended.push(`${s.domain} (${s.skuId})`);
            console.log('WS-ANCHORED SUSPEND (totalDays ' + totalDays + '):', s.domain, s.skuId, 'acct', s.account);
          } catch (e) {
            const detail = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e.message;
            results.suspendErrors.push({ domain: s.domain, skuId: s.skuId, error: detail });
            console.error('WS-ANCHORED SUSPEND FAILED:', s.domain, s.skuId, '→', detail);
          }
        }
      }
    }
  }
  return results;
}

// Customer: list available add-on subscriptions (Gemini, AppSheet, etc.) with admin-set prices.
// An add-on is purchasable ONLY if the admin has set a price.
app.get('/api/customer/addons', authenticateCustomer, async (req, res) => {
  try {
    const plans = await Plan.find({ category: 'addon', active: true });
    const priceBySku = {};
    for (const p of plans) if (p.skuId) priceBySku[String(p.skuId)] = p.monthlyPrice;
    const addons = Object.entries(SKU_CATALOG)
      .filter(([, v]) => v.category === 'addon')
      .map(([skuId, v]) => {
        const price = priceBySku[skuId];
        return { skuId, name: v.name, price: price != null ? price : null, purchasable: price != null && price > 0 };
      });
    res.json({ addons });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: full SKU catalog with any admin-set prices
app.get('/api/admin/sku-catalog', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const plans = await Plan.find();
    const priceBySku = {};
    for (const p of plans) if (p.skuId) priceBySku[String(p.skuId)] = { price: p.monthlyPrice, planId: p.planId };
    const catalog = Object.entries(SKU_CATALOG).map(([skuId, v]) => ({
      skuId, name: v.name, category: v.category,
      price: priceBySku[skuId]?.price ?? null,
    }));
    res.json({ catalog });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: set/update the price for any SKU (creates/updates its Plan record)
app.post('/api/admin/sku-price', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { skuId, price } = req.body;
    const sku = String(skuId || '');
    if (!SKU_CATALOG[sku]) return res.status(400).json({ error: 'Unknown SKU.' });
    if (price == null || isNaN(Number(price)) || Number(price) < 0) return res.status(400).json({ error: 'Valid price required.' });
    const meta = SKU_CATALOG[sku];
    const planId = `sku_${sku}`;
    const plan = await Plan.findOneAndUpdate(
      { planId },
      { planId, category: meta.category === 'core' ? 'workspace' : meta.category, name: meta.name, monthlyPrice: Number(price), skuId: sku, active: true },
      { upsert: true, new: true }
    );
    res.json({ success: true, plan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: attempt an add-on purchase. Blocks if no admin price → contact support message.
// Customer: list domains they own that have an ACTIVE Workspace subscription — addons attach to these.
app.get('/api/customer/addon-domains', authenticateCustomer, async (req, res) => {
  try {
    const me = await Customer.findById(req.customerId);
    if (!me) return res.status(404).json({ error: 'Not found' });

    // Gather candidate domains for this customer (from linked domain, orders, transfers).
    const candidates = new Set();
    if (me.domain) candidates.add(me.domain.toLowerCase());
    const wos = await WorkspaceOrder.find({ customerId: me._id, status: 'provisioned' });
    wos.forEach((o) => { if (o.organization?.domain) candidates.add(o.organization.domain.toLowerCase()); });
    const wts = await WorkspaceTransfer.find({ customerId: me._id, status: 'completed' });
    wts.forEach((t) => { if (t.domain) candidates.add(t.domain.toLowerCase()); });

    // For each candidate, check Google (PK then USA) for an ACTIVE Workspace subscription.
    const domains = [];
    for (const dom of candidates) {
      for (const account of ['pk', 'usa']) {
        let auth;
        try { auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth(); } catch (_) { continue; }
        const reseller = google.reseller({ version: 'v1', auth });
        try {
          const resp = await reseller.subscriptions.list({ customerId: dom });
          const subs = resp.data.subscriptions || [];
          // A Workspace plan = a non-addon SKU that's ACTIVE.
          const hasWorkspace = subs.some((s) => {
            const meta = SKU_CATALOG[String(s.skuId)];
            return s.status === 'ACTIVE' && (!meta || meta.category === 'workspace');
          });
          if (hasWorkspace) { domains.push({ domain: dom, account }); break; } // found on this account
        } catch (_) { /* not on this account */ }
      }
    }
    res.json({ domains });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/customer/addons/purchase', authenticateCustomer, async (req, res) => {
  try {
    const sku = String(req.body.skuId || '');
    const dom = String(req.body.domain || '').toLowerCase().trim();
    const method = req.body.method === 'nicky' ? 'nicky' : 'stripe';
    const meta = SKU_CATALOG[sku];
    if (!meta || meta.category !== 'addon') return res.status(400).json({ error: 'Invalid add-on.' });
    const plan = await Plan.findOne({ skuId: sku, category: 'addon', active: true });
    if (!plan || !plan.monthlyPrice || plan.monthlyPrice <= 0) {
      return res.status(400).json({ error: 'This add-on isn\'t available for self-service purchase yet. Please contact support to enable it.' });
    }
    const me = await Customer.findById(req.customerId);

    // MANDATORY: the customer must have a domain with an ACTIVE Workspace plan.
    if (!dom) return res.status(400).json({ error: 'Please select the Workspace domain to add this to.' });

    // Verify the domain has an active Workspace subscription and find which account it's on.
    let account = null;
    for (const acct of ['pk', 'usa']) {
      let auth;
      try { auth = acct === 'usa' ? await getUsaAuth() : await getResellerAuth(); } catch (_) { continue; }
      const reseller = google.reseller({ version: 'v1', auth });
      try {
        const resp = await reseller.subscriptions.list({ customerId: dom });
        const subs = resp.data.subscriptions || [];
        const hasWorkspace = subs.some((s) => {
          const m = SKU_CATALOG[String(s.skuId)];
          return s.status === 'ACTIVE' && (!m || m.category === 'workspace');
        });
        if (hasWorkspace) { account = acct; break; }
      } catch (_) { }
    }
    if (!account) {
      return res.status(400).json({ error: 'Please purchase a Google Workspace plan for this domain first. Add-ons require an active Workspace subscription.' });
    }

    // Pay-first: build checkout. Add-on bills to whichever account the domain lives on.
    const subtotal = Number(plan.monthlyPrice);
    const taxed = await applyTaxAndFee(subtotal);
    const amount = taxed.total;
    const orderNumber = `AD-${Date.now()}`;
    const payment = await Payment.create({
      customerId: me._id, customerEmail: me.businessEmail, domain: dom,
      orderType: 'addon', amount, subtotal: taxed.subtotal, tax: taxed.tax, fee: taxed.fee, currency: 'USD',
      method, status: 'pending',
      addonSku: sku, addonAccount: account, addonName: meta.name,
    });

    const orderDesc = `${meta.name} add-on for ${dom}`;
    const successUrl = `${FRONTEND_URL}/?payment=success&pid=${payment._id}`;
    const cancelUrl = `${FRONTEND_URL}/?payment=cancelled&pid=${payment._id}`;

    if (method === 'stripe') {
      let stripe; try { stripe = await getStripeForMode(); } catch (e) { return res.status(500).json({ error: e.message }); }
      const sd = await PaymentSettings.findOne({ singleton: 'main' });
      payment.isTest = (sd?.stripeMode || 'test') !== 'live'; await payment.save();
      const line_items = [{ price_data: { currency: 'usd', product_data: { name: orderDesc }, unit_amount: Math.round(taxed.subtotal * 100) }, quantity: 1 }];
      if (taxed.fee > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: 'Processing fee' }, unit_amount: Math.round(taxed.fee * 100) }, quantity: 1 });
      if (taxed.tax > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: `${taxed.taxLabel} (${taxed.taxPercent}%)` }, unit_amount: Math.round(taxed.tax * 100) }, quantity: 1 });
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', line_items, success_url: successUrl, cancel_url: cancelUrl,
        client_reference_id: String(payment._id), metadata: { paymentId: String(payment._id), orderType: 'addon' },
      });
      payment.providerRef = session.id; payment.checkoutUrl = session.url; await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id });
    }

    try {
      const nicky = await createNickyPayment({
        amount, currency: 'USD', description: orderDesc, orderNumber,
        reference: String(payment._id), billDescription: orderDesc,
        customerEmail: me.businessEmail, customerName: me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me.businessEmail,
        redirectUrl: successUrl, cancelUrl,
      });
      payment.checkoutUrl = nicky.url; payment.providerRef = nicky.nickyId || nicky.shortId || String(payment._id); payment.providerShortId = nicky.shortId || null;
      await payment.save();
      return res.json({ checkoutUrl: nicky.url, paymentId: payment._id });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: list all suspended subscriptions — fetched DIRECTLY from Google (both accounts).
app.get('/api/admin/billing/suspended', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const byDomain = {};
    let errors = [];
    for (const account of ['pk', 'usa']) {
      let auth;
      try { auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth(); }
      catch (e) { errors.push(`${account}: ${e.message}`); continue; }
      const reseller = google.reseller({ version: 'v1', auth });
      let pageToken;
      do {
        const resp = await reseller.subscriptions.list({ maxResults: 100, pageToken });
        for (const s of (resp.data.subscriptions || [])) {
          if (s.status !== 'SUSPENDED') continue;
          const domain = (s.customerDomain || s.customerId || '').toLowerCase();
          if (!byDomain[domain]) byDomain[domain] = { domain, subscriptions: [] };
          byDomain[domain].subscriptions.push({
            skuId: String(s.skuId), skuName: skuName(s.skuId),
            account, subscriptionId: s.subscriptionId,
            createdAt: s.creationTime ? Number(s.creationTime) : null,
          });
        }
        pageToken = resp.data.nextPageToken;
      } while (pageToken);
    }
    res.json({ suspended: Object.values(byDomain), errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: unsuspend (reactivate) — pass {domain, skuItems:[{account,skuId,subscriptionId}]} for selected,
// or {domain, all:true} to reactivate everything suspended for that domain (fetched from Google).
app.post('/api/admin/billing/unsuspend', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { domain, skuItems, all } = req.body;
    const dom = (domain || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'Domain required.' });

    let items = [];
    if (skuItems && skuItems.length) {
      items = skuItems;
    } else if (all) {
      // Pull this domain's suspended subs from Google across both accounts
      for (const account of ['pk', 'usa']) {
        let auth;
        try { auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth(); } catch (_) { continue; }
        const reseller = google.reseller({ version: 'v1', auth });
        try {
          const resp = await reseller.subscriptions.list({ customerId: dom });
          for (const s of (resp.data.subscriptions || [])) {
            if (s.status === 'SUSPENDED') items.push({ account, skuId: String(s.skuId), subscriptionId: s.subscriptionId });
          }
        } catch (_) { }
      }
    } else {
      return res.status(400).json({ error: 'Provide skuItems[] or all:true.' });
    }

    const now = new Date();
    const outcomes = [];
    for (const it of items) {
      try {
        await setSubscriptionState(it.account, dom, it.skuId, 'activate', it.subscriptionId);
        // RULE 4: manual unsuspension = a COMPLETELY NEW billing cycle from now.
        // billing_cycle_start = now, next_billing_date = now + 29 days. Cron ignores until new due date.
        let rec = await SubBilling.findOne({ domain: dom, skuId: it.skuId });
        if (!rec) rec = new SubBilling({ domain: dom, skuId: it.skuId, account: it.account, subscriptionId: it.subscriptionId });
        startNewBillingCycle(rec, now);
        rec.lastManualUnsuspendAt = now;
        rec.account = it.account;
        if (it.subscriptionId) rec.subscriptionId = it.subscriptionId;
        await rec.save();
        outcomes.push({ domain: dom, skuId: it.skuId, result: 'REACTIVATED ✓', nextBilling: rec.nextBillingDate.toISOString().slice(0, 10) });
        console.log('MANUAL UNSUSPEND (new cycle):', dom, it.skuId, it.account, '| new next billing', rec.nextBillingDate.toISOString().slice(0, 10));
      } catch (e) {
        const detail = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e.message;
        outcomes.push({ domain: dom, skuId: it.skuId, result: 'FAILED: ' + detail });
        console.error('UNSUSPEND FAILED:', dom, it.skuId, '→', detail);
      }
    }
    res.json({ success: true, outcomes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: BULK unsuspend — paste a list of domains, reactivate ALL suspended subs for each.
// Reports which domains fully succeeded and which had failures (so admin can fix + retry).
app.post('/api/admin/billing/unsuspend-bulk', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    let { domains } = req.body;
    if (typeof domains === 'string') domains = domains.split(/[\s,\n]+/);
    domains = (domains || []).map((d) => String(d).toLowerCase().trim()).filter(Boolean);
    if (!domains.length) return res.status(400).json({ error: 'Provide a list of domains.' });

    const now = new Date();
    const next = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const summary = { reactivated: [], partial: [], failed: [], notFound: [] };

    for (const dom of domains) {
      // Find this domain's suspended subs from Google (both accounts)
      let items = [];
      for (const account of ['pk', 'usa']) {
        let auth;
        try { auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth(); } catch (_) { continue; }
        const reseller = google.reseller({ version: 'v1', auth });
        try {
          const resp = await reseller.subscriptions.list({ customerId: dom });
          for (const s of (resp.data.subscriptions || [])) {
            if (s.status === 'SUSPENDED') items.push({ account, skuId: String(s.skuId), subscriptionId: s.subscriptionId });
          }
        } catch (_) { }
      }
      if (!items.length) { summary.notFound.push(dom); continue; }

      let okCount = 0; const failures = [];
      for (const it of items) {
        try {
          await setSubscriptionState(it.account, dom, it.skuId, 'activate', it.subscriptionId);
          // Manual unsuspension → new cycle from now.
          let rec = await SubBilling.findOne({ domain: dom, skuId: it.skuId });
          if (!rec) rec = new SubBilling({ domain: dom, skuId: it.skuId, account: it.account, subscriptionId: it.subscriptionId });
          startNewBillingCycle(rec, now);
          rec.lastManualUnsuspendAt = now;
          rec.account = it.account;
          if (it.subscriptionId) rec.subscriptionId = it.subscriptionId;
          await rec.save();
          okCount++;
        } catch (e) {
          const detail = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e.message;
          failures.push({ skuId: it.skuId, error: detail });
        }
      }
      if (failures.length === 0) summary.reactivated.push({ domain: dom, count: okCount });
      else if (okCount > 0) summary.partial.push({ domain: dom, reactivated: okCount, failures });
      else summary.failed.push({ domain: dom, failures });
    }
    res.json({ success: true, summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: BULK unsuspend — paste a list of domains, reactivate ALL their suspended subscriptions.
// Returns per-domain results so you can see which succeeded and which failed (to fix + retry).
app.post('/api/admin/billing/unsuspend-bulk', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const domains = (req.body.domains || []).map((d) => String(d).toLowerCase().trim()).filter(Boolean);
    if (!domains.length) return res.status(400).json({ error: 'Provide a list of domains.' });
    const now = new Date();
    const next = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const results = [];   // { domain, reactivated, failed, errors:[] }
    for (const dom of domains) {
      const domResult = { domain: dom, reactivated: 0, failed: 0, errors: [], found: 0 };
      // Find this domain's suspended subs across both accounts
      const items = [];
      for (const account of ['pk', 'usa']) {
        let auth;
        try { auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth(); } catch (_) { continue; }
        const reseller = google.reseller({ version: 'v1', auth });
        try {
          const resp = await reseller.subscriptions.list({ customerId: dom });
          for (const s of (resp.data.subscriptions || [])) {
            if (s.status === 'SUSPENDED') items.push({ account, skuId: String(s.skuId), subscriptionId: s.subscriptionId });
          }
        } catch (_) { }
      }
      domResult.found = items.length;
      if (!items.length) { domResult.errors.push('No suspended subscriptions found (domain may not exist in your reseller account or is already active).'); }
      for (const it of items) {
        try {
          await setSubscriptionState(it.account, dom, it.skuId, 'activate', it.subscriptionId);
          // Manual unsuspension → new cycle from now.
          let rec = await SubBilling.findOne({ domain: dom, skuId: it.skuId });
          if (!rec) rec = new SubBilling({ domain: dom, skuId: it.skuId, account: it.account, subscriptionId: it.subscriptionId });
          startNewBillingCycle(rec, now);
          rec.lastManualUnsuspendAt = now;
          rec.account = it.account;
          if (it.subscriptionId) rec.subscriptionId = it.subscriptionId;
          await rec.save();
          domResult.reactivated++;
          console.log('BULK UNSUSPEND (new cycle):', dom, it.skuId, it.account, '| next billing', rec.nextBillingDate.toISOString().slice(0, 10));
        } catch (e) {
          const detail = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e.message;
          domResult.failed++;
          domResult.errors.push(`${it.skuId}: ${detail}`);
          console.error('BULK UNSUSPEND FAILED:', dom, it.skuId, '→', detail);
        }
      }
      results.push(domResult);
    }

    // Summary: which domains fully succeeded vs had any failure
    const succeeded = results.filter((r) => r.reactivated > 0 && r.failed === 0).map((r) => r.domain);
    const failedDomains = results.filter((r) => r.failed > 0 || (r.found === 0)).map((r) => ({ domain: r.domain, reason: r.errors.join('; ') }));
    res.json({
      success: true,
      totalDomains: domains.length,
      totalReactivated: results.reduce((a, r) => a + r.reactivated, 0),
      succeededDomains: succeeded,
      failedDomains,        // <-- the domains you can fix and retry
      details: results,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: run the workspace-anchored check. ?dryRun=1 to PREVIEW without suspending.
app.post('/api/admin/billing/run-workspace-anchored', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true || req.query.dryRun === '1';
    const results = await runWorkspaceAnchoredBillingCheck(dryRun);
    res.json({ success: true, ...results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ===== END WORKSPACE-ANCHORED BILLING =====

// Admin: bulk whitelist by a list of domains. Whitelisted = PERMANENT protection from the
// billing cycle — never auto-suspended until an admin removes it. No time limit.
app.post('/api/admin/billing/whitelist-bulk', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const domains = (req.body.domains || []).map((d) => String(d).toLowerCase().trim()).filter(Boolean);
    if (!domains.length) return res.status(400).json({ error: 'Provide a list of domains.' });
    const now = new Date();
    const result = await SubBilling.updateMany(
      { domain: { $in: domains } },
      { $set: { whitelisted: true, whitelistedAt: now, billingStatus: 'active', warnedAt: null, suspendedAt: null, nextBillingDate: null, updatedAt: now } }
    );
    const matched = await SubBilling.countDocuments({ domain: { $in: domains }, whitelisted: true });
    res.json({ success: true, requested: domains.length, updated: result.modifiedCount, totalWhitelisted: matched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: recalculate nextBillingDate for ALL existing records from their purchase date.
// Uses the monthly anchor (renewal = same day-of-month as purchase). Fixes records whose
// dates were stored on the old flat 30-day cycle.
app.post('/api/admin/billing/recalculate', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const all = await SubBilling.find({ whitelisted: { $ne: true } });
    let updated = 0, nowPastDue = 0;
    for (const r of all) {
      // Anchor to the original purchase date's day-of-month, advanced to the next future renewal.
      const nextDate = recalcNextBilling(r, now);
      r.nextBillingDate = nextDate;
      // Suspended records stay suspended (admin must reactivate); don't change their status here.
      const suspendOn = suspendDateFor(nextDate);
      if (suspendOn.getTime() - now.getTime() <= 0 && r.billingStatus !== 'suspended') nowPastDue++;
      r.updatedAt = now;
      await r.save();
      updated++;
    }
    res.json({ success: true, updated, nowPastDue, note: 'Renewal dates re-anchored to each subscription\'s purchase day-of-month. Suspension occurs 1 day before renewal.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: diagnostic — show status breakdown of billing records (why are some not checked?)
app.get('/api/admin/billing/diagnostic', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const all = await SubBilling.find();
    const breakdown = { total: all.length, byStatus: {}, whitelisted: 0, pastDue: 0, pastDueAndCheckable: 0, futureDue: 0, noNextDate: 0 };
    const samples = [];
    for (const r of all) {
      breakdown.byStatus[r.billingStatus] = (breakdown.byStatus[r.billingStatus] || 0) + 1;
      if (r.whitelisted) breakdown.whitelisted++;
      if (!r.nextBillingDate) { breakdown.noNextDate++; continue; }
      const daysLeft = (new Date(r.nextBillingDate).getTime() - now.getTime()) / 86400000;
      if (daysLeft <= 0) {
        breakdown.pastDue++;
        if (['active', 'warned'].includes(r.billingStatus) && !r.whitelisted) breakdown.pastDueAndCheckable++;
      } else breakdown.futureDue++;
      if (samples.length < 10) samples.push({ domain: r.domain, status: r.billingStatus, whitelisted: !!r.whitelisted, nextBillingDate: r.nextBillingDate, daysLeft: Math.round(daysLeft) });
    }
    res.json({ breakdown, samples });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: whitelist (PERMANENT protection from billing — never auto-suspended) or un-whitelist.
app.post('/api/admin/billing/whitelist', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { id, whitelisted } = req.body;
    const r = await SubBilling.findById(id);
    if (!r) return res.status(404).json({ error: 'Subscription not found.' });
    const now = new Date();
    if (whitelisted) {
      // Whitelist = permanent protection. Reactivate if it was suspended. No billing date.
      if (r.billingStatus === 'suspended') {
        try { await setSubscriptionState(r.account, r.domain, r.skuId, 'activate', r.subscriptionId); } catch (_) { }
      }
      r.whitelisted = true;
      r.whitelistedAt = now;
      r.billingStatus = 'active';
      r.warnedAt = null;
      r.suspendedAt = null;
      r.nextBillingDate = null;     // no billing cycle while whitelisted
    } else {
      r.whitelisted = false;
      r.whitelistedAt = null;
    }
    r.updatedAt = now;
    await r.save();
    res.json({ success: true, record: r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: sync existing subscriptions into billing tracking (seed from Google creation dates)
app.post('/api/admin/billing/sync', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const pk = await syncSubscriptionsForBilling('pk');
    const usa = await syncSubscriptionsForBilling('usa');
    res.json({ success: true, pk, usa });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: Analytics dashboard for subscription growth, MRR, renewal rates
app.get('/api/admin/analytics/dashboard', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    // Generate the last 6 months list
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        mrr: 0,
        revenue: 0,
        workspace: 0,
        other: 0,
        newSubs: 0,
        activeSubs: 0,
        renewalsDue: 0,
        renewalsPaid: 0,
      });
    }

    // Fetch all paid payments
    const payments = await Payment.find({ status: 'paid' }).lean();
    // Fetch all subBilling records
    const subBillingRecs = await SubBilling.find().lean();
    // Fetch all customers
    const customers = await Customer.find().lean();

    // Group payments into months
    payments.forEach(p => {
      const pDate = p.paidAt || p.createdAt;
      if (!pDate) return;
      const d = new Date(pDate);
      const py = d.getFullYear();
      const pm = d.getMonth();
      
      const mBucket = months.find(m => m.year === py && m.month === pm);
      if (mBucket) {
        mBucket.revenue += p.amount || 0;
        if (p.isRenewal || p.orderType === 'workspace' || p.orderType === 'addon') {
          mBucket.mrr += p.amount || 0;
          mBucket.workspace += p.amount || 0;
        } else {
          mBucket.other += p.amount || 0;
        }
      }
    });

    // Group subscription creation (growth)
    subBillingRecs.forEach(sub => {
      const sDate = sub.purchaseDate || sub.billingCycleStart || sub.createdAt;
      if (!sDate) return;
      const d = new Date(sDate);
      const sy = d.getFullYear();
      const sm = d.getMonth();

      const mBucket = months.find(m => m.year === sy && m.month === sm);
      if (mBucket) {
        mBucket.newSubs += 1;
      }
    });

    // Calculate cumulative subscription growth month-by-month
    const firstMonthDate = new Date(months[0].year, months[0].month, 1);
    let cumulative = 0;
    subBillingRecs.forEach(sub => {
      const sDate = sub.purchaseDate || sub.billingCycleStart || sub.createdAt;
      if (sDate && new Date(sDate) < firstMonthDate) {
        cumulative += 1;
      }
    });

    const growthTrend = months.map(m => {
      cumulative += m.newSubs;
      return {
        month: m.label,
        newSubscriptions: m.newSubs,
        totalSubscriptions: cumulative,
      };
    });

    // Calculate renewal rates month-by-month based on billing cycle start
    subBillingRecs.forEach(sub => {
      const sDate = sub.billingCycleStart;
      if (!sDate) return;
      const d = new Date(sDate);
      const sy = d.getFullYear();
      const sm = d.getMonth();

      const mBucket = months.find(m => m.year === sy && m.month === sm);
      if (mBucket) {
        mBucket.renewalsDue += 1;
        if (sub.currentCycleStatus === 'paid' || sub.whitelisted) {
          mBucket.renewalsPaid += 1;
        }
      }
    });

    const renewalRatesTrend = months.map(m => {
      const rate = m.renewalsDue > 0 ? Math.round((m.renewalsPaid / m.renewalsDue) * 100) : 100;
      return {
        month: m.label,
        due: m.renewalsDue,
        paid: m.renewalsPaid,
        rate: rate,
      };
    });

    const mrrTrend = months.map(m => ({
      month: m.label,
      mrr: Math.round(m.mrr),
      revenue: Math.round(m.revenue),
      workspace: Math.round(m.workspace),
      other: Math.round(m.other),
    }));

    // Current general statistics (for pie charts or cards)
    const totalSubs = subBillingRecs.length;
    const activePaid = subBillingRecs.filter(s => s.billingStatus === 'active' && s.currentCycleStatus === 'paid').length;
    const activeUnpaid = subBillingRecs.filter(s => s.billingStatus === 'active' && s.currentCycleStatus === 'unpaid').length;
    const suspended = subBillingRecs.filter(s => s.billingStatus === 'suspended').length;
    const whitelisted = subBillingRecs.filter(s => s.whitelisted).length;

    const totalTrackedNonWhitelisted = subBillingRecs.filter(s => !s.whitelisted).length;
    const paidNonWhitelisted = subBillingRecs.filter(s => !s.whitelisted && s.currentCycleStatus === 'paid').length;
    const overallRenewalRate = totalTrackedNonWhitelisted > 0 
      ? Math.round((paidNonWhitelisted / totalTrackedNonWhitelisted) * 100) 
      : 100;

    res.json({
      mrrTrend,
      growthTrend,
      renewalRatesTrend,
      overallStats: {
        totalSubscriptions: totalSubs,
        activePaid,
        activeUnpaid,
        suspended,
        whitelisted,
        overallRenewalRate,
        totalCustomers: customers.length,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: list tracked subscription billing records
app.get('/api/admin/billing/subscriptions', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const rows = await SubBilling.find().sort({ nextBillingDate: 1 }).limit(1000).lean();
    // Fetch all customers to map their details by domain
    const customers = await Customer.find({}, 'domain firstName lastName companyName businessEmail username').lean();
    const customerMap = {};
    customers.forEach(c => {
      if (c.domain) {
        customerMap[c.domain.toLowerCase().trim()] = c;
      }
    });

    const enriched = rows.map(r => {
      const domainKey = r.domain ? r.domain.toLowerCase().trim() : '';
      const cust = customerMap[domainKey];
      return {
        ...r,
        customerName: cust ? `${cust.firstName || ''} ${cust.lastName || ''}`.trim() || cust.companyName || cust.username || '' : '',
        customerEmail: cust ? cust.businessEmail || cust.username || '' : '',
      };
    });

    res.json({ subscriptions: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: run the subscription billing check now
app.post('/api/admin/billing/run', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const results = await runWorkspaceAnchoredBillingCheck(false);
    res.json({ success: true, checked: results.customersChecked, warned: results.warned, suspended: results.suspended, overdue: results.overdue, suspendErrors: results.suspendErrors, skippedWhitelisted: results.skippedWhitelisted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cron: run the subscription billing check (point a daily external cron here)
app.get('/api/cron/subscription-billing', async (req, res) => {
  if (!req.query.secret || req.query.secret !== process.env.JWT_SECRET) {
    return res.status(403).json({ error: 'Invalid secret.' });
  }
  try {
    // Optionally re-sync to pick up new subs, then check
    if (req.query.sync === '1') { await syncSubscriptionsForBilling('pk'); await syncSubscriptionsForBilling('usa'); }
    const results = await runSubscriptionBillingCheck();
    console.log('SUBSCRIPTION BILLING CHECK:', JSON.stringify(results));
    res.json({ success: true, ...results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== END EXISTING SUBSCRIPTION BILLING =====

// ==================== ADMIN: EMAIL MANAGEMENT ====================
// Get all templates (custom merged over defaults) + whether email is configured
app.get('/api/admin/email/templates', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const custom = await EmailTemplate.find();
    const byKey = {}; custom.forEach(t => { byKey[t.key] = t; });
    const out = {};
    for (const key of ['warning', 'suspension', 'payment', 'expiry_7day', 'expiry_today']) {
      const def = DEFAULT_EMAIL_TEMPLATES[key];
      const c = byKey[key];
      out[key] = {
        subject: c?.subject ?? def.subject,
        heading: c?.heading ?? def.heading,
        body: c?.body ?? def.body,
        customized: !!c,
      };
    }
    res.json({
      templates: out,
      emailConfigured: !!(process.env.RESEND_API_KEY || (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD)),
      fromAddress: process.env.EMAIL_USER || null,
      fromName: process.env.EMAIL_FROM_NAME || process.env.BRAND_NAME || 'GNB MENTOR LLC',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save (customize) a template
app.put('/api/admin/email/templates/:key', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    if (!['warning', 'suspension', 'payment', 'expiry_7day', 'expiry_today'].includes(key)) return res.status(400).json({ error: 'Invalid template.' });
    const { subject, heading, body } = req.body;
    const t = await EmailTemplate.findOneAndUpdate(
      { key },
      { key, subject, heading, body, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, template: t });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reset a template to default
app.delete('/api/admin/email/templates/:key', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    await EmailTemplate.deleteOne({ key: req.params.key });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Preview a template (filled with sample data) — returns HTML
app.post('/api/admin/email/preview', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { key } = req.body;
    const sample = { domain: 'example.com', dueDate: new Date().toLocaleDateString(), amount: '$14.40', brand: BRAND_NAME };
    const { subject, html } = await getFilledTemplate(key, sample);
    res.json({ subject, html });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send a test email of a template to a chosen address
app.post('/api/admin/email/test', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    if (!process.env.RESEND_API_KEY && (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD)) {
      return res.status(400).json({ error: 'Email not configured. Set RESEND_API_KEY (recommended on Railway) or EMAIL_USER + EMAIL_PASSWORD.' });
    }
    const { key, to } = req.body;
    const dest = to || process.env.EMAIL_USER;
    const sample = { domain: 'example.com', dueDate: new Date().toLocaleDateString(), amount: '$14.40', brand: BRAND_NAME };
    const { subject, html } = await getFilledTemplate(key, sample);
    const ok = await sendEmail(dest, '[TEST] ' + subject, html);
    if (!ok) return res.status(500).json({ error: 'Send failed — check email credentials in Railway logs.' });
    res.json({ success: true, sentTo: dest });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send a custom one-off email to a customer (or any address)
app.post('/api/admin/email/send', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    if (!process.env.RESEND_API_KEY && (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD)) {
      return res.status(400).json({ error: 'Email not configured. Set RESEND_API_KEY (recommended on Railway) or EMAIL_USER + EMAIL_PASSWORD.' });
    }
    const { to, subject, message } = req.body;
    if (!to || !subject || !message) return res.status(400).json({ error: 'To, subject, and message are required.' });
    const bodyHtml = String(message).split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join('');
    const ok = await sendEmail(to, subject, emailShell(subject, bodyHtml));
    if (!ok) return res.status(500).json({ error: 'Send failed — check email credentials.' });
    res.json({ success: true, sentTo: to });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Zero-tolerance report types: a SINGLE credible report flags the customer immediately.
const ZERO_TOLERANCE_TYPES = ['child_safety', 'illegal', 'fraud_scam'];

// Abuse detection signal. Flags a Voice customer when EITHER:
//   - they have 1+ open report of a zero-tolerance type (Child Safety, Illegal, Fraud), OR
//   - they have 2+ high-severity open reports of any type.
// Flag ONLY — never auto-suspends. The reseller reviews and suspends manually.
async function computeAbuseFlags() {
  const reports = await AbuseReport.find({ status: { $in: ['open', 'investigating'] } });
  const byDomain = {};
  for (const r of reports) {
    const d = r.domain;
    if (!byDomain[d]) byDomain[d] = { domain: d, total: 0, high: 0, zeroTol: 0, types: new Set(), score: 0 };
    byDomain[d].total++;
    if (r.severity === 'high') byDomain[d].high++;
    if (ZERO_TOLERANCE_TYPES.includes(r.reportType)) byDomain[d].zeroTol++;
    byDomain[d].types.add(r.reportType);
    byDomain[d].score += (r.severity === 'high' ? 5 : r.severity === 'medium' ? 2 : 1);
  }
  const flagged = Object.values(byDomain)
    .filter((c) => c.zeroTol >= 1 || c.high >= 2)
    .map((c) => ({
      domain: c.domain,
      reason: c.zeroTol >= 1 ? 'zero_tolerance' : 'repeated_high_severity',
      zeroTolerance: c.zeroTol,
      highSeverity: c.high,
      totalOpen: c.total,
      score: c.score,
      types: [...c.types],
    }))
    .sort((a, b) => (b.zeroTolerance - a.zeroTolerance) || (b.highSeverity - a.highSeverity) || (b.score - a.score));
  return flagged;
}

// Admin: run the abuse check across ALL Voice customers (existing + new).
// Pulls Voice subs from Google (so we cover existing customers from their purchase date),
// and cross-references logged complaints. Returns flagged customers only — NO auto-suspend.
app.get('/api/admin/abuse/check', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const flagged = await computeAbuseFlags();
    const flaggedDomains = new Set(flagged.map((f) => f.domain));

    // Pull Voice customers from Google to show their purchase date + status alongside flags
    let voiceCustomers = [];
    try {
      const auth = await getUsaAuth();
      const reseller = google.reseller({ version: 'v1', auth });
      const voiceSkus = { '1010330003': 'Voice Starter', '1010330004': 'Voice Standard', '1010330002': 'Voice Premier' };
      let subs = []; let pageToken;
      do {
        const resp = await reseller.subscriptions.list({ maxResults: 100, pageToken });
        subs = subs.concat(resp.data.subscriptions || []);
        pageToken = resp.data.nextPageToken;
      } while (pageToken);
      voiceCustomers = subs
        .filter((s) => voiceSkus[String(s.skuId)])
        .map((s) => {
          const domain = s.customerDomain || s.customerId;
          const created = s.creationTime ? Number(s.creationTime) : null;
          const f = flagged.find((x) => x.domain === domain);
          return {
            domain,
            plan: voiceSkus[String(s.skuId)],
            status: s.status,
            purchaseDate: created,
            flagged: flaggedDomains.has(domain),
            highSeverity: f?.highSeverity || 0,
            totalOpen: f?.totalOpen || 0,
          };
        });
    } catch (e) {
      // Google not connected — still return complaint-based flags
      return res.json({ flagged, voiceCustomers: [], note: 'USA reseller not connected; showing complaint-based flags only. ' + e.message });
    }

    res.json({ flagged, voiceCustomers, flaggedCount: flagged.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== ADMIN: ABUSE / SPAM COMPLAINT TRACKING ====================
// Log a complaint received about a customer (from a recipient, carrier, Google, or internal review)
app.post('/api/admin/abuse-reports', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { domain, reportType, source, severity, description, phoneNumber } = req.body;
    const dom = (domain || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'Customer domain is required.' });
    const customer = await Customer.findOne({ domain: dom });
    const me = await Customer.findById(req.customerId);
    const report = await AbuseReport.create({
      domain: dom,
      customerId: customer?._id,
      reportType: reportType || 'other',
      source: source || '',
      severity: ['low', 'medium', 'high'].includes(severity) ? severity : 'medium',
      description: description || '',
      phoneNumber: phoneNumber || '',
      loggedBy: me?.businessEmail || 'admin',
    });
    res.status(201).json({ success: true, report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List all abuse reports (optionally filter by domain or status)
app.get('/api/admin/abuse-reports', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.domain) filter.domain = req.query.domain.toLowerCase();
    if (req.query.status) filter.status = req.query.status;
    const reports = await AbuseReport.find(filter).sort({ createdAt: -1 }).limit(1000);

    // Per-customer risk summary (more/severe reports = higher risk)
    const byDomain = {};
    for (const r of reports) {
      const d = r.domain;
      if (!byDomain[d]) byDomain[d] = { domain: d, total: 0, open: 0, high: 0, score: 0 };
      byDomain[d].total++;
      if (r.status === 'open' || r.status === 'investigating') byDomain[d].open++;
      if (r.severity === 'high') byDomain[d].high++;
      byDomain[d].score += (r.severity === 'high' ? 5 : r.severity === 'medium' ? 2 : 1);
    }
    const customers = Object.values(byDomain).map((c) => ({
      ...c,
      risk: c.score >= 10 || c.high >= 2 ? 'high' : c.score >= 4 ? 'medium' : 'low',
    })).sort((a, b) => b.score - a.score);

    res.json({ reports, customers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update a report's status / action taken
app.patch('/api/admin/abuse-reports/:id', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { status, actionTaken } = req.body;
    const report = await AbuseReport.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (status && ['open', 'investigating', 'actioned', 'dismissed'].includes(status)) report.status = status;
    if (actionTaken !== undefined) report.actionTaken = actionTaken;
    report.updatedAt = new Date();
    await report.save();
    res.json({ success: true, report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Suspend a flagged customer's Voice subscription (action on confirmed abuse)
app.post('/api/admin/abuse-reports/suspend-customer', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const dom = (req.body.domain || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'Domain required.' });
    let auth;
    try { auth = await getUsaAuth(); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const reseller = google.reseller({ version: 'v1', auth });
    const subResp = await reseller.subscriptions.list({ customerId: dom });
    const voiceSkus = ['1010330003', '1010330004', '1010330002'];
    const subs = (subResp.data.subscriptions || []).filter((s) => voiceSkus.includes(String(s.skuId)));
    let suspended = 0;
    for (const s of subs) {
      try { await reseller.subscriptions.suspend({ customerId: dom, subscriptionId: s.skuId }); suspended++; } catch (_) { }
    }
    // Mark related open reports as actioned
    await AbuseReport.updateMany({ domain: dom, status: { $in: ['open', 'investigating'] } }, { $set: { status: 'actioned', actionTaken: 'suspended', updatedAt: new Date() } });
    res.json({ success: true, suspended, message: `Suspended ${suspended} Voice subscription(s) for ${dom}.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ==================== ABUSE TRACKING end ====================

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

// Check a Nicky payment's status directly (reliable fallback when webhooks aren't firing).
// Call this when the customer returns, or poll it. If paid, it provisions the order.
async function checkNickyPaymentStatus(payment) {
  if (!payment || (!payment.providerRef && !payment.providerShortId)) return { paid: false, reason: 'no provider reference' };
  const token = process.env.NICKY_API_TOKEN;
  const base = process.env.NICKY_API_BASE || 'https://api-public.pay.nicky.me';
  const guid = payment.providerRef;
  const shortId = payment.providerShortId;

  // Endpoints confirmed from Nicky's official plugin source:
  //   GET /api/public/PaymentRequestPublicApi/get-by-short-id?shortId=<shortId>
  //   GET /api/public/PaymentRequestPublicApi/get-by-id?id=<guid>
  // Auth header: x-api-key. Paid status string: "Finished". Cancelled: "Canceled".
  const tryUrls = [];
  if (shortId) tryUrls.push(`${base}/api/public/PaymentRequestPublicApi/get-by-short-id?shortId=${encodeURIComponent(shortId)}`);
  if (guid) tryUrls.push(`${base}/api/public/PaymentRequestPublicApi/get-by-id?id=${encodeURIComponent(guid)}`);

  for (const u of tryUrls) {
    try {
      const resp = await fetch(u, { headers: { 'x-api-key': token, 'Accept': 'application/json' } });
      const bodyText = await resp.text();
      console.log(`NICKY STATUS ${u} → HTTP ${resp.status} body: ${bodyText.slice(0, 200)}`);
      if (!resp.ok) continue;
      let data; try { data = JSON.parse(bodyText); } catch (_) { continue; }
      const status = (data.status || data.bill?.status || '').toString();
      console.log('NICKY STATUS resolved →', status);
      // "Finished" = paid (per Nicky's official plugin)
      if (status === 'Finished') {
        if (payment.status !== 'paid') await markPaidAndProvision(payment);
        return { paid: true, status };
      }
      if (status === 'Canceled') return { paid: false, status, cancelled: true };
      return { paid: false, status };
    } catch (e) {
      console.log(`NICKY STATUS ${u} → error ${e.message}`);
      continue;
    }
  }
  return { paid: false, reason: 'status endpoint not reachable' };
}

// Admin: manually mark a payment as paid + provision (for payments confirmed on the provider
// side but not auto-caught, e.g. before the webhook was configured). Use carefully.
app.post('/api/admin/payments/mark-paid', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { paymentId, orderNumber } = req.body;
    let payment = null;
    if (paymentId) { try { payment = await Payment.findById(paymentId); } catch (_) { } }
    if (!payment && orderNumber) {
      const order = await WorkspaceOrder.findOne({ orderNumber });
      if (order) payment = await Payment.findOne({ orderId: order._id }).sort({ createdAt: -1 });
    }
    if (!payment) return res.status(404).json({ error: 'Payment not found. Provide a valid paymentId or orderNumber.' });
    if (payment.status === 'paid') return res.json({ success: true, alreadyPaid: true, message: 'Payment was already marked paid.' });
    await markPaidAndProvision(payment);
    res.json({ success: true, message: `Payment ${payment._id} marked paid and provisioning started.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer/endpoint: check a Nicky payment's status using Nicky's real status API.
app.get('/api/customer/payment-status/:paymentId', authenticateCustomer, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status === 'paid') return res.json({ paid: true, alreadyPaid: true });

    // Security: only the owner can check their own payment
    if (String(payment.customerId) !== String(req.customerId)) {
      return res.status(403).json({ error: 'Not your payment.' });
    }

    if (payment.method === 'nicky') {
      // Ask Nicky directly. Only "Finished" marks the order paid (+ provisions).
      const result = await checkNickyPaymentStatus(payment);
      if (result.paid) return res.json({ paid: true, via: 'api', status: result.status });
      if (result.cancelled) return res.json({ paid: false, cancelled: true, status: result.status });
      return res.json({ paid: false, status: result.status || 'pending' });
    }

    if (payment.method === 'stripe' && payment.providerRef) {
      // Verify directly with Stripe: is the checkout session paid?
      try {
        const stripe = await getStripeForMode();
        const session = await stripe.checkout.sessions.retrieve(payment.providerRef);
        console.log('STRIPE STATUS', payment.providerRef, '→', session.payment_status);
        if (session.payment_status === 'paid') {
          await markPaidAndProvision(payment);
          return res.json({ paid: true, via: 'stripe-api' });
        }
        return res.json({ paid: false, status: session.payment_status || 'pending' });
      } catch (e) {
        console.error('STRIPE STATUS check failed:', e.message);
        return res.json({ paid: false, status: 'pending' });
      }
    }

    res.json({ paid: payment.status === 'paid', status: payment.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// (legacy alias kept for safety) — Customer/endpoint: check my payment status
app.get('/api/customer/payment-status-legacy/:paymentId', authenticateCustomer, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status === 'paid') return res.json({ paid: true, alreadyPaid: true });
    if (payment.method === 'nicky') {
      const result = await checkNickyPaymentStatus(payment);
      return res.json(result);
    }
    res.json({ paid: payment.status === 'paid', status: payment.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Nicky webhook — Nicky notifies us when crypto payment completes
app.post('/api/webhooks/nicky', async (req, res) => {
  try {
    console.log('NICKY WEBHOOK:', JSON.stringify(req.body));
    const b = req.body || {};
    // Nicky's real webhook format: { WebHookType: 'PaymentRequest_StatusChanged', ItemId: <guid>, Data: { NewStatus: 'Finished' } }
    const webhookType = b.WebHookType || b.webHookType || b.webhookType || '';
    const newStatus = b.Data?.NewStatus || b.data?.newStatus || b.status || '';
    const itemId = b.ItemId || b.itemId || b.id || '';
    // Also support a flatter format (invoiceReference / shortId) just in case.
    const invoiceRef = b.invoiceReference || b.bill?.invoiceReference || b.reference;
    const shortIdIn = b.shortId || b.bill?.shortId;

    const isFinished = newStatus === 'Finished' || /finished|paid|completed|confirmed/i.test(String(newStatus));

    if (isFinished) {
      let payment = null;
      // 1) Match by Nicky GUID (ItemId) stored in providerRef
      if (itemId) payment = await Payment.findOne({ providerRef: itemId }).sort({ createdAt: -1 });
      // 2) Match by shortId
      if (!payment && shortIdIn) payment = await Payment.findOne({ providerShortId: shortIdIn }).sort({ createdAt: -1 });
      // 3) Match by our order number (invoiceReference)
      if (!payment && invoiceRef) {
        const order = await WorkspaceOrder.findOne({ orderNumber: invoiceRef });
        if (order) payment = await Payment.findOne({ orderId: order._id }).sort({ createdAt: -1 });
        if (!payment) { try { payment = await Payment.findById(invoiceRef); } catch (_) { } }
      }
      if (payment) {
        await markPaidAndProvision(payment);
        console.log('NICKY WEBHOOK: payment marked paid + provisioned:', String(payment._id));
      } else {
        console.error('NICKY WEBHOOK: Finished but no matching payment. itemId=', itemId, 'shortId=', shortIdIn, 'invoiceRef=', invoiceRef);
      }
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
      namecheapMode: s.namecheapMode || 'sandbox',
      stripePublishableTest: s.stripePublishableTest || '',
      stripePublishableLive: s.stripePublishableLive || '',
      feeEnabled: !!s.feeEnabled,
      feeFixed: s.feeFixed || 0,
      feePercent: s.feePercent || 0,
      taxEnabled: !!s.taxEnabled,
      taxPercent: s.taxPercent || 0,
      taxLabel: s.taxLabel || 'Tax',
      // secrets live in Railway env vars (Option A) — report whether each is configured
      stripeTestSecretConfigured: !!process.env.STRIPE_SECRET_KEY_TEST,
      stripeLiveSecretConfigured: !!process.env.STRIPE_SECRET_KEY,
      stripeWebhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
      nickyConfigured: !!process.env.NICKY_API_TOKEN,
      namecheapConfigured: !!(process.env.NAMECHEAP_API_KEY && process.env.NAMECHEAP_API_USER && process.env.NAMECHEAP_CLIENT_IP),
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
    if (b.namecheapMode && ['sandbox', 'live'].includes(b.namecheapMode)) { s.namecheapMode = b.namecheapMode; _ncSandboxCache = (b.namecheapMode === 'sandbox'); }
    if (b.stripePublishableTest !== undefined) s.stripePublishableTest = b.stripePublishableTest;
    if (b.stripePublishableLive !== undefined) s.stripePublishableLive = b.stripePublishableLive;
    if (b.feeEnabled !== undefined) s.feeEnabled = !!b.feeEnabled;
    if (b.feeFixed !== undefined) s.feeFixed = Number(b.feeFixed) || 0;
    if (b.feePercent !== undefined) s.feePercent = Number(b.feePercent) || 0;
    if (b.taxEnabled !== undefined) s.taxEnabled = !!b.taxEnabled;
    if (b.taxPercent !== undefined) s.taxPercent = Number(b.taxPercent) || 0;
    if (b.taxLabel !== undefined) s.taxLabel = b.taxLabel || 'Tax';
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

// Apply tax (and optional processing fee) to a subtotal. Works for BOTH Stripe and crypto,
// since it adjusts the amount BEFORE the checkout session/payment is created.
// Returns { subtotal, tax, fee, total, taxPercent, taxLabel }.
async function applyTaxAndFee(subtotal) {
  const s = await PaymentSettings.findOne({ singleton: 'main' });
  const taxPercent = s && s.taxEnabled ? (Number(s.taxPercent) || 0) : 0;
  const taxLabel = (s && s.taxLabel) || 'Tax';
  const fee = (s && s.feeEnabled) ? ((Number(s.feeFixed) || 0) + (Number(s.feePercent) || 0) / 100 * subtotal) : 0;
  const tax = taxPercent / 100 * (subtotal + fee);
  const round = (n) => Math.round(n * 100) / 100;
  const total = round(subtotal + fee + tax);
  console.log(`TAX/FEE: subtotal=${subtotal} taxEnabled=${s?.taxEnabled} taxPercent=${taxPercent}% tax=${round(tax)} fee=${round(fee)} → total=${total}`);
  return { subtotal: round(subtotal), tax: round(tax), fee: round(fee), total, taxPercent, taxLabel };
}

// Admin: diagnose tax/fee — shows current settings + a sample calculation on $100.
app.get('/api/admin/tax-diagnostic', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const s = await PaymentSettings.findOne({ singleton: 'main' });
    const sample = await applyTaxAndFee(100);
    res.json({
      settings: {
        taxEnabled: !!s?.taxEnabled,
        taxPercent: s?.taxPercent ?? 0,
        taxLabel: s?.taxLabel || 'Tax',
        feeEnabled: !!s?.feeEnabled,
        feePercent: s?.feePercent ?? 0,
        feeFixed: s?.feeFixed ?? 0,
      },
      sampleOn100: sample,
      note: sample.tax > 0 ? 'Tax IS being applied.' : 'Tax is NOT applied — either disabled or 0%.',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
// ==================== NAMECHEAP API CLIENT ====================
// Domains (check/register/renew), SSL, pricing via Namecheap's XML API.
// Env: NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME, NAMECHEAP_CLIENT_IP,
//      NAMECHEAP_SANDBOX ('true'/'false'), NAMECHEAP_MARKUP_PERCENT
const ncParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: true });

// Cached Namecheap sandbox mode (refreshed from DB). Defaults to env var.
let _ncSandboxCache = null;
async function ncResolveSandbox() {
  try {
    const s = await PaymentSettings.findOne({ singleton: 'main' });
    if (s && s.namecheapMode) { _ncSandboxCache = (s.namecheapMode === 'sandbox'); return _ncSandboxCache; }
  } catch (_) { }
  // Fall back to env var
  return String(process.env.NAMECHEAP_SANDBOX || 'true').toLowerCase() === 'true';
}

function ncConfig() {
  // Use cached DB mode if available, else env var.
  const sandbox = _ncSandboxCache != null ? _ncSandboxCache : (String(process.env.NAMECHEAP_SANDBOX || 'true').toLowerCase() === 'true');
  // Parse default markup robustly: ignore empty/blank/invalid env values, fall back to 20.
  let markup = 20;
  const rawMarkup = process.env.NAMECHEAP_MARKUP_PERCENT;
  if (rawMarkup != null && String(rawMarkup).trim() !== '' && !isNaN(Number(rawMarkup))) {
    markup = Number(rawMarkup);
  }
  return {
    sandbox,
    baseUrl: sandbox ? 'https://api.sandbox.namecheap.com/xml.response' : 'https://api.namecheap.com/xml.response',
    apiUser: process.env.NAMECHEAP_API_USER || '',
    apiKey: process.env.NAMECHEAP_API_KEY || '',
    userName: process.env.NAMECHEAP_USERNAME || process.env.NAMECHEAP_API_USER || '',
    clientIp: process.env.NAMECHEAP_CLIENT_IP || '',
    markupPercent: markup,
  };
}

// Outbound IP detection. Railway rotates between several shared IPs, so we re-detect
// periodically (cache for 5 min) rather than caching forever. Whitelist ALL Railway IPs in Namecheap.
let _ncOutboundIp = null;
let _ncOutboundIpAt = 0;
async function ncGetOutboundIp() {
  // Fixed env IP always wins (use only if you have a static IP).
  if (process.env.NAMECHEAP_CLIENT_IP) return process.env.NAMECHEAP_CLIENT_IP;
  const fresh = _ncOutboundIp && (Date.now() - _ncOutboundIpAt < 5 * 60 * 1000);
  if (fresh) return _ncOutboundIp;
  try {
    const r = await axios.get('https://api.ipify.org?format=json', { timeout: 8000 });
    _ncOutboundIp = r.data.ip;
    _ncOutboundIpAt = Date.now();
    console.log('NAMECHEAP outbound IP detected:', _ncOutboundIp);
  } catch (_) { /* keep last known */ }
  return _ncOutboundIp || '';
}

async function ncCall(command, params = {}) {
  await ncResolveSandbox(); // refresh sandbox/live mode from admin setting
  const cfg = ncConfig();
  const clientIp = cfg.clientIp || await ncGetOutboundIp();
  if (!cfg.apiUser || !cfg.apiKey || !clientIp) {
    return { ok: false, error: 'Namecheap not configured: set NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_CLIENT_IP.' };
  }
  const query = new URLSearchParams({
    ApiUser: cfg.apiUser, ApiKey: cfg.apiKey, UserName: cfg.userName,
    ClientIp: clientIp, Command: command, ...params,
  });
  const url = `${cfg.baseUrl}?${query.toString()}`;
  try {
    console.log('NAMECHEAP CALL ->', command, '| sandbox:', cfg.sandbox, '| clientIp:', clientIp);
    const resp = await axios.get(url, { timeout: 30000, responseType: 'text' });
    const parsed = ncParser.parse(resp.data);
    const api = parsed.ApiResponse;
    if (!api) return { ok: false, error: 'Unexpected Namecheap response.', raw: resp.data };
    if (api['@_Status'] === 'ERROR') {
      let msg = 'Namecheap API error.';
      const errs = api.Errors?.Error;
      if (errs) msg = Array.isArray(errs) ? errs.map((e) => e['#text'] || e).join('; ') : (errs['#text'] || errs);
      console.error('NAMECHEAP ERROR <-', msg);
      return { ok: false, error: msg, raw: parsed };
    }
    return { ok: true, data: api.CommandResponse, raw: parsed };
  } catch (e) {
    const detail = e.response?.data ? String(e.response.data).slice(0, 300) : e.message;
    return { ok: false, error: 'Namecheap request failed: ' + detail };
  }
}

// Apply pricing: fixed override wins; else markup % (override or default) on cost.
function ncApplyPricing(cost, markupPercentOverride, fixedPriceOverride) {
  const baseCost = Number(cost);
  if (isNaN(baseCost)) return 0;
  // Fixed price override wins.
  if (fixedPriceOverride != null && fixedPriceOverride !== '' && !isNaN(Number(fixedPriceOverride))) {
    return Number(Number(fixedPriceOverride).toFixed(2));
  }
  // Resolve the markup %: per-item override, else the env default.
  let pct;
  if (markupPercentOverride != null && markupPercentOverride !== '' && !isNaN(Number(markupPercentOverride))) {
    pct = Number(markupPercentOverride);
  } else {
    // Robustly parse the env default (strip %, spaces, etc.). Default 20 if unparseable.
    const raw = String(process.env.NAMECHEAP_MARKUP_PERCENT || '').replace(/[^0-9.]/g, '');
    pct = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : 20;
  }
  const result = Number((baseCost * (1 + pct / 100)).toFixed(2));
  console.log(`NC PRICING: cost=${baseCost} + markup ${pct}% → ${result} (envMarkup=${process.env.NAMECHEAP_MARKUP_PERCENT || 'unset'})`);
  return result;
}

async function ncCheckDomains(domainList) {
  const list = Array.isArray(domainList) ? domainList.join(',') : domainList;
  const r = await ncCall('namecheap.domains.check', { DomainList: list });
  if (!r.ok) return r;
  let results = r.data?.DomainCheckResult || [];
  if (!Array.isArray(results)) results = [results];
  return {
    ok: true,
    domains: results.map((d) => ({
      domain: d['@_Domain'],
      available: d['@_Available'] === true || d['@_Available'] === 'true',
      isPremium: d['@_IsPremiumName'] === true || d['@_IsPremiumName'] === 'true',
      premiumPrice: d['@_PremiumRegistrationPrice'] ? Number(d['@_PremiumRegistrationPrice']) : null,
    })),
  };
}

// Cache TLD pricing (cost rarely changes) for 1 hour to speed up multi-TLD search.
const _ncPriceCache = {};
async function ncGetTldPricing(tld, actionName = 'REGISTER') {
  const cacheKey = `${tld}:${actionName}`;
  const cached = _ncPriceCache[cacheKey];
  if (cached && (Date.now() - cached.at < 60 * 60 * 1000)) return cached.val;
  const r = await ncCall('namecheap.users.getPricing', {
    ProductType: 'DOMAIN', ProductCategory: actionName.toLowerCase(),
    ActionName: actionName, ProductName: tld,
  });
  if (!r.ok) return r;
  try {
    const categories = r.data.UserGetPricingResult.ProductType.ProductCategory;
    const cats = Array.isArray(categories) ? categories : [categories];
    for (const cat of cats) {
      let products = cat.Product;
      if (!products) continue;
      products = Array.isArray(products) ? products : [products];
      for (const p of products) {
        if (String(p['@_Name']).toLowerCase() === String(tld).toLowerCase()) {
          let prices = p.Price;
          prices = Array.isArray(prices) ? prices : [prices];
          const oneYear = prices.find((pr) => Number(pr['@_Duration']) === 1) || prices[0];
          // Namecheap returns several price fields. YourPrice = your reseller cost (what we mark up).
          // Price = the standard price. Prefer YourPrice, then Price, then RegularPrice.
          const yourPrice = oneYear['@_YourPrice'] != null ? Number(oneYear['@_YourPrice']) : null;
          const price = oneYear['@_Price'] != null ? Number(oneYear['@_Price']) : null;
          const regular = oneYear['@_RegularPrice'] != null ? Number(oneYear['@_RegularPrice']) : null;
          const cost = (yourPrice != null && yourPrice > 0) ? yourPrice
            : (price != null && price > 0) ? price
              : (regular || 0);
          console.log(`NC PRICING ${tld} ${actionName}: YourPrice=${yourPrice} Price=${price} Regular=${regular} → cost used=${cost}`);
          const val = { ok: true, cost, currency: oneYear['@_Currency'] || 'USD' };
          _ncPriceCache[cacheKey] = { at: Date.now(), val };
          return val;
        }
      }
    }
  } catch (e) { return { ok: false, error: 'Could not parse pricing: ' + e.message }; }
  return { ok: false, error: 'Pricing not found for TLD ' + tld };
}

// Format a phone into Namecheap's required format: +NNN.NNNNNNNNNN (country code . number).
function ncFormatPhone(phone, country) {
  let raw = String(phone || '').trim();
  if (!raw) return '+1.0000000000';
  // If already in +NNN.NNN format, keep it.
  if (/^\+\d{1,3}\.\d{6,14}$/.test(raw)) return raw;
  // Strip everything except digits and a leading +
  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/[^\d]/g, '');
  // Determine country calling code
  const codes = { US: '1', CA: '1', GB: '44', UK: '44', PK: '92', IN: '91', AU: '61', DE: '49', FR: '33', AE: '971' };
  let cc = '1';
  if (hasPlus) {
    // Try to split a leading country code (1-3 digits). Default to 1.
    // Common: 1 (NANP), 92 (PK), 44 (UK), 91 (IN)...
    for (const len of [3, 2, 1]) {
      const maybe = digits.slice(0, len);
      if (Object.values(codes).includes(maybe)) { cc = maybe; digits = digits.slice(len); break; }
    }
  } else {
    cc = codes[(country || 'US').toUpperCase()] || '1';
    // If the number itself starts with the country code, drop it to avoid duplication
    if (digits.startsWith(cc) && digits.length > 10) digits = digits.slice(cc.length);
  }
  // Namecheap wants at least ~7 digits in the number part
  if (digits.length < 7) digits = (digits + '0000000').slice(0, 10);
  return `+${cc}.${digits}`;
}

// Normalize a 2-letter country code (Namecheap requires ISO-2 like "US").
function ncCountryCode(country) {
  const c = String(country || '').trim();
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  const map = { 'united states': 'US', 'usa': 'US', 'pakistan': 'PK', 'united kingdom': 'GB', 'uk': 'GB', 'india': 'IN', 'canada': 'CA', 'australia': 'AU', 'germany': 'DE', 'france': 'FR' };
  return map[c.toLowerCase()] || 'US';
}

async function ncRegisterDomain(domainName, years, contact) {
  const country = ncCountryCode(contact.country);
  const c = {
    FirstName: contact.firstName || 'Domain', LastName: contact.lastName || 'Owner',
    Address1: contact.address || 'N/A', City: contact.city || 'N/A',
    StateProvince: contact.state || 'N/A', PostalCode: contact.zip || '00000',
    Country: country, Phone: ncFormatPhone(contact.phone, country), EmailAddress: contact.email,
  };
  const roles = ['Registrant', 'Tech', 'Admin', 'AuxBilling'];
  const params = { DomainName: domainName, Years: years || 1 };
  for (const role of roles) {
    params[`${role}FirstName`] = c.FirstName; params[`${role}LastName`] = c.LastName;
    params[`${role}Address1`] = c.Address1; params[`${role}City`] = c.City;
    params[`${role}StateProvince`] = c.StateProvince; params[`${role}PostalCode`] = c.PostalCode;
    params[`${role}Country`] = c.Country; params[`${role}Phone`] = c.Phone; params[`${role}EmailAddress`] = c.EmailAddress;
  }
  const r = await ncCall('namecheap.domains.create', params);
  if (!r.ok) return r;
  const result = r.data?.DomainCreateResult;
  return {
    ok: true,
    registered: result?.['@_Registered'] === true || result?.['@_Registered'] === 'true',
    domainId: result?.['@_DomainID'], chargedAmount: result?.['@_ChargedAmount'], domain: result?.['@_Domain'],
  };
}

async function ncRenewDomain(domainName, years) {
  const r = await ncCall('namecheap.domains.renew', { DomainName: domainName, Years: years || 1 });
  if (!r.ok) return r;
  const result = r.data?.DomainRenewResult;
  return { ok: true, renewed: !!result, domainId: result?.['@_DomainID'], chargedAmount: result?.['@_ChargedAmount'] };
}

// ---- DOMAIN TRANSFER (IN) ----
// Transfer a domain INTO our Namecheap account from another registrar.
// Requires the EPP/auth code from the current registrar, and the domain to be unlocked there.
async function ncCreateTransfer(domain, eppCode, years) {
  const r = await ncCall('namecheap.domains.transfer.create', {
    DomainName: domain,
    Years: years || 1,
    EPPCode: eppCode,
  });
  if (!r.ok) return r;
  const result = r.data?.DomainTransferCreateResult;
  return {
    ok: true,
    transferId: result?.['@_TransferID'],
    statusId: result?.['@_StatusID'],
    success: result?.['@_IsSuccess'] === true || result?.['@_IsSuccess'] === 'true',
    chargedAmount: result?.['@_ChargedAmount'],
  };
}

// Get TRANSFER pricing for a TLD (transfer price ≈ register price for most TLDs, includes 1yr).
async function ncGetTransferPricing(tld) {
  return ncGetTldPricing(tld, 'TRANSFER');
}

// ---- TRANSFER OUT (give the customer their EPP code + unlock) ----
// Get the EPP/auth code so the customer can transfer the domain away.
async function ncGetEppCode(domain) {
  // Namecheap returns the EPP code via getInfo (WhoisGuard/Modificationrights section) — use getRegistrarLock + info.
  const r = await ncCall('namecheap.domains.getInfo', { DomainName: domain });
  if (!r.ok) return r;
  // The EPP code isn't always returned by getInfo; Namecheap emails it on request for security.
  return { ok: true, note: 'requested' };
}

// Lock or unlock the domain (must be UNLOCKED to transfer out).
async function ncSetRegistrarLock(domain, lock) {
  const r = await ncCall('namecheap.domains.setRegistrarLock', { DomainName: domain, LockAction: lock ? 'LOCK' : 'UNLOCK' });
  if (!r.ok) return r;
  return { ok: true, locked: lock };
}

async function ncGetRegistrarLock(domain) {
  const r = await ncCall('namecheap.domains.getRegistrarLock', { DomainName: domain });
  if (!r.ok) return r;
  const result = r.data?.DomainGetRegistrarLockResult;
  return { ok: true, locked: result?.['@_RegistrarLockStatus'] === true || result?.['@_RegistrarLockStatus'] === 'true' };
}


// ---- DNS MANAGEMENT ----
function splitDomain(domain) {
  const parts = String(domain).toLowerCase().split('.');
  return { sld: parts[0], tld: parts.slice(1).join('.') };
}

// Get the current DNS host records for a domain.
async function ncGetDnsHosts(domain) {
  const { sld, tld } = splitDomain(domain);
  const r = await ncCall('namecheap.domains.dns.getHosts', { SLD: sld, TLD: tld });
  if (!r.ok) return r;
  let hosts = r.data?.DomainDNSGetHostsResult?.host || [];
  if (!Array.isArray(hosts)) hosts = hosts ? [hosts] : [];
  const usingOurDns = r.data?.DomainDNSGetHostsResult?.['@_IsUsingOurDNS'] === true || r.data?.DomainDNSGetHostsResult?.['@_IsUsingOurDNS'] === 'true';
  return {
    ok: true,
    usingNamecheapDns: usingOurDns,
    hosts: hosts.map((h) => ({
      hostId: h['@_HostId'],
      name: h['@_Name'],
      type: h['@_Type'],
      address: h['@_Address'],
      mxPref: h['@_MXPref'],
      ttl: h['@_TTL'],
    })),
  };
}

// Replace ALL host records for a domain (Namecheap's setHosts overwrites the full set).
// hosts = [{ name, type, address, mxPref, ttl }]
async function ncSetDnsHosts(domain, hosts) {
  const { sld, tld } = splitDomain(domain);
  const params = { SLD: sld, TLD: tld };
  let hasMx = false;
  hosts.forEach((h, i) => {
    const n = i + 1;
    // Host name: '@' for root. Trim and default.
    let host = String(h.name || '@').trim() || '@';
    // Record type
    const type = String(h.type || 'A').trim().toUpperCase();
    // Address/value: trim. For CNAME/MX/NS, Namecheap wants a trailing dot tolerated; leave as-is.
    let address = String(h.address || '').trim();
    params[`HostName${n}`] = host;
    params[`RecordType${n}`] = type;
    params[`Address${n}`] = address;
    // TTL: Namecheap minimum is 60; default 1800.
    let ttl = Number(h.ttl) || 1800;
    if (ttl < 60) ttl = 60;
    params[`TTL${n}`] = ttl;
    // MX records need a priority and the domain's EmailType must be MX.
    if (type === 'MX') { params[`MXPref${n}`] = Number(h.mxPref) || 10; hasMx = true; }
  });
  // Tell Namecheap how to route email: MX if any MX records, else default (no email handling).
  params.EmailType = hasMx ? 'MX' : 'FWD';
  const r = await ncCall('namecheap.domains.dns.setHosts', params);
  if (!r.ok) return r;
  const result = r.data?.DomainDNSSetHostsResult;
  const success = result?.['@_IsSuccess'] === true || result?.['@_IsSuccess'] === 'true';
  if (!success) {
    // Surface any warnings Namecheap returned
    let warn = '';
    try { const w = result?.Warnings?.Warning; if (w) warn = Array.isArray(w) ? w.map(x => x['#text'] || x).join('; ') : (w['#text'] || w); } catch (_) { }
    return { ok: false, error: warn || 'Namecheap did not confirm the DNS update. Check the record values.' };
  }
  return { ok: true, success: true };
}

// Get nameservers for a domain.
async function ncGetNameservers(domain) {
  const { sld, tld } = splitDomain(domain);
  const r = await ncCall('namecheap.domains.dns.getList', { SLD: sld, TLD: tld });
  if (!r.ok) return r;
  const result = r.data?.DomainDNSGetListResult;
  let ns = result?.Nameserver || [];
  if (!Array.isArray(ns)) ns = ns ? [ns] : [];
  return {
    ok: true,
    usingNamecheapDns: result?.['@_IsUsingOurDNS'] === true || result?.['@_IsUsingOurDNS'] === 'true',
    nameservers: ns.map((n) => (typeof n === 'string' ? n : n['#text'] || n)),
  };
}

// Set custom nameservers for a domain.
async function ncSetNameservers(domain, nameservers) {
  const { sld, tld } = splitDomain(domain);
  const r = await ncCall('namecheap.domains.dns.setCustom', { SLD: sld, TLD: tld, Nameservers: nameservers.join(',') });
  if (!r.ok) return r;
  return { ok: true, success: true };
}

// Reset a domain to Namecheap's DEFAULT (BasicDNS) nameservers.
async function ncSetDefaultNameservers(domain) {
  const { sld, tld } = splitDomain(domain);
  const r = await ncCall('namecheap.domains.dns.setDefault', { SLD: sld, TLD: tld });
  if (!r.ok) return r;
  return { ok: true, success: true };
}

// ---- DOMAIN TRANSFER (transfer IN / import to Namecheap) ----
// Transfer a domain INTO the Namecheap account. Requires the EPP/Auth code from the
// losing registrar. Years=1 means it includes a 1-year renewal (standard).
async function ncTransferCreate(domain, years, eppCode) {
  // EPP codes with special chars must be base64-encoded as "base64:<code>"
  const hasSpecial = /[^A-Za-z0-9]/.test(eppCode);
  const epp = hasSpecial ? 'base64:' + Buffer.from(eppCode, 'utf8').toString('base64') : eppCode;
  const r = await ncCall('namecheap.domains.transfer.create', {
    DomainName: domain, Years: years || 1, EPPCode: epp,
  });
  if (!r.ok) return r;
  const result = r.data?.DomainTransferCreateResult;
  return {
    ok: true,
    transferId: result?.['@_TransferID'],
    success: result?.['@_Transfer'] === true || result?.['@_Transfer'] === 'true' || !!result?.['@_TransferID'],
    statusId: result?.['@_StatusID'],
    chargedAmount: result?.['@_ChargedAmount'],
  };
}

// Get the status of a transfer by its TransferID.
async function ncTransferStatus(transferId) {
  const r = await ncCall('namecheap.domains.transfer.getStatus', { TransferID: transferId });
  if (!r.ok) return r;
  const result = r.data?.DomainTransferGetStatusResult;
  return { ok: true, status: result?.['@_Status'], statusId: result?.['@_StatusID'] };
}

// Get the EPP/auth code for a domain we hold (for transfer OUT to another registrar).
// Note: Namecheap's API does not expose EPP retrieval; this returns guidance instead.
async function ncGetEppGuidance(domain) {
  // There is no public API to fetch the EPP code; the customer must request it via the
  // Namecheap dashboard or support. We unlock + point them there.
  return { ok: true, viaDashboard: true };
}

// ---- REGISTRANT CONTACT VERIFICATION (ICANN RAA email verification) ----
// Get the verification status of a domain's registrant email.
async function ncGetVerificationStatus(domain) {
  // Namecheap: namecheap.domains.getRegistrantVerificationStatus (DomainName param)
  const r = await ncCall('namecheap.domains.getRegistrantVerificationStatus', { DomainName: domain });
  if (!r.ok) return r;
  // Response: DomainGetRegistrantVerificationStatusResult with @Status and @Verified-ish fields.
  const result = r.data?.DomainGetRegistrantVerificationStatusResult || r.data;
  let list = result?.DomainResult || result;
  if (Array.isArray(list)) list = list[0];
  const status = (list?.['@_Status'] || result?.['@_Status'] || '').toString();
  const verified = /verified|true/i.test(status);
  return { ok: true, status: status || 'Unknown', verified };
}

// Resend the registrant verification email.
async function ncResendVerification(domain) {
  const r = await ncCall('namecheap.domains.resendRegistrantVerificationEmail', { DomainName: domain });
  if (!r.ok) return r;
  const result = r.data?.DomainResendRegistrantVerificationEmailResult || r.data;
  let list = result?.DomainResult || result;
  if (Array.isArray(list)) list = list[0];
  const sent = list?.['@_IsSuccess'] === true || list?.['@_IsSuccess'] === 'true' || /true|success/i.test(JSON.stringify(result || ''));
  return { ok: true, sent };
}

// Get a domain's registrant contact details (so the customer can verify/update them).
async function ncGetContacts(domain) {
  const r = await ncCall('namecheap.domains.getContacts', { DomainName: domain });
  if (!r.ok) return r;
  const c = r.data?.DomainContactsResult?.Registrant || {};
  return {
    ok: true,
    contact: {
      firstName: c.FirstName, lastName: c.LastName,
      address: c.Address1, city: c.City, state: c.StateProvince,
      zip: c.PostalCode, country: c.Country, phone: c.Phone, email: c.EmailAddress,
    },
  };
}

// Update a domain's contacts (all 4 roles set to the same info, like registration).
async function ncSetContacts(domain, contact) {
  const country = ncCountryCode(contact.country);
  const c = {
    FirstName: contact.firstName || 'Domain', LastName: contact.lastName || 'Owner',
    Address1: contact.address || 'N/A', City: contact.city || 'N/A',
    StateProvince: contact.state || 'N/A', PostalCode: contact.zip || '00000',
    Country: country, Phone: ncFormatPhone(contact.phone, country), EmailAddress: contact.email,
  };
  const roles = ['Registrant', 'Tech', 'Admin', 'AuxBilling'];
  const params = { DomainName: domain };
  for (const role of roles) {
    params[`${role}FirstName`] = c.FirstName; params[`${role}LastName`] = c.LastName;
    params[`${role}Address1`] = c.Address1; params[`${role}City`] = c.City;
    params[`${role}StateProvince`] = c.StateProvince; params[`${role}PostalCode`] = c.PostalCode;
    params[`${role}Country`] = c.Country; params[`${role}Phone`] = c.Phone; params[`${role}EmailAddress`] = c.EmailAddress;
  }
  const r = await ncCall('namecheap.domains.setContacts', params);
  if (!r.ok) return r;
  const result = r.data?.DomainSetContactResult;
  return { ok: true, success: result?.['@_IsSuccess'] === true || result?.['@_IsSuccess'] === 'true' };
}

async function ncListDomains(page = 1, pageSize = 50) {
  const r = await ncCall('namecheap.domains.getList', { Page: page, PageSize: pageSize });
  if (!r.ok) return r;
  let domains = r.data?.DomainGetListResult?.Domain || [];
  if (!Array.isArray(domains)) domains = [domains];
  return {
    ok: true,
    domains: domains.map((d) => ({
      id: d['@_ID'], name: d['@_Name'], created: d['@_Created'], expires: d['@_Expires'],
      isExpired: d['@_IsExpired'] === true || d['@_IsExpired'] === 'true',
      autoRenew: d['@_AutoRenew'] === true || d['@_AutoRenew'] === 'true',
    })),
  };
}

async function ncGetBalance() {
  const r = await ncCall('namecheap.users.getBalances');
  if (!r.ok) return r;
  const b = r.data?.UserGetBalancesResult;
  return { ok: true, currency: b?.['@_Currency'] || 'USD', availableBalance: Number(b?.['@_AvailableBalance'] || 0) };
}

async function ncGetSslPricing() {
  const r = await ncCall('namecheap.users.getPricing', { ProductType: 'SSLCERTIFICATE' });
  if (!r.ok) return r;
  try {
    const cat = r.data.UserGetPricingResult.ProductType.ProductCategory;
    const cats = Array.isArray(cat) ? cat : [cat];
    const out = [];
    for (const c of cats) {
      let products = c.Product;
      if (!products) continue;
      products = Array.isArray(products) ? products : [products];
      for (const p of products) {
        let prices = p.Price;
        prices = Array.isArray(prices) ? prices : [prices];
        const oneYear = prices.find((pr) => Number(pr['@_Duration']) === 1) || prices[0];
        out.push({ name: p['@_Name'], cost: Number(oneYear['@_Price']), currency: oneYear['@_Currency'] || 'USD' });
      }
    }
    return { ok: true, products: out };
  } catch (e) { return { ok: false, error: 'Could not parse SSL pricing: ' + e.message }; }
}

async function ncPurchaseSsl(type, years) {
  const r = await ncCall('namecheap.ssl.create', { Type: type, Years: years || 1 });
  if (!r.ok) return r;
  const result = r.data?.SSLCreateResult;
  return { ok: true, created: !!result, certificateId: result?.['@_CertificateID'], chargedAmount: result?.['@_ChargedAmount'] };
}

// Compute the customer-facing price for a TLD, applying admin overrides.
async function ncCustomerPriceForTld(tld, cost) {
  const override = await NcPricing.findOne({ kind: 'tld', key: tld.toLowerCase(), active: true });
  const price = ncApplyPricing(cost, override?.markupPercent, override?.fixedPrice);
  const envPct = String(process.env.NAMECHEAP_MARKUP_PERCENT || '(unset→20)');
  console.log(`PRICING ${tld}: cost=${cost} override=${override ? (override.fixedPrice != null ? 'fixed$' + override.fixedPrice : override.markupPercent + '%') : 'none'} envMarkup=${envPct} → customer=$${price}`);
  return price;
}

function tldOf(domain) {
  const parts = String(domain).toLowerCase().split('.');
  return parts.slice(1).join('.'); // handles co.uk etc. minimally as last parts
}

// ---- Customer: domain search (Namecheap) with customer pricing ----
app.post('/api/customer/nc/domains/search', authenticateCustomer, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Enter a domain or keyword.' });
    // If no TLD, check a set of popular TLDs; else check the exact domain.
    let domains = [];
    if (query.includes('.')) {
      domains = [query.toLowerCase().trim()];
    } else {
      const tlds = ['com', 'net', 'org', 'io', 'co', 'shop', 'store', 'online', 'site'];
      domains = tlds.map((t) => `${query.toLowerCase().trim()}.${t}`);
    }
    const check = await ncCheckDomains(domains);
    if (!check.ok) return res.status(502).json({ error: check.error });

    // Add pricing for available domains
    const out = [];
    for (const d of check.domains) {
      let price = null;
      if (d.available) {
        const tld = tldOf(d.domain);
        if (d.isPremium && d.premiumPrice) {
          price = ncApplyPricing(d.premiumPrice);
        } else {
          const pricing = await ncGetTldPricing(tld, 'REGISTER');
          if (pricing.ok) price = await ncCustomerPriceForTld(tld, pricing.cost);
        }
      }
      out.push({ domain: d.domain, available: d.available, isPremium: d.isPremium, price });
    }
    res.json({ results: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Customer: register a domain (creates order + payment) ----
// NOTE: Domain register/renew go through the pay-first endpoints
// /api/customer/domains/register and /api/customer/domains/renew (which create a Payment
// and only register on payment). The earlier /nc/domains/register & /renew endpoints were
// removed because they created orders without a payment ("no payment found").

// ---- Customer: list available SSL products with customer pricing ----
app.get('/api/customer/nc/ssl', authenticateCustomer, async (req, res) => {
  try {
    const ssl = await ncGetSslPricing();
    if (!ssl.ok) return res.status(502).json({ error: ssl.error });
    const overrides = await NcPricing.find({ kind: 'ssl', active: true });
    const omap = {}; overrides.forEach((o) => { omap[o.key] = o; });
    const products = ssl.products
      .map((p) => {
        const o = omap[p.name];
        const price = ncApplyPricing(p.cost, o?.markupPercent, o?.fixedPrice);
        return { name: p.name, price };
      })
      .filter((p) => p.price > 0);
    res.json({ products });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: buy an SSL certificate (pay-first; purchased via Namecheap on payment).
app.post('/api/customer/nc/ssl/buy', authenticateCustomer, async (req, res) => {
  try {
    const { productType, years, forDomain, method } = req.body;
    if (!productType) return res.status(400).json({ error: 'Choose an SSL product.' });
    const me = await Customer.findById(req.customerId);
    // Price it (with admin override)
    const ssl = await ncGetSslPricing();
    if (!ssl.ok) return res.status(502).json({ error: ssl.error });
    const prod = ssl.products.find((p) => p.name === productType);
    if (!prod) return res.status(400).json({ error: 'That SSL product is not available.' });
    const override = await NcPricing.findOne({ kind: 'ssl', key: productType, active: true });
    const sslSubtotal = ncApplyPricing(prod.cost, override?.markupPercent, override?.fixedPrice) * (Number(years) || 1);
    const sslTaxed = await applyTaxAndFee(sslSubtotal);
    const amount = sslTaxed.total;

    const orderNumber = `SSL-${Date.now()}`;
    const order = await SslOrder.create({
      customerId: me._id, orderNumber, productType, years: Number(years) || 1,
      price: amount, forDomain: (forDomain || '').toLowerCase().trim(), status: 'pending',
    });

    const payment = await Payment.create({
      customerId: me._id, customerEmail: me.businessEmail, domain: forDomain || '',
      orderId: order._id, orderType: 'ssl', amount, subtotal: sslTaxed.subtotal, tax: sslTaxed.tax, currency: 'USD',
      method: method === 'nicky' ? 'nicky' : 'stripe', status: 'pending',
    });

    const orderDesc = `SSL: ${productType} (${order.years} yr)`;
    const successUrl = `${FRONTEND_URL}/?payment=success&pid=${payment._id}`;
    const cancelUrl = `${FRONTEND_URL}/?payment=cancelled&pid=${payment._id}`;

    if (payment.method === 'stripe') {
      let stripe; try { stripe = await getStripeForMode(); } catch (e) { return res.status(500).json({ error: e.message }); }
      const sdoc = await PaymentSettings.findOne({ singleton: 'main' });
      payment.isTest = (sdoc?.stripeMode || 'test') !== 'live';
      await payment.save();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price_data: { currency: 'usd', product_data: { name: orderDesc }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
        success_url: successUrl, cancel_url: cancelUrl, client_reference_id: String(payment._id),
        metadata: { paymentId: String(payment._id), orderId: String(order._id), orderType: 'ssl' },
      });
      payment.providerRef = session.id; payment.checkoutUrl = session.url; await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id });
    }
    try {
      const nicky = await createNickyPayment({
        amount, currency: 'USD', description: orderDesc, orderNumber,
        reference: String(payment._id), billDescription: orderDesc,
        customerEmail: me.businessEmail, customerName: me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me.businessEmail,
        redirectUrl: successUrl, cancelUrl,
      });
      payment.checkoutUrl = nicky.url; payment.providerRef = nicky.nickyId || nicky.shortId || String(payment._id);
      payment.providerShortId = nicky.shortId || null; await payment.save();
      return res.json({ checkoutUrl: nicky.url, paymentId: payment._id });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: list MY SSL orders.
app.get('/api/customer/nc/ssl/orders', authenticateCustomer, async (req, res) => {
  try {
    const orders = await SslOrder.find({ customerId: req.customerId }).sort({ createdAt: -1 });
    res.json({
      orders: orders.map((o) => ({
        id: o._id, orderNumber: o.orderNumber, productType: o.productType, years: o.years,
        price: o.price, forDomain: o.forDomain, status: o.status, certificateId: o.certificateId,
        activationNote: o.activationNote, createdAt: o.createdAt,
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/customer/nc/hosting', authenticateCustomer, async (req, res) => {
  try {
    const plans = await HostingPlan.find({ active: true }).sort({ sortOrder: 1 });
    res.json({ plans: plans.map((p) => ({ planId: p.planId, name: p.name, description: p.description, price: p.price, billingCycle: p.billingCycle, features: p.features })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: buy a hosting plan (pay-first).
app.post('/api/customer/nc/hosting/buy', authenticateCustomer, async (req, res) => {
  try {
    const { planId, forDomain, method } = req.body;
    const plan = await HostingPlan.findOne({ planId, active: true });
    if (!plan) return res.status(404).json({ error: 'Hosting plan not found.' });
    const me = await Customer.findById(req.customerId);
    const subtotal = Number(plan.price || 0);
    if (subtotal <= 0) return res.status(400).json({ error: 'This plan is not available for purchase.' });
    const taxed = await applyTaxAndFee(subtotal);
    const amount = taxed.total;

    const orderNumber = `HO-${Date.now()}`;
    const order = await HostingOrder.create({
      customerId: me._id, orderNumber, planId: plan.planId, planName: plan.name,
      forDomain: (forDomain || '').toLowerCase().trim(), price: amount, billingCycle: plan.billingCycle, status: 'pending',
    });
    const payment = await Payment.create({
      customerId: me._id, customerEmail: me.businessEmail, domain: order.forDomain,
      orderId: order._id, orderType: 'hosting', amount, subtotal: taxed.subtotal, tax: taxed.tax, fee: taxed.fee, currency: 'USD',
      method: method === 'nicky' ? 'nicky' : 'stripe', status: 'pending',
    });

    const orderDesc = `Hosting: ${plan.name}${order.forDomain ? ' for ' + order.forDomain : ''}`;
    const successUrl = `${FRONTEND_URL}/?payment=success&pid=${payment._id}`;
    const cancelUrl = `${FRONTEND_URL}/?payment=cancelled&pid=${payment._id}`;

    if (payment.method === 'stripe') {
      let stripe;
      try { stripe = await getStripeForMode(); } catch (e) { return res.status(500).json({ error: e.message }); }
      const sd = await PaymentSettings.findOne({ singleton: 'main' });
      payment.isTest = (sd?.stripeMode || 'test') !== 'live';
      await payment.save();
      const line_items = [{ price_data: { currency: 'usd', product_data: { name: orderDesc }, unit_amount: Math.round(taxed.subtotal * 100) }, quantity: 1 }];
      if (taxed.fee > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: 'Processing fee' }, unit_amount: Math.round(taxed.fee * 100) }, quantity: 1 });
      if (taxed.tax > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: `${taxed.taxLabel} (${taxed.taxPercent}%)` }, unit_amount: Math.round(taxed.tax * 100) }, quantity: 1 });
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', line_items, success_url: successUrl, cancel_url: cancelUrl,
        client_reference_id: String(payment._id),
        metadata: { paymentId: String(payment._id), orderId: String(order._id), orderType: 'hosting' },
      });
      payment.providerRef = session.id; payment.checkoutUrl = session.url; await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id });
    }

    try {
      const nicky = await createNickyPayment({
        amount, currency: 'USD', description: orderDesc, orderNumber,
        reference: String(payment._id), billDescription: orderDesc,
        customerEmail: me.businessEmail, customerName: me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me.businessEmail,
        redirectUrl: successUrl, cancelUrl,
      });
      payment.checkoutUrl = nicky.url; payment.providerRef = nicky.nickyId || nicky.shortId || String(payment._id); payment.providerShortId = nicky.shortId || null;
      await payment.save();
      return res.json({ checkoutUrl: nicky.url, paymentId: payment._id });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: list their hosting orders.
app.get('/api/customer/nc/hosting/orders', authenticateCustomer, async (req, res) => {
  try {
    const orders = await HostingOrder.find({ customerId: req.customerId }).sort({ createdAt: -1 });
    res.json({ orders: orders.map((o) => ({ id: o._id, planName: o.planName, forDomain: o.forDomain, status: o.status, billingCycle: o.billingCycle, createdAt: o.createdAt })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: diagnose domain orders — see each order's status, payment status, and any error.
app.get('/api/admin/nc/domain-diagnostic', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const orders = await DomainOrder.find().sort({ createdAt: -1 }).limit(50);
    const out = [];
    for (const o of orders) {
      const payment = await Payment.findOne({ orderId: o._id, orderType: 'domain' }).sort({ createdAt: -1 });
      out.push({
        domain: o.domainName,
        orderStatus: o.status,
        paymentStatus: payment?.status || 'no-payment',
        paymentMethod: payment?.method,
        isTest: payment?.isTest,
        registeredAt: o.registeredAt,
        result: o.registrationResult ? String(o.registrationResult).slice(0, 200) : null,
        createdAt: o.createdAt,
      });
    }
    res.json({ orders: out, namecheapMode: (await PaymentSettings.findOne({ singleton: 'main' }))?.namecheapMode || 'sandbox' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Admin: show the server's current outbound IP (whitelist THIS in Namecheap) ----
app.get('/api/admin/nc/outbound-ip', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    _ncOutboundIp = null; // force fresh detection
    const ip = await ncGetOutboundIp();
    res.json({ outboundIp: ip, envClientIp: process.env.NAMECHEAP_CLIENT_IP || null, note: 'Whitelist this IP in Namecheap (Profile → Tools → API Access → Whitelisted IPs) and set it as NAMECHEAP_CLIENT_IP.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Admin: Namecheap balance ----
app.get('/api/admin/nc/balance', authenticateCustomer, requireAdmin, async (req, res) => {
  const b = await ncGetBalance();
  if (!b.ok) return res.status(502).json({ error: b.error });
  res.json(b);
});

// ---- Admin: TLD pricing (cost + your price) for common TLDs, with overrides ----
app.get('/api/admin/nc/tld-pricing', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const tlds = (req.query.tlds ? String(req.query.tlds).split(',') : ['com', 'net', 'org', 'io', 'co', 'shop', 'store', 'online', 'site', 'xyz']);
    const overrides = await NcPricing.find({ kind: 'tld' });
    const omap = {}; overrides.forEach((o) => { omap[o.key] = o; });
    const out = [];
    for (const tld of tlds) {
      const pricing = await ncGetTldPricing(tld, 'REGISTER');
      if (!pricing.ok) { out.push({ tld, error: pricing.error }); continue; }
      const o = omap[tld];
      out.push({
        tld, cost: pricing.cost,
        markupPercent: o?.markupPercent ?? null,
        fixedPrice: o?.fixedPrice ?? null,
        price: ncApplyPricing(pricing.cost, o?.markupPercent, o?.fixedPrice),
      });
    }
    res.json({ tlds: out, defaultMarkup: ncConfig().markupPercent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Admin: set pricing override (tld/ssl/hosting) ----
app.post('/api/admin/nc/pricing', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { kind, key, markupPercent, fixedPrice, label, cost } = req.body;
    if (!kind || !key) return res.status(400).json({ error: 'kind and key required.' });
    const doc = await NcPricing.findOneAndUpdate(
      { kind, key: String(key).toLowerCase() },
      { kind, key: String(key).toLowerCase(), label, markupPercent: markupPercent === '' ? null : markupPercent, fixedPrice: fixedPrice === '' ? null : fixedPrice, cost, active: true, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, pricing: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: list ALL SSL orders (manage/activate).
app.get('/api/admin/nc/ssl-orders', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const orders = await SslOrder.find().sort({ createdAt: -1 }).limit(500);
    const rows = [];
    for (const o of orders) {
      const cust = await Customer.findById(o.customerId);
      rows.push({
        id: o._id, orderNumber: o.orderNumber, productType: o.productType, years: o.years,
        price: o.price, forDomain: o.forDomain, status: o.status, certificateId: o.certificateId,
        activationNote: o.activationNote, customer: cust?.businessEmail || cust?.username, createdAt: o.createdAt,
      });
    }
    res.json({ orders: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: update an SSL order's status/note (e.g. mark active after activation).
app.post('/api/admin/nc/ssl-orders/:id', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { status, activationNote, certificateId } = req.body;
    const o = await SslOrder.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found.' });
    if (status) o.status = status;
    if (activationNote != null) o.activationNote = activationNote;
    if (certificateId != null) o.certificateId = certificateId;
    await o.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Admin: SSL pricing list with overrides ----
app.get('/api/admin/nc/ssl-pricing', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const ssl = await ncGetSslPricing();
    if (!ssl.ok) return res.status(502).json({ error: ssl.error });
    const overrides = await NcPricing.find({ kind: 'ssl' });
    const omap = {}; overrides.forEach((o) => { omap[o.key] = o; });
    const products = ssl.products.map((p) => {
      const o = omap[p.name];
      return { name: p.name, cost: p.cost, markupPercent: o?.markupPercent ?? null, fixedPrice: o?.fixedPrice ?? null, price: ncApplyPricing(p.cost, o?.markupPercent, o?.fixedPrice) };
    });
    res.json({ products, defaultMarkup: ncConfig().markupPercent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Admin: hosting plans CRUD ----
app.get('/api/admin/nc/hosting', authenticateCustomer, requireAdmin, async (req, res) => {
  const plans = await HostingPlan.find().sort({ sortOrder: 1 });
  res.json({ plans });
});
app.post('/api/admin/nc/hosting', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { planId, name, description, cost, price, billingCycle, features, active, sortOrder } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'name and price required.' });
    const id = planId || ('host_' + Date.now());
    const plan = await HostingPlan.findOneAndUpdate(
      { planId: id },
      { planId: id, name, description, cost, price, billingCycle: billingCycle || 'yearly', features: features || [], active: active !== false, sortOrder: sortOrder || 0 },
      { upsert: true, new: true }
    );
    res.json({ success: true, plan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete('/api/admin/nc/hosting/:planId', authenticateCustomer, requireAdmin, async (req, res) => {
  await HostingPlan.deleteOne({ planId: req.params.planId });
  res.json({ success: true });
});

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
// DomainNameAPI's contact "country" field is a 2-letter ISO code (placeholder was "st").
// Map common full names → ISO 3166-1 alpha-2. Falls back to first 2 letters uppercased.
const COUNTRY_TO_ISO = {
  "united states": "US", "united kingdom": "GB", "canada": "CA", "australia": "AU", "pakistan": "PK", "india": "IN",
  "germany": "DE", "france": "FR", "spain": "ES", "italy": "IT", "netherlands": "NL", "ireland": "IE", "new zealand": "NZ",
  "united arab emirates": "AE", "saudi arabia": "SA", "china": "CN", "japan": "JP", "south korea": "KR", "singapore": "SG",
  "malaysia": "MY", "indonesia": "ID", "philippines": "PH", "thailand": "TH", "vietnam": "VN", "bangladesh": "BD", "sri lanka": "LK",
  "turkey": "TR", "egypt": "EG", "nigeria": "NG", "kenya": "KE", "south africa": "ZA", "ghana": "GH", "brazil": "BR", "mexico": "MX",
  "argentina": "AR", "chile": "CL", "colombia": "CO", "peru": "PE", "poland": "PL", "sweden": "SE", "norway": "NO", "denmark": "DK",
  "finland": "FI", "switzerland": "CH", "austria": "AT", "belgium": "BE", "portugal": "PT", "greece": "GR", "czechia": "CZ",
  "romania": "RO", "hungary": "HU", "russia": "RU", "ukraine": "UA", "qatar": "QA", "kuwait": "KW", "bahrain": "BH", "oman": "OM",
  "jordan": "JO", "lebanon": "LB", "morocco": "MA", "tunisia": "TN", "nepal": "NP", "afghanistan": "AF",
};
function toIsoCountry(name) {
  if (!name) return 'US';
  const s = String(name).trim();
  if (s.length === 2) return s.toUpperCase();           // already a code
  const hit = COUNTRY_TO_ISO[s.toLowerCase()];
  if (hit) return hit;
  return s.slice(0, 2).toUpperCase();                   // last-resort fallback
}

// ===== DomainNameAPI SOAP client (official method, like their nodejs-dna library) =====
// Registration uses the SOAP API at whmcs.domainnameapi.com with username/password.
// Set DNA_USERNAME and DNA_PASSWORD (your domainnameapi.com login) in Railway.
let _dnaSoapClientPromise = null;
function getDnaSoapClient() {
  if (_dnaSoapClientPromise) return _dnaSoapClientPromise;
  const soap = require('strong-soap').soap;
  const wsdl = process.env.DNA_SOAP_WSDL || 'https://whmcs.domainnameapi.com/DomainApi.svc?singlewsdl';
  _dnaSoapClientPromise = new Promise((resolve, reject) => {
    soap.createClient(wsdl, { strictSSL: false, wsdl_options: { timeout: 20000 } }, (err, client) => {
      if (err) { _dnaSoapClientPromise = null; reject(new Error('SOAP connection error: ' + err.message)); }
      else resolve(client);
    });
  });
  return _dnaSoapClientPromise;
}

// Build a SOAP contact object from the customer profile (DomainNameAPI contact structure)
function buildDnaContact(customer) {
  return {
    FirstName: (customer.firstName || customer.username || 'Customer').trim(),
    LastName: (customer.lastName || customer.companyName || 'Owner').trim(),
    Company: (customer.companyName || 'N/A').trim(),
    EMail: customer.businessEmail || 'admin@example.com',
    AddressLine1: (customer.address || 'N/A').trim(),
    State: (customer.state || 'N/A').trim(),
    City: (customer.city || 'N/A').trim(),
    Country: toIsoCountry(customer.country),     // 2-letter ISO code
    ZipCode: (customer.postalCode || '00000').trim(),
    Phone: (customer.phone || '0000000000').toString().replace(/[^0-9]/g, '') || '0000000000',
    PhoneCountryCode: (customer.phoneCountryCode || '1').toString().replace(/[^0-9]/g, '') || '1',
    Fax: '',
    FaxCountryCode: '',
    Type: 'Contact',
  };
}

// Register a domain via the official SOAP RegisterWithContactInfo method
async function registerDomainViaApi(customer, domainName, period) {
  const dom = (domainName || '').toLowerCase().trim();
  const username = process.env.DNA_USERNAME;
  const password = process.env.DNA_PASSWORD;
  if (!username || !password) throw new Error('DNA_USERNAME / DNA_PASSWORD not set (required for SOAP registration).');

  const contact = buildDnaContact(customer);
  // Account default nameservers (override with DNA_NS1 / DNA_NS2 env vars if needed)
  const nameServers = [
    process.env.DNA_NS1 || 'tr.apiname.com',
    process.env.DNA_NS2 || 'eu.apiname.com',
  ];

  const parameters = {
    request: {
      Password: password,
      UserName: username,
      DomainName: dom,
      Period: Number(period) || 1,
      // SOAP needs the array wrapped in a <string> element so it serializes as multiple nameservers
      NameServerList: { string: nameServers },
      LockStatus: true,
      PrivacyProtectionStatus: false,
      AdministrativeContact: contact,
      BillingContact: contact,
      TechnicalContact: contact,
      RegistrantContact: contact,
    },
  };

  console.log('DNA SOAP REGISTER ->', dom, 'period', parameters.request.Period, 'ns', nameServers.length);
  const client = await getDnaSoapClient();

  const result = await new Promise((resolve, reject) => {
    client.RegisterWithContactInfo(parameters, (err, res) => {
      if (err) return reject(new Error('SOAP register error: ' + (err.message || err)));
      resolve(res);
    });
  });

  // Dig out the ...Result payload (matches official lib's callApiFunction)
  let data = result?.RegisterWithContactInfoResult || null;
  if (!data) {
    const firstKey = Object.keys(result || {})[0];
    if (result?.[firstKey]?.RegisterWithContactInfoResult) data = result[firstKey].RegisterWithContactInfoResult;
  }
  console.log('DNA SOAP REGISTER <-', JSON.stringify(data).slice(0, 600));

  if (!data || typeof data !== 'object') throw new Error('Registration: no data returned from SOAP.');
  if (data.faultcode) throw new Error('Registration fault: ' + (data.faultstring || data.faultcode));

  const opResult = (data.OperationResult || '').toString().toUpperCase();
  if (opResult === 'SUCCESS' || (data.DomainInfo && typeof data.DomainInfo === 'object')) {
    return { success: true, domainName: dom, data: data.DomainInfo || data };
  }

  // Already registered → treat as owned/success
  const msg = (data.OperationMessage || data.Message || '').toString();
  if (/already.*regist|exist/i.test(msg)) {
    console.log('DNA SOAP REGISTER: already registered (treating as success):', dom);
    return { success: true, alreadyRegistered: true, domainName: dom };
  }

  throw new Error('Registration failed: ' + (msg || opResult || 'Unknown error'));
}

// Customer: start a PAID domain registration — creates a domain order + checkout (pay first)
app.post('/api/customer/domains/register', authenticateCustomer, async (req, res) => {
  try {
    const { domainName, period, price, method } = req.body;
    const dom = (domainName || '').toLowerCase().trim();
    if (!dom) return res.status(400).json({ error: 'Domain required.' });
    const me = await Customer.findById(req.customerId);
    if (!me) return res.status(404).json({ error: 'Account not found.' });

    const subtotal = Number(price || 0);
    if (!subtotal || subtotal <= 0) return res.status(400).json({ error: 'Invalid domain price.' });
    // Apply tax + processing fee on top of the domain price.
    const taxed = await applyTaxAndFee(subtotal);
    const amount = taxed.total;

    const orderNumber = `DM-${Date.now()}`;
    const order = await DomainOrder.create({
      customerId: me._id, orderNumber, domainName: dom, period: Number(period) || 1, price: amount, status: 'pending',
    });

    const payment = await Payment.create({
      customerId: me._id, customerEmail: me.businessEmail, domain: dom,
      orderId: order._id, orderType: 'domain', amount, subtotal: taxed.subtotal, tax: taxed.tax, fee: taxed.fee, currency: 'USD',
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
      // Build line items: domain price + separate tax/fee lines so the customer sees the breakdown.
      const line_items = [{ price_data: { currency: 'usd', product_data: { name: orderDesc }, unit_amount: Math.round(taxed.subtotal * 100) }, quantity: 1 }];
      if (taxed.fee > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: 'Processing fee' }, unit_amount: Math.round(taxed.fee * 100) }, quantity: 1 });
      if (taxed.tax > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: `${taxed.taxLabel} (${taxed.taxPercent}%)` }, unit_amount: Math.round(taxed.tax * 100) }, quantity: 1 });
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items,
        success_url: successUrl, cancel_url: cancelUrl,
        client_reference_id: String(payment._id),
        metadata: { paymentId: String(payment._id), orderId: String(order._id), orderType: 'domain' },
      });
      payment.providerRef = session.id; payment.checkoutUrl = session.url; await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id });
    }

    // Nicky crypto
    try {
      const nicky = await createNickyPayment({
        amount, currency: 'USD', description: orderDesc, orderNumber,
        reference: String(payment._id), billDescription: orderDesc,
        customerEmail: me.businessEmail, customerName: me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me.businessEmail,
        redirectUrl: successUrl, cancelUrl,
      });
      payment.checkoutUrl = nicky.url;
      payment.providerRef = nicky.nickyId || nicky.shortId || String(payment._id);
      payment.providerShortId = nicky.shortId || null;
      await payment.save();
      return res.json({ checkoutUrl: nicky.url, paymentId: payment._id });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: 'Domain order error: ' + e.message });
  }
});

// Admin: list domain orders
app.get('/api/admin/domain-orders', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const orders = await DomainOrder.find().sort({ createdAt: -1 }).limit(500);
    res.json({ orders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: retry a paid-but-unregistered domain (recovers a charge where registration failed)
app.post('/api/admin/domain-orders/:id/retry', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const order = await DomainOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    // Confirm it was paid
    const payment = await Payment.findOne({ orderId: order._id, orderType: 'domain', status: 'paid' });
    if (!payment) return res.status(400).json({ error: 'No paid payment found for this order.' });
    if (order.status === 'registered') return res.json({ success: true, message: 'Already registered.' });

    const customer = await Customer.findById(order.customerId);
    let meta = {}; try { meta = JSON.parse(order.registrationResult || '{}'); } catch (_) { }
    let result;
    if (meta.renew) {
      result = await ncRenewDomain(order.domainName, order.period);
    } else {
      const contact = meta.contact || {
        firstName: customer?.firstName || customer?.username || 'Domain', lastName: customer?.lastName || 'Owner',
        address: customer?.address || 'N/A', city: customer?.city || 'N/A', state: customer?.state || 'N/A',
        zip: customer?.zip || '00000', country: customer?.country || 'US', phone: customer?.phone || '+1.0000000000',
        email: customer?.businessEmail,
      };
      result = await ncRegisterDomain(order.domainName, order.period, contact);
    }
    if (!result.ok) return res.status(502).json({ error: result.error });
    order.status = 'registered';
    order.registeredAt = new Date();
    order.registrationResult = JSON.stringify(result).slice(0, 500);
    await order.save();
    if (customer && !customer.domain) { customer.domain = order.domainName; await customer.save(); }
    res.json({ success: true, message: `${order.domainName} registered.` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin: reseller account balance from Namecheap
app.get('/api/admin/domain-balance', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const b = await ncGetBalance();
    if (!b.ok) return res.status(400).json({ error: b.error });
    res.json({ balance: b.availableBalance, currency: b.currency, raw: b });
  } catch (e) {
    res.status(500).json({ error: 'Balance error: ' + e.message });
  }
});

// Public domain search (for the landing page — no login required)
app.post('/api/public/domains/search', async (req, res) => {
  try {
    const { domainName } = req.body;
    const raw = (domainName || '').toLowerCase().trim();
    if (!raw) return res.status(400).json({ error: 'Enter a domain or a name to search.' });

    // Full domain (has a dot): check just that one.
    if (raw.includes('.')) {
      if (!/^[a-z0-9-]+\.[a-z.]{2,}$/.test(raw)) return res.status(400).json({ error: 'Enter a valid domain like example.com' });
      const check = await ncCheckDomains([raw]);
      if (!check.ok) return res.status(502).json({ error: check.error });
      const d = check.domains[0];
      let price = null;
      if (d.available) {
        const tld = tldOf(raw);
        if (d.isPremium && d.premiumPrice) price = ncApplyPricing(d.premiumPrice);
        else { const pricing = await ncGetTldPricing(tld, 'REGISTER'); if (pricing.ok) price = await ncCustomerPriceForTld(tld, pricing.cost); }
      }
      return res.json({ domainName: raw, available: d.available, isPremium: d.isPremium, currency: 'USD', period: 1, price, results: [{ domain: raw, available: d.available, isPremium: d.isPremium, price }] });
    }

    // Bare name: check across popular TLDs in parallel.
    const name = raw.replace(/[^a-z0-9-]/g, '');
    if (!name) return res.status(400).json({ error: 'Enter a valid name (letters, numbers, hyphens).' });
    const tlds = ['com', 'net', 'org', 'io', 'co', 'shop', 'store', 'online', 'site', 'xyz'];
    const domains = tlds.map((t) => `${name}.${t}`);
    const check = await ncCheckDomains(domains);
    if (!check.ok) return res.status(502).json({ error: check.error });
    const results = await Promise.all(check.domains.map(async (d) => {
      let price = null;
      if (d.available) {
        const tld = tldOf(d.domain);
        if (d.isPremium && d.premiumPrice) price = ncApplyPricing(d.premiumPrice);
        else { try { const pricing = await ncGetTldPricing(tld, 'REGISTER'); if (pricing.ok) price = await ncCustomerPriceForTld(tld, pricing.cost); } catch (_) { } }
      }
      return { domain: d.domain, available: d.available, isPremium: d.isPremium, price };
    }));
    results.sort((a, b) => (b.available - a.available) || ((a.price || 999) - (b.price || 999)));
    res.json({ multi: true, results });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ==================== LEAD GENERATION & PROSPECTIVE CLIENTS ====================

// Public Lead Inquiry Submission
app.post('/api/public/leads', async (req, res) => {
  try {
    const { fullName, email, phone, businessName, domain, services, message } = req.body;
    if (!fullName || !email) {
      return res.status(400).json({ error: 'Full name and email address are required.' });
    }
    const newLead = new Lead({
      fullName,
      email,
      phone,
      businessName,
      domain,
      services: Array.isArray(services) ? services : [],
      message,
      status: 'New',
    });
    await newLead.save();
    res.status(201).json({ success: true, message: 'Thank you for your inquiry! We will contact you shortly.', lead: newLead });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: list all leads
app.get('/api/admin/leads', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const leads = await Lead.find({}).sort({ createdAt: -1 });
    res.json({ leads, total: leads.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: update lead status or notes
app.post('/api/admin/leads/:id', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    if (status) lead.status = status;
    if (notes !== undefined) lead.notes = notes;
    lead.updatedAt = new Date();
    await lead.save();

    res.json({ success: true, message: 'Lead updated successfully.', lead });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: delete lead
app.delete('/api/admin/leads/:id', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    res.json({ success: true, message: 'Lead deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: search domain availability + price
app.post('/api/customer/domains/search', authenticateCustomer, async (req, res) => {
  try {
    const { domainName } = req.body;
    const raw = (domainName || '').toLowerCase().trim();
    if (!raw) return res.status(400).json({ error: 'Enter a domain or a name to search.' });

    // If the user typed a full domain (has a dot), check just that one.
    if (raw.includes('.')) {
      if (!/^[a-z0-9-]+\.[a-z.]{2,}$/.test(raw)) return res.status(400).json({ error: 'Enter a valid domain like example.com' });
      const check = await ncCheckDomains([raw]);
      if (!check.ok) return res.status(502).json({ error: check.error });
      const d = check.domains[0];
      let price = null;
      if (d.available) {
        const tld = tldOf(raw);
        if (d.isPremium && d.premiumPrice) price = ncApplyPricing(d.premiumPrice);
        else { const pricing = await ncGetTldPricing(tld, 'REGISTER'); if (pricing.ok) price = await ncCustomerPriceForTld(tld, pricing.cost); }
      }
      return res.json({ domainName: raw, available: d.available, isPremium: d.isPremium, price, results: [{ domain: raw, available: d.available, isPremium: d.isPremium, price }] });
    }

    // Bare name (no dot): check across popular TLDs and return all options with prices.
    const name = raw.replace(/[^a-z0-9-]/g, '');
    if (!name) return res.status(400).json({ error: 'Enter a valid name (letters, numbers, hyphens).' });
    const tlds = ['com', 'net', 'org', 'io', 'co', 'shop', 'store', 'online', 'site', 'xyz'];
    const domains = tlds.map((t) => `${name}.${t}`);
    const check = await ncCheckDomains(domains);
    if (!check.ok) return res.status(502).json({ error: check.error });

    // Price all available TLDs in PARALLEL (not sequentially) to avoid timeouts.
    const results = await Promise.all(check.domains.map(async (d) => {
      let price = null;
      if (d.available) {
        const tld = tldOf(d.domain);
        if (d.isPremium && d.premiumPrice) price = ncApplyPricing(d.premiumPrice);
        else {
          try {
            const pricing = await ncGetTldPricing(tld, 'REGISTER');
            if (pricing.ok) price = await ncCustomerPriceForTld(tld, pricing.cost);
          } catch (_) { }
        }
      }
      return { domain: d.domain, available: d.available, isPremium: d.isPremium, price };
    }));
    // Sort: available first, then by price
    results.sort((a, b) => (b.available - a.available) || ((a.price || 999) - (b.price || 999)));
    res.json({ multi: true, results });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- BRANDING ----
// Public: get branding (logo, favicon, name, color) for the portal to render.
app.get('/api/branding', async (req, res) => {
  try {
    const b = await BrandSettings.findOne({ singleton: 'main' });
    res.json({
      brandName: b?.brandName || process.env.BRAND_NAME || 'GNB MENTOR LLC',
      brandColor: b?.brandColor || '#0F766E',
      logoDataUrl: b?.logoDataUrl || '',
      faviconDataUrl: b?.faviconDataUrl || '',
    });
  } catch (e) {
    res.json({ brandName: 'GNB MENTOR LLC', brandColor: '#0F766E', logoDataUrl: '', faviconDataUrl: '' });
  }
});

// Admin: update branding. Accepts base64 data URLs for logo/favicon.
app.post('/api/admin/branding', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { brandName, brandColor, logoDataUrl, faviconDataUrl } = req.body;
    // Guardrails: limit image size to keep the DB lean (~500KB base64).
    const tooBig = (s) => typeof s === 'string' && s.length > 700000;
    if (tooBig(logoDataUrl)) return res.status(400).json({ error: 'Logo is too large. Please use an image under 500KB.' });
    if (tooBig(faviconDataUrl)) return res.status(400).json({ error: 'Favicon is too large. Please use a small icon (under 100KB).' });
    const update = { updatedAt: new Date() };
    if (brandName !== undefined) update.brandName = brandName;
    if (brandColor !== undefined) update.brandColor = brandColor;
    if (logoDataUrl !== undefined) update.logoDataUrl = logoDataUrl;
    if (faviconDataUrl !== undefined) update.faviconDataUrl = faviconDataUrl;
    const b = await BrandSettings.findOneAndUpdate({ singleton: 'main' }, update, { upsert: true, new: true });
    res.json({ success: true, branding: { brandName: b.brandName, brandColor: b.brandColor, logoDataUrl: b.logoDataUrl, faviconDataUrl: b.faviconDataUrl } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- ORDER SETTINGS (which account takes orders + which plans are offered) ----
app.get('/api/admin/order-settings', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    let s = await OrderSettings.findOne({ singleton: 'main' });
    if (!s) s = await OrderSettings.create({ singleton: 'main' });
    res.json({
      pkOrdersEnabled: s.pkOrdersEnabled, usaOrdersEnabled: s.usaOrdersEnabled, flexibleEnabled: s.flexibleEnabled, annualEnabled: s.annualEnabled,
      pkTransferToken: s.pkTransferToken || '', usaTransferToken: s.usaTransferToken || '', pkPartnerId: s.pkPartnerId || '', usaPartnerId: s.usaPartnerId || ''
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/order-settings', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const b = req.body;
    const s = await OrderSettings.findOneAndUpdate(
      { singleton: 'main' },
      {
        $set: {
          ...(b.pkOrdersEnabled !== undefined ? { pkOrdersEnabled: !!b.pkOrdersEnabled } : {}),
          ...(b.usaOrdersEnabled !== undefined ? { usaOrdersEnabled: !!b.usaOrdersEnabled } : {}),
          ...(b.flexibleEnabled !== undefined ? { flexibleEnabled: !!b.flexibleEnabled } : {}),
          ...(b.annualEnabled !== undefined ? { annualEnabled: !!b.annualEnabled } : {}),
          ...(b.pkTransferToken !== undefined ? { pkTransferToken: String(b.pkTransferToken).trim() } : {}),
          ...(b.usaTransferToken !== undefined ? { usaTransferToken: String(b.usaTransferToken).trim() } : {}),
          ...(b.pkPartnerId !== undefined ? { pkPartnerId: String(b.pkPartnerId).trim() } : {}),
          ...(b.usaPartnerId !== undefined ? { usaPartnerId: String(b.usaPartnerId).trim() } : {}),
          updatedAt: new Date(),
        }
      },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Public: which plans the customer may choose (used by the order flow).
app.get('/api/order-options', async (req, res) => {
  try {
    let s = await OrderSettings.findOne({ singleton: 'main' });
    if (!s) s = await OrderSettings.create({ singleton: 'main' });
    res.json({ flexibleEnabled: s.flexibleEnabled, annualEnabled: s.annualEnabled });
  } catch (e) { res.json({ flexibleEnabled: true, annualEnabled: false }); }
});

// ---- GOOGLE WORKSPACE TRANSFER (import subscription from another reseller) ----
// Helper: pick the active reseller account for transfers (admin-routed).
async function activeTransferAccount() {
  const os = await OrderSettings.findOne({ singleton: 'main' });
  let account = 'pk';
  if (os && os.usaOrdersEnabled && !os.pkOrdersEnabled) account = 'usa';
  else if (os && os.pkOrdersEnabled) account = 'pk';
  else if (os && os.usaOrdersEnabled) account = 'usa';
  return { account, os };
}

// Customer: get the transfer instructions — OUR token + Partner ID for the active account.
app.get('/api/customer/workspace/transfer-info', authenticateCustomer, async (req, res) => {
  try {
    const { account, os } = await activeTransferAccount();
    const token = account === 'usa' ? (os?.usaTransferToken || '') : (os?.pkTransferToken || '');
    const partnerId = account === 'usa' ? (os?.usaPartnerId || '') : (os?.pkPartnerId || '');
    res.json({ account, token, partnerId, configured: !!token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Customer: submit a Workspace transfer — they've already pasted OUR token in their Google Admin.
// They pick a plan and PAY; on payment we claim the customer + subscription into our reseller.
app.post('/api/customer/workspace/transfer', authenticateCustomer, async (req, res) => {
  try {
    const { domain, planId, seats, planType, method } = req.body;
    const dom = (domain || '').toLowerCase().trim();
    if (!dom || !/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) return res.status(400).json({ error: 'Enter a valid domain like example.com' });
    const plan = await Plan.findOne({ planId });
    if (!plan || !plan.skuId) return res.status(400).json({ error: 'Choose the plan you are currently using.' });
    const me = await Customer.findById(req.customerId);
    const { account } = await activeTransferAccount();

    const numSeats = Math.max(1, Number(seats) || 1);
    const subtotal = Number(plan.monthlyPrice || 0) * numSeats;
    const taxed = await applyTaxAndFee(subtotal);
    const amount = taxed.total;

    const orderNumber = `WT-${Date.now()}`;
    const xfer = await WorkspaceTransfer.create({
      customerId: me._id, orderNumber, domain: dom, account, status: 'pending',
      planId: plan.planId, planName: plan.name, seats: numSeats, planType: planType === 'annual' ? 'annual' : 'flexible',
    });

    const payment = await Payment.create({
      customerId: me._id, customerEmail: me.businessEmail, domain: dom,
      orderId: xfer._id, orderType: 'workspace_transfer', amount, subtotal: taxed.subtotal, tax: taxed.tax, fee: taxed.fee, currency: 'USD',
      method: method === 'nicky' ? 'nicky' : 'stripe', status: 'pending',
    });

    const orderDesc = `Workspace transfer: ${dom} — ${plan.name} (${numSeats} seat${numSeats === 1 ? '' : 's'})`;
    const successUrl = `${FRONTEND_URL}/?payment=success&pid=${payment._id}`;
    const cancelUrl = `${FRONTEND_URL}/?payment=cancelled&pid=${payment._id}`;

    if (payment.method === 'stripe') {
      let stripe; try { stripe = await getStripeForMode(); } catch (e) { return res.status(500).json({ error: e.message }); }
      const sd = await PaymentSettings.findOne({ singleton: 'main' });
      payment.isTest = (sd?.stripeMode || 'test') !== 'live'; await payment.save();
      const line_items = [{ price_data: { currency: 'usd', product_data: { name: orderDesc }, unit_amount: Math.round(taxed.subtotal * 100) }, quantity: 1 }];
      if (taxed.fee > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: 'Processing fee' }, unit_amount: Math.round(taxed.fee * 100) }, quantity: 1 });
      if (taxed.tax > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: `${taxed.taxLabel} (${taxed.taxPercent}%)` }, unit_amount: Math.round(taxed.tax * 100) }, quantity: 1 });
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', line_items, success_url: successUrl, cancel_url: cancelUrl,
        client_reference_id: String(payment._id), metadata: { paymentId: String(payment._id), orderId: String(xfer._id), orderType: 'workspace_transfer' },
      });
      payment.providerRef = session.id; payment.checkoutUrl = session.url; await payment.save();
      return res.json({ checkoutUrl: session.url, paymentId: payment._id });
    }

    try {
      const nicky = await createNickyPayment({
        amount, currency: 'USD', description: orderDesc, orderNumber,
        reference: String(payment._id), billDescription: orderDesc,
        customerEmail: me.businessEmail, customerName: me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me.businessEmail,
        redirectUrl: successUrl, cancelUrl,
      });
      payment.checkoutUrl = nicky.url; payment.providerRef = nicky.nickyId || nicky.shortId || String(payment._id); payment.providerShortId = nicky.shortId || null;
      await payment.save();
      return res.json({ checkoutUrl: nicky.url, paymentId: payment._id });
    } catch (e) {
      return res.status(500).json({ error: 'Crypto checkout not available: ' + e.message });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Customer: list their workspace transfers.
app.get('/api/customer/workspace/transfers', authenticateCustomer, async (req, res) => {
  try {
    const rows = await WorkspaceTransfer.find({ customerId: req.customerId }).sort({ createdAt: -1 });
    res.json({ transfers: rows.map((t) => ({ id: t._id, domain: t.domain, status: t.status, claimed: t.subscriptionsClaimed, account: t.account, planName: t.planName, note: t.resultNote, createdAt: t.createdAt })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- GOOGLE WORKSPACE TRANSFER end ----
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
// Admin: create a workspace order AND provision it immediately — NO payment step.
// Admin fills the sign-up form, hits submit, and the Workspace is created in Google right away.
// Reusable: create + provision ONE admin workspace order (no payment). Returns {ok, orderNumber, ...}.
async function adminCreateAndProvisionWorkspace(body) {
  const dom = (body.organization?.domain || '').toLowerCase().trim();
  if (!dom || !body.plan?.id || !body.seats) {
    return { ok: false, domain: dom, error: 'Missing domain, plan, or seats.' };
  }

  let cust = await Customer.findOne({ domain: dom });
  if (!cust && body.contact?.email) cust = await Customer.findOne({ businessEmail: (body.contact.email || '').toLowerCase() });
  if (!cust) {
    cust = await Customer.create({
      username: dom.split('.')[0],
      businessEmail: body.contact?.email || `admin@${dom}`,
      firstName: body.contact?.firstName || 'Admin',
      lastName: body.contact?.lastName || '',
      domain: dom, role: 'customer', account: body.account || undefined,
      passwordHash: 'ADMIN_CREATED_NO_LOGIN',
    });
  } else if (!cust.domain) { cust.domain = dom; await cust.save(); }

  const orderNumber = `WS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const order = await WorkspaceOrder.create({
    customerId: cust._id, orderNumber, type: 'workspace',
    planType: body.planType === 'annual' ? 'annual' : 'flexible',
    account: body.account || '', plan: body.plan, seats: Number(body.seats),
    monthlyTotal: body.monthlyTotal, organization: body.organization, contact: body.contact, status: 'pending',
  });

  try {
    const result = await provisionWorkspaceOrder(order);
    try {
      const planDoc = await Plan.findOne({ planId: order.plan?.id });
      if (planDoc?.skuId) {
        const now = new Date();
        let rec = await SubBilling.findOne({ domain: dom, skuId: planDoc.skuId });
        if (!rec) { rec = new SubBilling({ account: order.account || 'pk', domain: dom, skuId: planDoc.skuId }); startNewBillingCycle(rec, now); }
        applyPaymentToCurrentCycle(rec, now);
        await rec.save();
      }
    } catch (_) { }
    return { ok: true, domain: dom, orderNumber, account: order.account || 'auto', message: result.message, provisionNote: order.provisionNote || null };
  } catch (e) {
    order.status = 'failed'; await order.save();
    return { ok: false, domain: dom, orderNumber, error: e.message };
  }
}

// Admin: BULK create + provision many workspaces at once (no payment).
// SAFEGUARD: stops the whole batch if the first few domains fail (prevents wasting domains
// when something is misconfigured, e.g. USA auth not set up).
app.post('/api/admin/workspace-orders/provision-bulk', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: 'No rows provided.' });
    if (rows.length > 100) return res.status(400).json({ error: 'Please limit to 100 domains per batch.' });

    // Stop condition: if the first N domains ALL fail, abort the rest.
    const STOP_AFTER_INITIAL_FAILURES = Number(req.body?.stopAfterFailures) || 3;

    const results = [];
    let consecutiveFailuresFromStart = 0;
    let aborted = false;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      let out;
      try {
        out = await adminCreateAndProvisionWorkspace(r);
      } catch (e) {
        out = { ok: false, domain: r?.organization?.domain || '?', error: e.message };
      }
      results.push(out);

      // Track failures among the FIRST few domains only.
      if (i < STOP_AFTER_INITIAL_FAILURES) {
        if (!out.ok) consecutiveFailuresFromStart++;
      }
      // If the first STOP_AFTER_INITIAL_FAILURES domains all failed, abort to avoid wasting the rest.
      if (i === STOP_AFTER_INITIAL_FAILURES - 1 && consecutiveFailuresFromStart >= STOP_AFTER_INITIAL_FAILURES && rows.length > STOP_AFTER_INITIAL_FAILURES) {
        aborted = true;
        console.error(`BULK ABORTED: first ${STOP_AFTER_INITIAL_FAILURES} domains all failed. Stopping to avoid wasting the remaining ${rows.length - results.length} domains.`);
        break;
      }
    }

    const okCount = results.filter((x) => x.ok).length;
    res.json({
      success: true,
      total: rows.length,
      attempted: results.length,
      provisioned: okCount,
      failed: results.length - okCount,
      aborted,
      abortReason: aborted ? `Stopped after the first ${STOP_AFTER_INITIAL_FAILURES} domains all failed — the remaining ${rows.length - results.length} were NOT attempted, so no domains were wasted. Fix the error below and retry.` : null,
      results,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/subscriptions/bulk-attach', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { domains, planId, seats, account } = req.body;
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of domains.' });
    }
    if (!planId) {
      return res.status(400).json({ error: 'Please specify a planId.' });
    }

    const planDoc = await Plan.findOne({ planId });
    if (!planDoc || !planDoc.skuId) {
      return res.status(400).json({ error: `Plan '${planId}' is missing a Google SKU.` });
    }

    const numSeats = Number(seats) || 1;
    const resolvedAccount = account || 'pk';
    const auth = resolvedAccount === 'usa' ? await getUsaAuth() : await getResellerAuth();
    const reseller = google.reseller({ version: 'v1', auth });

    const results = [];

    for (const rawDomain of domains) {
      const dom = rawDomain.toLowerCase().trim();
      if (!dom) continue;

      try {
        // 1) Find or create customer
        let cust = await Customer.findOne({ domain: dom });
        if (!cust) {
          cust = await Customer.create({
            username: dom.split('.')[0],
            businessEmail: `admin@${dom}`,
            firstName: 'Admin',
            lastName: 'User',
            domain: dom,
            role: 'customer',
            account: resolvedAccount,
            passwordHash: 'ADMIN_CREATED_NO_LOGIN',
          });
        }

        // 2) Create customer in Google Reseller if not exists
        let googleCustomerExists = false;
        try {
          await reseller.customers.get({ customerId: dom });
          googleCustomerExists = true;
        } catch (_) {
          try {
            await reseller.customers.insert({
              requestBody: {
                customerDomain: dom,
                alternateEmail: cust.businessEmail,
                postalAddress: {
                  contactName: 'Admin User',
                  locality: cust.city || 'City',
                  region: cust.state || 'State',
                  postalCode: cust.postalCode || '10001',
                  countryCode: cust.country || 'US',
                  addressLine1: cust.address || '123 Street',
                }
              }
            });
            googleCustomerExists = true;
          } catch (insertErr) {
            throw new Error(`Google Customer creation failed: ${insertErr.message}`);
          }
        }

        // 3) Insert subscription in Google
        let subResp;
        try {
          subResp = await reseller.subscriptions.insert({
            customerId: dom,
            requestBody: {
              customerId: dom,
              skuId: planDoc.skuId,
              plan: { planName: 'FLEXIBLE' },
              seats: { numberOfSeats: numSeats, maximumNumberOfSeats: numSeats },
              purchaseOrderId: `BULK-ATTACH-${Date.now()}`,
            },
          });
        } catch (subErr) {
          const msg = subErr?.errors?.[0]?.message || subErr?.message || '';
          if (!/already exists|entity already|duplicate/i.test(msg)) {
            throw new Error(`Google Subscription creation failed: ${msg}`);
          }
          // If already exists, try to list to get the subscriptionId
          const listResp = await reseller.subscriptions.list({ customerId: dom });
          const matching = (listResp.data.subscriptions || []).find(s => s.skuId === planDoc.skuId);
          subResp = { data: matching };
        }

        const subscriptionId = subResp?.data?.subscriptionId;

        // 4) Create WorkspaceOrder and Subscription database record
        const orderNumber = `WS-BULK-${Date.now()}`;
        const order = await WorkspaceOrder.create({
          customerId: cust._id,
          orderNumber,
          type: 'workspace',
          planType: 'flexible',
          account: resolvedAccount,
          plan: { id: planDoc.planId, name: planDoc.name, monthlyPrice: planDoc.monthlyPrice },
          seats: numSeats,
          monthlyTotal: planDoc.monthlyPrice * numSeats,
          organization: { domain: dom, name: dom.split('.')[0] },
          contact: { firstName: 'Admin', lastName: 'User', email: cust.businessEmail },
          status: 'provisioned',
          googleProvisioned: true,
        });

        const dbSub = await Subscription.create({
          customerId: cust._id,
          orderId: order._id,
          subscriptionId,
          type: 'workspace',
          plan: planDoc.name,
          seats: numSeats,
          monthlyPrice: planDoc.monthlyPrice,
          status: 'active',
          googleWorkspaceSkuId: planDoc.skuId,
        });

        // 5) Seed/update SubBilling so it's tracked in billing
        try {
          let rec = await SubBilling.findOne({ domain: dom, skuId: planDoc.skuId });
          if (!rec) {
            rec = new SubBilling({ account: resolvedAccount, domain: dom, skuId: planDoc.skuId, subscriptionId });
            startNewBillingCycle(rec, new Date());
          } else if (subscriptionId) {
            rec.subscriptionId = subscriptionId;
          }
          applyPaymentToCurrentCycle(rec, new Date());
          await rec.save();
        } catch (billingErr) {
          console.error(`SubBilling seeding failed for ${dom}:`, billingErr.message);
        }

        results.push({ ok: true, domain: dom, subscriptionId, dbSubId: dbSub._id });
      } catch (err) {
        results.push({ ok: false, domain: dom, error: err.message });
      }
    }

    const successCount = results.filter(r => r.ok).length;
    res.json({
      success: true,
      total: domains.length,
      attached: successCount,
      failed: domains.length - successCount,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/customers/bulk-apply', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { customerIds, planId, seats, actionType } = req.body;
    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one customer.' });
    }
    if (!planId) {
      return res.status(400).json({ error: 'Please specify a plan.' });
    }

    const planDoc = await Plan.findOne({ planId });
    if (!planDoc || !planDoc.skuId) {
      return res.status(400).json({ error: `Plan '${planId}' is missing a Google SKU.` });
    }

    const numSeats = Number(seats) || 1;
    const results = [];

    for (const cId of customerIds) {
      try {
        const customer = await Customer.findById(cId);
        if (!customer) {
          results.push({ id: cId, ok: false, error: 'Customer not found in DB.' });
          continue;
        }

        const domain = customer.domain ? customer.domain.toLowerCase().trim() : '';
        const resolvedAccount = customer.account || 'pk';

        if (!domain) {
          // Local creation only
          const orderNumber = `WS-BULK-APPLY-${Date.now()}`;
          const order = await WorkspaceOrder.create({
            customerId: customer._id,
            orderNumber,
            type: 'workspace',
            planType: 'flexible',
            account: resolvedAccount,
            plan: { id: planDoc.planId, name: planDoc.name, monthlyPrice: planDoc.monthlyPrice },
            seats: numSeats,
            monthlyTotal: planDoc.monthlyPrice * numSeats,
            status: 'provisioned',
            googleProvisioned: false,
          });

          const dbSub = await Subscription.create({
            customerId: customer._id,
            orderId: order._id,
            type: 'workspace',
            plan: planDoc.name,
            seats: numSeats,
            monthlyPrice: planDoc.monthlyPrice,
            status: 'active',
            googleWorkspaceSkuId: planDoc.skuId,
          });

          results.push({
            id: cId,
            username: customer.username || '—',
            email: customer.email,
            ok: true,
            note: 'Local DB subscription created (no domain set on customer for Google sync).'
          });
          continue;
        }

        // Reseller flow
        const auth = resolvedAccount === 'usa' ? await getUsaAuth() : await getResellerAuth();
        const reseller = google.reseller({ version: 'v1', auth });

        // Ensure customer exists in Google
        let googleCustomerExists = false;
        try {
          await reseller.customers.get({ customerId: domain });
          googleCustomerExists = true;
        } catch (_) {
          try {
            await reseller.customers.insert({
              requestBody: {
                customerDomain: domain,
                alternateEmail: customer.businessEmail || customer.email,
                postalAddress: {
                  contactName: `${customer.firstName || 'Admin'} ${customer.lastName || 'User'}`.trim(),
                  locality: customer.city || 'City',
                  region: customer.state || 'State',
                  postalCode: customer.postalCode || '10001',
                  countryCode: customer.country || 'US',
                  addressLine1: customer.address || '123 Street',
                }
              }
            });
            googleCustomerExists = true;
          } catch (insertErr) {
            results.push({ id: cId, username: customer.username || '—', email: customer.email, ok: false, error: `Google customer creation failed: ${insertErr.message}` });
            continue;
          }
        }

        // Check for existing subscription
        let existingSub = null;
        try {
          const listResp = await reseller.subscriptions.list({ customerId: domain });
          const subs = listResp.data.subscriptions || [];
          existingSub = subs.find(s => s.skuId === planDoc.skuId || s.skuId.startsWith('Google'));
        } catch (_) {}

        let subscriptionId;
        let operationNote = '';

        if (actionType === 'upgrade' && existingSub) {
          try {
            if (existingSub.skuId !== planDoc.skuId) {
              // changePlan
              const changeResp = await reseller.subscriptions.changePlan({
                customerId: domain,
                subscriptionId: existingSub.subscriptionId,
                requestBody: {
                  skuId: planDoc.skuId,
                  planName: 'FLEXIBLE',
                  seats: { numberOfSeats: numSeats },
                }
              });
              subscriptionId = changeResp?.data?.subscriptionId || existingSub.subscriptionId;
              operationNote = `Upgraded from ${existingSub.skuId} to ${planDoc.skuId} (${numSeats} seats)`;
            } else {
              // changeSeats
              const changeSeatsResp = await reseller.subscriptions.changeSeats({
                customerId: domain,
                subscriptionId: existingSub.subscriptionId,
                requestBody: {
                  numberOfSeats: numSeats
                }
              });
              subscriptionId = changeSeatsResp?.data?.subscriptionId || existingSub.subscriptionId;
              operationNote = `Updated seats to ${numSeats}`;
            }

            await Subscription.updateMany(
              { customerId: customer._id, googleWorkspaceSkuId: existingSub.skuId },
              { plan: planDoc.name, seats: numSeats, monthlyPrice: planDoc.monthlyPrice, googleWorkspaceSkuId: planDoc.skuId, subscriptionId }
            );
          } catch (upgradeErr) {
            results.push({ id: cId, username: customer.username || '—', email: customer.email, ok: false, error: `Google Upgrade failed: ${upgradeErr.message}` });
            continue;
          }
        } else {
          try {
            const subResp = await reseller.subscriptions.insert({
              customerId: domain,
              requestBody: {
                customerId: domain,
                skuId: planDoc.skuId,
                plan: { planName: 'FLEXIBLE' },
                seats: { numberOfSeats: numSeats, maximumNumberOfSeats: numSeats },
                purchaseOrderId: `BULK-APPLY-${Date.now()}`,
              },
            });
            subscriptionId = subResp?.data?.subscriptionId;
            operationNote = `Provisioned new subscription for ${planDoc.name} with ${numSeats} seats`;
          } catch (subErr) {
            const msg = subErr?.errors?.[0]?.message || subErr?.message || '';
            if (/already exists|duplicate/i.test(msg) && existingSub) {
              subscriptionId = existingSub.subscriptionId;
              operationNote = `Linked to existing active subscription (${existingSub.skuId})`;
            } else {
              results.push({ id: cId, username: customer.username || '—', email: customer.email, ok: false, error: `Google provisioning failed: ${msg}` });
              continue;
            }
          }
        }

        const orderNumber = `WS-BULK-APPLY-${Date.now()}`;
        const order = await WorkspaceOrder.create({
          customerId: customer._id,
          orderNumber,
          type: 'workspace',
          planType: 'flexible',
          account: resolvedAccount,
          plan: { id: planDoc.planId, name: planDoc.name, monthlyPrice: planDoc.monthlyPrice },
          seats: numSeats,
          monthlyTotal: planDoc.monthlyPrice * numSeats,
          organization: { domain, name: domain.split('.')[0] },
          contact: { firstName: customer.firstName || 'Admin', lastName: customer.lastName || 'User', email: customer.businessEmail || customer.email },
          status: 'provisioned',
          googleProvisioned: true,
          notes: operationNote,
        });

        const dbSub = await Subscription.findOneAndUpdate(
          { customerId: customer._id, googleWorkspaceSkuId: planDoc.skuId },
          {
            orderId: order._id,
            subscriptionId,
            type: 'workspace',
            plan: planDoc.name,
            seats: numSeats,
            monthlyPrice: planDoc.monthlyPrice,
            status: 'active',
            updatedAt: new Date(),
          },
          { upsert: true, new: true }
        );

        try {
          let rec = await SubBilling.findOne({ domain, skuId: planDoc.skuId });
          if (!rec) {
            rec = new SubBilling({ account: resolvedAccount, domain, skuId: planDoc.skuId, subscriptionId });
            startNewBillingCycle(rec, new Date());
          } else if (subscriptionId) {
            rec.subscriptionId = subscriptionId;
          }
          applyPaymentToCurrentCycle(rec, new Date());
          await rec.save();
        } catch (billingErr) {
          console.error(`SubBilling seeding failed for ${domain}:`, billingErr.message);
        }

        results.push({
          id: cId,
          username: customer.username || '—',
          email: customer.email,
          ok: true,
          note: operationNote,
          subscriptionId
        });

      } catch (custErr) {
        results.push({ id: cId, ok: false, error: custErr.message });
      }
    }

    const successCount = results.filter(r => r.ok).length;
    res.json({
      success: true,
      total: customerIds.length,
      applied: successCount,
      failed: customerIds.length - successCount,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/workspace-orders/provision', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.organization?.domain || !body.plan?.id || !body.seats) {
      return res.status(400).json({ error: 'Missing required fields: domain, plan, and seats.' });
    }
    const dom = (body.organization.domain || '').toLowerCase().trim();

    // Find or create a customer record for this domain (so it shows in subscriptions/billing).
    let cust = await Customer.findOne({ domain: dom });
    if (!cust && body.contact?.email) cust = await Customer.findOne({ businessEmail: (body.contact.email || '').toLowerCase() });
    if (!cust) {
      // Create a lightweight customer record owned by this domain.
      cust = await Customer.create({
        username: dom.split('.')[0],
        businessEmail: body.contact?.email || `admin@${dom}`,
        firstName: body.contact?.firstName || 'Admin',
        lastName: body.contact?.lastName || '',
        domain: dom,
        role: 'customer',
        account: body.account || undefined,
        passwordHash: 'ADMIN_CREATED_NO_LOGIN', // placeholder; admin-created, no customer login
      });
    } else if (!cust.domain) {
      cust.domain = dom; await cust.save();
    }

    const orderNumber = `WS-${Date.now()}`;
    const order = await WorkspaceOrder.create({
      customerId: cust._id,
      orderNumber,
      type: 'workspace',
      planType: body.planType === 'annual' ? 'annual' : 'flexible',
      account: body.account || '', // 'pk' / 'usa' / '' (auto by order settings)
      plan: body.plan,
      seats: Number(body.seats),
      monthlyTotal: body.monthlyTotal,
      organization: body.organization,
      contact: body.contact,
      status: 'pending',
    });

    // Provision into Google immediately (no payment).
    try {
      const result = await provisionWorkspaceOrder(order);
      // Seed billing so this subscription is tracked on its monthly anchor.
      try {
        const planDoc = await Plan.findOne({ planId: order.plan?.id });
        if (planDoc?.skuId) {
          const now = new Date();
          let rec = await SubBilling.findOne({ domain: dom, skuId: planDoc.skuId });
          if (!rec) { rec = new SubBilling({ account: order.account || 'pk', domain: dom, skuId: planDoc.skuId }); startNewBillingCycle(rec, now); }
          applyPaymentToCurrentCycle(rec, now);
          await rec.save();
        }
      } catch (_) { }
      return res.json({ success: true, orderNumber, account: order.account || 'auto', message: result.message || 'Workspace provisioned in Google.', provisionNote: order.provisionNote || null });
    } catch (e) {
      order.status = 'failed';
      await order.save();
      return res.status(502).json({ error: e.message, orderNumber });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
      planType: body.planType === 'annual' ? 'annual' : 'flexible',
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

    // Order-placed email (non-blocking)
    try {
      const me = await Customer.findById(req.customerId);
      const desc = `${order.plan?.name || 'Workspace'} (${order.seats || 1} seat${order.seats === 1 ? '' : 's'}) for ${order.organization?.domain || ''}`;
      await sendOrderPlacedEmail(me?.businessEmail, me?.firstName || me?.username, desc, order.monthlyTotal);
    } catch (_) { }

    // Order created successfully — discard any saved draft.
    try { await WorkspaceOrder.deleteMany({ customerId: req.customerId, status: 'draft' }); } catch (_) { }

    res.json({ orderNumber: order.orderNumber, id: order._id, status: order.status });
  } catch (error) {
    res.status(500).json({ error: 'Could not create order' });
  }
});

app.get('/api/workspace-orders', authenticateCustomer, async (req, res) => {
  try {
    const orders = await WorkspaceOrder.find({ customerId: req.customerId, status: { $ne: 'draft' } }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- DRAFT ORDERS (resume an interrupted checkout) ----
// Save / update the customer's in-progress order draft (called as they fill the form).
app.post('/api/workspace-orders/draft', authenticateCustomer, async (req, res) => {
  try {
    const { draftData, draftStep } = req.body;
    // One active draft per customer — upsert it.
    let draft = await WorkspaceOrder.findOne({ customerId: req.customerId, status: 'draft' });
    if (!draft) {
      draft = await WorkspaceOrder.create({
        customerId: req.customerId,
        orderNumber: `DRAFT-${Date.now()}`,
        status: 'draft',
        draftData, draftStep: draftStep || 0,
      });
    } else {
      draft.draftData = draftData;
      draft.draftStep = draftStep || 0;
      await draft.save();
    }
    res.json({ success: true, draftId: draft._id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get the customer's current draft (for the "Resume order" card).
app.get('/api/workspace-orders/draft', authenticateCustomer, async (req, res) => {
  try {
    const draft = await WorkspaceOrder.findOne({ customerId: req.customerId, status: 'draft' }).sort({ updatedAt: -1 });
    if (!draft) return res.json({ draft: null });
    res.json({ draft: { id: draft._id, draftData: draft.draftData, draftStep: draft.draftStep, updatedAt: draft.updatedAt } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Discard the draft (called after successful submit, or if customer cancels).
app.delete('/api/workspace-orders/draft', authenticateCustomer, async (req, res) => {
  try {
    await WorkspaceOrder.deleteMany({ customerId: req.customerId, status: 'draft' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
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

// Service-account auth for the USA reseller (domain-wide delegation) — mirrors PK.
// Uses GOOGLE_SERVICE_ACCOUNT_JSON_USA + RESELLER_ADMIN_EMAIL_USA. This is the method
// that can create users in customer domains (which OAuth cannot).
function getUsaServiceAccountAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_USA) return null;
  let creds;
  try {
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_USA);
  } catch (e) {
    console.error('GOOGLE_SERVICE_ACCOUNT_JSON_USA is not valid JSON:', e.message);
    return null;
  }
  const subject = process.env.RESELLER_ADMIN_EMAIL_USA || 'admin@artisandrywallaz.com';
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: PROVISION_SCOPES,
    subject, // impersonate the USA reseller admin
  });
}

// Auth client for the USA reseller.
// Prefers the USA service account (needed for user creation + full provisioning);
// falls back to the OAuth refresh token (Voice-only, can't create users).
async function getUsaAuth() {
  const sa = getUsaServiceAccountAuth();
  if (sa) return sa;
  const conn = await GoogleConnection.findOne({ account: 'usa' });
  if (!conn || !conn.refreshToken) throw new Error('USA reseller not connected. Add GOOGLE_SERVICE_ACCOUNT_JSON_USA (recommended) or connect via OAuth.');
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

// Admin: list/search domain orders (by number or domain) with status + retry.
app.get('/api/admin/domain-orders', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    const filter = {};
    if (q) { const rx = new RegExp(String(q).trim(), 'i'); filter.$or = [{ orderNumber: rx }, { domainName: rx }]; }
    const orders = await DomainOrder.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json({
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber, domainName: o.domainName, status: o.status,
        period: o.period, price: o.price, registeredAt: o.registeredAt, createdAt: o.createdAt,
        error: o.status === 'failed' ? o.registrationResult : null,
      }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: retry a domain order that was paid but not registered.
app.post('/api/admin/domain-order-retry', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { orderNumber } = req.body;
    const order = await DomainOrder.findOne({ orderNumber });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    // Find the paid payment for this order.
    const payment = await Payment.findOne({ orderId: order._id, orderType: 'domain', status: 'paid' });
    if (!payment) return res.status(400).json({ error: 'No completed payment found for this order.' });
    // Reset to pending and re-run fulfillment.
    order.status = 'pending'; await order.save();
    await markPaidAndProvision(payment);
    const updated = await DomainOrder.findById(order._id);
    res.json({ success: true, status: updated.status, domain: updated.domainName });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Admin: list/search workspace orders (by number or domain) with provisioning status.
app.get('/api/admin/workspace-orders', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { q, status } = req.query;
    const filter = {};
    if (q) {
      const rx = new RegExp(String(q).trim(), 'i');
      filter.$or = [{ orderNumber: rx }, { 'organization.domain': rx }];
    }
    if (status) filter.status = status;
    const orders = await WorkspaceOrder.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json({
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        domain: o.organization?.domain || '',
        planName: o.plan?.name || '',
        seats: o.seats,
        account: o.account || 'auto',
        status: o.status,
        googleProvisioned: !!o.googleProvisioned,
        planType: o.planType,
        provisionNote: o.provisionNote || null,
        createdAt: o.createdAt,
      }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: diagnose a failed workspace order — shows account, status, and lets you retry provisioning.
app.get('/api/admin/workspace-order-diagnostic', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { orderNumber, domain } = req.query;
    const q = {};
    if (orderNumber) q.orderNumber = orderNumber;
    if (domain) q['organization.domain'] = String(domain).toLowerCase();
    const orders = await WorkspaceOrder.find(q).sort({ createdAt: -1 }).limit(10);
    const out = [];
    for (const o of orders) {
      // Check if the customer actually exists in the relevant Google account.
      let existsInGoogle = null, googleErr = null;
      const acct = o.account || 'pk';
      try {
        const auth = acct === 'usa' ? await getUsaAuth() : await getResellerAuth();
        const reseller = google.reseller({ version: 'v1', auth });
        const dom = (o.organization?.domain || '').toLowerCase();
        const c = await reseller.customers.get({ customerId: dom });
        existsInGoogle = !!c.data.customerDomain;
      } catch (e) { existsInGoogle = false; googleErr = e?.errors?.[0]?.message || e.message; }
      out.push({
        orderNumber: o.orderNumber, domain: o.organization?.domain, account: acct,
        status: o.status, googleProvisioned: o.googleProvisioned, planType: o.planType,
        provisionNote: o.provisionNote || null, existsInGoogle, googleErr,
      });
    }
    res.json({ orders: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: force re-provision a workspace order (e.g. after fixing USA auth/scopes).
app.post('/api/admin/workspace-order-reprovision', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const { orderNumber } = req.body;
    const order = await WorkspaceOrder.findOne({ orderNumber });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    order.googleProvisioned = false; // allow re-attempt
    await order.save();
    const result = await provisionWorkspaceOrder(order);
    res.json({ success: true, result });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Admin: check the USA account connection + scopes.
app.get('/api/admin/usa-account-check', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    const usingSA = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_USA;
    let canUseResellerApi = false, resellerErr = null, canCreateUsers = usingSA;
    try {
      const auth = await getUsaAuth();
      const reseller = google.reseller({ version: 'v1', auth });
      await reseller.subscriptions.list({ maxResults: 1 });
      canUseResellerApi = true;
    } catch (e) { resellerErr = e?.errors?.[0]?.message || e.message; }

    res.json({
      method: usingSA ? 'service-account (domain-wide delegation)' : 'oauth (Voice-only)',
      serviceAccountConfigured: usingSA,
      resellerAdminEmail: process.env.RESELLER_ADMIN_EMAIL_USA || (usingSA ? 'admin@artisandrywallaz.com (default)' : null),
      canUseResellerApi,
      canCreateAdminUsers: canCreateUsers,
      resellerErr,
      note: usingSA
        ? (canUseResellerApi
          ? 'USA service account works — can create customers, subscriptions, AND admin users (full provisioning like PK).'
          : 'USA service account is set but the Reseller API call failed. Check domain-wide delegation is granted for the service account in the USA Google Admin, and that RESELLER_ADMIN_EMAIL_USA is a real super-admin.')
        : 'USA is OAuth-only (Voice). It CANNOT create admin users. Add GOOGLE_SERVICE_ACCOUNT_JSON_USA + RESELLER_ADMIN_EMAIL_USA for full Workspace provisioning like PK.',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

// Claim a Google Workspace customer + create their subscription under our reseller.
// The customer has already pasted OUR transfer token in their Google Admin, granting us
// reseller permission. So we create the subscription for the plan they chose + paid for.
async function transferWorkspaceCustomer(domain, account, planDoc, seats, planType) {
  const auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
  const reseller = google.reseller({ version: 'v1', auth });
  const dom = String(domain).toLowerCase().trim();

  // Step 1: make sure the customer exists under our reseller. After they grant the token,
  // we should be able to get them. If not yet visible, try to create the customer record.
  let customerOk = false;
  try { await reseller.customers.get({ customerId: dom }); customerOk = true; }
  catch (_) {
    try {
      await reseller.customers.insert({ requestBody: { customerDomain: dom } });
      customerOk = true;
    } catch (e) {
      const msg = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e.message;
      throw new Error('Could not access this domain under our reseller. Make sure you pasted our transfer token in your Google Admin first. (' + msg + ')');
    }
  }

  // Step 2: does the customer already have an active subscription (transferred)? If so, count it.
  let claimed = 0;
  try {
    const existing = await reseller.subscriptions.list({ customerId: dom });
    const subs = existing.data.subscriptions || [];
    if (subs.length > 0) {
      // The transfer already carried the subscription over — nothing to create.
      return { ok: true, claimed: subs.length, note: 'Existing subscription(s) transferred and now managed by us.' };
    }
  } catch (_) { }

  // Step 3: create the subscription for the plan the customer chose + paid for.
  const planType_ = planType === 'annual' ? 'ANNUAL_MONTHLY_PAY' : 'FLEXIBLE';
  const seatsBody = planType_ === 'FLEXIBLE' ? { maximumNumberOfSeats: seats } : { numberOfSeats: seats };
  try {
    await reseller.subscriptions.insert({
      customerId: dom,
      requestBody: {
        customerId: dom,
        skuId: planDoc.skuId,
        plan: { planName: planType_ },
        seats: seatsBody,
        purchaseOrderId: 'transfer-' + Date.now(),
      },
    });
    claimed = 1;
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e.message;
    throw new Error('Could not create the subscription: ' + msg);
  }

  return { ok: true, claimed };
}

// Map a country name (or code) to a 2-letter ISO code for Google's postalAddress.
function countryNameToCode(input) {
  if (!input) return 'US';
  const s = String(input).trim();
  if (s.length === 2) return s.toUpperCase();
  const map = {
    'united states': 'US', 'usa': 'US', 'united states of america': 'US',
    'pakistan': 'PK', 'united kingdom': 'GB', 'uk': 'GB', 'canada': 'CA',
    'australia': 'AU', 'india': 'IN', 'germany': 'DE', 'france': 'FR',
    'united arab emirates': 'AE', 'uae': 'AE', 'saudi arabia': 'SA',
    'netherlands': 'NL', 'spain': 'ES', 'italy': 'IT', 'ireland': 'IE',
    'new zealand': 'NZ', 'singapore': 'SG', 'south africa': 'ZA',
    'nigeria': 'NG', 'kenya': 'KE', 'bangladesh': 'BD', 'philippines': 'PH',
    'mexico': 'MX', 'brazil': 'BR', 'japan': 'JP', 'china': 'CN',
  };
  return map[s.toLowerCase()] || 'US';
}

// Provision a workspace order into Google: create customer + create subscription
// Reusable provisioning: creates Google customer + admin user + Workspace subscription.
// Returns { success, message } or throws. Used by the manual endpoint AND auto-provision-on-payment.
async function provisionWorkspaceOrder(order) {
  const planDoc = await Plan.findOne({ planId: order.plan?.id });
  if (!planDoc || !planDoc.skuId) throw new Error('Plan is missing a Google SKU.');

  // Decide which reseller account fulfills this order (admin-controlled).
  // Priority: the order's own account if set; else the admin's enabled account (USA if on, else PK).
  let account = order.account;
  if (!account) {
    const os = await OrderSettings.findOne({ singleton: 'main' });
    if (os && os.usaOrdersEnabled && !os.pkOrdersEnabled) account = 'usa';
    else if (os && os.pkOrdersEnabled) account = 'pk';
    else if (os && os.usaOrdersEnabled) account = 'usa';
    else account = 'pk'; // safe default
  }
  const auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
  const reseller = google.reseller({ version: 'v1', auth });
  // Remember which account handled it (for billing + display)
  try { order.account = account; await order.save(); } catch (_) { }
  const org = order.organization || {};
  const contact = order.contact || {};
  const domain = (org.domain || '').toLowerCase();
  console.log(`PROVISION START: order=${order.orderNumber} domain=${domain} account=${account} planType=${order.planType || 'flexible'}`);

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
          countryCode: countryNameToCode(org.country),
        },
      },
    });
    console.log(`PROVISION [${account}] step 1 OK: customer created for ${domain}`);
  } catch (custErr) {
    const msg = custErr?.errors?.[0]?.message || custErr?.message || '';
    if (!/already exists|entity already|duplicate/i.test(msg)) {
      console.error(`PROVISION [${account}] step 1 FAILED (customer):`, msg);
      throw new Error(`Customer creation failed on the ${account.toUpperCase()} account: ${msg}`);
    }
    console.log(`PROVISION [${account}] step 1: customer already exists for ${domain} (continuing)`);
  }

  // 2) Create admin user — NON-FATAL.
  // The USA account uses OAuth which may not have domain-wide delegation to create users
  // inside the customer's domain. Google can auto-create the admin when the subscription is made,
  // so we attempt this but DO NOT fail the whole order if it doesn't work.
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
    console.log(`PROVISION [${account}] step 2 OK: admin user ${adminEmail} created`);
  } catch (userErr) {
    const msg = userErr?.errors?.[0]?.message || userErr?.message || '';
    if (/already exists|entity already|duplicate|409/i.test(msg)) {
      console.log(`PROVISION [${account}] step 2: admin user already exists (continuing)`);
    } else {
      // Non-fatal: log it, but continue to create the subscription so the customer gets their plan.
      console.error(`PROVISION [${account}] step 2 SKIPPED (admin user could not be created — likely OAuth lacks domain delegation):`, msg);
      order.provisionNote = `Admin user not auto-created on ${account.toUpperCase()}: ${msg}. Subscription still created.`;
    }
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
    console.log(`PROVISION [${account}] step 3 OK: subscription created (${planDoc.skuId}, ${planType})`);
  } catch (subErr) {
    const msg = subErr?.errors?.[0]?.message || subErr?.message || '';
    if (/already exists|entity already|duplicate|resource already/i.test(msg)) {
      // The subscription is already in Google — this domain is already provisioned. Treat as success.
      console.log(`PROVISION [${account}] step 3: subscription already exists for ${domain} (treating as provisioned)`);
    } else {
      console.error(`PROVISION [${account}] step 3 FAILED (subscription):`, msg);
      throw new Error(`Subscription creation failed on the ${account.toUpperCase()} account: ${msg}`);
    }
  }

  order.status = 'provisioned';
  order.googleProvisioned = true;
  await order.save();
  console.log(`PROVISION COMPLETE: order=${order.orderNumber} account=${account}`);
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

    // Auto-attach Workspace/Voice subscriptions to Google Reseller Console if customer has a domain set
    let attachResults = [];
    try {
      const customer = await Customer.findById(req.customerId);
      const domain = customer?.domain ? customer.domain.toLowerCase().trim() : '';
      const account = customer?.account || 'pk';

      if (domain) {
        for (const item of items) {
          if (item.productType === 'workspace' || item.productType === 'voice') {
            try {
              // Find matching plan in database
              const planDoc = await Plan.findOne({
                $or: [
                  { planId: item.productName },
                  { name: item.productName },
                  { name: new RegExp('^' + item.productName + '$', 'i') }
                ]
              });

              if (planDoc && planDoc.skuId) {
                const auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth();
                const reseller = google.reseller({ version: 'v1', auth });

                // Verify customer domain exists in Google
                let googleCustomerExists = false;
                try {
                  await reseller.customers.get({ customerId: domain });
                  googleCustomerExists = true;
                } catch (_) {
                  // Attempt to register/insert lightweight customer under reseller
                  try {
                    await reseller.customers.insert({
                      requestBody: {
                        customerDomain: domain,
                        alternateEmail: customer.businessEmail,
                        postalAddress: {
                          contactName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Admin User',
                          locality: customer.city || 'City',
                          region: customer.state || 'State',
                          postalCode: customer.postalCode || '10001',
                          countryCode: customer.country || 'US',
                          addressLine1: customer.address || '123 Street',
                        }
                      }
                    });
                    googleCustomerExists = true;
                  } catch (insErr) {
                    console.error(`Auto-create google customer failed for ${domain}:`, insErr.message);
                  }
                }

                if (googleCustomerExists) {
                  // Provision/insert subscription
                  const subResp = await reseller.subscriptions.insert({
                    customerId: domain,
                    requestBody: {
                      customerId: domain,
                      skuId: planDoc.skuId,
                      plan: { planName: 'FLEXIBLE' },
                      seats: { numberOfSeats: item.quantity, maximumNumberOfSeats: item.quantity },
                      purchaseOrderId: orderNumber,
                    },
                  });

                  const subscriptionId = subResp?.data?.subscriptionId;
                  if (subscriptionId) {
                    await Subscription.findOneAndUpdate(
                      { orderId: order._id, plan: item.productName },
                      { subscriptionId, updatedAt: new Date() }
                    );

                    // Sync billing cycle
                    try {
                      let rec = await SubBilling.findOne({ domain, skuId: planDoc.skuId });
                      if (!rec) {
                        rec = new SubBilling({ account, domain, skuId: planDoc.skuId, subscriptionId });
                        startNewBillingCycle(rec, new Date());
                      } else {
                        rec.subscriptionId = subscriptionId;
                      }
                      applyPaymentToCurrentCycle(rec, new Date());
                      await rec.save();
                    } catch (billingErr) {
                      console.error('Auto-attach billing synchronization failed:', billingErr.message);
                    }

                    attachResults.push({ item: item.productName, status: 'Attached successfully', subscriptionId });
                  } else {
                    attachResults.push({ item: item.productName, status: 'Provisioned but no Subscription ID returned' });
                  }
                } else {
                  attachResults.push({ item: item.productName, status: 'Failed to access or create customer in Google Reseller' });
                }
              } else {
                attachResults.push({ item: item.productName, status: 'Plan SKU ID not found' });
              }
            } catch (err) {
              const errMsg = err?.errors?.[0]?.message || err?.message || 'Google API error';
              console.error(`Auto-attach failed for ${item.productName}:`, errMsg);
              attachResults.push({ item: item.productName, status: 'Failed', error: errMsg });
            }
          }
        }
      }
    } catch (outerErr) {
      console.error('Outer auto-attach error:', outerErr.message);
    }

    if (attachResults.length > 0) {
      order.notes = `Auto-attach results: ${JSON.stringify(attachResults)}`;
      await order.save();
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
    const subscription = await Subscription.findOneAndUpdate(
      { _id: req.params.id, customerId: req.customerId },
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

// ==================== VOICE USAGE & ABUSE MONITORING (reseller) ====================
// Surfaces, per Voice customer: seat utilization, subscription status/age, and risk flags.
// NOTE: Google's Reseller API exposes subscription/seat data, not granular per-call logs.
// Detailed call/SMS activity requires Google Voice API/Reports access (added here if available).
app.get('/api/admin/voice/usage', authenticateCustomer, requireAdmin, async (req, res) => {
  try {
    let auth;
    try { auth = await getUsaAuth(); }
    catch (e) { return res.status(400).json({ error: e.message, notConnected: true }); }
    const reseller = google.reseller({ version: 'v1', auth });

    const voiceSkus = { '1010330003': 'Voice Starter', '1010330004': 'Voice Standard', '1010330002': 'Voice Premier' };

    // Pull all subscriptions from the USA (Voice) account
    let subs = [];
    let pageToken;
    do {
      const resp = await reseller.subscriptions.list({ maxResults: 100, pageToken });
      subs = subs.concat(resp.data.subscriptions || []);
      pageToken = resp.data.nextPageToken;
    } while (pageToken);

    const now = Date.now();
    const rows = subs
      .filter((s) => voiceSkus[String(s.skuId)])
      .map((s) => {
        const domain = s.customerDomain || s.customerId;
        const seats = s.seats?.numberOfSeats ?? s.seats?.licensedNumberOfSeats ?? 0;
        const licensed = s.seats?.licensedNumberOfSeats ?? null;
        const created = s.creationTime ? Number(s.creationTime) : null;
        const ageDays = created ? Math.floor((now - created) / 86400000) : null;

        // Heuristic flags from available signals (subscription-level)
        const flags = [];
        if (s.status === 'SUSPENDED') flags.push('suspended');
        // Idle signal: licensed seats far below purchased seats = paying for unused capacity
        if (licensed != null && seats > 0 && licensed === 0) flags.push('idle_no_licensed_seats');
        // New + high seat count can be worth reviewing (rapid scale = possible misuse)
        if (ageDays != null && ageDays < 7 && seats >= 10) flags.push('new_high_seat_count');

        return {
          domain,
          plan: voiceSkus[String(s.skuId)],
          skuId: s.skuId,
          status: s.status,
          purchasedSeats: seats,
          licensedSeats: licensed,
          utilization: seats > 0 && licensed != null ? Math.round((licensed / seats) * 100) : null,
          ageDays,
          createdAt: created,
          flags,
          risk: flags.length === 0 ? 'ok' : (flags.includes('suspended') ? 'suspended' : 'review'),
        };
      });

    const summary = {
      totalVoiceCustomers: new Set(rows.map((r) => r.domain)).size,
      totalSubscriptions: rows.length,
      flaggedForReview: rows.filter((r) => r.risk === 'review').length,
      suspended: rows.filter((r) => r.risk === 'suspended').length,
      idle: rows.filter((r) => r.flags.includes('idle_no_licensed_seats')).length,
    };

    res.json({ rows, summary });
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message || 'Could not load Voice usage.';
    res.status(500).json({ error: msg });
  }
});

// ==================== VOICE USAGE & ABUSE MONITORING end ====================

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
    const accountStats = async (account) => {
      let auth;
      try { auth = account === 'usa' ? await getUsaAuth() : await getResellerAuth(); }
      catch (e) { return { error: e.message }; }
      const reseller = google.reseller({ version: 'v1', auth });
      let subs = [];
      let pageToken;
      try {
        do {
          const resp = await reseller.subscriptions.list({ maxResults: 100, pageToken });
          subs = subs.concat(resp.data.subscriptions || []);
          pageToken = resp.data.nextPageToken;
        } while (pageToken);
      } catch (e) {
        return { error: e?.errors?.[0]?.message || e.message };
      }
      const uniqueDomains = new Set(subs.map((s) => s.customerDomain || s.customerId));
      const totalSeats = subs.reduce((sum, s) => sum + (s.seats?.numberOfSeats || 0), 0);
      return {
        totalCustomers: uniqueDomains.size,
        totalSubscriptions: subs.length,
        activeSubscriptions: subs.filter((s) => s.status === 'ACTIVE').length,
        suspendedSubscriptions: subs.filter((s) => s.status === 'SUSPENDED').length,
        totalSeats,
      };
    };

    const [pk, usa] = await Promise.all([accountStats('pk'), accountStats('usa')]);
    // Combined totals (for the top summary)
    const sum = (a, b, k) => (a && !a.error ? a[k] : 0) + (b && !b.error ? b[k] : 0);
    res.json({
      pk, usa,
      combined: {
        totalCustomers: sum(pk, usa, 'totalCustomers'),
        totalSubscriptions: sum(pk, usa, 'totalSubscriptions'),
        activeSubscriptions: sum(pk, usa, 'activeSubscriptions'),
        suspendedSubscriptions: sum(pk, usa, 'suspendedSubscriptions'),
        totalSeats: sum(pk, usa, 'totalSeats'),
      },
      // Back-compat top-level (used by older UI)
      totalCustomers: sum(pk, usa, 'totalCustomers'),
      totalSubscriptions: sum(pk, usa, 'totalSubscriptions'),
      activeSubscriptions: sum(pk, usa, 'activeSubscriptions'),
      suspendedSubscriptions: sum(pk, usa, 'suspendedSubscriptions'),
      totalSeats: sum(pk, usa, 'totalSeats'),
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

const path = require('path');
// Serve static assets from frontend/build
const frontendBuildPath = path.join(__dirname, '../frontend/build');
app.use(express.static(frontendBuildPath));

// Fallback all non-API GET requests to index.html (SPA fallback)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// Database offline / generic error handler
app.use((err, req, res, next) => {
  if (err.name === 'MongooseError' || err.name === 'MongoNetworkError' || err.message?.includes('buffering timed out') || err.message?.includes('selection timed out')) {
    console.warn('[AI Studio] Database offline — returning mock empty response');
    if (req.method === 'GET') {
      return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
    }
    return res.status(503).json({ error: 'Service temporarily unavailable (database offline)' });
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ==================== DAILY BILLING SCHEDULER ====================
// Runs the billing checks automatically at 12:00 AM every day (in-code backup to external cron).
// Set TZ env var (e.g. TZ=America/New_York) to control which timezone midnight uses.
async function runDailyBillingTasks() {
  console.log('⏰ DAILY BILLING TASKS running at', new Date().toISOString());
  if (mongoose.connection.readyState !== 1) {
    console.log('🔌 Database not connected yet, skipping daily billing task.');
    return;
  }
  try {
    // Sync existing subscriptions from Google (seeds purchase dates + monthly renewal dates),
    // then run the per-subscription monthly-anchored check (renewal = purchase day-of-month,
    // suspend 1 day before). Suspended subs stay suspended until an admin reactivates.
    await syncSubscriptionsForBilling('pk');
    await syncSubscriptionsForBilling('usa');
    const subResults = await runSubscriptionBillingCheck();
    console.log('⏰ Monthly-anchored billing:', JSON.stringify({ checked: subResults.checked, warned: subResults.warned.length, suspended: subResults.suspended.length, skippedWhitelisted: subResults.skippedWhitelisted }));
  } catch (e) {
    console.error('Daily subscription billing error:', e.message);
  }
}

function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // next 00:00:00.000
  return next.getTime() - now.getTime();
}

function scheduleDailyBilling() {
  const wait = msUntilNextMidnight();
  const hours = (wait / 3600000).toFixed(1);
  console.log(`⏰ Next daily billing run scheduled in ${hours}h (at next 12:00 AM).`);
  setTimeout(() => {
    runDailyBillingTasks();
    // Then repeat every 24 hours
    setInterval(runDailyBillingTasks, 24 * 60 * 60 * 1000);
  }, wait);
}

// Background poller: check pending Nicky crypto payments and provision when "Finished".
// Mirrors Nicky's official plugin which polls every 30s. Catches payments even if the
// customer closed the tab before confirmation.
async function pollPendingNickyPayments() {
  if (mongoose.connection.readyState !== 1) {
    return;
  }
  try {
    const pending = await Payment.find({
      method: 'nicky',
      status: { $ne: 'paid' },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // only last 24h
    }).limit(50);
    for (const p of pending) {
      try {
        const r = await checkNickyPaymentStatus(p); // marks paid + provisions if Finished
        if (r.paid) console.log('NICKY POLL: provisioned payment', String(p._id));
      } catch (_) { }
    }
  } catch (e) {
    console.error('NICKY POLL error:', e.message);
  }
}

function scheduleNickyPolling() {
  // Poll every 60 seconds
  setInterval(pollPendingNickyPayments, 60 * 1000);
  console.log('⏰ Nicky payment poller started (every 60s).');
}

// ==================== SERVER START ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('======================================================');
  console.log('🚀 BUILD MARKER: v2026-07-01 seat-counter + core-category + google-welcome + fixed-billing');
  console.log('🚀 If you see "v2026-07-01" here, the LATEST backend with the Frontline/seat fixes is deployed.');
  console.log('======================================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📧 Email service: ${process.env.EMAIL_USER}`);
  console.log(`🔐 JWT Secret configured: ${process.env.JWT_SECRET ? 'Yes' : 'No'}`);
  console.log(`☁️ Google Workspace configured: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'Yes' : 'No'}`);
  // Start the daily midnight billing scheduler
  scheduleDailyBilling();
  // Start the Nicky crypto payment poller
  scheduleNickyPolling();
  // Load Namecheap sandbox/live mode from settings
  ncResolveSandbox().then((sb) => console.log(`🌐 Namecheap mode: ${sb ? 'SANDBOX (test)' : 'LIVE'}`)).catch(() => { });
});

module.exports = app;
