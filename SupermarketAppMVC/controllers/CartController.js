// controllers/CartController.js
const Product = require("../models/supermarket");
const UserCart = require("../models/userCart");

function ensureSessionCart(req) {
  if (!req.session.cart) req.session.cart = {};
  return req.session.cart;
}

function parseProductId(id) {
  const parsed = parseInt(id, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

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
        category: product.category || "Groceries",
        quantity,
        subtotal,
        selected,
      });

      total += subtotal;
    });

    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const selectedTotal = items
      .filter((item) => item.selected)
      .reduce((sum, item) => sum + item.subtotal, 0);
    callback(null, { items, total, count, selectedTotal });
  });
}

/* Add to Cart */
exports.addToCart = (req, res) => {
  const productId = req.params.id;
  const userId = req.session?.user?.id;
  const cart = ensureSessionCart(req);

  const applySessionUpdate = () => {
    const current = cart[productId];
    const quantity =
      typeof current === "object"
        ? (parseInt(current.quantity, 10) || 0) + 1
        : (parseInt(current, 10) || 0) + 1;
    cart[productId] = { ...(current || {}), quantity, selected: true };
    req.flash("success", "Added to cart");
    res.redirect("/shopping");
  };

  if (!userId) {
    return applySessionUpdate();
  }

  const numericProductId = parseProductId(productId);
  if (!numericProductId) {
    req.flash("error", "Invalid product.");
    return res.redirect("/shopping");
  }

  UserCart.addItem(userId, numericProductId, (err) => {
    if (err) {
      console.error(`Failed to add product ${numericProductId} to cart:`, err);
      req.flash("error", "Failed to add item to cart. Please try again.");
      return res.redirect("/shopping");
    }
    applySessionUpdate();
  });
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
  const userId = req.session?.user?.id;
  const cart = ensureSessionCart(req);
  const existingEntry = cart[id];
  delete cart[id];

  const wantsJson =
    req.xhr ||
    (req.get("Accept") && req.get("Accept").includes("application/json"));

  const respond = (err) => {
    if (err) {
      if (existingEntry) cart[id] = existingEntry;
      if (wantsJson) {
        return res
          .status(500)
          .json({ success: false, message: "Failed to update cart." });
      }
      req.flash("error", "Failed to remove item from cart.");
      return res.redirect("/cart");
    }

    if (wantsJson) {
      return buildCartSnapshot(cart, (snapshotErr, summary) => {
        if (snapshotErr) {
          return res
            .status(500)
            .json({ success: false, message: "Failed to update cart." });
        }
        return res.json({ success: true, cart: summary });
      });
    }

    return res.redirect("/cart");
  };

  if (!userId) {
    return respond(null);
  }

  const numericId = parseProductId(id);
  if (!numericId) {
    return respond(new Error("Invalid product id"));
  }

  UserCart.removeItem(userId, numericId, respond);
};

exports.increaseQuantity = (req, res) => {
  const id = req.params.id;
  const userId = req.session?.user?.id;
  const cart = ensureSessionCart(req);
  const current = cart[id]?.quantity || 0;
  const nextQuantity = current + 1;

  const finalize = (err) => {
    if (err) {
      console.error(`Failed to increase quantity for product ${id}:`, err);
      req.flash("error", "Unable to update cart.");
      return res.redirect("/shopping");
    }
    cart[id] = { ...(cart[id] || {}), quantity: nextQuantity, selected: true };
    return res.redirect("/shopping");
  };

  if (!userId) {
    return finalize(null);
  }

  const numericId = parseProductId(id);
  if (!numericId) {
    return finalize(new Error("Invalid product id"));
  }

  UserCart.addItem(userId, numericId, finalize);
};

exports.decreaseQuantity = (req, res) => {
  const id = req.params.id;
  const userId = req.session?.user?.id;
  const cart = ensureSessionCart(req);

  if (!cart[id]) {
    return res.redirect("/shopping");
  }

  const current = parseInt(cart[id].quantity, 10) || 0;
  const nextQuantity = current - 1;

  const applySessionUpdate = () => {
    if (nextQuantity <= 0) {
      delete cart[id];
    } else {
      cart[id].quantity = nextQuantity;
    }
    return res.redirect("/shopping");
  };

  if (!userId) {
    return applySessionUpdate();
  }

  const numericId = parseProductId(id);
  if (!numericId) {
    req.flash("error", "Unable to update cart.");
    return res.redirect("/shopping");
  }

  const callback =
    nextQuantity <= 0
      ? (cb) => UserCart.removeItem(userId, numericId, cb)
      : (cb) => UserCart.setQuantity(userId, numericId, nextQuantity, cb);

  callback((err) => {
    if (err) {
      console.error(`Failed to decrease quantity for product ${numericId}:`, err);
      req.flash("error", "Unable to update cart.");
      return res.redirect("/shopping");
    }
    return applySessionUpdate();
  });
};

exports.updateItemQuantity = (req, res) => {
  const { id } = req.params;
  let { quantity } = req.body;
  const { selected } = req.body;
  const userId = req.session?.user?.id;

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

  const cart = ensureSessionCart(req);

  const applySelection = () => {
    if (!cart[id]) cart[id] = { selected: true };
    if (typeof selected !== "undefined") {
      cart[id].selected = selected === "true" || selected === true;
    }
  };

  const updateSession = () => {
    applySelection();
    if (quantity === 0) {
      delete cart[id];
    } else {
      cart[id].quantity = quantity;
    }
  };

  const sendResponse = (err) => {
    const wantsJson =
      req.xhr ||
      (req.get("Accept") && req.get("Accept").includes("application/json"));

    if (err) {
      console.error(`Failed to update quantity for product ${id}:`, err);
      if (wantsJson) {
        return res
          .status(500)
          .json({ success: false, message: "Failed to update cart." });
      }
      req.flash("error", "Failed to update cart.");
      return res.redirect("/cart");
    }

    return buildCartSnapshot(cart, (snapshotErr, summary) => {
      if (snapshotErr) {
        if (wantsJson) {
          return res
            .status(500)
            .json({ success: false, message: "Failed to update cart." });
        }
        req.flash("error", "Failed to update cart.");
        return res.redirect("/cart");
      }

      if (!wantsJson) {
        return res.redirect("/cart");
      }

      const updatedItem = summary.items.find(
        (item) => String(item.id) === String(id)
      );
      return res.json({ success: true, cart: summary, item: updatedItem || null });
    });
  };

  if (!userId) {
    updateSession();
    return sendResponse(null);
  }

  const numericId = parseProductId(id);
  if (!numericId) {
    return sendResponse(new Error("Invalid product id"));
  }

  const dbCallback =
    quantity === 0
      ? (cb) => UserCart.removeItem(userId, numericId, cb)
      : (cb) => UserCart.setQuantity(userId, numericId, quantity, cb);

  dbCallback((err) => {
    if (err) {
      return sendResponse(err);
    }
    updateSession();
    return sendResponse(null);
  });
};

exports.buildCartSnapshot = buildCartSnapshot;

exports.clearCart = (req, res) => {
  const userId = req.session?.user?.id;
  req.session.cart = {};

  if (!userId) {
    return res.redirect("/cart");
  }

  UserCart.clearCart(userId, (err) => {
    if (err) {
      console.error(`Failed to clear cart for user ${userId}:`, err);
      req.flash("error", "Failed to clear cart.");
    }
    res.redirect("/cart");
  });
};
