// controllers/CartController.js
const { Product } = require("../models/supermarket");

/* Add to Cart */
exports.addToCart = (req, res) => {
  const productId = req.params.id;
  if (!req.session.cart) req.session.cart = {};
  req.session.cart[productId] = (req.session.cart[productId] || 0) + 1;
  req.flash("success", "Added to cart");
  res.redirect("/shopping");
};

/* View Cart */
exports.viewCart = (req, res) => {
  const cart = req.session.cart || {};
  const ids = Object.keys(cart);
  if (ids.length === 0)
    return res.render("cart", { items: [], total: 0, user: req.session.user || null });

  Product.getAll((err, products) => {
    if (err) return res.render("cart", { items: [], total: 0, user: req.session.user || null });

    const byId = products.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
    const items = ids.map(id => ({
      ...byId[id],
      quantity: cart[id],
      subtotal: byId[id].price * cart[id],
    }));
    const total = items.reduce((sum, i) => sum + i.subtotal, 0);
    res.render("cart", { items, total, user: req.session.user || null });
  });
};

/* Remove Item */
exports.removeFromCart = (req, res) => {
  const { id } = req.params;
  if (req.session.cart && req.session.cart[id]) delete req.session.cart[id];
  res.redirect("/cart");
};
