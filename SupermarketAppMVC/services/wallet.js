// services/wallet.js
// Lightweight session-backed wallet utilities (demo-ready; no DB schema required)

function ensureSessionWallet(req) {
  if (!req.session) return null;
  if (!req.session.wallet) {
    req.session.wallet = {
      balance: 0,
      history: [], // { id, type: 'topup'|'payment'|'refund', method, amount, note, at }
    };
  }
  return req.session.wallet;
}

function addFunds(req, amount, method, note) {
  const wallet = ensureSessionWallet(req);
  if (!wallet) return false;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return false;
  wallet.balance = Number((wallet.balance + amt).toFixed(2));
  wallet.history.unshift({
    id: `topup-${Date.now()}`,
    type: "topup",
    method: method || "unknown",
    amount: amt,
    note: note || null,
    at: new Date().toISOString(),
  });
  wallet.history = wallet.history.slice(0, 50); // cap history
  return true;
}

function deduct(req, amount, method, note) {
  const wallet = ensureSessionWallet(req);
  if (!wallet) return false;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return false;
  if (wallet.balance < amt) return false;
  wallet.balance = Number((wallet.balance - amt).toFixed(2));
  wallet.history.unshift({
    id: `debit-${Date.now()}`,
    type: "payment",
    method: method || "wallet",
    amount: -amt,
    note: note || null,
    at: new Date().toISOString(),
  });
  wallet.history = wallet.history.slice(0, 50);
  return true;
}

module.exports = {
  ensureSessionWallet,
  addFunds,
  deduct,
};
