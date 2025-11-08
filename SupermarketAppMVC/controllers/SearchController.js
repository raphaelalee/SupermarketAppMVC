// controllers/SearchController.js
const { Product } = require('../models/supermarket');

const SearchController = {};

SearchController.searchProducts = function (req, res) {
	const q = (req.query.q || '').toLowerCase();
	Product.getAll(function (err, results) {
		if (err) {
			console.error('Search error:', err);
			return res.status(500).send('Error searching products');
		}
		const filtered = results.filter(p => (p.productName || '').toLowerCase().includes(q));
		res.render('shopping', { products: filtered, user: req.session.user });
	});
};

module.exports = SearchController;
