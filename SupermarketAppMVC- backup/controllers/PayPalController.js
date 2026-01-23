// controllers/PayPalController.js
const paypal = require("../services/paypal");

// Example: cart stored in session as [{ price: 3.50, qty: 2 }, ...]
// If your cart is in DB, swap this out for a DB query.
function calcCartTotal(cart) {
  const total = (cart || []).reduce((sum, item) => {
    const price = Number(item.price);
    const qty = Number(item.qty);
    return sum + (Number.isFinite(price) && Number.isFinite(qty) ? price * qty : 0);
  }, 0);

  return total.toFixed(2);
}

exports.createOrder = async (req, res) => {
  try {
    const cart = req.session.cart || [];
    if (!cart.length) return res.status(400).json({ error: "Cart is empty" });

    // IMPORTANT: compute total server-side
    const total = calcCartTotal(cart);

    // Optional: add invoiceId if you already created an order row in DB
    const order = await paypal.createOrder(total, {
      currency: "SGD",
      description: "Supermarket checkout",
    });

    res.json({ id: order.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.captureOrder = async (req, res) => {
  try {
    const { orderID } = req.params;

    const capture = await paypal.captureOrder(orderID);

    // Basic success check
    // PayPal often returns status: "COMPLETED" when capture succeeds
    const status = capture?.status;

    if (status !== "COMPLETED") {
      return res.status(400).json({ error: "Payment not completed", details: capture });
    }

    // TODO: update your DB orders table -> PAID
    // TODO: clear cart
    req.session.cart = [];

    res.json(capture);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
