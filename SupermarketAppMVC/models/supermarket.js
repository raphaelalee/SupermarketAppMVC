// models/supermarket.js

const db = require("../db");  // Import the MySQL connection pool from db.js

module.exports = {
  // Fetches all columns for all products (used for initial load and general product listing)
  getAll(callback) {
    db.query("SELECT * FROM products", callback);
  },

  // Fetches a single product by its unique database ID.
  getById(id, callback) {
    // Uses parameterized query to prevent SQL injection
    db.query("SELECT * FROM products WHERE id = ?", [id], callback);
  },

  // Fetches products filtered by category. If category is "All", returns all products.
  getByCategory(category, callback) {
    if (category === "All") {
      return db.query("SELECT * FROM products", callback);
    }
    db.query(
      "SELECT * FROM products WHERE category = ?",
      [category],
      callback
    );
  },

  // Insert a new product record into the database (C in CRUD).
  create(productName, price, category, image, quantity = 0, callback) {
    db.query(
      "INSERT INTO products (productName, price, category, image, quantity) VALUES (?, ?, ?, ?, ?)",
      [productName, price, category, image, Number(quantity)],
      callback
    );
  },

  // Update an existing product record (U in CRUD).
  // This is used for all modifications, including stock replenishment in SupermarketController.
  update(id, productName, price, category, image, quantity = 0, callback) {
    db.query(
      "UPDATE products SET productName=?, price=?, category=?, image=?, quantity=? WHERE id=?",
      [productName, price, category, image, Number(quantity), id],
      callback
    );
  },

  // Delete a product by ID (D in CRUD).
  delete(id, callback) {
    db.query("DELETE FROM products WHERE id = ?", [id], callback);
  },

  // Calculates the total number of products in the database (used for admin dashboard totals).
  countAll(callback) {
    db.query("SELECT COUNT(*) AS totalProducts FROM products", (err, rows) => {
      if (err) return callback(err);
      const total = rows && rows[0] ? rows[0].totalProducts : 0;
      callback(null, total);
    });
  },

  // Fetches products whose stock quantity is at or below a defined threshold (for low stock alerts).
  getLowStock(threshold = 10, limit = 5, callback) {
    // Safely validates and coerces the input parameters
    const safeThreshold =
      Number.isFinite(Number(threshold)) && Number(threshold) >= 0
        ? Number(threshold)
        : 10;
    const safeLimit =
      Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 5;

    const sql = `SELECT id, productName, COALESCE(quantity, 0) AS quantity
       FROM products
       WHERE COALESCE(quantity, 0) <= ? // Check if quantity is less than or equal to threshold
       ORDER BY COALESCE(quantity, 0) ASC, productName ASC // Order by lowest stock first
       LIMIT ?`;

    db.query(sql, [safeThreshold, safeLimit],
      (err, rows) => {
        if (err) return callback(err);
        callback(null, rows || []);
      }
    );
  },

  // Retrieves a distinct, sorted list of all product categories (used for filtering navigation).
  getCategories(callback) {
    const sql = `
      SELECT DISTINCT category
      FROM products
      WHERE category IS NOT NULL AND category <> ''
      ORDER BY category ASC
    `;
    db.query(sql, callback);
  },

  // Dynamically builds a query to filter and search products (used by the shopping page).
  getFiltered(filters = {}, callback) {
    const clauses = [];
    const params = [];
    const category =
      typeof filters.category === "string" ? filters.category.trim() : "";
    const search =
      typeof filters.search === "string" ? filters.search.trim() : "";

    // If a specific category is requested, add a WHERE clause
    if (category) {
      clauses.push("category = ?");
      params.push(category);
    }

    // If a search term is present, add a LIKE clause that checks both name and category
    if (search) {
      clauses.push("(productName LIKE ? OR category LIKE ?)");
      const like = `%${search}%`; // Use %wildcards% for partial matching
      params.push(like, like);
    }

    let sql = "SELECT * FROM products";
    if (clauses.length) {
      // Combines all clauses with 'AND'
      sql += " WHERE " + clauses.join(" AND ");
    }
    sql += " ORDER BY id DESC"; // Default sort: newest products first

    // Executes the constructed query with all parameters
    db.query(sql, params, callback);
  },
};