// db.js
const mysql = require('mysql2');
require('dotenv').config(); // Load variables from .env file

// Create a MySQL connection pool (better than single connection)
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
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
    console.error('❌ Error connecting to MySQL:', err.message);
  } else {
    console.log('✅ Connected to MySQL database');
    connection.release();
  }
});

// Export the pool to use in models
module.exports = db;
