// controllers/InventoryController.js
const { Product } = require('../models/supermarket');

const InventoryController = {};

InventoryController.viewInventory = function (req, res) {
	Product.getAll(function (err, results) {
		if (err) {
			console.error('Error loading inventory:', err);
			return res.status(500).send('Database error while loading inventory');
		}
		res.render('inventory', { products: results, user: req.session.user });
	});
};

module.exports = InventoryController;
