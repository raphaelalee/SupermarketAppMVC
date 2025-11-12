// controllers/UserController.js
const bcrypt = require("bcryptjs");
const { Users } = require("../models/supermarket");

exports.renderRegister = (req, res) => {
  res.render("register", { messages: req.flash("error") });
};

exports.registerUser = (req, res) => {
  const { username, email, password, address, contact, role } = req.body;

  // Basic validation
  if (!username || !email || !password) {
    req.flash("error", "All fields are required");
    return res.redirect("/register");
  }

  // Check if email exists
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

    // Hash password and save
    const hashed = bcrypt.hashSync(password, 10);
    const newUser = { username, email, password: hashed, address, contact, role };

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

exports.renderLogin = (req, res) => {
  res.render("login", { messages: req.flash("error") });
};

exports.loginUser = (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    req.flash("error", "Please enter email and password");
    return res.redirect("/login");
  }

  Users.getByEmail(email, (err, results) => {
    if (err || results.length === 0) {
      req.flash("error", "User not found.");
      return res.redirect("/login");
    }

    const user = results[0];
    const passwordMatch = bcrypt.compareSync(password, user.password);

    if (!passwordMatch) {
      req.flash("error", "Incorrect password.");
      return res.redirect("/login");
    }

    // Store session
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    req.flash("success", "Welcome back, " + user.username + "!");
    res.redirect("/shopping");
  });
};

exports.logoutUser = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
};
