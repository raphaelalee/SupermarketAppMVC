const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); // ✅ force THIS project's .env

// Create a MySQL connection pool (better than single connection)
const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'c207',
  database: process.env.DB_NAME || 'c372_supermarketdb',
  port: process.env.DB_PORT || 3305,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection when server starts
db.getConnection((err, connection) => {
  if (err) {
    console.error(' Error connecting to MySQL:', err.message);
  } else {
    console.log(' Connected to MySQL database');
    connection.release();
  }
});

// Export the pool to use in models
module.exports = db;
db.query("SELECT DATABASE() AS db", (err, rows) => {
  if (err) return console.error("DB check failed:", err.message);
  console.log("✅ Connected DB (SELECT DATABASE()):", rows[0].db);
});
