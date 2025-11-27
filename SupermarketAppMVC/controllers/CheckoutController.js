// controllers/CheckoutController.js (session-based, no DB)
const Order = require("../models/order");
const UserCart = require("../models/userCart");

exports.renderCheckout = (req, res) => {
  const cart = req.session.cart || {};
  const ids = Object.keys(cart);
  const items = res.locals.cartDetailed || [];
  const total = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);

  res.render("checkout", { total, items, user: req.session.user || null });
};

// NOTES (CheckoutController)
// - processCheckout builds an `orderPayload` and stores it in `req.session.lastOrder` so the receipt can be shown immediately.
//   * To persist orders permanently change `Order.createOrder` (models/order.js) or write to your DB and include an order lookup in `renderReceipt`.
// - Pickup handling: mark an order as picked up by setting `order.deliveryStatus = 'completed'` or `order.pickedUp = true` on the server.
// - Safe demo edits: change flash text, alter redirect target, or tweak fee calculation for test cases. Avoid changing core object keys unless you update views that read them.


exports.processCheckout = (req, res) => {
  const items = res.locals.cartDetailed || [];
  if (!items.length) {
    req.flash("error", "Your cart is empty.");
    return res.redirect("/cart");
  }

  const deliveryMethod = req.body.deliveryMethod || "standard";
  const deliveryFee = parseFloat(req.body.deliveryFee || 0);
  // Normalize and validate shipping phone for non-pickup deliveries
  const rawPhone = (req.body.shippingPhone || "").toString();
  const digitsOnly = rawPhone.replace(/\D/g, ''); // strip non-digits
  // Accept formats like '81234567' or '+6581234567' but ensure 8 final digits
  if (deliveryMethod !== 'pickup') {
    const last8 = digitsOnly.slice(-8);
    if (!/^\d{8}$/.test(last8)) {
      req.flash('error', 'Contact number must be exactly 8 digits.');
      return res.redirect('/checkout');
    }
  }
  const paymentMethod = req.body.payment || "paynow";
  const subtotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
  const total = subtotal + deliveryFee;
  const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

  const orderPayload = {
    orderNumber,
    userId: req.session.user ? req.session.user.id : null,
    subtotal,
    deliveryFee,
    total,
    deliveryMethod,
    paymentMethod,
    shippingPhone: digitsOnly ? digitsOnly.slice(-8) : null,
    // Persist customer contact info so guest orders can be claimed later
    customerName: req.body.shippingName || (req.session.user && req.session.user.username) || null,
    customerEmail: (req.session.user && req.session.user.email) || (req.body.customerEmail || null),
    customerPhone: digitsOnly ? digitsOnly.slice(-8) : null,
    paid: true, // We treat completed checkout as paid
    createdAt: new Date().toISOString(),
    items,
  };

  Order.createOrder(orderPayload, items, (err, orderId) => {
    if (err) {
      console.error("Failed to persist order:", err);
      req.flash("error", "Order placed but not saved to admin dashboard.");
    } else {
      if (orderId) {
        orderPayload.id = orderId;
      }
      // Only show success when the order was saved to the DB
      req.flash("success", "Order placed successfully!");
    }

    // Store order in session for receipt (always keep receipt view available)
    req.session.lastOrder = orderPayload;
    req.session.cart = {}; // Clear cart
    if (req.session.user?.id) {
      UserCart.clearCart(req.session.user.id, (clearErr) => {
        if (clearErr) {
          console.error(
            `Failed to clear persisted cart for user ${req.session.user.id} after checkout:`,
            clearErr
          );
        }
      });
    }
    res.redirect(`/order/${orderNumber}`);
  });
};

exports.renderReceipt = (req, res) => {
  const orderNumber = req.params.orderNumber;
  const stored = req.session.lastOrder;

  if (!stored || stored.orderNumber !== orderNumber) {
    req.flash("error", "Order not found. Complete a checkout first.");
    return res.redirect("/shopping");
  }

  res.render("receipt", {
    order: stored,
    items: stored.items || [],
    user: req.session.user || null,
  });
};
