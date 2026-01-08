// controllers/CheckoutController.js
// Session-based checkout (no DB dependency required for PayPal render)

const Order = require("../models/order");
const UserCart = require("../models/userCart");

exports.renderCheckout = (req, res) => {
  const cart = req.session.cart || {};
  const items = res.locals.cartDetailed || [];
  const subtotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);

  res.render("checkout", {
    items,
    subtotal,
    total: subtotal, // delivery fee added on client side
    user: req.session.user || null,

    // 🔑 THIS is what fixes your error
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  });
};

exports.processCheckout = (req, res) => {
  const items = res.locals.cartDetailed || [];

  if (!items.length) {
    req.flash("error", "Your cart is empty.");
    return res.redirect("/cart");
  }

  const deliveryMethod = req.body.deliveryMethod || "standard";
  const deliveryFee = parseFloat(req.body.deliveryFee || 0);

  // Phone validation (SG standard)
  const rawPhone = (req.body.shippingPhone || "").toString();
  const digitsOnly = rawPhone.replace(/\D/g, "");
  if (deliveryMethod !== "pickup") {
    const last8 = digitsOnly.slice(-8);
    if (!/^\d{8}$/.test(last8)) {
      req.flash("error", "Contact number must be exactly 8 digits.");
      return res.redirect("/checkout");
    }
  }

  const paymentMethod = req.body.payment || "paynow";
  const subtotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
  const total = subtotal + deliveryFee;

  const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

  const orderPayload = {
    orderNumber,
    userId: req.session.user?.id || null,
    subtotal,
    deliveryFee,
    total,
    deliveryMethod,
    paymentMethod,
    customerName:
      req.body.shippingName ||
      req.session.user?.username ||
      null,
    customerEmail:
      req.session.user?.email ||
      req.body.customerEmail ||
      null,
    customerPhone: digitsOnly ? digitsOnly.slice(-8) : null,
    paid: true,
    createdAt: new Date().toISOString(),
    items,
  };

  Order.createOrder(orderPayload, items, (err, orderId) => {
    if (err) {
      console.error("Order save failed:", err);
      req.flash("error", "Order placed but not saved.");
    } else {
      if (orderId) orderPayload.id = orderId;
      req.flash("success", "Order placed successfully!");
    }

    req.session.lastOrder = orderPayload;
    req.session.cart = {};

    if (req.session.user?.id) {
      UserCart.clearCart(req.session.user.id, () => {});
    }

    res.redirect(`/order/${orderNumber}`);
  });
};

exports.renderReceipt = (req, res) => {
  const { orderNumber } = req.params;
  const order = req.session.lastOrder;

  if (!order || order.orderNumber !== orderNumber) {
    req.flash("error", "Order not found.");
    return res.redirect("/shopping");
  }

  res.render("receipt", {
    order,
    items: order.items || [],
    user: req.session.user || null,
  });
};
