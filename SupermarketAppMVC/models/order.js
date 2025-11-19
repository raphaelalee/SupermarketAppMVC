const db = require("../db");

function createOrder(order, items, callback) {
  const {
    orderNumber,
    userId = null,
    subtotal = 0,
    deliveryFee = 0,
    total = 0,
    deliveryMethod = "standard",
    paymentMethod = "paynow",
    paid = true,
    createdAt = null,
  } = order;

  const payload = [
    orderNumber,
    userId,
    subtotal,
    deliveryFee,
    total,
    deliveryMethod,
    paymentMethod,
  ];

  db.query(
    "INSERT INTO orders (orderNumber, userId, subtotal, deliveryFee, total, deliveryMethod, paymentMethod) VALUES (?, ?, ?, ?, ?, ?, ?)",
    payload,
    (err, result) => {
      if (err) return callback(err);
      const orderId = result.insertId;

      if (!items || !items.length) {
        return callback(null, orderId);
      }

      const values = items.map((i) => [
        orderId,
        i.id || null,
        i.productName || i.name,
        i.price || 0,
        i.quantity || 0,
        i.subtotal || 0,
      ]);

      db.query(
        "INSERT INTO order_items (orderId, productId, name, price, quantity, subtotal) VALUES ?",
        [values],
        (err2) => {
          if (err2) return callback(err2);
          callback(null, orderId);
        }
      );
    }
  );
}

function getOrderByNumber(orderNumber, callback) {
  db.query(
    "SELECT * FROM orders WHERE orderNumber = ? LIMIT 1",
    [orderNumber],
    (err, rows) => {
      if (err) return callback(err);
      if (!rows || !rows.length) return callback(null, null);
      callback(null, rows[0]);
    }
  );
}

function listAllWithUsers(callback) {
  const sql = `
    SELECT 
      o.*,
      u.username AS customerName,
      COUNT(oi.id) AS itemsCount
    FROM orders o
    LEFT JOIN users u ON u.id = o.userId
    LEFT JOIN order_items oi ON oi.orderId = o.id
    GROUP BY o.id
    ORDER BY o.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return callback(err);
    callback(null, rows || []);
  });
}

function getItemsByOrderId(orderId, callback) {
  db.query(
    "SELECT * FROM order_items WHERE orderId = ?",
    [orderId],
    (err, rows) => {
      if (err) return callback(err);
      callback(null, rows || []);
    }
  );
}

module.exports = {
  createOrder,
  getOrderByNumber,
  getItemsByOrderId,
  listAllWithUsers,
};
