// app.js
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const methodOverride = require('method-override');

// MVC imports
const SupermarketController = require('./controllers/SupermarketController');
const { Users, Product } = require('./models/supermarket');

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
   Auth middlewares
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
   Registration validation
   ====================== */
const validateRegistration = (req, res, next) => {
  const { username, email, password, address, contact, role } = req.body;
  if (!username || !email || !password || !address || !contact || !role) {
    return res.status(400).send('All fields are required.');
  }
  if (password.length < 6) {
    req.flash('error', 'Password should be at least 6 or more characters long');
    req.flash('formData', req.body);
    return res.redirect('/register');
  }
  next();
};

/* ======================
   Product routes (MVC)
   ====================== */
// REST-style routes
app.get('/products', SupermarketController.listAll);
app.get('/products/:id', SupermarketController.getById);
app.post('/products', upload.single('image'), SupermarketController.add);
app.put('/products/:id', upload.single('image'), SupermarketController.update);
app.delete('/products/:id', SupermarketController.delete);

// Form-friendly routes for PUT/DELETE
app.post('/products/:id/update', upload.single('image'), (req, res, next) => {
  req.method = 'PUT';
  next();
}, SupermarketController.update);


app.post('/products/:id/delete', (req, res, next) => {
  req.method = 'DELETE';
  next();
}, SupermarketController.delete);

/* ======================
   Page routes (views)
   ====================== */
app.get('/', (req, res) => res.render('index', { user: req.session.user }));

// Admin inventory page
app.get('/inventory', checkAuthenticated, checkAdmin, (req, res, next) => 
  SupermarketController.listAll(req, res, next)
);

// User shopping page
app.get('/shopping', checkAuthenticated, (req, res, next) => 
  SupermarketController.listAll(req, res, next)
);

// Product detail page
app.get('/product/:id', checkAuthenticated, (req, res, next) => 
  SupermarketController.getById(req, res, next)
);

// Add new product (admin only)
app.get('/addProduct', checkAuthenticated, checkAdmin, (req, res) => 
  res.render('addProduct', { user: req.session.user })
);

// Update product page (admin only)
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, (req, res) =>
  SupermarketController.renderEditForm(req, res)
);




/* ======================
   User registration & login
   ====================== */
app.get('/register', (req, res) => {
  res.render('register', {
    messages: req.flash('error'),
    formData: req.flash('formData')[0]
  });
});

app.post('/register', validateRegistration, (req, res) => {
  const { username, email, password, address, contact, role } = req.body;
  const hashed = crypto.createHash('sha1').update(password).digest('hex');
  Users.create({ username, email, password: hashed, address, contact, role }, (err) => {
    if (err) {
      req.flash('error', err.message);
      return res.redirect('/register');
    }
    req.flash('success', 'Registration successful! Please log in.');
    return res.redirect('/login');
  });
});

app.get('/login', (req, res) => {
  res.render('login', {
    messages: req.flash('success'),
    errors: req.flash('error')
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/login');
  }

  Users.getByEmail(email, (err, results) => {
    if (err) {
      req.flash('error', err.message);
      return res.redirect('/login');
    }

    if (!results || results.length === 0) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }

    const user = results[0];
    const hashed = crypto.createHash('sha1').update(password).digest('hex');

    if (user.password !== hashed) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }

    req.session.user = user;
    console.log('Logged in user:', user); // ✅ Debug check

    req.flash('success', 'Login successful!');
    return user.role === 'user' ? res.redirect('/shopping') : res.redirect('/inventory');
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

/* ======================
   Cart functionality
   ====================== */
app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const quantity = parseInt(req.body.quantity, 10) || 1;

  Product.getById(productId, (err, results) => {
    if (err) return res.status(500).send('Error adding to cart');
    if (!results || results.length === 0) return res.status(404).send('Product not found');

    const product = results[0];
    if (!req.session.cart) req.session.cart = [];

    const existing = req.session.cart.find(item => item.productId === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      req.session.cart.push({
        productId,
        productName: product.productName,
        price: product.price,
        quantity,
        image: product.image
      });
    }
    res.redirect('/cart');
  });
});

app.get('/cart', checkAuthenticated, (req, res) => {
  const cart = req.session.cart || [];
  res.render('cart', { cart, user: req.session.user });
});

/* ======================
   Server
   ====================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
