const express = require('express');
const multer = require('multer');
const path = require('path');
const app = express();

// ======================
// File Upload Setup (multer)
// ======================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/images'); // Directory for uploaded images
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // unique filenames
  }
});

const upload = multer({ storage });

// ======================
// Controller Import (case-insensitive fallback)
// ======================
let StudentController;
try {
  StudentController = require('./controllers/studentControllers');
} catch (err) {
  StudentController = require('./controllers/StudentController');
}

// ======================
// App Configuration
// ======================
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

// ======================
// ROUTES
// ======================

// Home → list all students
app.get('/', StudentController.list);
app.get('/students', StudentController.list);

// ✅ Put /students/add ABOVE /students/:id
// Render form to add a new student
app.get('/students/add', (req, res) => {
  res.render('addStudent');
});

// Add new student (POST with file upload)
app.post('/students', upload.single('image'), (req, res) => {
  return StudentController.add(req, res);
});

// Show details for one student
app.get('/students/:id', StudentController.show);

// Render edit form for a student
app.get('/students/:id/edit', (req, res) => {
  const handler = StudentController.updateForm || StudentController.show;
  return handler(req, res);
});


// Update student details
app.post('/students/:id/edit', upload.single('image'), (req, res) => {
  return StudentController.update(req, res);
});

// Delete student
app.get('/deleteStudent/:id', (req, res) => {
  return StudentController.delete(req, res);
});


// ======================
// Server Start
// ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
