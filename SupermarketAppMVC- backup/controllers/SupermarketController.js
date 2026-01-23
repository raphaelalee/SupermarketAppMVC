// controllers/SupermarketController.js

const fs = require("fs");
const path = require("path");
const multer = require("multer"); // Middleware for handling multipart/form-data (file uploads)
const Product = require("../models/supermarket"); // Import the Product Model for DB operations

// Directory path where uploaded product images will be stored (public/images/uploads)
const IMAGE_UPLOAD_DIR = path.join(
  __dirname,
  "..",
  "public",
  "images",
  "uploads"
);
// Ensure the upload directory exists; recursive: true allows creating parent directories if necessary
fs.mkdirSync(IMAGE_UPLOAD_DIR, { recursive: true });

// Helper to create a safe, unique filename by slugifying the original name and appending a timestamp.
const sanitizeFileName = (filename) => {
  const ext = path.extname(filename || "").toLowerCase() || ".png";
  const base = path
    .basename(filename, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing dashes
  return `${base || "image"}-${Date.now()}${ext}`;
};

// Configure multer's disk storage: tells where to save files and how to name them
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGE_UPLOAD_DIR), // Save to defined directory
  filename: (req, file, cb) => cb(null, sanitizeFileName(file.originalname)), // Use the safe filename generator
});

// Main multer instance configuration
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // Set max file size limit to 4MB (Good Security Practice)
  fileFilter: (req, file, cb) => { // Filter to only allow image file types
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(
        new Error("Only image uploads are allowed (PNG, JPG, GIF, WEBP).")
      );
    }
    return cb(null, true);
  },
});

// Middleware for handling a single file upload named 'imageFile'
const imageUploadMiddleware = upload.single("imageFile");
// Hardcoded options for product categories (used in inventory forms)
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

// Custom middleware wrapper to handle multer errors gracefully
exports.handleProductImageUpload = (req, res, next) => {
  imageUploadMiddleware(req, res, (err) => {
    if (err) {
      console.error("Image upload failed:", err);
      // Flash error and redirect user back to the form
      req.flash(
        "error",
        err.message || "Image upload failed. Please try again with a smaller file."
      );
      return res.redirect("/inventory");
    }
    return next(); // Continue to the next controller function (e.g., addProduct/updateProduct)
  });
};

// Determines the correct image path to store in the database (new upload, existing file, or default placeholder)
const resolveImageValue = (req, fallback = "placeholder.png") => {
  if (req.file && req.file.filename) {
    // If a new file was uploaded, return the relative path to the saved file
    return path.posix.join("uploads", req.file.filename);
  }
  const current = (req.body.currentImage || "").trim();
  if (current) return current; // If image wasn't updated, keep the old value
  return fallback;
};

/**
 * SHOPPING PAGE + CART
 * Handles listing products and integrating cart summary data.
 */
exports.listAll = (req, res) => {
  const rawCategory = (req.query.category || "").trim();
  const selectedCategory = rawCategory;
  const searchRaw = req.query.search || "";
  const search = searchRaw.trim();

  // 1. Fetch available categories (for navigation/filtering)
  Product.getCategories((catErr, categoryRows) => {
    if (catErr) {
      console.error("Failed to load categories:", catErr);
    }
    const categories = (categoryRows || []).filter(
      (row) => row && row.category
    );

    // 2. Fetch products based on user search/filter criteria
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
            products: items, // Filtered product list
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

        // 3. OPTIMIZATION CONCERN: This is an unnecessary second DB call to get all products.
        // It duplicates the middleware logic in app.js and should ideally be factored out.
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
          // Loop through session cart to build the mini-cart display (cartItems, total, cartCount)
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
 * Loads a few featured products (the first 4) for the homepage view.
 */
exports.homePage = (req, res) => {
  Product.getAll((err, products) => {
    if (err) {
      return res.render("index", { featured: [], user: req.session.user || null });
    }

    const featured = products.slice(0, 4); // Logic to select only the first 4 products as 'featured'

    res.render("index", {
      featured,
      user: req.session.user || null,
    });
  });
};

/**
 * INVENTORY PAGE
 * Displays all products to the admin, supporting search and sorting in Node.js memory.
 */
exports.inventoryPage = (req, res) => {
  const searchQuery = (req.query.search || "").trim();
  const sortOption = req.query.sort || "newest";

  Product.getAll((err, products) => { // NOTE: Fetches ALL products first
    if (err) {
      return res.render("inventory", {
        products: [],
        user: req.session.user || null,
        searchQuery,
        sortOption,
      });
    }

    let filtered = Array.isArray(products) ? [...products] : [];

    // Filter logic runs in Node.js (memory-intensive for large data sets)
    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          (p.productName && p.productName.toLowerCase().includes(term)) ||
          (p.category && p.category.toLowerCase().includes(term))
      );
    }

    // Sort logic runs in Node.js (CPU-intensive)
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
        filtered.sort((a, b) => Number(b.id) - Number(a.id)); // Default to newest first
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
 * Handles form submission for creating a new product record (C in CRUD).
 */
exports.addProduct = (req, res) => {
  const { productName, price, category } = req.body;
  // parse quantity from form (admin supplies when adding)
  let quantity = parseInt(req.body.quantity, 10);
  if (Number.isNaN(quantity) || quantity < 0) quantity = 0;
  const imageValue = resolveImageValue(req); // Get the saved image path

  // Persist the new product to the database
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
 * Handles form submission for modifying an existing product (U in CRUD).
 */
exports.updateProduct = (req, res) => {
  const id = req.params.id;
  const { productName, price, category } = req.body;
  const imageValue = resolveImageValue(req); // Handles either a new upload or keeping the existing image
  // parse quantity from form
  let quantity = parseInt(req.body.quantity, 10);
  if (Number.isNaN(quantity) || quantity < 0) quantity = 0;

  // Persist updated fields to the database
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
 * NOTE: This uses a vulnerable Read-Modify-Write pattern.
 */
exports.replenishStock = (req, res) => {
  const id = req.params.id;
  // parse increment (default 10)
  let increment = parseInt(req.body.increment, 10);
  if (Number.isNaN(increment) || !Number.isFinite(increment)) increment = 10;
  if (increment < 0) increment = 0;

  // 1. READ: Load current product state
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

    // 2. MODIFY: Calculate new quantity
    const current = Number(product.quantity || 0);
    const newQty = current + Number(increment);

    // 3. WRITE: Overwrite entire record with the new quantity
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
 * Handles deletion of a product record (D in CRUD).
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