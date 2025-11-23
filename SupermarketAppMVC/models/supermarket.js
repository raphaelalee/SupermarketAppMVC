// models/supermarket.js

const db = require("../db");  // ✅ FIXED (must point to db.js)

module.exports = {
  getAll(callback) {
    db.query("SELECT * FROM products", callback);
  },

  getById(id, callback) {
    db.query("SELECT * FROM products WHERE id = ?", [id], callback);
  },

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

  // Accept an optional `quantity` parameter when creating a product. If not
  // provided, default to 0.
  create(productName, price, category, image, quantity = 0, callback) {
    db.query(
      "INSERT INTO products (productName, price, category, image, quantity) VALUES (?, ?, ?, ?, ?)",
      [productName, price, category, image, Number(quantity)],
      callback
    );
  },

  // Update product fields including quantity.
  update(id, productName, price, category, image, quantity = 0, callback) {
    db.query(
      "UPDATE products SET productName=?, price=?, category=?, image=?, quantity=? WHERE id=?",
      [productName, price, category, image, Number(quantity), id],
      callback
    );
  },

  delete(id, callback) {
    db.query("DELETE FROM products WHERE id = ?", [id], callback);
  },

  countAll(callback) {
    db.query("SELECT COUNT(*) AS totalProducts FROM products", (err, rows) => {
      if (err) return callback(err);
      const total = rows && rows[0] ? rows[0].totalProducts : 0;
      callback(null, total);
    });
  },

  getLowStock(threshold = 10, limit = 5, callback) {
    const safeThreshold =
      Number.isFinite(Number(threshold)) && Number(threshold) >= 0
        ? Number(threshold)
        : 10;
    const safeLimit =
      Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 5;

    db.query(
      `SELECT id, productName, COALESCE(quantity, 0) AS quantity
       FROM products
       WHERE COALESCE(quantity, 0) <= ?
       ORDER BY COALESCE(quantity, 0) ASC, productName ASC
       LIMIT ?`,
      [safeThreshold, safeLimit],
      (err, rows) => {
        if (err) return callback(err);
        callback(null, rows || []);
      }
    );
  },

  getCategories(callback) {
    const sql = `
      SELECT DISTINCT category
      FROM products
      WHERE category IS NOT NULL AND category <> ''
      ORDER BY category ASC
    `;
    db.query(sql, callback);
  },

  getFiltered(filters = {}, callback) {
    const clauses = [];
    const params = [];
    const category =
      typeof filters.category === "string" ? filters.category.trim() : "";
    const search =
      typeof filters.search === "string" ? filters.search.trim() : "";

    if (category) {
      clauses.push("category = ?");
      params.push(category);
    }

    if (search) {
      clauses.push("(productName LIKE ? OR category LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like);
    }

    let sql = "SELECT * FROM products";
    if (clauses.length) {
      sql += " WHERE " + clauses.join(" AND ");
    }
    sql += " ORDER BY id DESC";

    db.query(sql, params, callback);
  },
};
