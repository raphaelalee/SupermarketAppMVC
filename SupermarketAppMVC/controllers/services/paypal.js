// Use global fetch when available (Node 18+). Fallback to node-fetch if not.
let fetchLib;
if (typeof fetch === "function") {
  fetchLib = fetch;
} else {
  try {
    // node-fetch v3 is ESM and exports default; handle both v2 & v3
    const nf = require("node-fetch");
    fetchLib = nf.default || nf;
  } catch (e) {
    throw new Error("Global fetch is unavailable and node-fetch is not installed. Run `npm install node-fetch` or use Node 18+.");
  }
}

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = process.env.PAYPAL_API;
const CURRENCY = process.env.PAYPAL_CURRENCY || "SGD";

async function getAccessToken() {
  if (!PAYPAL_CLIENT || !PAYPAL_SECRET || !PAYPAL_API) {
    throw new Error("Missing PAYPAL env vars (.env)");
  }

  const response = await fetchLib(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("PayPal getAccessToken error:", response.status, data);
    throw new Error("Failed to get PayPal access token");
  }

  return data.access_token;
}

async function createOrder(amount) {
  const accessToken = await getAccessToken();

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Invalid amount");

  const response = await fetchLib(`${PAYPAL_API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: CURRENCY,
            value: amt.toFixed(2),
          },
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("PayPal createOrder error:", response.status, data);
    throw new Error("Failed to create PayPal order");
  }

  return data; // contains id
}

async function captureOrder(orderId) {
  const accessToken = await getAccessToken();
  if (!orderId) throw new Error("Missing orderId");

  const response = await fetchLib(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("PayPal captureOrder error:", response.status, data);
    throw new Error("Failed to capture PayPal order");
  }

  return data;
}

module.exports = { createOrder, captureOrder };
