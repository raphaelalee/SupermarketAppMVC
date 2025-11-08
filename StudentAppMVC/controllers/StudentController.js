// ...existing code...
const Student = require('../models/Student');

module.exports = {
    // list all students and render index view
    list(req, res) {
        Student.getAll((err, students) => {
            if (err) return res.status(500).send('Database error.');
            res.render('index', { students });
        });
    },

    // show a single student by ID and render student view
    show(req, res) {
        const studentId = req.params.id;
        Student.getById(studentId, (err, student) => {
            if (err) return res.status(500).send('Database error.');
            if (!student) return res.status(404).send('Student not found.');
            res.render('student', { student });
        });
    },

    // add a new student (expects form data in req.body, optional file in req.file)
    add(req, res) {
        const student = {
            name: req.body.name,
            dob: req.body.dob,
            contact: req.body.contact,
            image: req.file ? req.file.filename : (req.body.image || null)
        };

        Student.add(student, (err, result) => {
            if (err) return res.status(500).send('Database error.');
            res.redirect('/');
        });
    },

    // update an existing student by ID
    update(req, res) {
    const studentId = req.params.id;
    const student = {
        name: req.body.name,
        dob: req.body.dob,
        contact: req.body.contact,
        image: req.file ? req.file.filename : (req.body.currentImage || null)
    };

    Student.update(studentId, student, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error.');
        }
        res.redirect('/students/' + req.params.id);
    });
},

    //Update form
    updateForm: (req, res) => {
        const id = req.params.id;
        Student.getById(id, (err, student) => {
            if (err) { 
                return res.status(500).send('Error retrieving student.');
            }
            if (!student) { 
                return res.status(404).send('Student not found.');
            }
            res.render('editStudent', { student }); 
        });
    },

    // delete a student by ID
    delete(req, res) {
        const studentId = req.params.id;
        Student['delete'](studentId, (err, result) => {
            if (err) return res.status(500).send('Database error.');
            res.redirect('/');
        });
    }
};
// ...existing code...