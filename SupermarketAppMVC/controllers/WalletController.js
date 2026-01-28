const Order = require('../models/order');
const Wallet = require('../models/wallet');
const paypal = require('../services/paypal');

exports.walletPage = (req, res) => {
  const user = req.session.user || null;
  if (!user) return res.redirect('/login');

  Wallet.getOrCreateAccount(user.id, (err, balance) => {
    if (err) balance = 0;
    Wallet.history(user.id, 20, (hErr, rows) => {
      res.render('wallet', {
        user,
        balance: balance || 0,
        history: rows || [],
        sandboxDashboard: 'https://www.sandbox.paypal.com',
        paypalClientId: process.env.PAYPAL_CLIENT_ID || null,
        paypalCurrency: process.env.PAYPAL_CURRENCY || 'SGD',
      });
    });
  });
};

// POST /wallet/topup (card/paypal/nets). For now, mark as paid immediately.
exports.topup = (req, res) => {
  const user = req.session.user;
  if (!user) return res.redirect('/login');
  const amount = Number(req.body.amount || 0);
  const method = (req.body.method || 'card').toLowerCase();
  const note = req.body.note || null;

  // PayPal/NETS use dedicated flows
  if (method === 'paypal') {
    // Frontend should use /wallet/paypal/create-order + capture; block direct form post
    req.flash('error', 'Please complete PayPal top-up via the PayPal button.');
    return res.redirect('/wallet');
  }
  if (method === 'nets') {
    // Frontend should redirect to /wallet/nets/qr
    req.flash('error', 'Please use the NETS QR flow for top-up.');
    return res.redirect('/wallet');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    req.flash('error', 'Enter a valid amount to top up.');
    return res.redirect('/wallet');
  }

  Wallet.topup(user.id, amount, method, note, null, null, (err) => {
    if (err) {
      req.flash('error', 'Top-up failed.');
      return res.redirect('/wallet');
    }
    req.flash('success', `Wallet topped up S$${amount.toFixed(2)} via ${method.toUpperCase()}.`);
    return res.redirect('/wallet');
  });
};

// PayPal wallet top-up: create order
exports.createPaypalTopup = async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Login required' });
    const amount = Number(req.body.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const order = await paypal.createOrder(amount.toFixed(2), {
      description: 'FreshMart wallet top-up',
    });

    req.session.walletPaypalPending = {
      orderId: order.id,
      amount: Number(amount.toFixed(2)),
      createdAt: Date.now(),
    };

    return res.json({ id: order.id });
  } catch (err) {
    console.error('createPaypalTopup error', err);
    return res.status(500).json({ error: 'Failed to create PayPal order' });
  }
};

// PayPal wallet top-up: capture and credit wallet
exports.capturePaypalTopup = async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Login required' });
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

    const capture = await paypal.captureOrder(orderId);
    if (capture.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Payment not completed', capture });
    }

    const cap = capture?.purchase_units?.[0]?.payments?.captures?.[0];
    const amountValue = cap?.amount?.value;
    const currency = cap?.amount?.currency_code;
    const pending = req.session.walletPaypalPending;

    const paidAmount = Number(amountValue || 0);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return res.status(400).json({ error: 'Invalid captured amount' });
    }

    if (!pending || pending.orderId !== orderId || Number(pending.amount) !== Number(paidAmount.toFixed(2))) {
      console.warn('PayPal topup amount/order mismatch', { pending, paidAmount });
    }

    Wallet.topup(
      req.session.user.id,
      paidAmount,
      'paypal',
      `PayPal ${currency || ''}`.trim(),
      orderId,
      { captureId: cap?.id || null, payer: capture?.payer || null },
      (err) => {
        req.session.walletPaypalPending = null;
        if (err) {
          console.error('Wallet topup credit failed', err);
          return res.status(500).json({ error: 'Wallet credit failed' });
        }
        return res.json({ ok: true, amount: paidAmount });
      }
    );
  } catch (err) {
    console.error('capturePaypalTopup error', err);
    return res.status(500).json({ error: 'Failed to capture PayPal order' });
  }
};

// NETS wallet QR start
exports.startNetsTopup = (req, res, next) => {
  try {
    if (!req.session.user) return res.redirect('/login');
    const amount = Number(req.body.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      req.flash('error', 'Enter a valid amount.');
      return res.redirect('/wallet');
    }
    req.session.pendingWalletNets = { amount: Number(amount.toFixed(2)), createdAt: Date.now() };
    req.body.cartTotal = amount.toFixed(2);
    res.locals.finalizePath = '/wallet/nets/finalize';
    res.locals.markPaidPath = '/wallet/nets/mark-paid';
    res.locals.amount = amount.toFixed(2);
    return require('../services/nets').generateQrCode(req, res);
  } catch (e) {
    return next(e);
  }
};

// NETS wallet mark-paid (called by netsQr page when enquiry success)
exports.netsMarkPaid = (req, res) => {
  const txnRef = req.body?.txnRetrievalRef;
  if (!txnRef) return res.status(400).json({ error: 'Missing txnRetrievalRef' });
  req.session.netsWalletPaid = true;
  req.session.netsWalletTxnRef = txnRef;
  return res.json({ ok: true });
};

// NETS wallet finalize -> credit wallet and redirect back to wallet
exports.netsFinalize = (req, res) => {
  const pending = req.session?.pendingWalletNets;
  if (!pending) return res.status(400).json({ error: 'No pending NETS wallet top-up found.' });
  if (!req.session.netsWalletPaid) return res.status(400).json({ error: 'NETS payment not confirmed yet.' });

  const txnRef = req.body?.txnRetrievalRef || req.session.netsWalletTxnRef || null;

  Wallet.topup(
    req.session.user.id,
    pending.amount,
    'nets',
    'NETS QR top-up',
    txnRef,
    null,
    (err) => {
      if (err) {
        console.error('Wallet NETS credit failed', err);
        return res.status(500).json({ error: 'Wallet credit failed' });
      }
      // clear flags
      req.session.pendingWalletNets = null;
      req.session.netsWalletPaid = null;
      req.session.netsWalletTxnRef = null;
      // After successful top-up, send user back to checkout to pay with wallet
      return res.json({ success: true, redirect: '/checkout' });
    }
  );
};

// POST /wallet/pay - deduct from wallet for current cart
exports.payWithWallet = (req, res) => {
  const user = req.session.user;
  if (!user) {
    if (req.accepts('json')) return res.status(401).json({ error: 'Login required' });
    req.flash('error', 'Please log in to use wallet.');
    return res.redirect('/login');
  }

  const amount = Number(req.body.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    if (req.accepts('json')) return res.status(400).json({ error: 'Invalid amount' });
    req.flash('error', 'Invalid amount.');
    return res.redirect('/checkout');
  }

  Wallet.debit(user.id, amount, 'wallet', 'Checkout payment', null, null, (err) => {
    if (err) {
      const msg = err.message === 'INSUFFICIENT_FUNDS' ? 'Insufficient wallet balance.' : 'Wallet payment failed.';
      if (req.accepts('json')) return res.status(400).json({ error: msg });
      req.flash('error', msg);
      return res.redirect('/checkout');
    }
    req.session.walletPaidAmount = amount;
    if (req.accepts('json')) return res.json({ ok: true });
    req.flash('success', 'Wallet payment successful.');
    return res.redirect('/checkout');
  });
};
