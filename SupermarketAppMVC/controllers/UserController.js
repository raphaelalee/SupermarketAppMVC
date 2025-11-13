// controllers/UserController.js
const bcrypt = require("bcryptjs");
const Users = require("../models/user");   // ✅ FIXED IMPORT

/* ========================================
   RENDER REGISTER PAGE
======================================== */
exports.renderRegister = (req, res) => {
  res.render("register", { 
    messages: req.flash("error"),
    success: req.flash("success")
  });
};

/* ========================================
   REGISTER USER
======================================== */
exports.registerUser = (req, res) => {
  const { username, email, password, address, contact, role } = req.body;

  if (!username || !email || !password) {
    req.flash("error", "All fields are required.");
    return res.redirect("/register");
  }

  // Check if email is already taken
  Users.getByEmail(email, (err, results) => {
    if (err) {
      console.error("DB error:", err);
      req.flash("error", "Database error.");
      return res.redirect("/register");
    }

    if (results.length > 0) {
      req.flash("error", "Email already registered.");
      return res.redirect("/register");
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    const newUser = {
      username,
      email,
      password: hashedPassword,
      address,
      contact,
      role: role || "user"
    };

    // Save new user
    Users.create(newUser, (err2) => {
      if (err2) {
        console.error("Error creating user:", err2);
        req.flash("error", "Registration failed.");
        return res.redirect("/register");
      }

      req.flash("success", "Registration successful! Please log in.");
      res.redirect("/login");
    });
  });
};

/* ========================================
   RENDER LOGIN PAGE
======================================== */
exports.renderLogin = (req, res) => {
  res.render("login", {
    messages: req.flash("error"),
    success: req.flash("success")
  });
};

/* ========================================
   LOGIN USER
======================================== */
exports.loginUser = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    req.flash("error", "Please enter your email and password.");
    return res.redirect("/login");
  }

  Users.getByEmail(email, (err, results) => {
    if (err || results.length === 0) {
      req.flash("error", "User not found.");
      return res.redirect("/login");
    }

    const user = results[0];

    // Compare password
    const match = bcrypt.compareSync(password, user.password);
    if (!match) {
      req.flash("error", "Incorrect password.");
      return res.redirect("/login");
    }

    // Save to session
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    req.flash("success", "Welcome back, " + user.username + "!");

    // Redirect based on role
    if (user.role === "admin") {
      return res.redirect("/inventory");
    }

    res.redirect("/shopping");
  });
};

/* ========================================
   LOGOUT
======================================== */
exports.logoutUser = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
};
