// WooCommerce REST API verification & checkout link integration
const axios = require('axios');

const WOOCOMMERCE_API_URL = (process.env.WOOCOMMERCE_API_URL || process.env.WORDPRESS_URL || 'https://gnbmentor.com').replace(/\/+$/, '');
const WOOCOMMERCE_CONSUMER_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WC_CONSUMER_KEY || '';
const WOOCOMMERCE_CONSUMER_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WC_CONSUMER_SECRET || '';

/**
 * Check whether WooCommerce credentials are configured
 */
function isWooCommerceConfigured() {
  return Boolean(WOOCOMMERCE_CONSUMER_KEY && WOOCOMMERCE_CONSUMER_SECRET);
}

/**
 * Verify WooCommerce order payment status directly via WooCommerce REST API v3
 * Strictly accepts status 'processing' or 'completed'.
 */
async function verifyWooCommerceOrder({ orderId, email = '', domain = '' }) {
  const cleanId = String(orderId || '').trim().replace(/^WC-/, '');
  if (!cleanId) {
    return {
      verified: false,
      reason: 'missing_order_id',
      message: 'No WooCommerce order ID provided.',
    };
  }

  // If WooCommerce API credentials are not yet configured in environment variables:
  if (!isWooCommerceConfigured()) {
    console.warn(`[WooCommerce] Consumer keys not configured (WOOCOMMERCE_CONSUMER_KEY / WOOCOMMERCE_CONSUMER_SECRET).`);
    // If in development/testing mode or explicit dev secret provided
    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_UNVERIFIED_WOO_ORDERS === 'true') {
      console.warn(`[WooCommerce DEV MODE] Allowing order #${cleanId} as test-verified.`);
      return {
        verified: true,
        orderId: cleanId,
        status: 'processing',
        simulated: true,
        total: '28.00',
        currency: 'USD',
        billingEmail: email,
        customerName: 'Customer',
        lineItems: [],
      };
    }
    return {
      verified: false,
      reason: 'api_unconfigured',
      message: 'WooCommerce API credentials are not configured on the server. Please add WOOCOMMERCE_CONSUMER_KEY and WOOCOMMERCE_CONSUMER_SECRET.',
    };
  }

  try {
    const authHeader = 'Basic ' + Buffer.from(`${WOOCOMMERCE_CONSUMER_KEY}:${WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
    const endpoint = `${WOOCOMMERCE_API_URL}/wp-json/wc/v3/orders/${encodeURIComponent(cleanId)}`;

    const response = await axios.get(endpoint, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
      timeout: 12000,
    });

    const order = response.data;
    if (!order || !order.id) {
      return {
        verified: false,
        reason: 'not_found',
        message: `Order #${cleanId} was not found in WooCommerce.`,
      };
    }

    const orderStatus = (order.status || '').toLowerCase();
    const isPaid = orderStatus === 'processing' || orderStatus === 'completed';

    // Verify billing email matches if provided
    const billingEmail = (order.billing?.email || '').toLowerCase().trim();
    const cleanExpectedEmail = (email || '').toLowerCase().trim();
    const emailMatch = !cleanExpectedEmail || !billingEmail || (billingEmail === cleanExpectedEmail);

    if (!isPaid) {
      return {
        verified: false,
        reason: 'unpaid',
        status: orderStatus,
        orderId: order.id,
        total: order.total,
        currency: order.currency,
        paymentUrl: order.payment_url || `${WOOCOMMERCE_API_URL}/checkout/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`,
        message: `Order #${cleanId} has status "${orderStatus}". Payment must be completed before Workspace provisioning.`,
      };
    }

    return {
      verified: true,
      orderId: String(order.id),
      status: orderStatus,
      total: order.total,
      currency: order.currency,
      emailMatch,
      billingEmail,
      orderKey: order.order_key,
      customerName: [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(' '),
      lineItems: order.line_items || [],
      datePaid: order.date_paid || order.date_created,
    };
  } catch (error) {
    const status = error.response?.status;
    const errData = error.response?.data;
    console.error(`[WooCommerce verify error #${cleanId}]:`, errData || error.message);

    if (status === 404) {
      return {
        verified: false,
        reason: 'not_found',
        message: `Order #${cleanId} does not exist in WooCommerce store at ${WOOCOMMERCE_API_URL}.`,
      };
    }

    return {
      verified: false,
      reason: 'api_error',
      message: `Failed to verify order #${cleanId} with WooCommerce: ${errData?.message || error.message}`,
    };
  }
}

/**
 * Generate a direct checkout link on WooCommerce store or Stripe
 */
function createWooCommerceCheckoutLink({ planId, domain, seats = 1, orderId, email = '' }) {
  const base = WOOCOMMERCE_API_URL;
  if (orderId) {
    return `${base}/checkout/order-pay/${orderId}/?pay_for_order=true`;
  }
  const params = new URLSearchParams({
    domain: domain || '',
    plan: planId || '',
    seats: String(seats || 1),
    ...(email ? { email } : {}),
  });
  return `${base}/checkout/?${params.toString()}`;
}

module.exports = {
  isWooCommerceConfigured,
  verifyWooCommerceOrder,
  createWooCommerceCheckoutLink,
  WOOCOMMERCE_API_URL,
};
