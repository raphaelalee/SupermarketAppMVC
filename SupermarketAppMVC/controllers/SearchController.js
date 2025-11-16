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
		const filtered = results.filter(p => {
			const name = (p.productName || '').toLowerCase();
			const cat = (p.category || '').toLowerCase();
			return name.includes(q) || cat.includes(q);
		});
		res.render('shopping', { products: filtered, user: req.session.user });
	});
};

module.exports = SearchController;
