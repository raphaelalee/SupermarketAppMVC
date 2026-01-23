// controllers/UserController.js
const bcrypt = require("bcryptjs");
const Users = require("../models/user");
const UserCart = require("../models/userCart");
const Orders = require("../models/order");

function normalizeCartEntry(entry) {
  if (typeof entry === "object" && entry !== null) {
    const qty = parseInt(entry.quantity, 10) || 0;
    const selectedValue = entry.selected;
    const selected =
      selectedValue === false || selectedValue === "false" || selectedValue === 0
        ? false
        : true;
    return { quantity: qty, selected };
  }

  return { quantity: parseInt(entry, 10) || 0, selected: true };
}

function mergeCarts(stored = {}, sessionCart = {}) {
  const merged = { ...(stored || {}) };
  Object.keys(sessionCart || {}).forEach((id) => {
    const incoming = normalizeCartEntry(sessionCart[id]);
    if (!incoming.quantity) return;
    if (!merged[id]) {
      merged[id] = { quantity: incoming.quantity, selected: incoming.selected };
      return;
    }
    const current = normalizeCartEntry(merged[id]);
    const shouldOverrideSelection =
      typeof sessionCart[id] === "object" && sessionCart[id] !== null &&
      Object.prototype.hasOwnProperty.call(sessionCart[id], "selected");

    merged[id] = {
      quantity: current.quantity + incoming.quantity,
      selected: shouldOverrideSelection ? incoming.selected : current.selected,
    };
  });
  return merged;
}

function persistSessionCartToDb(userId, cart, callback = () => {}) {
  if (!userId) return callback();
  const entries = Object.entries(cart || {}).filter(([_, entry]) => {
    const qty = typeof entry === "object" && entry !== null
      ? parseInt(entry.quantity, 10) || 0
      : parseInt(entry, 10) || 0;
    return qty > 0;
  });

  UserCart.clearCart(userId, (clearErr) => {
    if (clearErr) return callback(clearErr);
    let index = 0;
    const next = () => {
      if (index >= entries.length) return callback();
      const [productId, entry] = entries[index++];
      const qty = typeof entry === "object" && entry !== null
        ? parseInt(entry.quantity, 10) || 0
        : parseInt(entry, 10) || 0;
      if (!qty) { next(); return; }
      UserCart.setQuantity(userId, productId, qty, (err) => {
        if (err) return callback(err);
        next();
      });
    };
    next();
  });
}

/* ========================================
   RENDER REGISTER PAGE
======================================== */
exports.renderRegister = (req, res) => {
  res.render("register", { messages: req.flash("error"), success: req.flash("success") });
};

/* ========================================
   REGISTER USER
   validations: require all fields, email contains @gmail, contact 8 digits
======================================== */
exports.registerUser = (req, res) => {
  const { username, email, password, address, contact, role } = req.body || {};
  // enforce exact gmail domain
  const emailIsGmailCom = /@gmail\.com$/i.test(email || "");
  const phoneValid = /^\d{8}$/.test(contact || "");

  if (!username || !email || !password || !address || !contact) {
    req.flash("error", "All fields are required.");
    return res.redirect("/register");
  }

  if (!emailIsGmailCom) {
    req.flash("error", "Email must be a Gmail address (end with '@gmail.com').");
    return res.redirect("/register");
  }

  if (!phoneValid) {
    req.flash("error", "Contact number must be exactly 8 digits.");
    return res.redirect("/register");
  }

  // Password policy: require a minimum length (friendly validation)
  if (typeof password !== 'string' || password.length < 6) {
    req.flash('error', 'Password must be at least 6 characters long.');
    return res.redirect('/register');
  }

  // Password must include at least one special character for stronger security
  const specialCharPattern = /[!@#$%^&*(),.?":{}|<>]/;
  if (!specialCharPattern.test(password)) {
    req.flash('error', 'Password must include at least one special character (e.g. !@#$%).');
    return res.redirect('/register');
  }

  // Require at least one uppercase letter and one digit for stronger passwords
  const uppercasePattern = /[A-Z]/;
  const digitPattern = /\d/;
  if (!uppercasePattern.test(password) || !digitPattern.test(password)) {
    req.flash('error', 'Password must include at least one uppercase letter and one digit.');
    return res.redirect('/register');
  }

  // Check if email is already taken
  Users.getByEmail(email, (err, results) => {
    if (err) { console.error("DB error:", err); req.flash("error", "Database error."); return res.redirect("/register"); }
    if (results.length > 0) { req.flash("error", "Email already registered."); return res.redirect("/register"); }

    const hashedPassword = bcrypt.hashSync(password, 10);
    // Force role to 'user' regardless of submitted value
    const newUser = { username, email, password: hashedPassword, address, contact, role: "user" };

    Users.create(newUser, (err2) => {
      if (err2) { console.error("Error creating user:", err2); req.flash("error", "Registration failed."); return res.redirect("/register"); }
      req.flash("success", "Registration successful! Please log in.");
      res.redirect("/login");
    });
  });
};

/* ========================================
   RENDER LOGIN PAGE
======================================== */
exports.renderLogin = (req, res) => {
  if (req.query.next) { req.session.returnTo = req.query.next; } else { delete req.session.returnTo; }
  res.render("login", { messages: req.flash("error"), success: req.flash("success") });
};

/* ========================================
   LOGIN USER
   validation: email must contain @gmail
======================================== */
exports.loginUser = (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) { req.flash("error", "Please enter your email and password."); return res.redirect("/login"); }
  if (!/@gmail/i.test(email)) { req.flash("error", "Please use your Gmail address to login."); return res.redirect("/login"); }

  Users.getByEmail(email, (err, results) => {
    if (err || !results || results.length === 0) { req.flash("error", "Email not found."); return res.redirect("/login"); }
    const user = results[0];
    const match = bcrypt.compareSync(password, user.password);
    if (!match) { req.flash("error", "Incorrect password."); return res.redirect("/login"); }

    req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
    const redirectTo = req.session.returnTo || (user.role === "admin" ? "/inventory" : "/shopping"); delete req.session.returnTo;

    const sessionCart = req.session.cart || {};
    UserCart.getCart(user.id, (cartErr, storedCart) => {
      if (cartErr) { console.error(`Failed to load saved cart for user ${user.id}:`, cartErr); req.session.cart = sessionCart; req.flash("success", "Welcome back, " + user.username + "!"); return res.redirect(redirectTo); }
      req.session.cart = mergeCarts(storedCart || {}, sessionCart);
      persistSessionCartToDb(user.id, req.session.cart, (persistErr) => {
        if (persistErr) console.error(`Failed to persist cart for user ${user.id}:`, persistErr);
        // 1) Claim any recent guest orders that match this user's email or contact number
        const userEmail = user.email || null;
        const userPhone = user.contact || null;
        Orders.claimGuestOrdersByContact(user.id, userEmail, userPhone, 30, (claimErr, claimRes) => {
          if (claimErr) console.error(`Failed to claim guest orders for user ${user.id}:`, claimErr);

          // 2) Additionally, if the current session has a lastOrder (immediate checkout), ensure it's associated
          const lastOrder = req.session.lastOrder;
          if (lastOrder && lastOrder.orderNumber && !lastOrder.userId) {
            Orders.updateOrderUser(lastOrder.orderNumber, user.id, (updErr) => {
              if (updErr) console.error(`Failed to associate order ${lastOrder.orderNumber} to user ${user.id}:`, updErr);
              else {
                req.session.lastOrder.userId = user.id;
              }
              req.flash("success", "Welcome back, " + user.username + "!");
              return res.redirect(redirectTo);
            });
            return;
          }

          req.flash("success", "Welcome back, " + user.username + "!");
          return res.redirect(redirectTo);
        });
      });
    });
  });
};

// logout user and persist cart to DB
exports.logoutUser = (req, res) => {
  const userId = req.session?.user?.id; const cartData = req.session?.cart || {};
  const finalize = () => { req.session.destroy(() => { res.redirect("/login"); }); };
  if (!userId) return finalize();
  persistSessionCartToDb(userId, cartData, (err) => { if (err) console.error(`Failed to persist cart before logout for user ${userId}:`, err); finalize(); });
};

// =====================
// User purchase history
// =====================

exports.myOrders = (req, res) => {
  const user = req.session.user;
  if (!user) { req.flash('error','Please log in to view your orders.'); return res.redirect('/login'); }
  Orders.getOrdersByUser(user.id, (err, rows) => {
    if (err) { console.error('Failed to load user orders:', err); req.flash('error','Unable to load your orders right now.'); return res.redirect('/shopping'); }
    res.render('history', { orders: rows || [], messages: req.flash('success'), errors: req.flash('error') });
  });
};

exports.viewMyOrder = (req, res) => {
  const user = req.session.user;
  const id = Number(req.params.id);
  if (!user) { req.flash('error','Please log in to view your orders.'); return res.redirect('/login'); }
  if (!id) { req.flash('error', 'Invalid order id'); return res.redirect('/history'); }
  Orders.getOrderWithItems(id, (err, data) => {
    if (err || !data || !data.order) { console.error('Failed to fetch order detail:', err); req.flash('error','Order not found.'); return res.redirect('/history'); }
    // ensure this order belongs to the current user (or admin can view)
    if (data.order.userId && data.order.userId !== user.id && user.role !== 'admin') {
      req.flash('error','You are not authorized to view this order.');
      return res.redirect('/history');
    }
    res.render('historyItem', { order: data.order, items: data.items || [], messages: req.flash('success'), errors: req.flash('error') });
  });
};
