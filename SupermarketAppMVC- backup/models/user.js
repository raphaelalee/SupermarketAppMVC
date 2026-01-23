// models/user.js
const db = require("../db");

module.exports = {
  getByEmail(email, callback) {
    db.query("SELECT * FROM users WHERE email = ?", [email], callback);
  },

  create(user, callback) {
    const { username, email, password, address, contact, role } = user;

    db.query(
      "INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, ?, ?, ?, ?)",
      [username, email, password, address, contact, role],
      callback
    );
  }
};
