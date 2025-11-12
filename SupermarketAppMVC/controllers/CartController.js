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
			const filtered = items.filter(Boolean).map(i => ({
				productName: i.product.productName,
				image: i.product.image,
				price: parseFloat(i.product.price) || 0,
				quantity: i.quantity
			}));
			// Render view expecting `cart` array
			res.render('cart', { cart: filtered, user: req.session.user });
	}).catch(err => {
		console.error('Error loading cart:', err);
		res.status(500).send('Error loading cart');
	});
};

module.exports = CartController;
// Add update and remove handlers
CartController.updateQuantity = function (req, res) {
	const id = req.params.id;
	const qty = parseInt(req.body.quantity, 10);
	if (!req.session.cart) req.session.cart = {};

	if (!id) return res.status(400).json({ success: false, message: 'Product id required' });
	if (!qty || qty <= 0) {
		// remove when quantity set to 0 or invalid
		delete req.session.cart[id];
		return res.json({ success: true, cart: req.session.cart });
	}

	req.session.cart[id] = qty;
	return res.json({ success: true, cart: req.session.cart });
};

CartController.removeFromCart = function (req, res) {
	const id = req.params.id;
	if (req.session && req.session.cart && req.session.cart[id]) {
		delete req.session.cart[id];
	}
	return res.json({ success: true, cart: req.session.cart || {} });
};
