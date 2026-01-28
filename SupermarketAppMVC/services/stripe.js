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

exports.dollarsToCents = dollarsToCents;
exports.currency = DEFAULT_CURRENCY;
