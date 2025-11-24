const db = require("../db"); // Link to the database connection pool

// Converts the raw rows we get from the database into a simple JavaScript cart object format.
function toCartObject(rows = []) {
  const cart = {};
  rows.forEach((row) => {
    // Looks for product ID using several possible column names for safety
    const productId =
      row.productId ?? row.productID ?? row.product_id ?? row.productid;
    const quantity = parseInt(row.quantity, 10) || 0;
    if (!productId || quantity <= 0) return;
    // Saves the item to the final cart object, marking it as 'selected' by default
    cart[String(productId)] = { quantity, selected: true };
  });
  return cart;
}

// Simple helper to make sure a valid callback function exists before calling it
function ensureCallback(cb) {
  return typeof cb === "function" ? cb : () => {};
}

// Function to add one unit of a product to a user's persistent cart.
function addItem(userId, productId, callback) {
  const cb = ensureCallback(callback);
  const pid = parseInt(productId, 10);
  if (!userId || Number.isNaN(pid)) {
    return cb(new Error("Invalid user or product id for addItem"));
  }

  const sql = `
    // This is the core logic: Tries to INSERT a quantity of 1.
    INSERT INTO user_carts (userId, productId, quantity)
    VALUES (?, ?, 1)
    // If the item is already in the cart (duplicate key), INCREMENT the quantity by 1.
    ON DUPLICATE KEY UPDATE quantity = quantity + 1 
  `;

  // Runs the safe, concurrency-friendly SQL query
  db.query(sql, [userId, pid], cb);
}

// Fetches the entire saved cart from the database for a logged-in user.
function getCart(userId, callback) {
  const cb = ensureCallback(callback);
  if (!userId) return cb(null, {}); // If no user, return an empty cart immediately

  db.query(
    "SELECT productId, quantity FROM user_carts WHERE userId = ?",
    [userId],
    (err, rows) => {
      if (err) return cb(err);
      cb(null, toCartObject(rows)); // Converts the results to the needed object format
    }
  );
}

// Sets a product's quantity to a specific number.
function setQuantity(userId, productId, quantity, callback) {
  const cb = ensureCallback(callback);
  const pid = parseInt(productId, 10);
  const qty = parseInt(quantity, 10);

  if (!userId || Number.isNaN(pid) || Number.isNaN(qty)) {
    return cb(new Error("Invalid user/product/quantity for setQuantity"));
  }

  // If the quantity is 0 or less, we just delete the item instead of setting the quantity.
  if (qty <= 0) {
    return removeItem(userId, pid, cb);
  }

  const sql = `
    // Tries to INSERT the specific quantity.
    INSERT INTO user_carts (userId, productId, quantity)
    VALUES (?, ?, ?)
    // If the item exists, it OVERWRITES the existing quantity with the new value.
    ON DUPLICATE KEY UPDATE quantity = VALUES(quantity) 
  `;

  db.query(sql, [userId, pid, qty], cb);
}

// Permanently deletes an item from the user's saved cart.
function removeItem(userId, productId, callback) {
  const cb = ensureCallback(callback);
  const pid = parseInt(productId, 10);
  if (!userId || Number.isNaN(pid)) {
    return cb(new Error("Invalid user or product id for removeItem"));
  }

  db.query(
    "DELETE FROM user_carts WHERE userId = ? AND productId = ?",
    [userId, pid],
    cb
  );
}

// Clears ALL items from a user's persistent cart.
function clearCart(userId, callback) {
  const cb = ensureCallback(callback);
  if (!userId) return cb(null);

  db.query("DELETE FROM user_carts WHERE userId = ?", [userId], cb);
}

// Exports all functions so they can be used by other parts of the application (like controllers).
module.exports = {
  addItem,
  getCart,
  setQuantity,
  removeItem,
  clearCart,
  toCartObject,
};