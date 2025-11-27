const db = require("../db"); // Import the MySQL connection pool from db.js

const DEFAULT_ORDER_STATUS = "pending"; // Default status for new orders

// ==============================
// ORDER CREATION
// ==============================
// Function to create a new order and its associated items in two separate steps.
function createOrder(order, items, callback) {
  const {
    orderNumber,
    userId = null,
    subtotal = 0,
    deliveryFee = 0,
    total = 0,
    deliveryMethod = "standard",
    paymentMethod = "paynow",
    status = DEFAULT_ORDER_STATUS,
  } = order;

  const payload = [
    orderNumber,
    userId,
    subtotal,
    deliveryFee,
    total,
    deliveryMethod,
    paymentMethod,
    status,
  ];

  // Use a connection from the pool to run a transaction so we can atomically create the order,
  // insert items and decrement product quantities.
  db.getConnection((connErr, connection) => {
    if (connErr) return callback(connErr);

    connection.beginTransaction((txErr) => {
      if (txErr) {
        connection.release();
        return callback(txErr);
      }

      const sql = `
            INSERT INTO orders 
              (orderNumber, userId, subtotal, deliveryFee, total, deliveryMethod, paymentMethod, status, customerName, customerEmail, customerPhone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

          // append customer contact info if present on order
          const custName = order.customerName || null;
          const custEmail = order.customerEmail || null;
          const custPhone = order.customerPhone || null;
          const fullPayload = payload.concat([custName, custEmail, custPhone]);

          connection.query(sql, fullPayload, (insErr, result) => {
        if (insErr) {
          return connection.rollback(() => {
            connection.release();
            callback(insErr);
          });
        }

        const orderId = result.insertId;

        if (!items || !items.length) {
          return connection.commit((cErr) => {
            if (cErr) {
              return connection.rollback(() => {
                connection.release();
                callback(cErr);
              });
            }
            connection.release();
            return callback(null, orderId);
          });
        }

        const values = items.map((i) => [
          orderId,
          i.id || null,
          i.productName || i.name,
          i.price || 0,
          i.quantity || 0,
          i.subtotal || 0,
        ]);

        const itemsSql = `
          INSERT INTO order_items 
            (orderId, productId, name, price, quantity, subtotal)
          VALUES ?
        `;

        connection.query(itemsSql, [values], (itemsErr) => {
          if (itemsErr) {
            return connection.rollback(() => {
              connection.release();
              callback(itemsErr);
            });
          }

          // Decrement product quantities for items that have a valid productId
          const updates = (items || []).filter((it) => it.id).map((it) => ({ id: it.id, qty: it.quantity || 0 }));

          // Helper to sequentially run updates to avoid overwhelming the DB and to keep within transaction
          let idx = 0;
          function runNextUpdate() {
            if (idx >= updates.length) {
              // All updates done — commit the transaction
              return connection.commit((commitErr) => {
                if (commitErr) {
                  return connection.rollback(() => {
                    connection.release();
                    callback(commitErr);
                  });
                }
                connection.release();
                return callback(null, orderId);
              });
            }

            const u = updates[idx++];
            // Ensure quantity never goes below zero using GREATEST
            connection.query(
              'UPDATE products SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?',
              [u.qty, u.id],
              (upErr) => {
                if (upErr) {
                  return connection.rollback(() => {
                    connection.release();
                    callback(upErr);
                  });
                }
                runNextUpdate();
              }
            );
          }

          runNextUpdate();
        });
      });
    });
  });
}

// ==============================
// ORDER LOOKUPS
// ==============================
function getOrderByNumber(orderNumber, callback) {
  db.query(
    "SELECT * FROM orders WHERE orderNumber = ? LIMIT 1", // Find order by human-readable number
    [orderNumber],
    (err, rows) => {
      if (err) return callback(err);
      callback(null, rows && rows[0] ? rows[0] : null);
    }
  );
}

// Fetches ALL orders for the Admin Dashboard List, joining with user data and counting items.
function listAllWithUsers(callback) {
  const sql = `
    SELECT 
      o.id,
      o.orderNumber,
      o.total,
      o.paymentMethod,
      o.paid,
      o.status,
      o.createdAt,
      u.username AS customerName,
      COUNT(oi.id) AS itemsCount
    FROM orders o
    LEFT JOIN users u ON u.id = o.userId
    LEFT JOIN order_items oi ON oi.orderId = o.id
    GROUP BY 
      o.id, o.orderNumber, o.total, o.paymentMethod, o.paid, o.status, o.createdAt, u.username
    ORDER BY o.createdAt DESC, o.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return callback(err);
    callback(null, rows || []);
  });
}

// Fetches the line items associated with a single order ID.
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

// Fetches a single order, joining customer contact details (if logged in) AND fetching all items.
// This uses a nested query pattern (SQL query then JS logic/second query).
function getOrderWithItems(orderId, callback) {
  const sql = `
    SELECT 
      o.*,
      u.username AS customerName,
      u.email AS customerEmail,
      u.contact AS customerPhone
    FROM orders o
    LEFT JOIN users u ON u.id = o.userId
    WHERE o.id = ?
    LIMIT 1
  `;

  db.query(sql, [orderId], (err, rows) => {
    if (err) return callback(err);
    if (!rows || !rows.length) return callback(null, null);
    const order = rows[0];

    // Second database operation: retrieve all associated line items
    getItemsByOrderId(orderId, (itemsErr, items) => {
      if (itemsErr) return callback(itemsErr);
      // Return both the order header and the list of items
      callback(null, { order, items: items || [] });
    });
  });
}

// Fetches all orders for a specific user (for user purchase history)
function getOrdersByUser(userId, callback) {
  const sql = `
    SELECT id, orderNumber, total, paymentMethod, paid, status, createdAt
    FROM orders
    WHERE userId = ?
    ORDER BY createdAt DESC, id DESC
  `;
  db.query(sql, [userId], (err, rows) => {
    if (err) return callback(err);
    callback(null, rows || []);
  });
}

// Associate an existing order (by orderNumber) to a userId. Useful to claim guest orders after login.
function updateOrderUser(orderNumber, userId, callback) {
  const sql = `UPDATE orders SET userId = ? WHERE orderNumber = ?`;
  db.query(sql, [userId, orderNumber], (err, result) => {
    if (err) return callback(err);
    callback(null, result);
  });
}

// Claim recent guest orders by matching customer email or phone and assign them to a userId.
// daysWindow limits how far back to search (default 30 days).
function claimGuestOrdersByContact(userId, email, phone, daysWindow = 30, callback) {
  if (!userId) return callback(new Error('Missing userId'));
  const clauses = [];
  const params = [userId];
  if (email) { clauses.push('customerEmail = ?'); params.push(email); }
  if (phone) { clauses.push('customerPhone = ?'); params.push(phone); }
  if (!clauses.length) return callback(null, { affectedRows: 0 });

  const sql = `
    UPDATE orders
    SET userId = ?
    WHERE userId IS NULL
      AND (${clauses.join(' OR ')})
      AND createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
  `;
  params.push(Number(daysWindow));

  db.query(sql, params, (err, result) => {
    if (err) return callback(err);
    callback(null, result);
  });
}

// Updates the order status field for a given order ID.
function updateOrderStatus(orderId, status, callback) {
  db.query(
    "UPDATE orders SET status = ? WHERE id = ?", // Parameterized query protects against SQL injection
    [status, orderId],
    (err, result) => {
      if (err) return callback(err);
      callback(null, result);
    }
  );
}

// ==============================
// DASHBOARD + ANALYTICS (Heavy lifting happens in SQL)
// ==============================

// Calculates total orders and total revenue across ALL orders
function getSummaryStats(callback) {
  const sql = `
    SELECT 
      COUNT(*) AS totalOrders,
      COALESCE(SUM(total), 0) AS totalRevenue
    FROM orders
  `; /* COALESCE ensures 0 is returned instead of null on empty table */

  db.query(sql, (err, rows) => {
    if (err) return callback(err);
    const row = rows && rows[0] ? rows[0] : { totalOrders: 0, totalRevenue: 0 };
    callback(null, row);
  });
}

// Finds the products that have sold the most (by quantity and revenue)
function getBestSellingProducts(limit = 5, callback) {
  const safeLimit =
    Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 5;

  const sql = `
    SELECT 
      COALESCE(oi.productId, 0) AS productId,
      oi.name AS productName,
      SUM(oi.quantity) AS totalQuantity,
      SUM(oi.subtotal) AS totalRevenue
    FROM order_items oi
    GROUP BY COALESCE(oi.productId, oi.name)
    ORDER BY totalQuantity DESC, totalRevenue DESC
    LIMIT ?
  `;

  db.query(sql, [safeLimit], (err, rows) => {
    if (err) return callback(err);
    callback(null, rows || []);
  });
}

// Calculates total sales revenue and quantity grouped by product category
function getSalesByCategory(callback) {
  const sql = `
    SELECT
      COALESCE(p.category, 'Uncategorized') AS category,
      SUM(oi.subtotal) AS revenue,
      SUM(oi.quantity) AS quantity
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.productId
    GROUP BY COALESCE(p.category, 'Uncategorized')
    ORDER BY revenue DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return callback(err);
    callback(null, rows || []);
  });
}

// Calculates sales activity (orders and revenue) bucketed by hour over a given range (e.g., last 24 hours)
function getSalesByHourRange(hours = 24, callback) {
  const safeHours =
    Number.isFinite(Number(hours)) && Number(hours) > 0 ? Number(hours) : 24;

  const sql = `
    SELECT 
      DATE_FORMAT(o.createdAt, '%Y-%m-%d %H:00:00') AS bucket,
      COUNT(*) AS ordersCount,
      COALESCE(SUM(o.total), 0) AS revenue
    FROM orders o
    WHERE o.createdAt >= DATE_SUB(NOW(), INTERVAL ? HOUR)
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  db.query(sql, [safeHours], (err, rows) => {
    if (err) return callback(err);
    callback(null, rows || []);
  });
}

// Finds the customers with more than one order (returning customers)
function getReturningCustomers(limit = 5, callback) {
  const safeLimit =
    Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 5;

  const sql = `
    SELECT 
      u.id,
      u.username,
      COUNT(o.id) AS ordersCount,
      COALESCE(SUM(o.total), 0) AS totalSpent
    FROM orders o
    INNER JOIN users u ON u.id = o.userId
    GROUP BY u.id, u.username
    HAVING COUNT(o.id) > 1
    ORDER BY ordersCount DESC, totalSpent DESC
    LIMIT ?
  `;

  db.query(sql, [safeLimit], (err, rows) => {
    if (err) return callback(err);
    callback(null, rows || []);
  });
}

// Exported functions accessible by controllers (like AdminController.js)
module.exports = {
  createOrder,
  getOrderByNumber,
  getItemsByOrderId,
  listAllWithUsers,
  getOrderWithItems,
  updateOrderStatus,
  getOrdersByUser,
  updateOrderUser,
  getSummaryStats,
  getBestSellingProducts,
  getSalesByCategory,
  getSalesByHourRange,
  getReturningCustomers,
  claimGuestOrdersByContact,
};