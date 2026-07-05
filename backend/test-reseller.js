const mongoose = require('mongoose');
const { google } = require('googleapis');
const dotenv = require('dotenv');

// Load env from both root and backend just in case
dotenv.config({ path: '../.env' });
dotenv.config();

// Connect to DB to load GoogleConnection
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/workspace-reseller';

// Reuse original reseller
const originalReseller = google.reseller;

// Define schemas to match backend
const GoogleConnectionSchema = new mongoose.Schema({
  account: { type: String, default: 'pk', index: true },
  name: { type: String, default: 'Reseller Google Connection' },
  refreshToken: String,
  accessToken: String,
  tokenExpiry: Date,
  connectedEmail: String,
  scopes: [String],
  active: { type: Boolean, default: true },
});
const GoogleConnection = mongoose.model('GoogleConnection', GoogleConnectionSchema);

const PROVISION_SCOPES = [
  'https://www.googleapis.com/auth/apps.order',
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.domain',
  'https://www.googleapis.com/auth/siteverification',
];

function getUsaServiceAccountAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_USA) {
    console.log("No GOOGLE_SERVICE_ACCOUNT_JSON_USA in env.");
    return null;
  }
  let creds;
  try {
    creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_USA);
  } catch (e) {
    console.error('GOOGLE_SERVICE_ACCOUNT_JSON_USA parsing failed:', e.message);
    return null;
  }
  const subject = process.env.RESELLER_ADMIN_EMAIL_USA || 'admin@artisandrywallaz.com';
  console.log("USA Service Account Subject email used:", subject);
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: PROVISION_SCOPES,
    subject,
  });
}

function makeUsaOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID_USA,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET_USA,
    process.env.GOOGLE_OAUTH_REDIRECT_URI_USA
  );
}

async function getUsaAuth() {
  const sa = getUsaServiceAccountAuth();
  if (sa) {
    console.log("Using USA Service Account Auth.");
    return sa;
  }
  console.log("Falling back to USA OAuth connection.");
  const conn = await GoogleConnection.findOne({ account: 'usa' });
  if (!conn || !conn.refreshToken) {
    throw new Error('USA reseller not connected via OAuth or SA.');
  }
  console.log("Found USA OAuth connection for email:", conn.connectedEmail);
  const oauth2 = makeUsaOAuthClient();
  oauth2.setCredentials({ refresh_token: conn.refreshToken });
  return oauth2;
}

async function run() {
  try {
    console.log("Connecting to MongoDB with URI:", mongoUri.replace(/:([^@]+)@/, ':***@'));
    await mongoose.connect(mongoUri);
    console.log("Connected.");

    const auth = await getUsaAuth();
    const reseller = originalReseller.call(google, { version: 'v1', auth });

    const domain = 'swiftvoice24.site';
    console.log(`Calling reseller.subscriptions.list for customerId/domain: ${domain}...`);
    try {
      const resp = await reseller.subscriptions.list({ customerId: domain });
      console.log("SUCCESS! Subscriptions found:", JSON.stringify(resp.data, null, 2));
    } catch (apiErr) {
      console.error("API Call Failed with Error:");
      console.error("Status Code:", apiErr.code);
      console.error("Message:", apiErr.message);
      console.error("Errors:", JSON.stringify(apiErr.errors, null, 2));
      console.error("Full error object properties:", Object.keys(apiErr));
    }
  } catch (err) {
    console.error("General error in run script:", err);
  } finally {
    await mongoose.connect(mongoUri);
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

run();
