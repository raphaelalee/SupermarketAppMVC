// controllers/UserController.js
const bcrypt = require("bcryptjs");
const { Users } = require("../models/supermarket");

/* ---------- Render Pages ---------- */
exports.renderLogin = (req, res) => {
  res.render("login", { user: req.session.user || null, messages: req.flash("error") });
};

exports.renderRegister = (req, res) => {
  res.render("register", { user: req.session.user || null, messages: req.flash("error") });
};

/* ---------- Register ---------- */
exports.registerUser = (req, res) => {
  const { username, email, password, address, contact } = req.body;
  if (!username || !email || !password) {
    req.flash("error", "All fields required");
    return res.redirect("/register");
  }

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      req.flash("error", "Error securing password");
      return res.redirect("/register");
    }

    Users.create({ username, email, password: hashedPassword, address, contact, role: "user" }, (err2) => {
      if (err2) {
        console.error(err2);
        req.flash("error", "Email already exists or DB error");
        return res.redirect("/register");
      }
      req.flash("success", "Registration successful! Please log in.");
      res.redirect("/login");
    });
  });
};

/* ---------- Login ---------- */
exports.loginUser = (req, res) => {
  const { email, password } = req.body;
  Users.getByEmail(email, (err, results) => {
    if (err || results.length === 0) {
      req.flash("error", "Invalid credentials");
      return res.redirect("/login");
    }
    const user = results[0];
    bcrypt.compare(password, user.password, (err2, match) => {
      if (!match) {
        req.flash("error", "Invalid credentials");
        return res.redirect("/login");
      }
      req.session.user = { id: user.id, username: user.username, role: user.role };
      res.redirect("/shopping");
    });
  });
};

/* ---------- Logout ---------- */
exports.logoutUser = (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
};
