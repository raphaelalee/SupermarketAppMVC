const db = require("../db");

function toCartObject(rows = []) {
  const cart = {};
  rows.forEach((row) => {
    const productId =
      row.productId ?? row.productID ?? row.product_id ?? row.productid;
    const quantity = parseInt(row.quantity, 10) || 0;
    if (!productId || quantity <= 0) return;
    cart[String(productId)] = { quantity, selected: true };
  });
  return cart;
}

function ensureCallback(cb) {
  return typeof cb === "function" ? cb : () => {};
}

function addItem(userId, productId, callback) {
  const cb = ensureCallback(callback);
  const pid = parseInt(productId, 10);
  if (!userId || Number.isNaN(pid)) {
    return cb(new Error("Invalid user or product id for addItem"));
  }

  const sql = `
    INSERT INTO user_carts (userId, productId, quantity)
    VALUES (?, ?, 1)
    ON DUPLICATE KEY UPDATE quantity = quantity + 1
  `;

  db.query(sql, [userId, pid], cb);
}

function getCart(userId, callback) {
  const cb = ensureCallback(callback);
  if (!userId) return cb(null, {});

  db.query(
    "SELECT productId, quantity FROM user_carts WHERE userId = ?",
    [userId],
    (err, rows) => {
      if (err) return cb(err);
      cb(null, toCartObject(rows));
    }
  );
}

function setQuantity(userId, productId, quantity, callback) {
  const cb = ensureCallback(callback);
  const pid = parseInt(productId, 10);
  const qty = parseInt(quantity, 10);

  if (!userId || Number.isNaN(pid) || Number.isNaN(qty)) {
    return cb(new Error("Invalid user/product/quantity for setQuantity"));
  }

  if (qty <= 0) {
    return removeItem(userId, pid, cb);
  }

  const sql = `
    INSERT INTO user_carts (userId, productId, quantity)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)
  `;

  db.query(sql, [userId, pid, qty], cb);
}

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

function clearCart(userId, callback) {
  const cb = ensureCallback(callback);
  if (!userId) return cb(null);

  db.query("DELETE FROM user_carts WHERE userId = ?", [userId], cb);
}

module.exports = {
  addItem,
  getCart,
  setQuantity,
  removeItem,
  clearCart,
  toCartObject,
};
