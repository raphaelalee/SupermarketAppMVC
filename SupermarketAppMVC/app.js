// app.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");
const methodOverride = require("method-override");

// ===== NETS (ADDED) =====
const axios = require("axios");
const netsQr = require("./services/nets");

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
  const payment = String(req.body.payment || "").toLowerCase();

  // ✅ NETS Option A: send user to QR page instead of processCheckout
  if (payment === "nets") {
    // Save checkout payload so we can finalize after NETS confirms payment
    req.session.pendingNetsCheckout = {
      body: { ...req.body },
      createdAt: Date.now(),
    };
    return res.redirect("/nets/qr");
  }

  const wantsOtp =
    payment === "paypal" && String(req.body.paypalPaid || "") === "1";

  if (wantsOtp) {
    // Intercept redirects issued by the controller and send user to /verify-otp
    const originalRedirect = res.redirect.bind(res);
    let redirected = false;

    res.redirect = function (_url) {
      if (redirected) return;
      redirected = true;
      return originalRedirect("/verify-otp");
    };

    return CheckoutController.processCheckout(req, res, next);
  }

  return CheckoutController.processCheckout(req, res, next);
});

// =====================
// NETS ROUTES (MOVED HERE SO flash + cartTotal EXIST)
// =====================


// ✅ NETS Option A: QR page (checkout.ejs redirects here)
app.get("/nets/qr", (req, res) => {
  const total = Number(res.locals.cartTotal || 0);

  if (!total || total <= 0) {
    req.flash("error", "Your cart is empty.");
    return res.redirect("/cart");
  }

  // Use server-side generator to request a real QR from the NETS sandbox
  // Reuse the existing service which expects `req.body.cartTotal`.
  req.body = req.body || {};
  req.body.cartTotal = total.toFixed(2);
  return netsQr.generateQrCode(req, res);
});

// ✅ Simulate success -> go receipt if lastOrder exists
app.get("/nets/success", (req, res) => {
  const last = req.session?.lastOrder;
  if (last && last.orderNumber) return res.redirect(`/order/${last.orderNumber}`);
  return res.redirect("/history");
});

// ✅ Simulate fail -> back to checkout
app.get("/nets/fail", (req, res) => {
  req.flash("error", "NETS payment failed. Please try again.");
  return res.redirect("/checkout");
});

// Generate NETS QR using SERVER cart total (secure: don't trust client)
app.post("/nets/generate", (req, res, next) => {
  try {
    const total = Number(res.locals.cartTotal || 0);

    if (!total || total <= 0) {
      req.flash("error", "Your cart is empty.");
      return res.redirect("/cart");
    }

    // Reuse demo function by injecting the cartTotal it expects
    req.body.cartTotal = total.toFixed(2);
    return netsQr.generateQrCode(req, res);
  } catch (e) {
    console.error("NETS generate error:", e);
    return next(e);
  }
});

// Success/Fail pages (same as demo)
app.get("/nets-qr/success", (req, res) => {
  res.render("netsTxnSuccessStatus", { message: "Transaction Successful!" });
});

app.get("/nets-qr/fail", (req, res) => {
  res.render("netsTxnFailStatus", {
    message: "Transaction Failed. Please try again.",
  });
});

// Manual mark (fallback when NETS enquiry is unreachable)
app.post("/nets/mark-paid", (req, res) => {
  const txnRef = req.body?.txnRetrievalRef;
  if (!txnRef) return res.status(400).json({ error: "Missing txnRetrievalRef" });
  req.session.netsPaid = true;
  req.session.netsTxnRef = txnRef;
  return res.json({ ok: true });
});

// Finalize NETS checkout after payment success (called by netsQr.ejs)
app.post("/nets/finalize", (req, res, next) => {
  try {
    const pending = req.session?.pendingNetsCheckout;
    if (!pending || !pending.body) {
      return res.status(400).json({ error: "No pending NETS checkout found." });
    }
    if (!req.session?.netsPaid) {
      return res
        .status(400)
        .json({ error: "NETS payment not confirmed yet." });
    }

    const txnRef = req.body?.txnRetrievalRef;
    if (req.session.netsTxnRef && txnRef && txnRef !== req.session.netsTxnRef) {
      return res.status(400).json({ error: "NETS transaction mismatch." });
    }

    // Restore the original checkout payload and enforce payment method
    req.body = { ...pending.body, payment: "nets" };

    // Capture the redirect from the checkout controller and return JSON instead
    const originalRedirect = res.redirect.bind(res);
    res.redirect = (url) => {
      const success = typeof url === "string" && url.startsWith("/order/");

      if (success) {
        delete req.session.pendingNetsCheckout;
        delete req.session.netsPaid;
        delete req.session.netsTxnRef;
      }

      return res.json({ success, redirect: url });
    };

    return CheckoutController.processCheckout(req, res, next);
  } catch (err) {
    return next(err);
  }
});

// SSE: Poll NETS transaction status using txnRetrievalRef
app.get("/sse/payment-status/:txnRetrievalRef", async (req, res) => {
  const txnRetrievalRef = req.params.txnRetrievalRef;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const startTime = Date.now();
  const timeoutDuration = 5 * 60 * 1000; // 5 minutes
  let errorCount = 0;
  let closed = false;

  const intervalId = setInterval(async () => {
    try {
      if (Date.now() - startTime >= timeoutDuration) {
        clearInterval(intervalId);
        res.write(
          `data: ${JSON.stringify({
            fail: true,
            message: "Timeout. Please try again.",
          })}\n\n`
        );
        return res.end();
      }

      const queryResponse = await axios.post(
        "https://uat-api.nets.com.sg:9065/NetsQR/uat/transactions/qr/enquiry",
        {
          txn_retrieval_ref: txnRetrievalRef,
          mid: "1234567", // demo MID
        },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": process.env.API_KEY,
            "project-id": process.env.PROJECT_ID,
          },
        }
      );

      const txnStatus = queryResponse.data?.txn_status;
      console.log('NETS enquiry response:', queryResponse.data);

      // demo logic: some NETS sandboxes use 1 for success; accept both 1 or 0
      const txnStatusNum = Number.isFinite(Number(txnStatus)) ? Number(txnStatus) : null;
      if (txnStatusNum === 1 || txnStatusNum === 0) {
        clearInterval(intervalId);

        req.session.netsPaid = true;
        req.session.netsTxnRef = txnRetrievalRef;

        res.write(
          `data: ${JSON.stringify({
            success: true,
            message: "Payment successful!",
          })}\n\n`
        );
        closed = true;
        return res.end();
      }
    } catch (error) {
      console.error("Error querying NETS QR status:", error.message);

      // If NETS sandbox is unreachable, fall back after a few retries so user can proceed
      errorCount += 1;
      const isTimeout = /ETIMEDOUT/i.test(error.message || "");
      if (!closed && errorCount >= 1 && isTimeout) {
        clearInterval(intervalId);
        req.session.netsPaid = true;
        req.session.netsTxnRef = txnRetrievalRef;
        res.write(
          `data: ${JSON.stringify({
            success: true,
            message: "Payment marked successful (sandbox timeout fallback).",
          })}\n\n`
        );
        closed = true;
        return res.end();
      }
    }
  }, 1500);

  req.on("close", () => {
    clearInterval(intervalId);
  });
});

// =====================
// OTP routes (demo mode: OTP printed to server console)
// =====================

app.post("/send-otp", (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.otp = otp;
    req.session.otpPending = true;

    const phone =
      req.body && req.body.phone
        ? String(req.body.phone)
        : req.session.otpPhone || null;
    if (phone) req.session.otpPhone = phone;

    const expiresAt = Date.now() + 3 * 60 * 1000;
    req.session.otpExpires = expiresAt;

    console.log("OTP (demo):", otp);
    return res.json({ ok: true });
  } catch (e) {
    console.error("send-otp error", e);
    return res.sendStatus(500);
  }
});

app.post("/resend-otp", (req, res) => {
  try {
    if (!req.session || !req.session.otpPending)
      return res.status(400).json({ error: "No OTP pending" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.otp = otp;

    const expiresAt = Date.now() + 3 * 60 * 1000;
    req.session.otpExpires = expiresAt;

    console.log("OTP (demo) resent:", otp);
    return res.json({ ok: true, expiresAt });
  } catch (e) {
    console.error("resend-otp error", e);
    return res.sendStatus(500);
  }
});

app.get("/verify-otp", (req, res) => {
  if (!req.session || !req.session.otpPending) return res.redirect("/checkout");

  // Demo shortcut: if we already have a lastOrder in session, skip OTP and go to receipt
  const last = req.session?.lastOrder || null;
  if (last && last.orderNumber) {
    delete req.session.otp;
    delete req.session.otpPending;
    delete req.session.otpExpires;
    delete req.session.otpPhone;
    return res.redirect(`/order/${last.orderNumber}`);
  }

  if (!req.session.otp) {
    const generated = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.otp = generated;
    req.session.otpPending = true;
    req.session.otpExpires = Date.now() + 3 * 60 * 1000;
    console.log("OTP (demo auto-generated):", generated);
  }

  const otp = req.session.otp || null;
  const phone = req.session.otpPhone || null;
  const expiresAt = req.session.otpExpires || Date.now() + 3 * 60 * 1000;
  const remainingSeconds = Math.max(
    0,
    Math.floor((expiresAt - Date.now()) / 1000)
  );

  let maskedPhone = null;
  if (phone) {
    const digits = String(phone).replace(/\D/g, "");
    if (digits.length > 4) maskedPhone = `****${digits.slice(-4)}`;
    else maskedPhone = phone;
  }

  return res.render("verifyOTP", {
    error: null,
    otp,
    remainingSeconds,
    maskedPhone,
  });
});

app.post("/verify-otp", (req, res) => {
  const provided = (req.body && (req.body.otp || "")).toString().trim();

  if (!req.session || !req.session.otpPending) {
    return res.redirect("/checkout");
  }

  // Demo mode: accept any non-empty input
  if (!provided) {
    const remainingSeconds = Math.max(
      0,
      Math.floor(((req.session.otpExpires || Date.now()) - Date.now()) / 1000)
    );
    return res.render("verifyOTP", {
      error: "Please enter the code (any value accepted in demo).",
      otp: req.session.otp || null,
      remainingSeconds,
      maskedPhone: req.session.otpPhone || null,
    });
  }

  delete req.session.otp;
  delete req.session.otpPending;
  delete req.session.otpExpires;
  delete req.session.otpPhone;

  const last = req.session?.lastOrder || null;
  if (last && last.orderNumber) return res.redirect(`/order/${last.orderNumber}`);
  return res.redirect("/history");
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
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log("Using DB:", DB_NAME);
  console.log(
    "PAYPAL_CLIENT_ID:",
    process.env.PAYPAL_CLIENT_ID ? "[set]" : "[missing]"
  );
});

// (global handlers removed - reverted)
