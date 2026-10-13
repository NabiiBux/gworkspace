/**
 * Standalone Google Workspace Reseller Subscription Cancellation Script
 *
 * Designed to safely cancel subscriptions and stop recurring monthly reseller billing
 * for specified customer domains via the Google Workspace Reseller API v1.
 *
 * Usage on VPS:
 *   cd /opt/gworkspace/backend
 *   node cancel-domains.js [optional domain1 domain2 ...]
 *
 * Defaults to:
 *   daskacity.com relpvaa.com qenalora.com coloradohaven.shop
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { google } = require('googleapis');
let mongoose;
try {
  mongoose = require('mongoose');
} catch (_) {}

// 1. Load Environment Variables from possible locations
const envPaths = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '../.env'),
  '/opt/gworkspace/backend/.env',
  '/opt/gworkspace/.env',
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}
dotenv.config();

const PROVISION_SCOPES = [
  'https://www.googleapis.com/auth/apps.order',
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.domain',
  'https://www.googleapis.com/auth/siteverification',
];

// Target domains to cancel
const TARGET_DOMAINS = process.argv.slice(2).length > 0
  ? process.argv.slice(2).map(d => d.trim().toLowerCase())
  : ['daskacity.com', 'relpvaa.com', 'qenalora.com', 'coloradohaven.shop'];

console.log('===============================================================');
console.log(' GOOGLE WORKSPACE RESELLER SUBSCRIPTION CANCELLATION TOOL');
console.log('===============================================================');
console.log('Target domains to cancel:');
TARGET_DOMAINS.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
console.log('===============================================================\n');

function getServiceAccountAuth(account) {
  const isUsa = account === 'usa';
  const rawJson = isUsa
    ? process.env.GOOGLE_SERVICE_ACCOUNT_JSON_USA
    : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!rawJson) return null;

  let creds;
  try {
    creds = JSON.parse(rawJson);
  } catch (err) {
    return null;
  }

  const subject = isUsa
    ? (process.env.RESELLER_ADMIN_EMAIL_USA || 'admin@artisandrywallaz.com')
    : (process.env.RESELLER_ADMIN_EMAIL || 'admin@gnbmentor.com');

  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: PROVISION_SCOPES,
    subject,
  });
}

function makeOAuthClient(account) {
  const isUsa = account === 'usa';
  const clientId = isUsa ? process.env.GOOGLE_OAUTH_CLIENT_ID_USA : process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = isUsa ? process.env.GOOGLE_OAUTH_CLIENT_SECRET_USA : process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = isUsa ? process.env.GOOGLE_OAUTH_REDIRECT_URI_USA : process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function getAuth(account) {
  // 1. Try Service Account with domain-wide delegation
  const sa = getServiceAccountAuth(account);
  if (sa) {
    return { auth: sa, type: 'Service Account' };
  }

  // 2. Try MongoDB GoogleConnection
  if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const conn = await mongoose.connection.db.collection('googleconnections').findOne({ account });
      if (conn && conn.refreshToken) {
        const oauth = makeOAuthClient(account);
        if (oauth) {
          oauth.setCredentials({ refresh_token: conn.refreshToken });
          return { auth: oauth, type: 'OAuth (MongoDB)' };
        }
      }
    } catch (_) {}
  }

  // 3. Try local json fallback
  try {
    const jsonPath = path.join(__dirname, 'google_connections.json');
    if (fs.existsSync(jsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (parsed[account] && parsed[account].refreshToken) {
        const oauth = makeOAuthClient(account);
        if (oauth) {
          oauth.setCredentials({ refresh_token: parsed[account].refreshToken });
          return { auth: oauth, type: 'OAuth (local JSON)' };
        }
      }
    }
  } catch (_) {}

  return null;
}

async function cancelSubscriptionsForDomain(reseller, account, domain) {
  const results = [];
  let subs = [];

  // Step 1: Query subscriptions directly by domain
  try {
    const resp = await reseller.subscriptions.list({ customerId: domain });
    subs = resp.data?.subscriptions || [];
  } catch (err) {
    // 404 or customer ID format error: try to look up customer first
    try {
      const custResp = await reseller.customers.get({ customerId: domain });
      const custId = custResp.data?.customerId;
      if (custId && custId !== domain) {
        const resp2 = await reseller.subscriptions.list({ customerId: custId });
        subs = resp2.data?.subscriptions || [];
      }
    } catch (_) {}
  }

  // Step 2: If no subs found directly, check global subscription list for matches
  if (!subs.length) {
    try {
      let pageToken;
      do {
        const listResp = await reseller.subscriptions.list({ maxResults: 100, pageToken });
        const batch = listResp.data?.subscriptions || [];
        for (const s of batch) {
          const sDom = (s.customerDomain || s.customerId || '').toLowerCase();
          if (sDom === domain) {
            subs.push(s);
          }
        }
        pageToken = listResp.data?.nextPageToken;
      } while (pageToken && subs.length === 0);
    } catch (_) {}
  }

  if (!subs.length) {
    return results; // No subscriptions found in this account
  }

  console.log(`\nFound ${subs.length} subscription(s) for ${domain} in [${account.toUpperCase()}] account:`);

  // Step 3: Cancel / Offload each subscription to stop all partner reseller billing
  for (const s of subs) {
    const subId = s.subscriptionId;
    const skuName = s.skuName || s.skuId;
    const planName = s.plan?.planName || 'N/A';
    const status = s.status || 'UNKNOWN';

    // Candidate customer IDs: try unique customer ID (e.g. C0xxxx) and domain name
    const candidateCustIds = [...new Set([s.customerId, domain, s.customerDomain].filter(Boolean))];
    const primaryCustId = candidateCustIds[0] || domain;

    console.log(`  -> Sub ID: ${subId} | SKU: ${skuName} | Plan: ${planName} | Status: ${status} | Cust: ${primaryCustId}`);

    let actionTaken = '';
    let success = false;
    const notes = [];

    // Helper to attempt a reseller call across candidate customer IDs
    const runResellerCall = async (fn) => {
      let lastErr = null;
      for (const cid of candidateCustIds) {
        try {
          return await fn(cid);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    };

    // 1. Immediately disable auto-renewal so commitment plans never renew (changeRenewalSettings)
    try {
      console.log(`     1. Setting renewalSettings to CANCEL (stops future commitment renewal)...`);
      await runResellerCall((cid) =>
        reseller.subscriptions.changeRenewalSettings({
          customerId: cid,
          subscriptionId: subId,
          requestBody: { renewalType: 'CANCEL' },
        })
      );
      notes.push('Auto-renew disabled (renewalType: CANCEL)');
      console.log(`     ✅ Auto-renew set to CANCEL.`);
    } catch (renErr) {
      const renMsg = renErr?.errors?.[0]?.message || renErr?.message || String(renErr);
      notes.push(`Renewal settings note: ${renMsg}`);
      console.log(`     ℹ️  Renewal setting note: ${renMsg}`);
    }

    // 2. Attempt Google Reseller API official offload: deletionType: 'transfer_to_direct'
    // This detaches the subscription from reseller billing and transitions the customer to direct Google billing.
    try {
      console.log(`     2. Attempting deletionType: 'transfer_to_direct' (releases reseller from billing)...`);
      await runResellerCall((cid) =>
        reseller.subscriptions.delete({
          customerId: cid,
          subscriptionId: subId,
          deletionType: 'transfer_to_direct',
        })
      );
      actionTaken = 'TRANSFERRED_TO_DIRECT';
      success = true;
      notes.push('Transferred to Google direct billing. Reseller billing stopped immediately');
      console.log(`     ✅ SUCCESS: Transferred to Google Direct. Partner billing cancelled.`);
    } catch (transErr) {
      const transMsg = transErr?.errors?.[0]?.message || transErr?.message || String(transErr);
      notes.push(`Transfer to direct: ${transMsg}`);
      console.log(`     ℹ️  Transfer to direct: ${transMsg}`);
    }

    // 3. If transfer_to_direct was not accepted, try deletionType: 'suspend'
    if (!success) {
      try {
        console.log(`     3. Attempting deletionType: 'suspend'...`);
        await runResellerCall((cid) =>
          reseller.subscriptions.delete({
            customerId: cid,
            subscriptionId: subId,
            deletionType: 'suspend',
          })
        );
        actionTaken = 'DELETED_SUSPENDED';
        success = true;
        notes.push('Subscription removed/suspended via delete');
        console.log(`     ✅ SUCCESS: Subscription suspended via delete.`);
      } catch (delSuspErr) {
        const delSuspMsg = delSuspErr?.errors?.[0]?.message || delSuspErr?.message || String(delSuspErr);
        notes.push(`Delete suspend: ${delSuspMsg}`);
        console.log(`     ℹ️  Delete suspend: ${delSuspMsg}`);
      }
    }

    // 4. If not yet resolved, attempt direct suspension or check if already suspended
    if (!success) {
      if (status === 'SUSPENDED') {
        actionTaken = 'ALREADY_SUSPENDED';
        success = true;
        notes.push('Subscription was already SUSPENDED. Active services and billing halted');
        console.log(`     ✅ Subscription is already SUSPENDED.`);
      } else {
        try {
          console.log(`     4. Attempting reseller.subscriptions.suspend()...`);
          await runResellerCall((cid) =>
            reseller.subscriptions.suspend({
              customerId: cid,
              subscriptionId: subId,
            })
          );
          actionTaken = 'SUSPENDED';
          success = true;
          notes.push('Suspended subscription to stop active service and billing');
          console.log(`     ✅ SUCCESS: Subscription suspended.`);
        } catch (suspErr) {
          const suspMsg = suspErr?.errors?.[0]?.message || suspErr?.message || String(suspErr);
          notes.push(`Suspend: ${suspMsg}`);
          console.log(`     ℹ️  Suspend: ${suspMsg}`);
          if (suspMsg.toLowerCase().includes('already suspended') || suspMsg.toLowerCase().includes('inactive')) {
            actionTaken = 'ALREADY_SUSPENDED';
            success = true;
          }
        }
      }
    }

    // 5. Attempt seat reduction to 0 or 1 if flexible plan allows
    try {
      await runResellerCall((cid) =>
        reseller.subscriptions.changeSeats({
          customerId: cid,
          subscriptionId: subId,
          requestBody: { numberOfSeats: 0 },
        })
      );
      notes.push('Seats reduced to 0');
    } catch (_) {
      try {
        await runResellerCall((cid) =>
          reseller.subscriptions.changeSeats({
            customerId: cid,
            subscriptionId: subId,
            requestBody: { numberOfSeats: 1 },
          })
        );
        notes.push('Seats reduced to 1');
      } catch (_) {}
    }

    // 6. Final resolution
    if (!success) {
      if (notes.some((n) => n.includes('renewalType: CANCEL'))) {
        actionTaken = 'NON_RENEWING_COMMITMENT';
        success = true;
        notes.push('Commitment renewal disabled. Service will terminate at commitment end');
      } else {
        actionTaken = 'FAILED';
      }
    }

    results.push({
      domain,
      account,
      subscriptionId: subId,
      customerId: primaryCustId,
      skuId: s.skuId,
      skuName,
      previousStatus: status,
      actionTaken,
      success,
      detail: notes.join('. '),
    });
  }

  return results;
}

async function cleanLocalDatabase(domain) {
  if (!mongoose || !mongoose.connection || mongoose.connection.readyState !== 1) {
    return;
  }
  try {
    const db = mongoose.connection.db;

    // SubBilling
    const sbRes = await db.collection('subbillings').updateMany(
      { domain },
      { $set: { active: false, status: 'cancelled', autoRenew: false, updatedAt: new Date() } }
    );

    // Subscriptions
    const subRes = await db.collection('subscriptions').updateMany(
      { $or: [{ domain }, { customerDomain: domain }] },
      { $set: { status: 'CANCELLED', autoRenew: false, updatedAt: new Date() } }
    );

    // ServiceBillingCycle
    const sbcRes = await db.collection('servicebillingcycles').updateMany(
      { domain },
      { $set: { status: 'cancelled', active: false, updatedAt: new Date() } }
    );

    // WorkspaceOrders
    const woRes = await db.collection('workspaceorders').updateMany(
      { domain },
      { $set: { status: 'cancelled', updatedAt: new Date() } }
    );

    console.log(`  [Database] Deactivated local billing tracking for ${domain} (${sbRes.modifiedCount} subbilling, ${subRes.modifiedCount} subs, ${sbcRes.modifiedCount} billing cycles).`);
  } catch (dbErr) {
    console.log(`  [Database] Warning during DB update: ${dbErr.message}`);
  }
}

async function main() {
  // Connect to DB if available
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/workspace-reseller';
  if (mongoose && mongoUri && !mongoUri.startsWith('#')) {
    try {
      console.log('Connecting to database...');
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 4000 });
      console.log('Connected to MongoDB.\n');
    } catch (e) {
      console.log(`MongoDB connection skipped (${e.message}). Proceeding directly with Google APIs...\n`);
    }
  }

  const allSummary = [];

  for (const acct of ['pk', 'usa']) {
    console.log(`---------------------------------------------------------------`);
    console.log(`Checking Reseller Account: ${acct.toUpperCase()}`);
    console.log(`---------------------------------------------------------------`);

    const authInfo = await getAuth(acct);
    if (!authInfo) {
      console.log(`Reseller account [${acct.toUpperCase()}] credentials not configured in environment.`);
      continue;
    }

    console.log(`Using ${authInfo.type} authentication for [${acct.toUpperCase()}]`);
    const reseller = google.reseller({ version: 'v1', auth: authInfo.auth });

    for (const dom of TARGET_DOMAINS) {
      const results = await cancelSubscriptionsForDomain(reseller, acct, dom);
      if (results && results.length) {
        allSummary.push(...results);
        await cleanLocalDatabase(dom);
      }
    }
  }

  console.log('\n===============================================================');
  console.log(' FINAL CANCELLATION REPORT');
  console.log('===============================================================');

  if (!allSummary.length) {
    console.log('No active subscriptions found for the requested domains in the configured reseller accounts.');
    console.log('Please verify:');
    console.log('  1. Are you running this on the VPS where production credentials are loaded?');
    console.log('  2. Were the domains already cancelled or under a different reseller account?');
  } else {
    for (const item of allSummary) {
      const icon = item.success ? '✅' : '❌';
      console.log(`${icon} Domain: ${item.domain.padEnd(22)} | Acct: ${item.account.toUpperCase()} | Sub: ${item.subscriptionId} | Result: ${item.actionTaken}`);
      console.log(`   Details: ${item.detail}`);
    }
  }

  console.log('===============================================================\n');

  if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
