// controllers/UserController.js
const { Users } = require('../models/supermarket');
const crypto = require('crypto');

function hashPassword(password) {
	return crypto.createHash('sha256').update(password || '').digest('hex');
}

const UserController = {};

UserController.renderRegister = function (req, res) {
	// `register.ejs` expects `messages`/`errors` arrays (from connect-flash)
		const errors = req.flash('error') || [];
		const messages = req.flash('success') || [];
		// Some templates expect `formData` to pre-fill fields after a failed submit.
		// If no flash data is present, provide an empty object so EJS doesn't throw.
		const formData = req.flash('formData')[0] || {};
		res.render('register', { user: req.session.user, errors, messages, formData });
};

UserController.registerUser = function (req, res) {
	const { username, email, password, address, contact, role } = req.body || {};
	const formData = { username, email, address, contact, role };
		console.log('Register attempt:', { username, email, role });

	if (!username || !email || !password) {
		req.flash('error', 'Username, email and password are required');
		req.flash('formData', formData);
		return res.redirect('/register');
	}

	const hashed = hashPassword(password);
	const userRole = role || 'user';

	Users.create({ username, email, password: hashed, address, contact, role: userRole }, function (err, results) {
		if (err) {
			console.error('Error creating user:', err);
			req.flash('error', 'Unable to create user: ' + (err.message || ''));
			req.flash('formData', formData);
			return res.redirect('/register');
		}

		// Auto-login the newly registered user
		req.session.user = {
			id: results.insertId,
			username,
			email,
			role: userRole
		};

		req.flash('success', 'Registration successful. You are now logged in.');
		return res.redirect('/shopping');
	});
};

UserController.renderLogin = function (req, res) {
	// `login.ejs` expects `errors` and `messages` arrays (from connect-flash)
	const errors = req.flash('error') || [];
	const messages = req.flash('success') || [];
	res.render('login', { user: req.session.user, errors, messages });
};

UserController.loginUser = function (req, res) {
	const { email, password } = req.body || {};
	if (!email || !password) {
		req.flash('error', 'Email and password are required');
		return res.redirect('/login');
	}

	Users.getByEmail(email, function (err, results) {
		if (err) {
			console.error('Login error:', err);
			req.flash('error', 'Login failed');
			return res.redirect('/login');
		}
		if (!results || results.length === 0) {
			req.flash('error', 'Invalid email or password');
			return res.redirect('/login');
		}

		const user = results[0];
		const hashed = hashPassword(password);
		if (user.password !== hashed) {
			req.flash('error', 'Invalid email or password');
			return res.redirect('/login');
		}

		// Remove password before storing in session
		req.session.user = {
			id: user.id,
			username: user.username,
			email: user.email,
			role: user.role || 'user'
		};

		// Redirect based on role
		if (req.session.user.role === 'admin') return res.redirect('/inventory');
		return res.redirect('/shopping');
	});
};

UserController.logoutUser = function (req, res) {
	req.session.destroy(() => {
		res.redirect('/login');
	});
};

module.exports = UserController;
