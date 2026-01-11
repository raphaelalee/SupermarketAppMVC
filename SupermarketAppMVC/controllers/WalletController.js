const Order = require('../models/order');

exports.walletPage = (req, res) => {
  // Default: show link to PayPal sandbox dashboard and list recent PayPal-paid orders
  const user = req.session.user || null;

  const renderWith = (txs) => {
    res.render('wallet', {
      user,
      transactions: txs || [],
      sandboxDashboard: 'https://www.sandbox.paypal.com',
    });
  };

  if (user && user.id) {
    Order.getOrdersByUser(user.id, (err, rows) => {
      if (err) return renderWith([]);
      const paypalTx = (rows || []).filter(r => String(r.paymentMethod).toLowerCase() === 'paypal' && Number(r.paid) === 1);
      renderWith(paypalTx.slice(0, 20));
    });
  } else {
    // For guests, show site-wide recent PayPal orders (admin-like list)
    Order.listAllWithUsers((err, rows) => {
      if (err) return renderWith([]);
      const paypalTx = (rows || []).filter(r => String(r.paymentMethod).toLowerCase() === 'paypal' && Number(r.paid) === 1);
      renderWith(paypalTx.slice(0, 20));
    });
  }
};
