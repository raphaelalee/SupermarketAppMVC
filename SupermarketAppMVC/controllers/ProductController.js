// ProductController.js
// Thin wrapper that re-uses the implementations from SupermarketController
const SupermarketController = require('./SupermarketController');

module.exports = {
	listAll: SupermarketController.listAll,
	getById: SupermarketController.getById,
	add: SupermarketController.add,
	update: SupermarketController.update,
	delete: SupermarketController.delete,
	renderEditForm: SupermarketController.renderEditForm,
};
