// controllers/SupermarketController.js
const { Product } = require('../models/supermarket');

/**
 * Display all products with optional category filtering.
 * This controls the /shopping page.
 */
exports.listAll = (req, res) => {
  const category = req.query.category || 'All';
  const categories = ['All', 'Dairy', 'Meat', 'Produce', 'Pantry', 'Drinks'];

  Product.getByCategory(category, (err, products) => {
    if (err) {
      console.error('Error fetching products:', err);
      return res.render('shopping', { 
        products: [], 
        category, 
        categories, 
        user: req.session.user || null 
      });
    }

    res.render('shopping', { 
      products, 
      category, 
      categories, 
      user: req.session.user || null 
    });
  });
};

/**
 * Show one product by ID
 */
exports.viewProduct = (req, res) => {
  const id = req.params.id;
  Product.getById(id, (err, results) => {
    if (err || !results || results.length === 0) {
      req.flash('error', 'Product not found');
      return res.redirect('/shopping');
    }

    const product = results[0];
    res.render('productdetail', { product, user: req.session.user || null });
  });
};

/**
 * Homepage with featured products
 */
exports.homePage = (req, res) => {
  Product.getAll((err, products) => {
    if (err) {
      console.error('Error loading homepage:', err);
      return res.render('index', { featured: [], user: req.session.user || null });
    }

    const featured = products.slice(0, 4);
    res.render('index', { featured, user: req.session.user || null });
  });
};
