// controllers/CheckoutController.js
exports.renderCheckout = (req, res) => {
  const cart = req.session.cart || {};
  const ids = Object.keys(cart);
  let total = 0;

  if (ids.length > 0 && res.locals.cartDetailed) {
    total = res.locals.cartDetailed.reduce((sum, i) => sum + i.subtotal, 0);
  }

  res.render("checkout", { total, user: req.session.user || null });
};

exports.processCheckout = (req, res) => {
  req.session.cart = {}; // Clear cart
  req.flash("success", "✅ Payment successful with PayNow / PayLah!");
  res.redirect("/shopping");
};
