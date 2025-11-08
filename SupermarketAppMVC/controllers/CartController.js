// controllers/CartController.js
const { Product } = require('../models/supermarket');

const CartController = {};

CartController.addToCart = function (req, res) {
	const id = req.params.id;
	const qty = parseInt(req.body.quantity, 10) || 1;
	if (!req.session.cart) req.session.cart = {};

	if (req.session.cart[id]) req.session.cart[id] += qty;
	else req.session.cart[id] = qty;

	return res.redirect('/cart');
};

CartController.viewCart = function (req, res) {
	const cart = req.session.cart || {};
	const ids = Object.keys(cart);

	if (ids.length === 0) return res.render('cart', { items: [], user: req.session.user });

	// fetch product details for each id
	const promises = ids.map(id => new Promise((resolve) => {
		Product.getById(id, (err, results) => {
			if (err || !results || results.length === 0) return resolve(null);
			const product = results[0];
			resolve({ product, quantity: cart[id] });
		});
	}));

	Promise.all(promises).then(items => {
		const filtered = items.filter(Boolean);
		res.render('cart', { items: filtered, user: req.session.user });
	}).catch(err => {
		console.error('Error loading cart:', err);
		res.status(500).send('Error loading cart');
	});
};

module.exports = CartController;
