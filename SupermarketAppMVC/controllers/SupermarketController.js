// controllers/SupermarketController.js

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const Product = require("../models/supermarket"); // IMPORT MODEL

const IMAGE_UPLOAD_DIR = path.join(
  __dirname,
  "..",
  "public",
  "images",
  "uploads"
);
fs.mkdirSync(IMAGE_UPLOAD_DIR, { recursive: true });

const sanitizeFileName = (filename) => {
  const ext = path.extname(filename || "").toLowerCase() || ".png";
  const base = path
    .basename(filename, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "image"}-${Date.now()}${ext}`;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGE_UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, sanitizeFileName(file.originalname)),
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(
        new Error("Only image uploads are allowed (PNG, JPG, GIF, WEBP).")
      );
    }
    return cb(null, true);
  },
});

const imageUploadMiddleware = upload.single("imageFile");
const CATEGORY_OPTIONS = [
  "Produce",
  "Meat",
  "Seafood",
  "Dairy",
  "Bakery",
  "Frozen",
  "Pantry",
  "Beverages",
  "Snacks",
  "Household",
];

exports.handleProductImageUpload = (req, res, next) => {
  imageUploadMiddleware(req, res, (err) => {
    if (err) {
      console.error("Image upload failed:", err);
      req.flash(
        "error",
        err.message || "Image upload failed. Please try again with a smaller file."
      );
      return res.redirect("/inventory");
    }
    return next();
  });
};

const resolveImageValue = (req, fallback = "placeholder.png") => {
  if (req.file && req.file.filename) {
    return path.posix.join("uploads", req.file.filename);
  }
  const current = (req.body.currentImage || "").trim();
  if (current) return current;
  return fallback;
};

/**
 * SHOPPING PAGE + CART
 */
exports.listAll = (req, res) => {
  const rawCategory = (req.query.category || "").trim();
  const selectedCategory = rawCategory;
  const searchRaw = req.query.search || "";
  const search = searchRaw.trim();

  Product.getCategories((catErr, categoryRows) => {
    if (catErr) {
      console.error("Failed to load categories:", catErr);
    }
    const categories = (categoryRows || []).filter(
      (row) => row && row.category
    );

    Product.getFiltered(
      { category: selectedCategory, search },
      (productErr, products) => {
        if (productErr) {
          console.error("Failed to load products:", productErr);
        }
        const items = Array.isArray(products) ? products : [];
        const cartObj = req.session.cart || {};
        const cartIds = Object.keys(cartObj);

        const renderPage = (cartItems, total, cartCount) => {
          const displayCategory = search
            ? `Search: ${searchRaw}`
            : selectedCategory || "All Products";

          res.render("shopping", {
            products: items,
            categories,
            category: selectedCategory,
            search,
            displayCategory,
            user: req.session.user || null,
            cart: cartItems,
            total,
            cartCount,
          });
        };

        if (cartIds.length === 0) {
          return renderPage([], 0, 0);
        }

        Product.getFiltered({}, (allErr, allProducts) => {
          if (allErr) {
            console.error("Failed to load cart products:", allErr);
            return renderPage([], 0, 0);
          }

          const byId = {};
          (allProducts || []).forEach((p) => {
            if (!p) return;
            byId[String(p.id)] = p;
          });

          let total = 0;
          let cartCount = 0;
          const cartItems = cartIds
            .map((id) => {
              const item = byId[id];
              if (!item) return null;
              const entry = cartObj[id];
              const quantity =
                typeof entry === "object" && entry !== null
                  ? parseInt(entry.quantity, 10) || 0
                  : parseInt(entry, 10) || 0;
              if (quantity <= 0) return null;

              const price = Number(item.price) || 0;
              const subtotal = price * quantity;

              total += subtotal;
              cartCount += quantity;

              return { ...item, quantity, subtotal };
            })
            .filter(Boolean);

          renderPage(cartItems, total, cartCount);
        });
      }
    );
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
      user: req.session.user || null,
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
      user: req.session.user || null,
    });
  });
};

/**
 * INVENTORY PAGE
 */
exports.inventoryPage = (req, res) => {
  const searchQuery = (req.query.search || "").trim();
  const sortOption = req.query.sort || "newest";

  Product.getAll((err, products) => {
    if (err) {
      return res.render("inventory", {
        products: [],
        user: req.session.user || null,
        searchQuery,
        sortOption,
      });
    }

    let filtered = Array.isArray(products) ? [...products] : [];

    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          (p.productName && p.productName.toLowerCase().includes(term)) ||
          (p.category && p.category.toLowerCase().includes(term))
      );
    }

    switch (sortOption) {
      case "price-asc":
        filtered.sort((a, b) => Number(a.price) - Number(b.price));
        break;
      case "price-desc":
        filtered.sort((a, b) => Number(b.price) - Number(a.price));
        break;
      case "name-az":
        filtered.sort((a, b) =>
          (a.productName || "").localeCompare(b.productName || "")
        );
        break;
      case "name-za":
        filtered.sort((a, b) =>
          (b.productName || "").localeCompare(a.productName || "")
        );
        break;
      default:
        filtered.sort((a, b) => Number(b.id) - Number(a.id)); // newest
    }

    res.render("inventory", {
      products: filtered,
      user: req.session.user || null,
      searchQuery,
      sortOption,
      categoryOptions: CATEGORY_OPTIONS,
    });
  });
};

/**
 * ADD PRODUCT
 */
exports.addProduct = (req, res) => {
  const { productName, price, category } = req.body;
  // parse quantity from form (admin supplies when adding)
  let quantity = parseInt(req.body.quantity, 10);
  if (Number.isNaN(quantity) || quantity < 0) quantity = 0;
  const imageValue = resolveImageValue(req);

  Product.create(productName, price, category, imageValue, quantity, (err) => {
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
  const { productName, price, category } = req.body;
  const imageValue = resolveImageValue(req);
  // parse quantity from form
  let quantity = parseInt(req.body.quantity, 10);
  if (Number.isNaN(quantity) || quantity < 0) quantity = 0;

  Product.update(id, productName, price, category, imageValue, quantity, (err) => {
    if (err) {
      req.flash("error", "Failed to update product");
      return res.redirect("/inventory");
    }

    req.flash("success", "Product updated successfully");
    res.redirect("/inventory");
  });
};

/**
 * Replenish product stock by a small admin-provided increment.
 * POST /inventory/replenish/:id
 * Body: { increment }
 */
exports.replenishStock = (req, res) => {
  const id = req.params.id;
  // parse increment (default 10)
  let increment = parseInt(req.body.increment, 10);
  if (Number.isNaN(increment) || !Number.isFinite(increment)) increment = 10;
  if (increment < 0) increment = 0;

  Product.getById(id, (err, results) => {
    if (err) {
      console.error(`Failed to load product ${id} for replenish:`, err);
      req.flash('error', 'Unable to replenish stock.');
      return res.redirect('/inventory');
    }

    const product = results && results[0];
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/inventory');
    }

    const current = Number(product.quantity || 0);
    const newQty = current + Number(increment);

    // Use the existing update API to persist the new quantity
    Product.update(
      id,
      product.productName,
      product.price,
      product.category,
      product.image,
      newQty,
      (updateErr) => {
        if (updateErr) {
          console.error(`Failed to update quantity for ${id}:`, updateErr);
          req.flash('error', 'Failed to replenish stock.');
          return res.redirect('/inventory');
        }
        req.flash('success', `Replenished ${product.productName} by ${increment}. New stock: ${newQty}`);
        return res.redirect('/inventory');
      }
    );
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
