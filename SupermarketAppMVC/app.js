// app.js
const express = require("express");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const methodOverride = require("method-override");

const app = express();

// Controllers
const SupermarketController = require("./controllers/SupermarketController");
const UserController = require("./controllers/UserController");
const CartController = require("./controllers/CartController");
const CheckoutController = require("./controllers/CheckoutController");

// Logger
app.use((req, res, next) => {
  console.log(`🟠 ${req.method} ${req.url}`);
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

app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: true,
  })
);
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
  res.locals.cartCount = Object.values(cartObj).reduce((a, b) => a + b, 0);
  next();
});

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

/* =====================
      ROUTES 
===================== */

// Home
app.get("/", SupermarketController.homePage);

// Shopping
app.get("/shopping", SupermarketController.listAll);
app.get("/product/:id", SupermarketController.viewProduct);

// Inventory (Admin)
app.get("/inventory", SupermarketController.inventoryPage);
app.post("/inventory/add", SupermarketController.addProduct);
app.post("/inventory/edit/:id", SupermarketController.updateProduct);
app.post("/inventory/delete/:id", SupermarketController.deleteProduct);

// Auth
app.get("/login", UserController.renderLogin);
app.post("/login", UserController.loginUser);
app.get("/register", UserController.renderRegister);
app.post("/register", UserController.registerUser);
app.get("/logout", UserController.logoutUser);

// Cart
app.post("/add-to-cart/:id", CartController.addToCart);
app.get("/cart", CartController.viewCart);
app.post("/cart/remove/:id", CartController.removeFromCart);
app.post("/cart/update/:id", CartController.updateItemQuantity);
app.post("/cart/increase/:id", CartController.increaseQuantity);
app.post("/cart/decrease/:id", CartController.decreaseQuantity);

// Checkout
app.get("/checkout", CheckoutController.renderCheckout);
app.post("/checkout", CheckoutController.processCheckout);

// Pages
app.get("/about", (req, res) => res.render("about"));
app.get("/contact", (req, res) => res.render("contact"));

/* =====================
      SERVER 
===================== */
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
