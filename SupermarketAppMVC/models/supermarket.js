// models/supermarket.js
const db = require('../db');

/* =========================
   USERS MODEL
   ========================= */
const Users = {
  // Get all users (exclude passwords)
  getAll(callback) {
    const sql = 'SELECT id, username, email, address, contact, role FROM users ORDER BY id';
    db.query(sql, (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  // Get user by ID (exclude password)
  getById(id, callback) {
    const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE id = ?';
    db.query(sql, [id], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  // Get user by email (used for login)
  getByEmail(email, callback) {
    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  // Create new user
  create({ username, email, password, address, contact, role }, callback) {
    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [username, email, password, address, contact, role], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  // Update user
  update(id, { username, email, password, address, contact, role }, callback) {
    const sql = 'UPDATE users SET username = ?, email = ?, password = ?, address = ?, contact = ?, role = ? WHERE id = ?';
    db.query(sql, [username, email, password, address, contact, role, id], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  // Delete user
  remove(id, callback) {
    const sql = 'DELETE FROM users WHERE id = ?';
    db.query(sql, [id], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }
};

/* =========================
   PRODUCTS MODEL
   ========================= */
const Product = {
  // Get all products
  getAll(callback) {
    const sql = 'SELECT * FROM products ORDER BY id';
    db.query(sql, (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  // Get product by ID
  getById(id, callback) {
    const sql = 'SELECT * FROM products WHERE id = ?';
    db.query(sql, [id], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  // Add a new product
  create({ productName, quantity, price, image }, callback) {
    const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)';
    db.query(sql, [productName, quantity, price, image], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  // Update an existing product
  update(id, { productName, quantity, price, image }, callback) {
    const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, image = ? WHERE id = ?';
    db.query(sql, [productName, quantity, price, image, id], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  // Delete a product
  remove(id, callback) {
    const sql = 'DELETE FROM products WHERE id = ?';
    db.query(sql, [id], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }
};

/* =========================
   EXPORT BOTH MODELS
   ========================= */
module.exports = { Users, Product };
