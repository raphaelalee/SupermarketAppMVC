const CheckoutController = {};

// Render checkout page using res.locals.cartDetailed prepared by app middleware
CheckoutController.renderCheckout = function (req, res) {
  const cart = res.locals.cartDetailed || [];
  const total = res.locals.cartTotal || 0;
  return res.render('checkout', { cart, total, user: req.session.user });
};

// Simple checkout processor: in a real app you'd create orders, charge payments, etc.
CheckoutController.processCheckout = function (req, res) {
  // Basic validation: ensure cart not empty
  const cart = req.session.cart || {};
  if (Object.keys(cart).length === 0) {
    req.flash('error', 'Your cart is empty.');
    return res.redirect('/shopping');
  }

  // TODO: persist order to DB
  // For now: clear cart and show success
  req.session.cart = {};
  req.flash('success', 'Checkout complete — thank you for your purchase!');
  return res.redirect('/shopping');
};

module.exports = CheckoutController;
