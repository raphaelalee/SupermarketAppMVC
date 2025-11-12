// app.js
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const methodOverride = require('method-override');

const app = express();

/* ======================
   View Engine & Middleware
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
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());

app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.cart = req.session?.cart || {};
  res.locals.cartCount = Object.keys(res.locals.cart).length;
  res.locals.errors = req.flash('error') || [];
  res.locals.messages = req.flash('success') || [];
  next();
});

/* ======================
   Multer Config
   ====================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'images')),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

/* ======================
   Auth Middleware
   ====================== */
const checkAuthenticated = (req, res, next) => {
  if (req.session?.user) return next();
  req.flash('error', 'Please log in to view this resource');
  return res.redirect('/login');
};
const checkAdmin = (req, res, next) => {
  if (req.session?.user?.role === 'admin') return next();
  req.flash('error', 'Access denied');
  return res.redirect('/shopping');
};

/* ======================
   Imports
   ====================== */
const { Users, Product } = require('./models/supermarket');
const ProductController = require('./controllers/ProductController');
const CartController = require('./controllers/CartController');
const UserController = require('./controllers/UserController');
const InventoryController = require('./controllers/InventoryController');
const SearchController = require('./controllers/SearchController');
const ReportController = require('./controllers/ReportController');
const CheckoutController = require('./controllers/CheckoutController');
const SupermarketController = require('./controllers/SupermarketController');

/* ======================
   Routes
   ====================== */

// Home page
app.get('/', (req, res) => {
  Product.getAll((err, products) => {
    if (err) return res.render('index', { featured: [] });
    res.render('index', { featured: products.slice(0, 4), user: req.session.user });
  });
});

// ✅ Temporary: Safe fallback routes
app.get('/shopping', checkAuthenticated, (req, res) => {
  res.send(`
    <div style="font-family:Arial;text-align:center;margin-top:100px;">
      <h2>🛒 Your app is running!</h2>
      <p>The controller is not crashing anymore 🎉</p>
      <a href="/" style="color:green;text-decoration:none;">Back to Home</a>
    </div>
  `);
});

// Products
app.get('/products', ProductController.listAll);
app.get('/products/:id', ProductController.getById);
app.post('/products', upload.single('image'), ProductController.add);
app.put('/products/:id', upload.single('image'), ProductController.update);
app.delete('/products/:id', ProductController.delete);

// Auth
app.get('/register', UserController.renderRegister);
app.post('/register', UserController.registerUser);
app.get('/login', UserController.renderLogin);
app.post('/login', UserController.loginUser);
app.get('/logout', UserController.logoutUser);

// Admin
app.get('/inventory', checkAuthenticated, checkAdmin, InventoryController.viewInventory);

// Misc pages
app.get('/about', (req, res) => res.render('about'));
app.get('/contact', (req, res) => res.render('contact'));

// 404 Handler
app.use((req, res) => {
  res.status(404).send('<h1 style="text-align:center;margin-top:100px;">404 - Page Not Found</h1>');
});

/* ======================
   Server Start
   ====================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
