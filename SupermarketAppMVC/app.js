// app.js
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const methodOverride = require('method-override');

const app = express();

/* ======================
   View engine & middleware
   ====================== */
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(methodOverride('_method'));

app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));
app.use(flash());

// Make session-based data available to all views via res.locals
app.use((req, res, next) => {
   res.locals.user = req.session && req.session.user ? req.session.user : null;
   res.locals.cart = req.session && req.session.cart ? req.session.cart : {};
   res.locals.cartCount = res.locals.cart ? Object.keys(res.locals.cart).length : 0;
   res.locals.errors = req.flash('error') || [];
   res.locals.messages = req.flash('success') || [];
   next();
});

// Make common template variables available to all views
app.use((req, res, next) => {
   res.locals.user = req.session ? req.session.user : null;
   res.locals.cartCount = req.session && req.session.cart ? Object.keys(req.session.cart).length : 0;
   res.locals.errors = req.flash('error') || [];
   res.locals.messages = req.flash('success') || [];
   next();
});

/* ======================
   Multer (image uploads)
   ====================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'images')),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const ext = path.extname(file.originalname) || '';
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

/* ======================
   Middleware for auth
   ====================== */
const checkAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please log in to view this resource');
  return res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  req.flash('error', 'Access denied');
  return res.redirect('/shopping');
};

/* ======================
   Models
   ====================== */
const { Users, Product } = require('./models/supermarket');

/* ======================
   Controllers
   ====================== */
const SupermarketController = require('./controllers/SupermarketController');
const ProductController = require('./controllers/ProductController');
const CartController = require('./controllers/CartController');
const UserController = require('./controllers/UserController');
const InventoryController = require('./controllers/InventoryController');
const SearchController = require('./controllers/SearchController');
const ReportController = require('./controllers/ReportController');
const CheckoutController = require('./controllers/CheckoutController');

/* ======================
   Routes (Controllers)
   ====================== */

// Build detailed cart for templates (id -> product details + qty)
app.use((req, res, next) => {
   const cart = req.session && req.session.cart ? req.session.cart : {};
   const ids = Object.keys(cart);
   if (ids.length === 0) {
      res.locals.cartDetailed = [];
      res.locals.cartTotal = 0;
      res.locals.cartCount = 0;
      return next();
   }

   // Fetch all products once and map by id (more resilient than per-id queries)
   Product.getAll((err, products) => {
      if (err || !products) {
         console.error('Error fetching products for cart middleware:', err);
         res.locals.cartDetailed = [];
         res.locals.cartTotal = 0;
         res.locals.cartCount = 0;
         return next();
      }

      const byId = products.reduce((acc, p) => {
         acc[String(p.id)] = p;
         return acc;
      }, {});

      const detailed = ids.map(id => {
         const p = byId[String(id)];
         const qty = parseInt(cart[id], 10) || 0;
         if (!p) return { id, productName: 'Unknown product', image: 'broccoli.png', price: 0, quantity: qty, subtotal: 0 };
         const price = parseFloat(p.price) || 0;
         return { id: p.id, productName: p.productName, image: p.image, price, quantity: qty, subtotal: price * qty };
      }).filter(Boolean);

      res.locals.cartDetailed = detailed;
      res.locals.cartTotal = detailed.reduce((s, it) => s + (it.subtotal || 0), 0);
      res.locals.cartCount = detailed.reduce((s, it) => s + (it.quantity || 0), 0);
      return next();
   });
});


// --- Home ---
app.get('/', (req, res) => res.render('index', { user: req.session.user }));

// --- Products (CRUD) ---
app.get('/products', ProductController.listAll);
app.get('/products/:id', ProductController.getById);
app.post('/products', upload.single('image'), ProductController.add);
app.put('/products/:id', upload.single('image'), ProductController.update);
app.delete('/products/:id', ProductController.delete);
app.post('/products/:id/update', upload.single('image'), (req, res, next) => { req.method = 'PUT'; next(); }, ProductController.update);
app.post('/products/:id/delete', (req, res, next) => { req.method = 'DELETE'; next(); }, ProductController.delete);

// --- Inventory (Admin only) ---
app.get('/inventory', checkAuthenticated, checkAdmin, InventoryController.viewInventory);
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, ProductController.renderEditForm);
app.get('/addProduct', checkAuthenticated, checkAdmin, (req, res) => res.render('addProduct', { user: req.session.user }));

// --- Shopping / User pages ---
app.get('/shopping', checkAuthenticated, SupermarketController.listAll);
app.get('/product/:id', checkAuthenticated, ProductController.getById);

// --- Cart ---
app.post('/add-to-cart/:id', checkAuthenticated, CartController.addToCart);
app.get('/cart', checkAuthenticated, CartController.viewCart);
app.post('/cart/update/:id', checkAuthenticated, CartController.updateQuantity);
app.post('/cart/remove/:id', checkAuthenticated, CartController.removeFromCart);

// Checkout routes (shared for admin & user)
app.get('/checkout', checkAuthenticated, CheckoutController.renderCheckout);
app.post('/checkout', checkAuthenticated, CheckoutController.processCheckout);

// --- Search ---
app.get('/search', SearchController.searchProducts);

// --- Reports ---
app.get('/report', checkAuthenticated, checkAdmin, ReportController.generateReport);

// --- User auth ---
app.get('/register', UserController.renderRegister);
app.post('/register', UserController.registerUser);
app.get('/login', UserController.renderLogin);
app.post('/login', UserController.loginUser);
app.get('/logout', UserController.logoutUser);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
