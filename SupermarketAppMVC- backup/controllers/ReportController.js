// controllers/ReportController.js
const { Product } = require('../models/supermarket');

const ReportController = {};

ReportController.generateReport = function (req, res) {
	Product.getAll(function (err, results) {
		if (err) {
			console.error('Report generation error:', err);
			return res.status(500).send('Error generating report');
		}

		const totalProducts = results.length;
		const totalValue = results.reduce((sum, p) => {
			const price = parseFloat(p.price) || 0;
			const qty = parseInt(p.quantity, 10) || 0;
			return sum + price * qty;
		}, 0);

		// Return JSON summary (view not present in repository)
		res.json({ totalProducts, totalValue, products: results });
	});
};

module.exports = ReportController;
