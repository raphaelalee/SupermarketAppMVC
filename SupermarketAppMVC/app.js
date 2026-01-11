// app.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");
const methodOverride = require("method-override");

// Optional MySQL session store
let MySQLStore;
if (process.env.USE_MYSQL_SESSION === "true") {
  try {
    MySQLStore = require("express-mysql-session")(session);
  } catch (e) {
    console.warn("express-mysql-session not installed; using memory store.");
  }
}

const app = express();

// Controllers
const SupermarketController = require("./controllers/SupermarketController");
const UserController = require("./controllers/UserController");
const CartController = require("./controllers/CartController");
const CheckoutController = require("./controllers/CheckoutController");
const AdminController = require("./controllers/AdminController");
const WalletController = require("./controllers/WalletController");

// Logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// View engine
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(methodOverride("_method"));

// Session config
const sessOptions = {
  secret: process.env.SESSION_SECRET || "secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    sameSite: "lax",
  },
};

// Use DB_NAME (your .env) but also accept DB_DATABASE
const DB_NAME = process.env.DB_NAME || process.env.DB_DATABASE;

if (MySQLStore) {
  sessOptions.store = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: DB_NAME,
  });
}

app.use(session(sessOptions));
app.use(flash());

// Global locals
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.messages = req.flash("success") || [];
  res.locals.errors = req.flash("error") || [];
  res.locals.PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
  next();
});

// Cart count for navbar
app.use((req, res, next) => {
  const cartObj = req.session.cart || {};
  res.locals.cartCount = Object.values(cartObj).reduce((count, entry) => {
    if (typeof entry === "object" && entry !== null) {
      return count + (parseInt(entry.quantity, 10) || 0);
    }
    return count + (parseInt(entry, 10) || 0);
  }, 0);
  next();
});

// Build detailed cart snapshot
app.use((req, res, next) => {
  const cart = req.session.cart || {};
  const ids = Object.keys(cart);

  res.locals.cartDetailed = [];
  res.locals.cartTotal = 0;
  res.locals.cartSummary = { items: [], total: 0, count: 0 };

  if (!ids.length) return next();

  CartController.buildCartSnapshot(cart, (err, summary) => {
    if (!err && summary) {
      res.locals.cartDetailed = summary.items;
      res.locals.cartTotal = summary.total;
      res.locals.cartSummary = summary;
    }
    next();
  });
});

// Auth guards
const requireLogin = (req, res, next) => {
  if (req.session?.user) return next();
  req.flash("error", "Please log in to continue.");
  req.session.returnTo = req.originalUrl;
  return res.redirect("/login");
};

const requireAdmin = (req, res, next) => {
  if (req.session?.user?.role === "admin") return next();
  req.flash("error", "Admin access required.");
  req.session.returnTo = req.originalUrl;
  return res.redirect("/login");
};

/* OTP handlers implemented later in file (demo-friendly send/resend/verify) */

// Routes
app.get("/", SupermarketController.homePage);

app.get("/shopping", SupermarketController.listAll);
app.get("/product/:id", SupermarketController.viewProduct);

app.get("/inventory", SupermarketController.inventoryPage);
app.post(
  "/inventory/add",
  SupermarketController.handleProductImageUpload,
  SupermarketController.addProduct
);
app.post(
  "/inventory/edit/:id",
  SupermarketController.handleProductImageUpload,
  SupermarketController.updateProduct
);
app.post("/inventory/delete/:id", SupermarketController.deleteProduct);
app.post(
  "/inventory/replenish/:id",
  requireLogin,
  requireAdmin,
  SupermarketController.replenishStock
);

app.get("/login", UserController.renderLogin);
app.post("/login", UserController.loginUser);
app.get("/register", UserController.renderRegister);
app.post("/register", UserController.registerUser);
app.get("/logout", UserController.logoutUser);

app.get("/history", requireLogin, UserController.myOrders);
app.get("/history/:id", requireLogin, UserController.viewMyOrder);

app.post("/add-to-cart/:id", CartController.addToCart);
app.get("/cart", CartController.viewCart);
app.post("/cart/remove/:id", CartController.removeFromCart);
app.post("/cart/update/:id", CartController.updateItemQuantity);
app.post("/cart/increase/:id", CartController.increaseQuantity);
app.post("/cart/decrease/:id", CartController.decreaseQuantity);
app.post("/cart/clear", CartController.clearCart);

app.get("/checkout", CheckoutController.renderCheckout);

// Checkout POST: wrap the existing controller so we can route PayPal-paid orders
// to OTP verification without changing controller logic.
app.post("/checkout", (req, res, next) => {
  const wantsOtp = String(req.body.payment || '').toLowerCase() === 'paypal' && String(req.body.paypalPaid || '') === '1';

  if (wantsOtp) {
    // Intercept redirects issued by the controller and send user to /verify-otp
    const originalRedirect = res.redirect.bind(res);
    let redirected = false;
    res.redirect = function (url) {
      if (redirected) return; // avoid double-redirects
      redirected = true;
      return originalRedirect('/verify-otp');
    };

    // Call the existing controller (it will perform order save and invoke res.redirect)
    return CheckoutController.processCheckout(req, res, next);
  }

  // Default behavior: use controller as-is
  return CheckoutController.processCheckout(req, res, next);
});

// OTP routes (demo mode: OTP printed to server console)
app.post('/send-otp', (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.otp = otp;
    req.session.otpPending = true;
    // store phone if provided (client may send phone in body)
    const phone = req.body && req.body.phone ? String(req.body.phone) : (req.session.otpPhone || null);
    if (phone) req.session.otpPhone = phone;

    // expiry (3 minutes)
    const expiresAt = Date.now() + (3 * 60 * 1000);
    req.session.otpExpires = expiresAt;

    console.log('OTP (demo):', otp);
    return res.json({ ok: true });
  } catch (e) {
    console.error('send-otp error', e);
    return res.sendStatus(500);
  }
});

// POST /resend-otp - generate a new OTP if an OTP flow is pending
app.post('/resend-otp', (req, res) => {
  try {
    if (!req.session || !req.session.otpPending) return res.status(400).json({ error: 'No OTP pending' });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.otp = otp;
    // refresh expiry
    const expiresAt = Date.now() + (3 * 60 * 1000);
    req.session.otpExpires = expiresAt;
    // keep otpPending true
    console.log('OTP (demo) resent:', otp);
    return res.json({ ok: true, expiresAt });
  } catch (e) {
    console.error('resend-otp error', e);
    return res.sendStatus(500);
  }
});

app.get('/verify-otp', (req, res) => {
  if (!req.session || !req.session.otpPending) return res.redirect('/checkout');

  // Demo shortcut: if we already have a lastOrder in session, skip OTP and go to receipt
  const last = req.session && req.session.lastOrder ? req.session.lastOrder : null;
  if (last && last.orderNumber) {
    // clear OTP flags and redirect
    delete req.session.otp;
    delete req.session.otpPending;
    delete req.session.otpExpires;
    delete req.session.otpPhone;
    return res.redirect(`/order/${last.orderNumber}`);
  }

  // If no OTP exists yet (maybe send-otp wasn't called), create a demo OTP so user can see it
  if (!req.session.otp) {
    const generated = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.otp = generated;
    req.session.otpPending = true;
    const expiresAt = Date.now() + (3 * 60 * 1000);
    req.session.otpExpires = expiresAt;
    console.log('OTP (demo auto-generated):', generated);
  }

  const otp = req.session.otp || null;
  const phone = req.session.otpPhone || null;
  const expiresAt = req.session.otpExpires || (Date.now() + (3 * 60 * 1000));
  const remainingSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

  // mask phone for display: show country/left and last 4 digits
  let maskedPhone = null;
  if (phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length > 4) {
      const last4 = digits.slice(-4);
      maskedPhone = `****${last4}`;
    } else maskedPhone = phone;
  }

  return res.render('verifyOTP', { error: null, otp, remainingSeconds, maskedPhone });
});

app.post('/verify-otp', (req, res) => {
  const provided = (req.body && (req.body.otp || '')).toString().trim();

  // ensure an OTP flow is active
  if (!req.session || !req.session.otpPending) {
    return res.redirect('/checkout');
  }

  // Demo mode: accept any non-empty input as success so verification won't fail for testing
  if (!provided || provided.length === 0) {
    const remainingSeconds = Math.max(0, Math.floor(((req.session.otpExpires || Date.now()) - Date.now()) / 1000));
    return res.render('verifyOTP', { error: 'Please enter the code (any value accepted in demo).', otp: req.session.otp || null, remainingSeconds, maskedPhone: req.session.otpPhone || null });
  }

  // Treat as success (demo): clear OTP session state and redirect to receipt/history
  delete req.session.otp;
  delete req.session.otpPending;
  delete req.session.otpExpires;
  delete req.session.otpPhone;

  const last = req.session && req.session.lastOrder ? req.session.lastOrder : null;
  if (last && last.orderNumber) return res.redirect(`/order/${last.orderNumber}`);
  return res.redirect('/history');
});

app.get("/order/:orderNumber", CheckoutController.renderReceipt);

// PayPal
app.post("/paypal/create-order", CheckoutController.createPaypalOrder);
app.post("/paypal/capture-order", CheckoutController.capturePaypalOrder);

app.get("/wallet", WalletController.walletPage);

// Customer-confirm payment for offline methods
app.post("/order/confirm-payment", CheckoutController.confirmPayment);

// Admin
app.get("/admin/orders", requireLogin, requireAdmin, AdminController.ordersDashboard);
app.get("/admin/orders/:id", requireLogin, requireAdmin, AdminController.viewOrder);
app.post("/admin/orders/:id/status", requireLogin, requireAdmin, AdminController.updateOrderStatus);
app.get("/admin/orders/:id/receipt", requireLogin, requireAdmin, AdminController.downloadReceipt);

app.get("/about", (req, res) => res.render("about"));
app.get("/contact", (req, res) => res.render("contact"));
app.get("/help-center", (req, res) => res.render("helpCenter"));

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log("Using DB:", DB_NAME);
  console.log(
    "PAYPAL_CLIENT_ID:",
    process.env.PAYPAL_CLIENT_ID ? "[set]" : "[missing]"
  );
});
