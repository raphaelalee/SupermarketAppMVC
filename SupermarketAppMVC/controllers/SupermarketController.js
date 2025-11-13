// controllers/SupermarketController.js

const Product = require("../models/supermarket");   // IMPORT MODEL

/**
 * SHOPPING PAGE + CART
 */
exports.listAll = (req, res) => {
  const category = req.query.category || "All";
  const categories = ["All", "Dairy", "Meat", "Produce", "Pantry", "Drinks"];

  Product.getByCategory(category, (err, products) => {
    if (err) {
      return res.render("shopping", {
        products: [],
        category,
        categories,
        user: req.session.user || null,
        cart: [],
        total: 0,
        cartCount: 0
      });
    }

    const cartObj = req.session.cart || {};
    const cartIds = Object.keys(cartObj);

    if (cartIds.length === 0) {
      return res.render("shopping", {
        products,
        category,
        categories,
        user: req.session.user || null,
        cart: [],
        total: 0,
        cartCount: 0
      });
    }

    // cart has items → load product data
    Product.getAll((err2, allProducts) => {
      if (err2) {
        return res.render("shopping", {
          products,
          category,
          categories,
          user: req.session.user || null,
          cart: [],
          total: 0,
          cartCount: 0
        });
      }

      const byId = {};
      allProducts.forEach(p => (byId[p.id] = p));

      let cartItems = [];
      let total = 0;
      let cartCount = 0;

      cartItems = cartIds.map(id => {
        const item = byId[id];
        const quantity = cartObj[id];
        const subtotal = item.price * quantity;

        total += subtotal;
        cartCount += quantity;

        return { ...item, quantity, subtotal };
      });

      res.render("shopping", {
        products,
        category,
        categories,
        user: req.session.user || null,
        cart: cartItems,
        total,
        cartCount
      });
    });
  });
};


/**
 * PRODUCT DETAILS PAGE
 */
exports.viewProduct = (req, res) => {
  Product.getById(req.params.id, (err, results) => {
    if (!results || results.length === 0) {
      req.flash("error", "Product not found");
      return res.redirect("/shopping");
    }

    res.render("productdetail", {
      product: results[0],
      user: req.session.user || null
    });
  });
};


/**
 * HOME PAGE
 */
exports.homePage = (req, res) => {
  Product.getAll((err, products) => {
    if (err) {
      return res.render("index", { featured: [], user: req.session.user || null });
    }

    const featured = products.slice(0, 4);

    res.render("index", {
      featured,
      user: req.session.user || null
    });
  });
};


/**
 * INVENTORY PAGE
 */
exports.inventoryPage = (req, res) => {
  Product.getAll((err, products) => {
    if (err) {
      return res.render("inventory", { products: [], user: req.session.user || null });
    }

    res.render("inventory", {
      products,
      user: req.session.user || null
    });
  });
};


/**
 * ADD PRODUCT
 */
exports.addProduct = (req, res) => {
  const { productName, price, category, image } = req.body;

  Product.create(productName, price, category, image, (err) => {
    if (err) {
      req.flash("error", "Failed to add product");
      return res.redirect("/inventory");
    }

    req.flash("success", "Product added successfully");
    res.redirect("/inventory");
  });
};


/**
 * UPDATE PRODUCT
 */
exports.updateProduct = (req, res) => {
  const id = req.params.id;
  const { productName, price, category, image } = req.body;

  Product.update(id, productName, price, category, image, (err) => {
    if (err) {
      req.flash("error", "Failed to update product");
      return res.redirect("/inventory");
    }

    req.flash("success", "Product updated successfully");
    res.redirect("/inventory");
  });
};


/**
 * DELETE PRODUCT
 */
exports.deleteProduct = (req, res) => {
  const id = req.params.id;

  Product.delete(id, (err) => {
    if (err) {
      req.flash("error", "Failed to delete product");
      return res.redirect("/inventory");
    }

    req.flash("success", "Product deleted successfully");
    res.redirect("/inventory");
  });
};
