// controllers/CartController.js
const Product = require("../models/supermarket");

function buildCartSnapshot(cart = {}, callback) {
  const ids = Object.keys(cart);

  if (ids.length === 0) {
    return callback(null, { items: [], total: 0, count: 0 });
  }

  Product.getAll((err, products) => {
    if (err) return callback(err);

    const byId = {};
    products.forEach((p) => {
      byId[String(p.id)] = p;
    });

    const items = [];
    let total = 0;

    ids.forEach((id) => {
      const product = byId[id];
      const quantity = parseInt(cart[id], 10) || 0;

      if (!product || quantity <= 0) {
        delete cart[id];
        return;
      }

      const price = Number(product.price) || 0;
      const subtotal = price * quantity;

      items.push({
        id: product.id,
        productName: product.productName,
        price,
        image: product.image,
        quantity,
        subtotal,
      });

      total += subtotal;
    });

    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    callback(null, { items, total, count });
  });
}

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
  const summary = res.locals.cartSummary || { items: [], total: 0 };
  res.render("cart", { items: summary.items || [], total: summary.total || 0, user: req.session.user || null });
};

/* Remove Item */
exports.removeFromCart = (req, res) => {
  const { id } = req.params;
  if (req.session.cart && req.session.cart[id]) delete req.session.cart[id];

  const wantsJson =
    req.xhr ||
    (req.get("Accept") && req.get("Accept").includes("application/json"));

  if (wantsJson) {
    return buildCartSnapshot(req.session.cart || {}, (err, summary) => {
      if (err) {
        return res.status(500).json({ success: false, message: "Failed to update cart." });
      }
      return res.json({ success: true, cart: summary });
    });
  }

  res.redirect("/cart");
};

exports.increaseQuantity = (req, res) => {
  const id = req.params.id;

  if (!req.session.cart) req.session.cart = {};
  req.session.cart[id] = (req.session.cart[id] || 1) + 1;

  return res.redirect("/shopping");
};

exports.decreaseQuantity = (req, res) => {
  const id = req.params.id;

  if (req.session.cart && req.session.cart[id]) {
    req.session.cart[id] -= 1;

    // Remove if quantity <= 0
    if (req.session.cart[id] <= 0) {
      delete req.session.cart[id];
    }
  }

  return res.redirect("/shopping");
};

exports.updateItemQuantity = (req, res) => {
  const { id } = req.params;
  let { quantity } = req.body;

  quantity = parseInt(quantity, 10);
  if (Number.isNaN(quantity) || quantity < 0) {
    return res.status(400).json({ success: false, message: "Invalid quantity." });
  }

  if (!req.session.cart) req.session.cart = {};

  if (quantity === 0) {
    delete req.session.cart[id];
  } else {
    req.session.cart[id] = quantity;
  }

  buildCartSnapshot(req.session.cart, (err, summary) => {
    if (err) {
      return res.status(500).json({ success: false, message: "Failed to update cart." });
    }

    const updatedItem = summary.items.find((item) => String(item.id) === String(id));

    return res.json({ success: true, cart: summary, item: updatedItem || null });
  });
};

exports.buildCartSnapshot = buildCartSnapshot;
