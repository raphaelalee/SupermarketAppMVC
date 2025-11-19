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
  const category = (req.query.category || "All").trim();
  const searchTermRaw = req.query.search || "";
  const searchTerm = searchTermRaw.trim().toLowerCase();

  Product.getAll((err, allProducts) => {
    if (err) {
      return res.render("shopping", {
        products: [],
        category,
        displayCategory: "All Products",
        categories: ["All"],
        searchTerm: searchTermRaw,
        user: req.session.user || null,
        cart: [],
        total: 0,
        cartCount: 0,
      });
    }

    const categories = ["All"];
    const categorySet = new Set();
    allProducts.forEach((p) => {
      const raw = (p.category || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (categorySet.has(key)) return;
      categorySet.add(key);
      categories.push(raw.charAt(0).toUpperCase() + raw.slice(1));
    });

    let filtered = Array.isArray(allProducts) ? [...allProducts] : [];

    if (searchTerm) {
      filtered = filtered.filter((p) => {
        const name = (p.productName || "").toLowerCase();
        const cat = (p.category || "").toLowerCase();
        return name.includes(searchTerm) || cat.includes(searchTerm);
      });
    } else if (category && category !== "All") {
      filtered = filtered.filter(
        (p) => (p.category || "").toLowerCase() === category.toLowerCase()
      );
    }

    const displayCategory = searchTerm
      ? `Search: ${searchTermRaw}`
      : category === "All"
      ? "All Products"
      : category;

    const cartObj = req.session.cart || {};
    const cartIds = Object.keys(cartObj);

    if (cartIds.length === 0) {
      return res.render("shopping", {
        products: filtered,
        category,
        displayCategory,
        categories,
        searchTerm: searchTermRaw,
        user: req.session.user || null,
        cart: [],
        total: 0,
        cartCount: 0,
      });
    }

    const byId = {};
    allProducts.forEach((p) => (byId[p.id] = p));

    let cartItems = [];
    let total = 0;
    let cartCount = 0;

    cartItems = cartIds
      .map((id) => {
        const item = byId[id];
        if (!item) return null;
        const quantity = cartObj[id];
        const subtotal = item.price * quantity;

        total += subtotal;
        cartCount += quantity;

        return { ...item, quantity, subtotal };
      })
      .filter(Boolean);

    res.render("shopping", {
      products: filtered,
      category,
      displayCategory,
      categories,
      searchTerm: searchTermRaw,
      user: req.session.user || null,
      cart: cartItems,
      total,
      cartCount,
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
  const imageValue = resolveImageValue(req);

  Product.create(productName, price, category, imageValue, (err) => {
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

  Product.update(id, productName, price, category, imageValue, (err) => {
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
