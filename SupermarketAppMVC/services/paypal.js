// services/paypal.js
// Uses Node.js 18+ built-in fetch (NO node-fetch)

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = process.env.PAYPAL_API;
const DEFAULT_CURRENCY = process.env.PAYPAL_CURRENCY || "SGD";

function mustHaveEnv(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

// Validate required env vars at startup
mustHaveEnv("PAYPAL_CLIENT_ID", PAYPAL_CLIENT);
mustHaveEnv("PAYPAL_CLIENT_SECRET", PAYPAL_SECRET);
mustHaveEnv("PAYPAL_API", PAYPAL_API);

async function getAccessToken() {
  const auth = Buffer.from(
    `${PAYPAL_CLIENT}:${PAYPAL_SECRET}`
  ).toString("base64");

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
    console.error("PayPal getAccessToken failed", {
      status: response.status,
      body: data,
    });
    throw new Error(`PayPal getAccessToken failed`);
  }

  return data.access_token;
}

/**
 * Create PayPal order
 * @param {string|number} amount
 * @param {object} options
 */
async function createOrder(amount, options = {}) {
  const accessToken = await getAccessToken();

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

  if (options.shippingName) {
    payload.purchase_units[0].shipping = {
      name: { full_name: String(options.shippingName) },
    };
  }

  if (options.invoiceId) {
    payload.purchase_units[0].invoice_id = String(options.invoiceId);
  }

  if (options.description) {
    payload.purchase_units[0].description = String(options.description);
  }

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
    console.error("PayPal createOrder failed", {
      status: response.status,
      body: data,
      payload,
    });
    throw new Error(`PayPal createOrder failed`);
  }

  return data;
}

async function captureOrder(orderId) {
  if (!orderId) throw new Error("Missing orderId for captureOrder");

  const accessToken = await getAccessToken();

  const response = await fetch(
    `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("PayPal captureOrder failed", {
      status: response.status,
      body: data,
      orderId,
    });
    throw new Error(`PayPal captureOrder failed`);
  }

  return data;
}

/**
 * Refund a captured PayPal payment by capture ID.
 * If `amount` is provided, performs a partial refund for that amount
 * (currency defaults to PAYPAL_CURRENCY). Otherwise, refunds full amount.
 * @param {string} captureId
 * @param {object} options
 * @param {number|string} [options.amount]
 * @param {string} [options.currency]
 * @param {string} [options.invoiceId]
 */
async function refundCapture(captureId, options = {}) {
  if (!captureId) throw new Error("Missing captureId for refundCapture");

  const accessToken = await getAccessToken();
  const currency = options.currency || DEFAULT_CURRENCY;

  let body = {};
  if (
    typeof options.amount !== "undefined" &&
    options.amount !== null &&
    options.amount !== ""
  ) {
    const value = Number(options.amount);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid amount for refundCapture: ${options.amount}`);
    }
    body.amount = {
      currency_code: currency,
      value: value.toFixed(2),
    };
  }

  if (options.invoiceId) {
    body.invoice_id = String(options.invoiceId);
  }

  // PayPal allows empty body for full refund; send {} when no fields.
  const payload =
    Object.keys(body).length > 0 ? JSON.stringify(body) : "{}";

  const response = await fetch(
    `${PAYPAL_API}/v2/payments/captures/${captureId}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: payload,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("PayPal refundCapture failed", {
      status: response.status,
      body: data,
      captureId,
    });
    throw new Error("PayPal refundCapture failed");
  }

  return data;
}

module.exports = {
  createOrder,
  captureOrder,
  refundCapture,
};
