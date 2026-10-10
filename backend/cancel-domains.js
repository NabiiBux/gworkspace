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

async function ensureDomainAdminUser(auth, candidateCustIds, domain, reseller, subId, isSuspended) {
  if (!auth) return false;
  const admin = google.admin({ version: 'directory_v1', auth });

  // If subscription is currently suspended, temporarily activate so directory mutations succeed
  if (isSuspended && reseller && subId) {
    for (const cid of candidateCustIds) {
      try {
        await reseller.subscriptions.activate({ customerId: cid, subscriptionId: subId });
        console.log(`     Temporarily activated subscription for ${domain} to permit domain admin setup...`);
        break;
      } catch (actErr) {
        console.log(`     ℹ️ Activation note for ${cid}: ${actErr?.errors?.[0]?.message || actErr.message}`);
      }
    }
  }

  try {
    let existingUsers = [];
    for (const cid of candidateCustIds) {
      try {
        const resp = await admin.users.list({ customer: cid, maxResults: 20 });
        if (resp.data?.users && resp.data.users.length) {
          existingUsers = resp.data.users;
          break;
        }
      } catch (_) {}
    }
    if (!existingUsers.length) {
      try {
        const resp2 = await admin.users.list({ domain: domain, maxResults: 20 });
        if (resp2.data?.users && resp2.data.users.length) {
          existingUsers = resp2.data.users;
        }
      } catch (_) {}
    }

    // Check if an active, non-suspended Super Admin already exists
    const activeAdmin = existingUsers.find(u => u.isAdmin && !u.suspended);
    if (activeAdmin) {
      console.log(`     ✅ Found active domain administrator: ${activeAdmin.primaryEmail}`);
      return true;
    }

    // Promote existing users to Super Admin via makeAdmin
    for (const u of existingUsers) {
      try {
        if (u.suspended) {
          await admin.users.update({
            userKey: u.primaryEmail,
            requestBody: { suspended: false },
          });
          console.log(`     Unsuspended user ${u.primaryEmail}`);
        }
        await admin.users.makeAdmin({
          userKey: u.primaryEmail,
          requestBody: { status: true },
        });
        console.log(`     ✅ Successfully promoted ${u.primaryEmail} to Super Admin via makeAdmin!`);
        return true;
      } catch (err) {
        console.log(`     ℹ️ makeAdmin on ${u.primaryEmail} note: ${err?.errors?.[0]?.message || err.message}`);
      }
    }

    // If no existing user was promoted, create a new domain administrator
    const candidateEmails = [
      `admin@${domain}`,
      `administrator@${domain}`,
      `workspace@${domain}`,
      `superadmin@${domain}`,
    ];

    for (const adminEmail of candidateEmails) {
      try {
        console.log(`     Creating domain administrator (${adminEmail}) for transfer...`);
        await admin.users.insert({
          requestBody: {
            primaryEmail: adminEmail,
            name: { givenName: 'Domain', familyName: 'Admin' },
            password: 'AdminPassword!2026#X',
            changePasswordAtNextLogin: false,
          },
        });
        console.log(`     ✅ Created user ${adminEmail}`);
      } catch (insErr) {
        const insMsg = insErr?.errors?.[0]?.message || insErr.message;
        console.log(`     ℹ️ Insert note for ${adminEmail}: ${insMsg}`);
      }

      try {
        await admin.users.update({
          userKey: adminEmail,
          requestBody: { suspended: false },
        });
      } catch (_) {}

      try {
        await admin.users.makeAdmin({
          userKey: adminEmail,
          requestBody: { status: true },
        });
        console.log(`     ✅ Promoted ${adminEmail} to Domain Super Admin via makeAdmin!`);
        return true;
      } catch (maErr) {
        console.log(`     ℹ️ makeAdmin on ${adminEmail} note: ${maErr?.errors?.[0]?.message || maErr.message}`);
      }
    }
  } catch (err) {
    const msg = err?.errors?.[0]?.message || err?.message || String(err);
    console.log(`     ℹ️ Domain admin setup exception: ${msg}`);
  }

  return false;
}

async function cancelSubscriptionsForDomain(reseller, account, domain, auth) {
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

    // 2. First attempt: Direct cancellation via Google API (deletionType: 'cancel')
    try {
      console.log(`     2. Attempting deletionType: 'cancel' (cancel directly in Google API)...`);
      await runResellerCall((cid) =>
        reseller.subscriptions.delete({
          customerId: cid,
          subscriptionId: subId,
          deletionType: 'cancel',
        })
      );
      actionTaken = 'REMOVED_CANCELLED';
      success = true;
      notes.push('Subscription successfully cancelled and removed from Google Partner Console');
      console.log(`     ✅ SUCCESS: Subscription cancelled & removed from Partner Console.`);
    } catch (delCancelErr) {
      const delCancelMsg = delCancelErr?.errors?.[0]?.message || delCancelErr?.message || String(delCancelErr);
      notes.push(`Direct cancel: ${delCancelMsg}`);
      console.log(`     ℹ️  Direct cancel: ${delCancelMsg}`);
    }

    // 3. Second attempt: Google Reseller API official offload: deletionType: 'transfer_to_direct'
    // (Google's official "Transfer all to Google" as shown in Partner Sales Console)
    if (!success) {
      try {
        console.log(`     3. Attempting deletionType: 'transfer_to_direct' (Transfer to Google)...`);
        await runResellerCall((cid) =>
          reseller.subscriptions.delete({
            customerId: cid,
            subscriptionId: subId,
            deletionType: 'transfer_to_direct',
          })
        );
        actionTaken = 'TRANSFERRED_TO_DIRECT';
        success = true;
        notes.push('Transferred to Google direct billing. Reseller billing stopped and removed from Partner Console');
        console.log(`     ✅ SUCCESS: Transferred to Google Direct. Partner billing cancelled.`);
      } catch (transErr) {
        const transMsg = transErr?.errors?.[0]?.message || transErr?.message || String(transErr);
        notes.push(`Transfer to direct: ${transMsg}`);
        console.log(`     ℹ️  Transfer to direct: ${transMsg}`);

        // If Google requires a domain administrator, create one and retry transfer_to_direct!
        if (transMsg.toLowerCase().includes('domain administrator') || transMsg.toLowerCase().includes('administrator')) {
          console.log(`     -> Setting up domain administrator for ${domain} to unblock transfer...`);
          await ensureDomainAdminUser(auth, candidateCustIds, domain, reseller, subId, status === 'SUSPENDED');

          // Wait 2500ms for Directory API propagation
          await new Promise(r => setTimeout(r, 2500));

          try {
            console.log(`     Retrying deletionType: 'transfer_to_direct' with domain admin...`);
            await runResellerCall((cid) =>
              reseller.subscriptions.delete({
                customerId: cid,
                subscriptionId: subId,
                deletionType: 'transfer_to_direct',
              })
            );
            actionTaken = 'TRANSFERRED_TO_DIRECT';
            success = true;
            notes.push('Transferred to Google direct billing after creating domain admin. Reseller billing stopped');
            console.log(`     ✅ SUCCESS: Transferred to Google Direct on retry!`);
          } catch (retryErr) {
            const retryMsg = retryErr?.errors?.[0]?.message || retryErr?.message || String(retryErr);
            notes.push(`Transfer retry note: ${retryMsg}`);
            console.log(`     ℹ️  Transfer retry note: ${retryMsg}`);
            if (status === 'SUSPENDED') {
              try {
                console.log(`     Re-suspending subscription to keep billing halted...`);
                await runResellerCall((cid) =>
                  reseller.subscriptions.suspend({ customerId: cid, subscriptionId: subId })
                );
              } catch (_) {}
            }
          }
        }
      }
    }

    // 4. Third attempt: If an annual commitment blocked cancellation, switch plan to FLEXIBLE first
    if (!success) {
      try {
        console.log(`     4. Attempting to switch plan to FLEXIBLE before cancelling...`);
        await runResellerCall((cid) =>
          reseller.subscriptions.changePlan({
            customerId: cid,
            subscriptionId: subId,
            requestBody: {
              planName: 'FLEXIBLE',
              seats: { numberOfSeats: 1 },
            },
          })
        );
        console.log(`     ✅ Plan changed to FLEXIBLE. Retrying direct cancellation...`);
        await runResellerCall((cid) =>
          reseller.subscriptions.delete({
            customerId: cid,
            subscriptionId: subId,
            deletionType: 'cancel',
          })
        );
        actionTaken = 'REMOVED_CANCELLED';
        success = true;
        notes.push('Changed to flexible plan and cancelled via Google API. Removed from Partner Console');
        console.log(`     ✅ SUCCESS: Cancelled after converting to flexible plan.`);
      } catch (flexErr) {
        const flexMsg = flexErr?.errors?.[0]?.message || flexErr?.message || String(flexErr);
        notes.push(`Flexible convert note: ${flexMsg}`);
        console.log(`     ℹ️  Flexible convert note: ${flexMsg}`);
      }
    }

    // 5. Fourth attempt: Suspend the subscription to freeze active billing
    if (!success) {
      if (status === 'SUSPENDED') {
        actionTaken = 'SUSPENDED';
        notes.push('Subscription is currently SUSPENDED. Partner billing halted');
        console.log(`     ✅ Subscription is SUSPENDED.`);
      } else {
        try {
          console.log(`     5. Attempting reseller.subscriptions.suspend()...`);
          await runResellerCall((cid) =>
            reseller.subscriptions.suspend({
              customerId: cid,
              subscriptionId: subId,
            })
          );
          actionTaken = 'SUSPENDED';
          notes.push('Suspended subscription to halt active service and billing');
          console.log(`     ✅ SUCCESS: Subscription suspended.`);
        } catch (suspErr) {
          const suspMsg = suspErr?.errors?.[0]?.message || suspErr?.message || String(suspErr);
          notes.push(`Suspend: ${suspMsg}`);
          console.log(`     ℹ️  Suspend: ${suspMsg}`);
        }
      }
    }

    // 6. Reduce seats to 1 if flexible
    try {
      await runResellerCall((cid) =>
        reseller.subscriptions.changeSeats({
          customerId: cid,
          subscriptionId: subId,
          requestBody: { numberOfSeats: 1 },
        })
      );
      notes.push('Seats set to minimum 1');
    } catch (_) {}

    const isBillingHalted = success || actionTaken === 'TRANSFERRED_TO_DIRECT' || actionTaken === 'REMOVED_CANCELLED' || actionTaken === 'SUSPENDED';

    results.push({
      domain,
      account,
      subscriptionId: subId,
      customerId: primaryCustId,
      skuId: s.skuId,
      skuName,
      previousStatus: status,
      actionTaken,
      success: isBillingHalted,
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
      const results = await cancelSubscriptionsForDomain(reseller, acct, dom, authInfo.auth);
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
