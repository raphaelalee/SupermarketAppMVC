const db = require('../db');

module.exports = {
    // get all students
    getAll(callback) {
        const sql = 'SELECT studentId, name, dob, contact, image FROM students ORDER BY studentId';
        db.query(sql, (err, results) => callback(err, results));
    },

    // get a single student by ID
    getById(studentId, callback) {
        const sql = 'SELECT studentId, name, dob, contact, image FROM students WHERE studentId = ? LIMIT 1';
        db.query(sql, [studentId], (err, results) => {
            if (err) return callback(err);
            callback(null, results[0] || null);
        });
    },

    // add a new student; student is an object { name, dob, contact, image }
    add(student, callback) {
        const sql = 'INSERT INTO students (name, dob, contact, image) VALUES (?, ?, ?, ?)';
        const params = [student.name, student.dob, student.contact, student.image];
        db.query(sql, params, (err, result) => callback(err, result));
    },

    // update an existing student by ID; student is an object { name, dob, contact, image }
    update(studentId, student, callback) {
        const sql = 'UPDATE students SET name = ?, dob = ?, contact = ?, image = ? WHERE studentId = ?';
        const params = [student.name, student.dob, student.contact, student.image, studentId];
        db.query(sql, params, (err, result) => callback(err, result));
    },

    // delete a student by ID
    'delete'(studentId, callback) {
        const sql = 'DELETE FROM students WHERE studentId = ?';
        db.query(sql, [studentId], (err, result) => callback(err, result));
    }
};