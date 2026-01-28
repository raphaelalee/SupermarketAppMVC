// models/wallet.js
// Persistent wallet using MySQL. No external gateway — credits/debits are recorded for audit.

const db = require("../db");

const schemaSqls = [
  `
  CREATE TABLE IF NOT EXISTS wallet_accounts (
    user_id INT PRIMARY KEY,
    balance DECIMAL(10,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB;
  `,
  `
  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('topup','debit','refund') NOT NULL,
    method VARCHAR(32) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    ref VARCHAR(128),
    note VARCHAR(255),
    meta JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_created (user_id, created_at DESC)
  ) ENGINE=InnoDB;
  `,
];

let schemaReady = false;

function ensureSchema() {
  if (schemaReady) return;
  let remaining = schemaSqls.length;
  schemaSqls.forEach((sql) => {
    db.query(sql, (err) => {
      if (err) console.error("Wallet schema init failed:", err.message);
      remaining -= 1;
      if (remaining === 0) schemaReady = true;
    });
  });
}

function getOrCreateAccount(userId, cb) {
  ensureSchema();
  db.query(
    "INSERT INTO wallet_accounts (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE balance = balance",
    [userId],
    (err) => {
      if (err) return cb(err);
      db.query(
        "SELECT balance FROM wallet_accounts WHERE user_id = ?",
        [userId],
        (err2, rows) => {
          if (err2) return cb(err2);
          const balance = rows[0]?.balance ? Number(rows[0].balance) : 0;
          cb(null, balance);
        }
      );
    }
  );
}

function topup(userId, amount, method, note, ref, meta, cb) {
  ensureSchema();
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return cb(new Error("Invalid amount"));

  db.getConnection((err, conn) => {
    if (err) return cb(err);
    conn.beginTransaction((txErr) => {
      if (txErr) {
        conn.release();
        return cb(txErr);
      }
      conn.query(
        "INSERT INTO wallet_accounts (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE balance = balance",
        [userId],
        (iErr) => {
          if (iErr) {
            conn.rollback(() => conn.release());
            return cb(iErr);
          }
          conn.query(
            "UPDATE wallet_accounts SET balance = balance + ? WHERE user_id = ?",
            [amt, userId],
            (uErr) => {
              if (uErr) {
                conn.rollback(() => conn.release());
                return cb(uErr);
              }
              conn.query(
                "INSERT INTO wallet_transactions (user_id, type, method, amount, ref, note, meta) VALUES (?,?,?,?,?,?,?)",
                [userId, "topup", method, amt, ref || null, note || null, meta ? JSON.stringify(meta) : null],
                (tErr) => {
                  if (tErr) {
                    conn.rollback(() => conn.release());
                    return cb(tErr);
                  }
                  conn.commit((cErr) => {
                    if (cErr) {
                      conn.rollback(() => conn.release());
                      return cb(cErr);
                    }
                    conn.release();
                    cb(null, { balanceChange: amt });
                  });
                }
              );
            }
          );
        }
      );
    });
  });
}

function debit(userId, amount, method, note, ref, meta, cb) {
  ensureSchema();
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return cb(new Error("Invalid amount"));

  db.getConnection((err, conn) => {
    if (err) return cb(err);
    conn.beginTransaction((txErr) => {
      if (txErr) {
        conn.release();
        return cb(txErr);
      }
      conn.query(
        "SELECT balance FROM wallet_accounts WHERE user_id = ? FOR UPDATE",
        [userId],
        (sErr, rows) => {
          if (sErr) {
            conn.rollback(() => conn.release());
            return cb(sErr);
          }
          const balance = rows[0]?.balance ? Number(rows[0].balance) : 0;
          if (balance < amt) {
            conn.rollback(() => conn.release());
            return cb(new Error("INSUFFICIENT_FUNDS"));
          }
          conn.query(
            "UPDATE wallet_accounts SET balance = balance - ? WHERE user_id = ?",
            [amt, userId],
            (uErr) => {
              if (uErr) {
                conn.rollback(() => conn.release());
                return cb(uErr);
              }
              conn.query(
                "INSERT INTO wallet_transactions (user_id, type, method, amount, ref, note, meta) VALUES (?,?,?,?,?,?,?)",
                [userId, "debit", method, -amt, ref || null, note || null, meta ? JSON.stringify(meta) : null],
                (tErr) => {
                  if (tErr) {
                    conn.rollback(() => conn.release());
                    return cb(tErr);
                  }
                  conn.commit((cErr) => {
                    if (cErr) {
                      conn.rollback(() => conn.release());
                      return cb(cErr);
                    }
                    conn.release();
                    cb(null, { balanceChange: -amt });
                  });
                }
              );
            }
          );
        }
      );
    });
  });
}

function history(userId, limit = 20, cb) {
  ensureSchema();
  db.query(
    "SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, Number(limit) || 20],
    cb
  );
}

module.exports = {
  getOrCreateAccount,
  topup,
  debit,
  history,
};
