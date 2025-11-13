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

  create(productName, price, category, image, callback) {
    db.query(
      "INSERT INTO products (productName, price, category, image) VALUES (?, ?, ?, ?)",
      [productName, price, category, image],
      callback
    );
  },

  update(id, productName, price, category, image, callback) {
    db.query(
      "UPDATE products SET productName=?, price=?, category=?, image=? WHERE id=?",
      [productName, price, category, image, id],
      callback
    );
  },

  delete(id, callback) {
    db.query("DELETE FROM products WHERE id = ?", [id], callback);
  }
};
