// controllers/CheckoutController.js (session-based, no DB)

exports.renderCheckout = (req, res) => {
  const cart = req.session.cart || {};
  const ids = Object.keys(cart);
  const items = res.locals.cartDetailed || [];
  const total = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);

  res.render("checkout", { total, items, user: req.session.user || null });
};

exports.processCheckout = (req, res) => {
  const items = res.locals.cartDetailed || [];
  if (!items.length) {
    req.flash("error", "Your cart is empty.");
    return res.redirect("/cart");
  }

  const deliveryMethod = req.body.deliveryMethod || "standard";
  const deliveryFee = parseFloat(req.body.deliveryFee || 0);
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
    createdAt: new Date().toISOString(),
    items,
  };

  // Store order in session for receipt (no DB)
  req.session.lastOrder = orderPayload;
  req.session.cart = {}; // Clear cart
  req.flash("success", "Order placed successfully!");
  res.redirect(`/order/${orderNumber}`);
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
