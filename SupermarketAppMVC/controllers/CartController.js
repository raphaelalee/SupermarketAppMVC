// controllers/CartController.js
// Responsible for cart-related HTTP handlers and helper utilities.
// Adds, removes, updates items in a session-backed cart and mirrors
// changes to the persistent per-user cart when a user is logged in.

const Product = require("../models/supermarket"); // product model (DB access)
const UserCart = require("../models/userCart"); // per-user cart persistence

// Ensure there is a cart object on the session and return it.
// This avoids repeat null checks elsewhere.
function ensureSessionCart(req) {
  if (!req.session.cart) req.session.cart = {}; // create empty cart if missing
  return req.session.cart; // always return an object
}

// Safely parse a numeric product id from a route param.
// Returns null when parsing fails (invalid id).
function parseProductId(id) {
  const parsed = parseInt(id, 10); // base-10 parse
  return Number.isNaN(parsed) ? null : parsed; // normalize NaN to null
}

// Build a cart snapshot useful for rendering or JSON responses.
// - cart: session cart object mapping productId -> { quantity, selected }
// - callback: function(err, { items, total, count, selectedTotal })
function buildCartSnapshot(cart = {}, callback) {
  const ids = Object.keys(cart); // session keys (string ids)

  // Fast path: empty cart -> return zeroed summary
  if (ids.length === 0) {
    return callback(null, { items: [], total: 0, count: 0, selectedTotal: 0 });
  }

  // Load all products once and map them by id to avoid repeated DB calls.
  Product.getAll((err, products) => {
    if (err) return callback(err); // bubble DB error to caller

    const byId = {};
    products.forEach((p) => {
      byId[String(p.id)] = p; // use string keys for session compatibility
    });

    const items = []; // resulting items array for the view/response
    let total = 0; // running total of all items

    // Walk the session cart and build item rows
    ids.forEach((id) => {
      const product = byId[id]; // lookup product from DB results
      const entry = cart[id]; // session entry (object or numeric)

      // Normalize quantity: either entry.quantity (object) or the raw value
      const quantity =
        typeof entry === "object"
          ? parseInt(entry.quantity, 10) || 0
          : parseInt(entry, 10) || 0;

      // Normalize selection flag; default to true if not explicitly false
      const selected = typeof entry === "object" ? entry.selected !== false : true;

      // If product no longer exists or quantity is zero, remove from cart and skip
      if (!product || quantity <= 0) {
        delete cart[id];
        return;
      }

      const price = Number(product.price) || 0; // ensure numeric price
      const subtotal = price * quantity; // line subtotal

      // Push the normalized item structure used by views and clients
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

      total += subtotal; // accumulate total
    });

    // count: total item quantity across items
    const count = items.reduce((sum, item) => sum + item.quantity, 0);

    // selectedTotal: only sum subtotals for selected items
    const selectedTotal = items
      .filter((item) => item.selected)
      .reduce((sum, item) => sum + item.subtotal, 0);

    // callback with the computed snapshot
    callback(null, { items, total, count, selectedTotal });
  });
}

/* Add to Cart */
// Adds one quantity of the given product to the session cart and, if a user
// is logged in, persists the change to the user's persistent cart as well.
exports.addToCart = (req, res) => {
  const productId = req.params.id; // product id from route param (string)
  const userId = req.session?.user?.id; // optional logged-in user id
  const cart = ensureSessionCart(req); // ensure session cart exists

  // Debug: detailed request/session trace for diagnosing add-to-cart issues
  try {
    console.debug("[addToCart] incoming request", {
      method: req.method,
      url: req.originalUrl,
      params: req.params,
      body: req.body,
      sessionUser: req.session && req.session.user ? { id: req.session.user.id, role: req.session.user.role } : null,
      sessionCartKeys: Object.keys(req.session.cart || {}),
    });
  } catch (logErr) {
    // keep silent on logging failures
  }

  // Local helper to update the in-memory session cart and redirect.
  const applySessionUpdate = () => {
    const current = cart[productId]; // existing entry or undefined
    const quantity =
      typeof current === "object"
        ? (parseInt(current.quantity, 10) || 0) + 1 // object-style entry
        : (parseInt(current, 10) || 0) + 1; // numeric entry

    // Merge current entry (if any) with new values; always mark selected
    cart[productId] = { ...(current || {}), quantity, selected: true };
    req.flash("success", "Added to cart"); // user feedback
    res.redirect("/shopping"); // redirect back to shopping page
  };

  // Before updating cart (session or DB), check product availability from DB.
  const numericProductId = parseProductId(productId);
  if (!numericProductId) {
    console.error(`Attempted to add item with invalid ID: ${productId}`); // LOG ERROR
    req.flash("error", "Invalid product ID format."); // More specific error
    return res.redirect("/shopping");
  }

  Product.getById(numericProductId, (err, results) => {
    console.debug(`[addToCart] Product.getById callback for id=${numericProductId}`, { err: err ? String(err) : null, resultsLength: results && results.length });
    if (err) {
      console.error(`DB Error during Product lookup for ID ${numericProductId}:`, err); // LOG DB ERROR
      req.flash("error", "Database connection error. Try again.");
      return res.redirect("/shopping");
    }

    const product = results && results[0];
    console.debug(`[addToCart] looked up product:`, product ? { id: product.id, productName: product.productName, quantity: product.quantity } : null);
    if (!product) {
      console.warn(`Product ID ${numericProductId} not found in database.`); // LOG WARNING
      req.flash("error", "Product not found.");
      return res.redirect("/shopping");
    }

    const available = Number(product.quantity || 0);
    console.debug(`[addToCart] available quantity for id=${numericProductId}:`, available);
    if (available <= 0) {
      req.flash("error", "Item is out of stock."); // Check your inventory via /inventory
      return res.redirect("/shopping");
    }

    // If user is anonymous, update session only.
    if (!userId) {
      return applySessionUpdate();
    }

    // Logged-in: persist the addition then update session
    UserCart.addItem(userId, numericProductId, (addErr) => {
      if (addErr) {
        console.error(`Failed to add product ${numericProductId} to persistent cart:`, addErr); // LOG DB ERROR
        req.flash("error", "Failed to add item to cart. Please try again.");
        return res.redirect("/shopping");
      }
      applySessionUpdate();
    });
  });
};

/* View Cart */
// Renders the cart view using the precomputed summary stored in res.locals
// by middleware (see app.js). This keeps controller logic simple.
exports.viewCart = (req, res) => {
  const summary = res.locals.cartSummary || { items: [], total: 0 };
  res.render("cart", {
    items: summary.items || [], // items array for template
    total: summary.total || 0, // cart total
    selectedTotal: summary.selectedTotal || summary.total || 0, // total of selected items
    user: req.session.user || null, // current user for template logic
  });
};

/* Remove Item */
// Removes an item from the session cart immediately, and if logged in,
// attempts to remove it from the persistent user cart as well. Supports
// both HTML and AJAX JSON responses (Accept: application/json).
exports.removeFromCart = (req, res) => {
  const { id } = req.params; // product id (string)
  const userId = req.session?.user?.id; // optional user id
  const cart = ensureSessionCart(req);
  const existingEntry = cart[id]; // keep a copy for rollback on error
  delete cart[id]; // optimistic remove from session

  // Determine if caller expects JSON (AJAX) or HTML redirect
  const wantsJson =
    req.xhr ||
    (req.get("Accept") && req.get("Accept").includes("application/json"));

  // Helper to send the appropriate response based on error / request type
  const respond = (err) => {
    if (err) {
      // rollback session change on failure
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
      // return the updated cart snapshot for client-side UI updates
      return buildCartSnapshot(cart, (snapshotErr, summary) => {
        if (snapshotErr) {
          return res
            .status(500)
            .json({ success: false, message: "Failed to update cart." });
        }
        return res.json({ success: true, cart: summary });
      });
    }

    // HTML flow: redirect back to cart page
    return res.redirect("/cart");
  };

  // If user is not logged in, respond immediately (session-only change)
  if (!userId) {
    return respond(null);
  }

  // Validate numeric id before DB operation
  const numericId = parseProductId(id);
  if (!numericId) {
    return respond(new Error("Invalid product id"));
  }

  // Remove from persistent per-user cart, respond afterwards
  UserCart.removeItem(userId, numericId, respond);
};

// Increase quantity by one. Mirrors behavior of addToCart but keeps semantics
// distinct to aid callers that specifically want an "increase" action.
exports.increaseQuantity = (req, res) => {
  const id = req.params.id;
  const userId = req.session?.user?.id;
  const cart = ensureSessionCart(req);
  const current = cart[id]?.quantity || 0; // existing quantity (0 if missing)
  const nextQuantity = current + 1; // desired new quantity

  // finalize updates session and redirects; used after DB update or when
  // user is anonymous and only session is updated
  const finalize = (err) => {
    if (err) {
      console.error(`Failed to increase quantity for product ${id}:`, err);
      req.flash("error", "Unable to update cart.");
      return res.redirect("/shopping");
    }
    cart[id] = { ...(cart[id] || {}), quantity: nextQuantity, selected: true };
    return res.redirect("/shopping");
  };

  // Anonymous user: update session only
  if (!userId) {
    return finalize(null);
  }

  // Logged-in: persist to user cart first
  const numericId = parseProductId(id);
  if (!numericId) {
    return finalize(new Error("Invalid product id"));
  }

  // Re-use UserCart.addItem to increment DB-stored quantity
  UserCart.addItem(userId, numericId, finalize);
};

// Decrease quantity by one (and remove item if quantity reaches zero).
exports.decreaseQuantity = (req, res) => {
  const id = req.params.id;
  const userId = req.session?.user?.id;
  const cart = ensureSessionCart(req);

  // If item not present in session, nothing to do
  if (!cart[id]) {
    return res.redirect("/shopping");
  }

  const current = parseInt(cart[id].quantity, 10) || 0; // current quantity
  const nextQuantity = current - 1; // desired new quantity

  // Apply only to session (used after DB update or for anonymous users)
  const applySessionUpdate = () => {
    if (nextQuantity <= 0) {
      delete cart[id]; // remove if zero or negative
    } else {
      cart[id].quantity = nextQuantity; // update quantity
    }
    return res.redirect("/shopping");
  };

  // Anonymous user: update session and return
  if (!userId) {
    return applySessionUpdate();
  }

  // Validate id for DB operations
  const numericId = parseProductId(id);
  if (!numericId) {
    req.flash("error", "Unable to update cart.");
    return res.redirect("/shopping");
  }

  // Decide DB operation: remove item when quantity <= 0, otherwise set quantity
  const callback =
    nextQuantity <= 0
      ? (cb) => UserCart.removeItem(userId, numericId, cb)
      : (cb) => UserCart.setQuantity(userId, numericId, nextQuantity, cb);

  // Execute DB callback then apply session update on success
  callback((err) => {
    if (err) {
      console.error(`Failed to decrease quantity for product ${numericId}:`, err);
      req.flash("error", "Unable to update cart.");
      return res.redirect("/shopping");
    }
    return applySessionUpdate();
  });
};

// Update item quantity to an explicit value (AJAX or form-based).
// Accepts optional `selected` flag to set selection state.
exports.updateItemQuantity = (req, res) => {
  const { id } = req.params; // product id
  let { quantity } = req.body; // may be string from form
  const { selected } = req.body; // optional selection toggle
  const userId = req.session?.user?.id; // optional user id

  quantity = parseInt(quantity, 10); // normalize to number
  if (Number.isNaN(quantity) || quantity < 0) {
    // If invalid input, respond with JSON or redirect depending on caller
    const wantsJson =
      req.xhr ||
      (req.get("Accept") && req.get("Accept").includes("application/json"));
    const responsePayload = { success: false, message: "Invalid quantity." };
    return wantsJson
      ? res.status(400).json(responsePayload)
      : res.redirect("/cart");
  }

  const cart = ensureSessionCart(req); // session cart

  // Apply selection flag if provided; default selected to true when creating
  const applySelection = () => {
    if (!cart[id]) cart[id] = { selected: true };
    if (typeof selected !== "undefined") {
      cart[id].selected = selected === "true" || selected === true;
    }
  };

  // Update session representation with new quantity/selection
  const updateSession = () => {
    applySelection();
    if (quantity === 0) {
      delete cart[id];
    } else {
      cart[id].quantity = quantity;
    }
  };

  // Send appropriate response: JSON for AJAX, redirect for HTML
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

    // Build a fresh snapshot to return current cart state to client
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

      // For AJAX: find the updated item to include in response
      const updatedItem = summary.items.find(
        (item) => String(item.id) === String(id)
      );
      return res.json({ success: true, cart: summary, item: updatedItem || null });
    });
  };

  // If user is anonymous, only update session and respond
  if (!userId) {
    updateSession();
    return sendResponse(null);
  }

  // Validate id for DB operations
  const numericId = parseProductId(id);
  if (!numericId) {
    return sendResponse(new Error("Invalid product id"));
  }

  // Choose DB operation: remove when quantity 0, otherwise set explicit quantity
  const dbCallback =
    quantity === 0
      ? (cb) => UserCart.removeItem(userId, numericId, cb)
      : (cb) => UserCart.setQuantity(userId, numericId, quantity, cb);

  // Persist change then apply session update and final response
  dbCallback((err) => {
    if (err) {
      return sendResponse(err);
    }
    updateSession();
    return sendResponse(null);
  });
};

// Re-export helper for use elsewhere (app middleware uses this)
exports.buildCartSnapshot = buildCartSnapshot;

// Clear the session cart and the persistent cart (if user logged in)
exports.clearCart = (req, res) => {
  const userId = req.session?.user?.id;
  req.session.cart = {}; // wipe session cart immediately

  if (!userId) {
    return res.redirect("/cart"); // anonymous user: redirect
  }

  // For logged-in users, clear persistent cart as well
  UserCart.clearCart(userId, (err) => {
    if (err) {
      console.error(`Failed to clear cart for user ${userId}:`, err);
      req.flash("error", "Failed to clear cart.");
    }
    res.redirect("/cart");
  });
};