// controllers/CartController.js
const Product = require("../models/supermarket");

function buildCartSnapshot(cart = {}, callback) {
  const ids = Object.keys(cart);

  if (ids.length === 0) {
    return callback(null, { items: [], total: 0, count: 0, selectedTotal: 0 });
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
      const entry = cart[id];
      const quantity =
        typeof entry === "object"
          ? parseInt(entry.quantity, 10) || 0
          : parseInt(entry, 10) || 0;
      const selected =
        typeof entry === "object" ? entry.selected !== false : true;

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
        selected,
      });

      total += subtotal;
    });

    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const selectedTotal = items.filter((item) => item.selected).reduce((sum, item) => sum + item.subtotal, 0);
    callback(null, { items, total, count, selectedTotal });
  });
}

/* Add to Cart */
exports.addToCart = (req, res) => {
  const productId = req.params.id;
  if (!req.session.cart) req.session.cart = {};
  const current = req.session.cart[productId];
  const quantity =
    typeof current === "object"
      ? (parseInt(current.quantity, 10) || 0) + 1
      : (parseInt(current, 10) || 0) + 1;
  req.session.cart[productId] = { quantity, selected: true };
  req.flash("success", "Added to cart");
  res.redirect("/shopping");
};

/* View Cart */
exports.viewCart = (req, res) => {
  const summary = res.locals.cartSummary || { items: [], total: 0 };
  res.render("cart", {
    items: summary.items || [],
    total: summary.total || 0,
    selectedTotal: summary.selectedTotal || summary.total || 0,
    user: req.session.user || null,
  });
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
  const current = req.session.cart[id]?.quantity || 1;
  req.session.cart[id] = { ...(req.session.cart[id] || {}), quantity: current + 1 };

  return res.redirect("/shopping");
};

exports.decreaseQuantity = (req, res) => {
  const id = req.params.id;

  if (req.session.cart && req.session.cart[id]) {
    req.session.cart[id].quantity -= 1;

    // Remove if quantity <= 0
    if (req.session.cart[id].quantity <= 0) {
      delete req.session.cart[id];
    }
  }

  return res.redirect("/shopping");
};

exports.updateItemQuantity = (req, res) => {
  const { id } = req.params;
  let { quantity } = req.body;
  const { selected } = req.body;

  quantity = parseInt(quantity, 10);
  if (Number.isNaN(quantity) || quantity < 0) {
    const wantsJson =
      req.xhr ||
      (req.get("Accept") && req.get("Accept").includes("application/json"));
    const responsePayload = { success: false, message: "Invalid quantity." };
    return wantsJson
      ? res.status(400).json(responsePayload)
      : res.redirect("/cart");
  }

  if (!req.session.cart) req.session.cart = {};

  if (!req.session.cart[id]) req.session.cart[id] = { selected: true };

  if (typeof selected !== "undefined") {
    req.session.cart[id].selected = selected === "true" || selected === true;
  }

  if (quantity === 0) delete req.session.cart[id];
  else req.session.cart[id].quantity = quantity;

  buildCartSnapshot(req.session.cart, (err, summary) => {
    const wantsJson =
      req.xhr ||
      (req.get("Accept") && req.get("Accept").includes("application/json"));

    if (err) {
      return wantsJson
        ? res
            .status(500)
            .json({ success: false, message: "Failed to update cart." })
        : res.redirect("/cart");
    }

    if (!wantsJson) {
      return res.redirect("/cart");
    }

    const updatedItem = summary.items.find((item) => String(item.id) === String(id));

    return res.json({ success: true, cart: summary, item: updatedItem || null });
  });
};

exports.buildCartSnapshot = buildCartSnapshot;

exports.clearCart = (req, res) => {
  req.session.cart = {};
  res.redirect("/cart");
};
