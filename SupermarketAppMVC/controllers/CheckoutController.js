// controllers/CheckoutController.js (session-based, no DB)
const Order = require("../models/order");
const UserCart = require("../models/userCart");
const paypal = require("./services/paypal");

exports.renderCheckout = (req, res) => {
  const items = res.locals.cartDetailed || [];
  const subtotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);

  // If your checkout.ejs uses delivery fee selection, it will be added on POST.
  // Here we just render subtotal/total preview; keep it simple.
  const total = subtotal;

  res.render("checkout", {
    total,
    items,
    user: req.session.user || null,
    paypalClientId: process.env.PAYPAL_CLIENT_ID,
    paypalCurrency: process.env.PAYPAL_CURRENCY || "SGD",
  });
};

/**
 * POST /paypal/create-order
 * Creates PayPal order using server-calculated total (cart + selected delivery fee).
 * We accept deliveryFee + deliveryMethod from frontend because it affects total,
 * but we still compute total server-side from cart items.
 */
exports.createPaypalOrder = async (req, res) => {
  try {
    const items = res.locals.cartDetailed || [];
    if (!items.length) return res.status(400).json({ error: "Cart is empty" });

    const deliveryFee = parseFloat(req.body.deliveryFee || 0);
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      return res.status(400).json({ error: "Invalid delivery fee" });
    }

    const subtotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
    const total = subtotal + deliveryFee;

    const order = await paypal.createOrder(total);

    // Store the expected total in session to validate later
    req.session.paypalPending = {
      orderId: order.id,
      total: Number(total.toFixed(2)),
      createdAt: Date.now(),
    };

    return res.json({ id: order.id });
  } catch (err) {
    console.error("createPaypalOrder:", err);
    return res.status(500).json({ error: "Failed to create PayPal order" });
  }
};

/**
 * POST /paypal/capture-order
 * Captures PayPal order and stores proof in session.
 */
exports.capturePaypalOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "Missing orderId" });

    const capture = await paypal.captureOrder(orderId);

    // Basic sanity check: make sure capture is completed
    const status = capture.status;
    if (status !== "COMPLETED") {
      req.session.paypalCapture = null;
      return res.status(400).json({ error: "Payment not completed", capture });
    }

    // Save capture proof in session for processCheckout to verify
    req.session.paypalCapture = {
      orderId,
      status,
      captureId:
        capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null,
      payerEmail: capture?.payer?.email_address || null,
      payerId: capture?.payer?.payer_id || null,
      capturedAt: Date.now(),
    };

    return res.json({ ok: true, capture });
  } catch (err) {
    console.error("capturePaypalOrder:", err);
    return res.status(500).json({ error: "Failed to capture PayPal order" });
  }
};

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

  // ✅ PayPal verification gate:
  // If user chose paypal, they must have a COMPLETED capture stored in session
  let paid = true;
  let paypalMeta = null;

  if (paymentMethod === "paypal") {
    const cap = req.session.paypalCapture;
    const pending = req.session.paypalPending;

    if (!cap || cap.status !== "COMPLETED") {
      req.flash("error", "PayPal payment not completed. Please pay first.");
      return res.redirect("/checkout");
    }

    // Optional: verify orderId matches what we created
    if (pending?.orderId && pending.orderId !== cap.orderId) {
      req.flash("error", "PayPal order mismatch. Please try again.");
      return res.redirect("/checkout");
    }

    // Optional: verify total matches what we created
    if (pending?.total && Number(total.toFixed(2)) !== Number(pending.total)) {
      req.flash("error", "Cart total changed. Please pay again.");
      return res.redirect("/checkout");
    }

    paid = true;
    paypalMeta = {
      paypalOrderId: cap.orderId,
      paypalCaptureId: cap.captureId,
      paypalPayerEmail: cap.payerEmail,
      paypalPayerId: cap.payerId,
    };
  }

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
    customerName: req.body.shippingName || (req.session.user && req.session.user.username) || null,
    customerEmail: (req.session.user && req.session.user.email) || (req.body.customerEmail || null),
    customerPhone: digitsOnly ? digitsOnly.slice(-8) : null,
    paid,
    createdAt: new Date().toISOString(),
    items,
    ...(paypalMeta ? paypalMeta : {}),
  };

  Order.createOrder(orderPayload, items, (err, orderId) => {
    if (err) {
      console.error("Failed to persist order:", err);
      req.flash("error", "Order placed but not saved to admin dashboard.");
    } else {
      if (orderId) orderPayload.id = orderId;
      req.flash("success", "Order placed successfully!");
    }

    req.session.lastOrder = orderPayload;
    req.session.cart = {};

    // Clear PayPal session proof after use (important)
    req.session.paypalCapture = null;
    req.session.paypalPending = null;

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
