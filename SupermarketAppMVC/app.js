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

/* ======================
   Routes (Controllers)
   ====================== */

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

/* ======================
   Server
   ====================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
