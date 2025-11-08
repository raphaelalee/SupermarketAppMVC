// controllers/SupermarketController.js
const { Product } = require('../models/supermarket'); // ✅ Correct import

const SupermarketController = {};

/**
 * List all products
 * GET /products  or /shopping  or /inventory
 */
SupermarketController.listAll = function (req, res) {
  Product.getAll(function (err, results) {
    if (err) {
      console.error('Error loading products:', err);
      return res.status(500).send('Database error while loading products.');
    }

    res.render('shopping', { 
      products: results,
      user: req.session.user 
    });
  });
};

/**
 * Get product by ID
 * GET /products/:id
 */
SupermarketController.getById = function (req, res) {
  const id = req.params.id;
  if (!id)
    return res.status(400).json({ success: false, message: 'Product ID is required' });

  Product.getById(id, function (err, results) {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    if (!results || results.length === 0)
      return res.status(404).json({ success: false, message: 'Product not found' });

    return res.render('productDetail', { 
      product: results[0], 
      user: req.session.user 
    });
  });
};

/**
 * 🟡 Render edit form for admin
 * GET /updateProduct/:id
 */
SupermarketController.renderEditForm = function (req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).send('Product ID is required');

  Product.getById(id, function (err, results) {
    if (err) return res.status(500).send('Database error while loading product');
    if (!results || results.length === 0) return res.status(404).send('Product not found');

    res.render('updateProduct', {
      product: results[0],
      user: req.session.user
    });
  });
};

/**
 * Add a new product
 * POST /products
 */
SupermarketController.add = function (req, res) {
  const payload = req.body || {};
  const image = req.file ? `images/${req.file.filename}` : payload.image || '';
  const newProduct = {
    productName: payload.productName,
    quantity: payload.quantity,
    price: payload.price,
    image
  };

  Product.create(newProduct, function (err, results) {
    if (err) {
      const status = err.code === 'ER_DUP_ENTRY' ? 400 : 500;
      return res.status(status).json({ success: false, message: err.message });
    }

    if (req.accepts('html')) return res.redirect('/inventory');

    return res.status(201).json({
      success: true,
      message: 'Product added successfully',
      data: { id: results.insertId },
    });
  });
};

/**
 * Update an existing product
 * PUT /products/:id
 */
SupermarketController.update = function (req, res) {
  const id = req.params.id;
  const payload = req.body || {};

  if (!id)
    return res.status(400).json({ success: false, message: 'Product ID is required' });

  // 🧠 FIX: Keep old image if no new upload
  let imagePath = payload.currentImage; // hidden input in the form
  if (req.file) {
    imagePath = `images/${req.file.filename}`;
  }

  const updatedProduct = {
    productName: payload.productName,
    quantity: payload.quantity,
    price: payload.price,
    image: imagePath
  };

  Product.update(id, updatedProduct, function (err, results) {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    if (!results || results.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Product not found' });

    // ✅ Redirect after successful update
    if (req.accepts('html')) return res.redirect('/shopping');

    return res.status(200).json({ success: true, message: 'Product updated successfully' });
  });
};

/**
 * Delete a product
 * DELETE /products/:id
 */
SupermarketController.delete = function (req, res) {
  const id = req.params.id;
  if (!id)
    return res.status(400).json({ success: false, message: 'Product ID is required' });

  Product.remove(id, function (err, results) {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    if (!results || results.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Product not found' });

    if (req.accepts('html')) return res.redirect('/shopping');

    return res.status(200).json({ success: true, message: 'Product deleted successfully' });
  });
};

module.exports = SupermarketController;
