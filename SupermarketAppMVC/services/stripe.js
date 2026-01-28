const Stripe = require("stripe");

const stripe = (() => {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  return Stripe(secret);
})();

const DEFAULT_CURRENCY = (process.env.STRIPE_CURRENCY || "sgd").toLowerCase();

function dollarsToCents(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) throw new Error("Invalid amount");
  return Math.round(num * 100);
}

exports.createPaymentIntent = async (amount, metadata = {}) => {
  const cents = dollarsToCents(amount);
  return stripe.paymentIntents.create({
    amount: cents,
    currency: DEFAULT_CURRENCY,
    automatic_payment_methods: { enabled: true },
    metadata,
  });
};

exports.retrievePaymentIntent = async (intentId) => {
  if (!intentId) throw new Error("Missing paymentIntent id");
  return stripe.paymentIntents.retrieve(intentId);
};

exports.refundPayment = async (options = {}) => {
  const {
    paymentIntentId = null,
    chargeId = null,
    amount = null, // amount in dollars
    reason = "requested_by_customer",
    metadata = {},
  } = options;

  if (!paymentIntentId && !chargeId) {
    throw new Error("Missing Stripe reference (paymentIntentId or chargeId)");
  }

  const payload = {
    reason,
    metadata,
  };

  // Stripe rejects requests containing both payment_intent and charge.
  // Prefer payment_intent (newer API path); fall back to charge when intent is absent.
  if (paymentIntentId) {
    payload.payment_intent = paymentIntentId;
  } else if (chargeId) {
    payload.charge = chargeId;
  }
  if (Number.isFinite(Number(amount))) {
    payload.amount = dollarsToCents(amount);
  }

  return stripe.refunds.create(payload);
};

exports.dollarsToCents = dollarsToCents;
exports.currency = DEFAULT_CURRENCY;
