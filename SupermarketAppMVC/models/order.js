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

  // Array of values to be substituted into the primary SQL query (automatically escapes them)
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

  // 1. INSERT INTO ORDERS TABLE
  const sql = `
    INSERT INTO orders 
      (orderNumber, userId, subtotal, deliveryFee, total, deliveryMethod, paymentMethod, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Executes the primary order insertion
  db.query(sql, payload, (err, result) => {
    if (err) return callback(err); // Handle errors from the orders table insertion

    const orderId = result.insertId; // Retrieve the newly created order ID

    if (!items || !items.length) {
      return callback(null, orderId); // Skip items insertion if cart was empty or validation failed
    }

    // Map cart items into an array of arrays format suitable for batch insertion
    const values = items.map((i) => [
      orderId,
      i.id || null, // The product ID (or null if the original product was deleted)
      i.productName || i.name,
      i.price || 0,
      i.quantity || 0,
      i.subtotal || 0,
    ]);

    // 2. INSERT INTO ORDER_ITEMS TABLE (Batch Insertion for efficiency)
    const itemsSql = `
      INSERT INTO order_items 
        (orderId, productId, name, price, quantity, subtotal)
      VALUES ?
    `;

    // Executes the batch item insertion (the '?' placeholder handles all rows in the [values] array)
    db.query(itemsSql, [values], (err2) => {
      if (err2) return callback(err2); // Handle errors from the order_items table insertion
      callback(null, orderId);
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
      u.username AS customerName, // Alias user's name as customerName
      COUNT(oi.id) AS itemsCount // Aggregate function to count items per order
    FROM orders o
    LEFT JOIN users u ON u.id = o.userId // Link to user, allowing for 'Guest checkout' (null user)
    LEFT JOIN order_items oi ON oi.orderId = o.id // Link to get item details
    GROUP BY 
      o.id, o.orderNumber, o.total, o.paymentMethod, o.paid, o.status, o.createdAt, u.username
    ORDER BY o.createdAt DESC, o.id DESC // Sort newest first
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
      COALESCE(SUM(total), 0) AS totalRevenue // COALESCE ensures 0 is returned instead of null on empty table
    FROM orders
  `;

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
      SUM(oi.quantity) AS totalQuantity, // Aggregate: sum up quantities
      SUM(oi.subtotal) AS totalRevenue // Aggregate: sum up revenue
    FROM order_items oi
    GROUP BY COALESCE(oi.productId, oi.name) // Group results to roll up per product
    ORDER BY totalQuantity DESC, totalRevenue DESC // Prioritize quantity, then revenue
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
      COALESCE(p.category, 'Uncategorized') AS category, // Fallback for items without a product link
      SUM(oi.subtotal) AS revenue,
      SUM(oi.quantity) AS quantity
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.productId // Join with products to get category data
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
      DATE_FORMAT(o.createdAt, '%Y-%m-%d %H:00:00') AS bucket, // Aggregate into hour-long buckets
      COUNT(*) AS ordersCount,
      COALESCE(SUM(o.total), 0) AS revenue
    FROM orders o
    WHERE o.createdAt >= DATE_SUB(NOW(), INTERVAL ? HOUR) // Filter: only include orders within the time window
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
      COUNT(o.id) AS ordersCount, // Aggregate: count total orders
      COALESCE(SUM(o.total), 0) AS totalSpent // Aggregate: sum total spent
    FROM orders o
    INNER JOIN users u ON u.id = o.userId // Only include orders linked to a registered user
    GROUP BY u.id, u.username
    HAVING COUNT(o.id) > 1 // Filter: keep only customers with more than 1 order
    ORDER BY ordersCount DESC, totalSpent DESC // Sort by number of orders, then total spent
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
  getSummaryStats,
  getBestSellingProducts,
  getSalesByCategory,
  getSalesByHourRange,
  getReturningCustomers,
};