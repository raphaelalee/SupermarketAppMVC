// app.js
require('dotenv').config();
const express = require("express");
const path = require("path");
const session = require("express-session");
// Optional persistent session store backed by MySQL. Install with: npm install express-mysql-session
let MySQLStore;
if (process.env.USE_MYSQL_SESSION === 'true') {
  try {
    MySQLStore = require('express-mysql-session')(session);
  } catch (e) {
    console.warn('express-mysql-session not installed; falling back to memory session store.');
  }
}
const flash = require("connect-flash");
const methodOverride = require("method-override");

const app = express();

// Controllers
const SupermarketController = require("./controllers/SupermarketController");
const UserController = require("./controllers/UserController");
const CartController = require("./controllers/CartController");
const CheckoutController = require("./controllers/CheckoutController");
const AdminController = require("./controllers/AdminController");

// Logger
app.use((req, res, next) => {
  console.log(` ${req.method} ${req.url}`);
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

const sessOptions = {
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    sameSite: 'lax',
  }
};

// Use MySQL-backed session store when available and enabled via env
if (MySQLStore) {
  const storeOptions = {
    // Use the same connection settings as db.js via env vars
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
  sessOptions.store = new MySQLStore(storeOptions);
}

app.use(session(sessOptions));
app.use(flash());

// Global variables
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.messages = req.flash("success") || [];
  res.locals.errors = req.flash("error") || [];
  next();
});

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

// Simple auth guard for protected pages
const requireLogin = (req, res, next) => {
  if (req.session && req.session.user) return next();
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

app.use((req, res, next) => {
  const cart = req.session.cart || {};
  const ids = Object.keys(cart);

  res.locals.cartDetailed = [];
  res.locals.cartTotal = 0;
  res.locals.cartSummary = { items: [], total: 0, count: 0 };

  if (ids.length === 0) return next();

  CartController.buildCartSnapshot(cart, (err, summary) => {
    if (!err && summary) {
      res.locals.cartDetailed = summary.items;
      res.locals.cartTotal = summary.total;
      res.locals.cartSummary = summary;
    }
    next();
  });
});

// Routes

// Home
app.get("/", SupermarketController.homePage);

// Shopping
app.get("/shopping", SupermarketController.listAll);
app.get("/product/:id", SupermarketController.viewProduct);

// Inventory (Admin)
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
app.post("/inventory/replenish/:id", requireLogin, requireAdmin, SupermarketController.replenishStock);

// Auth
app.get("/login", UserController.renderLogin);
app.post("/login", UserController.loginUser);
app.get("/register", UserController.renderRegister);
app.post("/register", UserController.registerUser);
app.get("/logout", UserController.logoutUser);
// (forgot/reset password routes removed)

// User orders (purchase history)
app.get('/history', requireLogin, UserController.myOrders);
app.get('/history/:id', requireLogin, UserController.viewMyOrder);

// Cart
app.post("/add-to-cart/:id", CartController.addToCart);
app.get("/cart", CartController.viewCart);
app.post("/cart/remove/:id", CartController.removeFromCart);
app.post("/cart/update/:id", CartController.updateItemQuantity);
app.post("/cart/increase/:id", CartController.increaseQuantity);
app.post("/cart/decrease/:id", CartController.decreaseQuantity);
app.post("/cart/clear", CartController.clearCart);

// Checkout (allow guest checkout and receipt viewing)
app.get("/checkout", CheckoutController.renderCheckout);
app.post("/checkout", CheckoutController.processCheckout);
app.get("/order/:orderNumber", CheckoutController.renderReceipt);

// ✅ PayPal (REST example style)
app.post("/paypal/create-order", CheckoutController.createPaypalOrder);
app.post("/paypal/capture-order", CheckoutController.capturePaypalOrder);
// Admin
app.get("/admin/orders", requireLogin, requireAdmin, AdminController.ordersDashboard);
app.get(
  "/admin/orders/:id",
  requireLogin,
  requireAdmin,
  AdminController.viewOrder
);
app.post(
  "/admin/orders/:id/status",
  requireLogin,
  requireAdmin,
  AdminController.updateOrderStatus
);
app.get(
  "/admin/orders/:id/receipt",
  requireLogin,
  requireAdmin,
  AdminController.downloadReceipt
);

// Pages
app.get("/about", (req, res) => res.render("about"));
app.get("/contact", (req, res) => res.render("contact"));
app.get("/help-center", (req, res) => res.render("helpCenter"));

// start server
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
