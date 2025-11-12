// app.js
const express = require("express");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const methodOverride = require("method-override");

const app = express();

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

// Globals
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.cart = req.session.cart || {};
  res.locals.cartCount = Object.keys(res.locals.cart).length;
  res.locals.messages = req.flash("success") || [];
  res.locals.errors = req.flash("error") || [];
  next();
});

// Models
const { Product } = require("./models/supermarket");

// Controllers
const SupermarketController = require("./controllers/SupermarketController");
const UserController = require("./controllers/UserController");
const CartController = require("./controllers/CartController");
const CheckoutController = require("./controllers/CheckoutController");

// ============= ROUTES =============

// Home
app.get("/", SupermarketController.homePage);

// Shopping
app.get("/shopping", SupermarketController.listAll);
app.get("/product/:id", SupermarketController.viewProduct);

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

// Checkout
app.get("/checkout", CheckoutController.renderCheckout);
app.post("/checkout", CheckoutController.processCheckout);

// Contact + About
app.get("/about", (req, res) => res.render("about"));
app.get("/contact", (req, res) => res.render("contact"));

// Server
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
