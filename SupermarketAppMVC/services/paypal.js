// services/paypal.js
const fetch = require("node-fetch");

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;

// IMPORTANT:
// For sandbox use: https://api-m.sandbox.paypal.com
// For live use:    https://api-m.paypal.com
const PAYPAL_API = process.env.PAYPAL_API;

const DEFAULT_CURRENCY = process.env.PAYPAL_CURRENCY || "SGD";

function mustHaveEnv(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

mustHaveEnv("PAYPAL_CLIENT_ID", PAYPAL_CLIENT);
mustHaveEnv("PAYPAL_CLIENT_SECRET", PAYPAL_SECRET);
mustHaveEnv("PAYPAL_API", PAYPAL_API);

async function getAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString("base64");

  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`PayPal getAccessToken failed: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

/**
 * Create PayPal order
 * @param {string|number} amount - Total amount, e.g. "12.34"
 * @param {object} options
 * @param {string} options.currency - e.g. "SGD"
 * @param {string} options.invoiceId - your internal order id (optional)
 * @param {string} options.description - optional text
 */
async function createOrder(amount, options = {}) {
  const accessToken = await getAccessToken();

  // Force proper 2dp money string
  const value = Number(amount).toFixed(2);
  if (Number.isNaN(Number(value)) || Number(value) <= 0) {
    throw new Error(`Invalid amount for createOrder: ${amount}`);
  }

  const currency = options.currency || DEFAULT_CURRENCY;

  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: currency,
          value,
        },
      },
    ],
  };

  // Optional helpful metadata
  if (options.invoiceId) payload.purchase_units[0].invoice_id = String(options.invoiceId);
  if (options.description) payload.purchase_units[0].description = String(options.description);

  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`PayPal createOrder failed: ${JSON.stringify(data)}`);
  }

  return data; // includes data.id
}

async function captureOrder(orderId) {
  const accessToken = await getAccessToken();

  if (!orderId) throw new Error("Missing orderId for captureOrder");

  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`PayPal captureOrder failed: ${JSON.stringify(data)}`);
  }

  return data;
}

module.exports = { createOrder, captureOrder };
